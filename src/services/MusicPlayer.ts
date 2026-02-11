import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  VoiceConnection,
  VoiceConnectionStatus,
  generateDependencyReport,
  StreamType,
} from '@discordjs/voice';
import { Client, Guild, VoiceChannel } from 'discord.js';
import { getAudioStream, extractVideoId } from './YouTubeService';
import { Track, ITrack } from '../models/Track';
import { isDBConnected } from '../utils/connectDB';
import { setUserCurrentTrack } from '../events/voiceStateUpdate';
import { MAX_QUEUE_SIZE, MAX_QUEUES_PER_USER } from '../config/playlists';
import { musicLogService } from './MusicLogService';
import * as fs from 'fs';
import * as path from 'path';

export interface QueueItem {
  track: ITrack;
  requestedBy?: string;
  requestedByUsername?: string;
  isPinned?: boolean;
}

export class MusicPlayer {
  private client: Client;
  private audioPlayer: AudioPlayer;
  private connection: VoiceConnection | null = null;
  private guildId: string;
  private textChannelId: string | null = null;
  private isPlaying: boolean = false;
  private isLooping: boolean = false;
  private currentTrack: QueueItem | null = null;
  private queue: QueueItem[] = [];
  private pinnedQueue: QueueItem[] = []; // Priority queue for pinned tracks
  
  // Playback position tracking
  private trackStartTime: number = 0;
  private pausedAt: number = 0;
  private totalPausedTime: number = 0;

  // Skip vote tracking
  private skipVotes: Set<string> = new Set();

  // Per-user queue count (for max 5 songs per user; slot freed when their song finishes)
  private userQueueCount: Map<string, number> = new Map();

  // Idle disconnect: last time there was activity (play, skip, pause, someone in channel, etc.)
  private lastActivityAt: number = 0;

  constructor(client: Client, guildId: string) {
    this.client = client;
    this.guildId = guildId;
    
    this.audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    this.setupPlayerListeners();
  }

