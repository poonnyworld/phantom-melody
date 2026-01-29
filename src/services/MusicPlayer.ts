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
import play from 'play-dl';
import { Track, ITrack } from '../models/Track';
import { isDBConnected } from '../utils/connectDB';
import { setUserCurrentTrack } from '../events/voiceStateUpdate';
import * as fs from 'fs';
import * as path from 'path';

export interface QueueItem {
  track: ITrack;
  requestedBy?: string;
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
      // Track finished playing
      if (this.isLooping && this.currentTrack) {
        // Replay the same track
        await this.playTrack(this.currentTrack);
      } else {
        // Play next track
        await this.playNext();
      }
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
        console.log(`[MusicPlayer] Reusing existing connection to voice channel: ${voiceChannel.name}`);
        return true;
      }

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

  disconnect() {
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    this.isPlaying = false;
    this.currentTrack = null;
    this.queue = [];
    this.pinnedQueue = [];
  }

  setTextChannel(channelId: string) {
    this.textChannelId = channelId;
  }

  getTextChannel(): string | null {
    return this.textChannelId;
  }

  async addToQueue(track: ITrack, requestedBy?: string, isPinned: boolean = false): Promise<void> {
    const queueItem: QueueItem = { track, requestedBy, isPinned };
    
    if (isPinned) {
      this.pinnedQueue.push(queueItem);
    } else {
      this.queue.push(queueItem);
    }

    // If not playing, start playing
    if (!this.isPlaying) {
      await this.playNext();
    }
  }

  async addTracksToQueue(tracks: ITrack[], shuffle: boolean = false): Promise<void> {
    let tracksToAdd = [...tracks];
    
    if (shuffle) {
      tracksToAdd = this.shuffleArray(tracksToAdd);
    }

    for (const track of tracksToAdd) {
      this.queue.push({ track });
    }

    if (!this.isPlaying) {
      await this.playNext();
    }
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
    musicLogService.addLog('Queue is empty. Add more tracks with `/play` or `/playlist`!', 'info');
  }

  private async playTrack(item: QueueItem): Promise<void> {
    try {
      this.isPlaying = true;
      this.currentTrack = item;

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

      // Update listening history for users in voice channel
      // This will be handled by voiceStateUpdate event

      // Add log entry (Now Playing will be shown in log)
      const { musicLogService } = await import('./MusicLogService');
      const artistInfo = item.track.artist ? ` - ${item.track.artist}` : '';
      const sourceIcon = audioSource === 'local' ? '💾' : '🎵';
      musicLogService.addLog(`${sourceIcon} Now playing: **${item.track.title}**${artistInfo}${item.isPinned ? ' 📌 (Pinned)' : ''}`, 'success');

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
   * Create audio resource from YouTube URL
   */
  private async createYouTubeAudioResource(item: QueueItem) {
    const url = String(item.track.youtubeUrl).trim();
    
    console.log(`[MusicPlayer] URL after String() and trim(): "${url}"`);
    
    // Validate URL
    if (!url || url === 'undefined' || url === 'null' || url === '') {
      throw new Error(`Track "${item.track.title}" has invalid YouTube URL: ${url}`);
    }

    // Check if URL is a valid YouTube URL
    if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)) {
      throw new Error(`Track "${item.track.title}" has invalid YouTube URL format: ${url}`);
    }

    console.log(`[MusicPlayer] URL validation passed, attempting to stream: ${url}`);

    // Get audio stream from YouTube
    console.log(`[MusicPlayer] Calling play.stream() with URL: ${url}`);
    const stream = await play.stream(url);
    console.log(`[MusicPlayer] Stream obtained successfully, type: ${stream.type}`);
    
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
    });

    return resource;
  }


  pause(): boolean {
    if (this.audioPlayer.state.status === AudioPlayerStatus.Playing) {
      this.audioPlayer.pause();
      return true;
    }
    return false;
  }

  resume(): boolean {
    if (this.audioPlayer.state.status === AudioPlayerStatus.Paused) {
      this.audioPlayer.unpause();
      return true;
    }
    return false;
  }

  skip(): boolean {
    if (this.isPlaying) {
      this.audioPlayer.stop();
      return true;
    }
    return false;
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

  clearQueue(): void {
    this.queue = [];
    this.pinnedQueue = [];
  }

  isConnected(): boolean {
    return this.connection !== null && 
           this.connection.state.status === VoiceConnectionStatus.Ready;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}