  private setupPlayerListeners() {
    this.audioPlayer.on(AudioPlayerStatus.Idle, async () => {
      // Free per-user slot when a requested track finishes
      if (this.currentTrack?.requestedBy) {
        const uid = this.currentTrack.requestedBy;
        this.userQueueCount.set(uid, Math.max(0, (this.userQueueCount.get(uid) ?? 0) - 1));
      }
      // Log track finished
      if (this.currentTrack) {
        const finishedTrack = this.currentTrack;
        musicLogService.addLog(`🏁 Finished: **${finishedTrack.track.title}**`, 'info');
      }
      
      // Reset playback tracking
      this.trackStartTime = 0;
      this.pausedAt = 0;
      this.totalPausedTime = 0;
      this.skipVotes.clear();
      
      // Track finished playing
      if (this.isLooping && this.currentTrack) {
        // Replay the same track
        await this.playTrack(this.currentTrack);
      } else {
        // Play next track
        await this.playNext();
      }
    });

    this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
      this.touchActivity();
      if (this.pausedAt > 0) {
        // Resuming from pause
        this.totalPausedTime += Date.now() - this.pausedAt;
        this.pausedAt = 0;
      }
    });

    this.audioPlayer.on(AudioPlayerStatus.Paused, () => {
      this.pausedAt = Date.now();
    });

    this.audioPlayer.on('error', (error) => {
      console.error('[MusicPlayer] Audio player error:', error);
      this.playNext();
    });
  }

  async connect(voiceChannel: VoiceChannel): Promise<boolean> {
    try {
      // Log dependency report on first connection attempt
      if (!this.connection) {
        const report = generateDependencyReport();
        console.log('[MusicPlayer] Voice dependencies:', report);
      }

      // Check if already connected to this channel
      const existingConnection = getVoiceConnection(voiceChannel.guild.id);
      if (existingConnection && existingConnection.state.status !== VoiceConnectionStatus.Destroyed) {
        // Already connected, reuse it
        this.connection = existingConnection;
        
        // Ensure connection is ready before subscribing
        if (this.connection.state.status !== VoiceConnectionStatus.Ready) {
          await entersState(this.connection, VoiceConnectionStatus.Ready, 10_000);
        }
        
        // Check if subscription exists by trying to subscribe (it will handle if already subscribed)
        try {
          this.connection.subscribe(this.audioPlayer);
        } catch (error) {
          // Already subscribed, ignore
        }
        this.touchActivity();
        console.log(`[MusicPlayer] Reusing existing connection to voice channel: ${voiceChannel.name}`);
        return true;
      }

      this.touchActivity();
      this.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator as any,
        selfDeaf: false,
        selfMute: false,
      });

      // Wait for connection to be ready (increased timeout)
      await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
      
      // Subscribe the connection to the audio player
      this.connection.subscribe(this.audioPlayer);
      
      this.touchActivity();
      console.log(`[MusicPlayer] Connected to voice channel: ${voiceChannel.name}`);
      return true;
    } catch (error: any) {
      console.error('[MusicPlayer] Failed to connect to voice channel:', error);
      
      // Log dependency report on error
      const report = generateDependencyReport();
      console.error('[MusicPlayer] Dependency report:', report);
      
      // If encryption error, try to reconnect
      if (error.message && (error.message.includes('encryption') || error.message.includes('No compatible'))) {
        console.log('[MusicPlayer] Encryption error detected, attempting to reconnect...');
        try {
          // Destroy existing connection
          if (this.connection) {
            this.connection.destroy();
            this.connection = null;
          }
          
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Retry connection
          this.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator as any,
            selfDeaf: false,
            selfMute: false,
          });
          
          await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
          this.connection.subscribe(this.audioPlayer);
          
          console.log(`[MusicPlayer] Successfully reconnected after encryption error`);
          return true;
        } catch (retryError: any) {
          console.error('[MusicPlayer] Retry failed:', retryError);
          const report = generateDependencyReport();
          console.error('[MusicPlayer] Dependency report after retry:', report);
          return false;
        }
      }
      
      return false;
    }
  }

  /** Update last activity timestamp (used for idle disconnect). */
  touchActivity(): void {
    this.lastActivityAt = Date.now();
  }

  /** True if no activity for at least `idleMs` milliseconds. */
  isIdleLongerThan(idleMs: number): boolean {
    if (this.lastActivityAt === 0) return false;
    return Date.now() - this.lastActivityAt >= idleMs;
  }

  disconnect() {
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    this.isPlaying = false;
    this.currentTrack = null;
    this.queue = [];
    this.pinnedQueue = [];
    this.trackStartTime = 0;
    this.pausedAt = 0;
    this.totalPausedTime = 0;
    this.skipVotes.clear();
  }

  setTextChannel(channelId: string) {
    this.textChannelId = channelId;
  }

  getTextChannel(): string | null {
    return this.textChannelId;
  }

  /**
   * Add a track to the queue
   * @returns true if added, false if queue is full or user at limit
   */
  async addToQueue(track: ITrack, requestedBy?: string, requestedByUsername?: string, isPinned: boolean = false): Promise<boolean> {
    const totalSlots = (this.currentTrack ? 1 : 0) + this.queue.length + this.pinnedQueue.length;
    if (!isPinned && totalSlots >= MAX_QUEUE_SIZE) {
      return false;
    }
    if (requestedBy !== undefined && !isPinned) {
      const userCount = this.userQueueCount.get(requestedBy) ?? 0;
      if (userCount >= MAX_QUEUES_PER_USER) {
        return false;
      }
    }

    this.touchActivity();
    const queueItem: QueueItem = { track, requestedBy, requestedByUsername, isPinned };
    
    if (isPinned) {
      this.pinnedQueue.push(queueItem);
    } else {
      if (requestedBy !== undefined) {
        this.userQueueCount.set(requestedBy, (this.userQueueCount.get(requestedBy) ?? 0) + 1);
      }
      this.queue.push(queueItem);
    }

    // If not playing, start playing
    if (!this.isPlaying) {
      await this.playNext();
    }

    return true;
  }

  async addTracksToQueue(tracks: ITrack[], shuffle: boolean = false): Promise<number> {
    let tracksToAdd = [...tracks];
    
    if (shuffle) {
      tracksToAdd = this.shuffleArray(tracksToAdd);
    }

    let addedCount = 0;
    for (const track of tracksToAdd) {
      if (this.queue.length >= MAX_QUEUE_SIZE) break;
      this.queue.push({ track });
      addedCount++;
    }

    if (!this.isPlaying && addedCount > 0) {
      await this.playNext();
    }

    return addedCount;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  async playNext(): Promise<void> {
    // Ensure we're connected before playing
    if (!this.isConnected()) {
      const { musicLogService } = await import('./MusicLogService');
      musicLogService.addLog('Not connected to voice channel. Please reconnect.', 'warning');
      this.isPlaying = false;
      this.currentTrack = null;
      return;
    }

    // Pinned tracks have priority
    if (this.pinnedQueue.length > 0) {
      const nextItem = this.pinnedQueue.shift()!;
      await this.playTrack(nextItem);
      return;
    }

    // Regular queue
    if (this.queue.length > 0) {
      const nextItem = this.queue.shift()!;
      await this.playTrack(nextItem);
      return;
    }

    // No more tracks
    this.isPlaying = false;
    this.currentTrack = null;
    const { musicLogService } = await import('./MusicLogService');
    musicLogService.addLog('Queue is empty. Select songs from the playlist!', 'info');
    
    // Update display to show empty state
    const { nowPlayingDisplayService } = await import('./NowPlayingDisplayService');
    nowPlayingDisplayService.updateDisplay();
  }

  private async playTrack(item: QueueItem): Promise<void> {
    try {
      this.touchActivity();
      this.isPlaying = true;
      this.currentTrack = item;
      this.trackStartTime = Date.now();
      this.pausedAt = 0;
      this.totalPausedTime = 0;
      this.skipVotes.clear();

      // Debug: Log track info
      console.log(`[MusicPlayer] Attempting to play track: ${item.track.title}`);
      console.log(`[MusicPlayer] Track ID: ${item.track.trackId}`);
      console.log(`[MusicPlayer] Audio Source: ${item.track.audioSource || 'youtube'}`);
      console.log(`[MusicPlayer] Local Path: ${item.track.localPath || 'none'}`);
      console.log(`[MusicPlayer] YouTube URL: ${item.track.youtubeUrl || 'none'}`);

      // Ensure we're connected to voice channel before playing
      if (!this.isConnected()) {
        const { musicLogService } = await import('./MusicLogService');
        musicLogService.addLog(`Skipped: ${item.track.title} (not connected to voice channel)`, 'warning');
        throw new Error(`Not connected to voice channel`);
      }

      let resource;
      const audioSource = item.track.audioSource || 'youtube';

      // Try local file first if available
      if (audioSource === 'local' && item.track.localPath) {
        resource = await this.createLocalAudioResource(item);
      } 
      // Fall back to YouTube if local file not available or audioSource is youtube
      else if (item.track.youtubeUrl) {
        resource = await this.createYouTubeAudioResource(item);
      }
      // No valid audio source
      else {
        const { musicLogService } = await import('./MusicLogService');
        musicLogService.addLog(`Skipped: ${item.track.title} (no audio source available)`, 'warning');
        throw new Error(`Track "${item.track.title}" has no valid audio source`);
      }

      this.audioPlayer.play(resource);

      // Update play count
      if (isDBConnected()) {
        await Track.findOneAndUpdate(
          { trackId: item.track.trackId },
          { 
            $inc: { playCount: 1, monthlyPlayCount: 1 } 
          }
        );
      }

      // Update Now Playing display
      const { nowPlayingDisplayService } = await import('./NowPlayingDisplayService');
      nowPlayingDisplayService.updateDisplay();

      // Add log entry (Now Playing will be shown in log)
      const { musicLogService } = await import('./MusicLogService');
      const artistInfo = item.track.artist ? ` — ${item.track.artist}` : '';
      const requesterInfo = item.requestedByUsername ? ` (requested by ${item.requestedByUsername})` : '';
      musicLogService.addLog(`🎵 Now playing: **${item.track.title}**${artistInfo}${requesterInfo}`, 'success');

    } catch (error: any) {
      console.error('[MusicPlayer] Error playing track:', error);
      const { musicLogService } = await import('./MusicLogService');
      
      // More detailed error logging
      let errorMessage = `Failed to play: ${item.track.title}`;
      if (error.message) {
        errorMessage += ` (${error.message})`;
      }
      if (error.code) {
        errorMessage += ` [${error.code}]`;
      }
      
      musicLogService.addLog(errorMessage, 'error');
      
      // Don't play next if it's a connection error (to avoid infinite loop)
      if (error.message && error.message.includes('not connected')) {
        this.isPlaying = false;
        this.currentTrack = null;
        return;
      }
      
      await this.playNext();
    }
  }

  /**
   * Create audio resource from local MP3 file
   */
  private async createLocalAudioResource(item: QueueItem) {
    const localPath = item.track.localPath!;
    // Resolve path relative to project root's music folder
    const musicDir = path.join(__dirname, '../../music');
    const filePath = path.join(musicDir, localPath);

    console.log(`[MusicPlayer] Attempting to play local file: ${filePath}`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`Local file not found: ${filePath}`);
    }

    // Create audio resource from file stream
    const fileStream = fs.createReadStream(filePath);
    const resource = createAudioResource(fileStream, {
      inputType: StreamType.Arbitrary,
    });

    console.log(`[MusicPlayer] Local file stream created successfully`);
    return resource;
  }

  /**
   * Extract YouTube video ID from URL (handles youtube.com and youtu.be)
   */
  private extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /[?&]v=([a-zA-Z0-9_-]{11})/,
    ];
    for (const re of patterns) {
      const m = url.match(re);
      if (m && m[1]) return m[1];
    }
    return null;
  }

  /**
   * Build a canonical YouTube URL from raw input (avoids ERR_INVALID_URL from malformed URLs)
   */
  private toCanonicalYouTubeUrl(input: string): string | null {
    let url = String(input ?? '')
      .trim()
      .replace(/[\s\u200B-\u200D\uFEFF]/g, ''); // strip spaces and zero-width chars
    if (!url || url === 'undefined' || url === 'null') return null;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
    const videoId = this.extractVideoId(url);
    if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    try {
      new URL(url);
      return url;
    } catch {
      return null;
    }
  }

  /**
   * Create audio resource from YouTube URL (via YouTubeService / youtubei.js)
   */
  private async createYouTubeAudioResource(item: QueueItem) {
    const rawUrl = String(item.track.youtubeUrl ?? '').trim();
    const url = this.toCanonicalYouTubeUrl(rawUrl);

    console.log(`[MusicPlayer] Canonical URL: "${url}"`);

    if (!url) {
      throw new Error(`Track "${item.track.title}" has invalid YouTube URL`);
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error(`Track "${item.track.title}" has invalid YouTube URL`);
    }

    console.log(`[MusicPlayer] Fetching audio stream via yt-dlp for: ${url}`);
    const stream = getAudioStream(videoId);
    console.log(`[MusicPlayer] Stream created successfully`);

    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
    });

    return resource;
  }


  pause(): boolean {
    if (this.audioPlayer.state.status === AudioPlayerStatus.Playing) {
      this.touchActivity();
      this.audioPlayer.pause();
      return true;
    }
    return false;
  }

  resume(): boolean {
    if (this.audioPlayer.state.status === AudioPlayerStatus.Paused) {
      this.touchActivity();
      this.audioPlayer.unpause();
      return true;
    }
    return false;
  }

  skip(): boolean {
    if (this.isPlaying) {
      this.touchActivity();
      this.audioPlayer.stop();
      return true;
    }
    return false;
  }

  /**
   * Add a skip vote
   * @returns { voted: boolean, totalVotes: number, required: number, skipped: boolean }
   */
  addSkipVote(userId: string): { voted: boolean; totalVotes: number; required: number; skipped: boolean } {
    const { SKIP_VOTES_REQUIRED } = require('../config/playlists');
    
    if (this.skipVotes.has(userId)) {
      return { voted: false, totalVotes: this.skipVotes.size, required: SKIP_VOTES_REQUIRED, skipped: false };
    }

    this.skipVotes.add(userId);
    const totalVotes = this.skipVotes.size;

    if (totalVotes >= SKIP_VOTES_REQUIRED) {
      this.skip();
      return { voted: true, totalVotes, required: SKIP_VOTES_REQUIRED, skipped: true };
    }

    return { voted: true, totalVotes, required: SKIP_VOTES_REQUIRED, skipped: false };
  }

  getSkipVotes(): number {
    return this.skipVotes.size;
  }

  setLoop(enabled: boolean): void {
    this.isLooping = enabled;
  }

  isLoopEnabled(): boolean {
    return this.isLooping;
  }

  getCurrentTrack(): QueueItem | null {
    return this.currentTrack;
  }

  getQueue(): QueueItem[] {
    return [...this.pinnedQueue, ...this.queue];
  }

  getQueueLength(): number {
    return this.pinnedQueue.length + this.queue.length;
  }

  /** Number of songs this user currently has in queue (including now playing). Max 5 per user. */
  getQueuedCountForUser(userId: string): number {
    let count = 0;
    if (this.currentTrack?.requestedBy === userId) count++;
    for (const item of this.queue) {
      if (item.requestedBy === userId) count++;
    }
    return count;
  }

  clearQueue(): void {
    this.queue = [];
    this.pinnedQueue = [];
    this.userQueueCount.clear();
  }

  isConnected(): boolean {
    return this.connection !== null && 
           this.connection.state.status === VoiceConnectionStatus.Ready;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /** Current playback state for Pause/Play toggle (uses actual audio player status) */
  getPlaybackState(): 'playing' | 'paused' | 'idle' {
    const status = this.audioPlayer.state.status;
    if (status === AudioPlayerStatus.Playing) return 'playing';
    if (status === AudioPlayerStatus.Paused) return 'paused';
    return 'idle';
  }

  /**
   * Get current playback position in seconds
   */
  getPlaybackPosition(): number {
    if (!this.trackStartTime || !this.isPlaying) return 0;
    
    const now = Date.now();
    let elapsed = now - this.trackStartTime - this.totalPausedTime;
    
    // If currently paused, don't count time since pause
    if (this.pausedAt > 0) {
      elapsed = this.pausedAt - this.trackStartTime - this.totalPausedTime;
    }
    
    return Math.floor(elapsed / 1000);
  }

  /**
   * Remove a track from queue by trackId
   */
  removeFromQueue(trackId: string): boolean {
    const idx = this.queue.findIndex(item => item.track.trackId === trackId);
    if (idx !== -1) {
      const item = this.queue[idx];
      if (item.requestedBy) {
        this.userQueueCount.set(item.requestedBy, Math.max(0, (this.userQueueCount.get(item.requestedBy) ?? 0) - 1));
      }
      this.queue.splice(idx, 1);
      return true;
    }
    return false;
  }
}
