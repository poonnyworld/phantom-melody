import { Client, VoiceChannel, Guild } from 'discord.js';
import { MusicPlayer } from './MusicPlayer';
import { Track, ITrack, TrackCategory } from '../models/Track';
import { Playlist } from '../models/Playlist';
import { isDBConnected } from '../utils/connectDB';
import { MAIN_PLAYLIST } from '../config/playlists';

export class QueueManager {
  private client: Client;
  private players: Map<string, MusicPlayer> = new Map(); // guildId -> MusicPlayer

  constructor(client: Client) {
    this.client = client;
  }

  getPlayer(guildId: string): MusicPlayer | undefined {
    return this.players.get(guildId);
  }

  async getOrCreatePlayer(guildId: string, voiceChannel: VoiceChannel, textChannelId: string): Promise<MusicPlayer> {
    let player = this.players.get(guildId);

    if (!player) {
      player = new MusicPlayer(this.client, guildId);
      this.players.set(guildId, player);
    }

    if (!player.isConnected()) {
      const connected = await player.connect(voiceChannel);
      if (!connected) {
        throw new Error('Failed to connect to voice channel. Please check bot permissions and try again.');
      }
    }

    player.setTextChannel(textChannelId);
    return player;
  }

  destroyPlayer(guildId: string): void {
    const player = this.players.get(guildId);
    if (player) {
      player.disconnect();
      this.players.delete(guildId);
    }
  }

  /**
   * Get all tracks from the main playlist (Phantom Blade Zero Melody)
   * รวมทั้งแทร็กจาก YouTube และ local (WAV) ตาม trackIds ในเพลย์ลิสต์
   */
  async getAllTracks(): Promise<ITrack[]> {
    if (!isDBConnected()) return [];

    try {
      const playlist = await Playlist.findOne({ name: MAIN_PLAYLIST.name });
      if (!playlist || !playlist.trackIds?.length) {
        return [];
      }
      const trackIds = playlist.trackIds;
      const tracks = await Track.find({ trackId: { $in: trackIds } });
      const byId = new Map(tracks.map((t) => [t.trackId, t]));
      const result = trackIds.map((id) => byId.get(id)).filter((t) => t != null);
      return result as ITrack[];
    } catch (error) {
      console.error('[QueueManager] Error fetching tracks:', error);
      return [];
    }
  }

  /**
   * Search tracks by title or artist (ภายในเพลย์ลิสต์หลัก)
   */
  async searchTracks(query: string): Promise<ITrack[]> {
    if (!isDBConnected()) return [];

    try {
      const all = await this.getAllTracks();
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return all.filter((t) => regex.test(t.title) || regex.test(t.artist || '')).slice(0, 25);
    } catch (error) {
      console.error('[QueueManager] Error searching tracks:', error);
      return [];
    }
  }

  /**
   * Get a single track by ID
   */
  async getTrackById(trackId: string): Promise<ITrack | null> {
    if (!isDBConnected()) return null;

    try {
      return await Track.findOne({ trackId });
    } catch (error) {
      console.error('[QueueManager] Error fetching track:', error);
      return null;
    }
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Save a YouTube URL as a permanent track in the database
   */
  async saveYouTubeTrack(
    youtubeUrl: string,
    customTitle?: string,
    customArtist?: string
  ): Promise<{ success: boolean; track?: ITrack; error?: string }> {
    if (!isDBConnected()) {
      return { success: false, error: 'Database is not connected' };
    }

    try {
      // Validate YouTube URL format
      const isYouTubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(youtubeUrl);
      if (!isYouTubeUrl) {
        return { success: false, error: 'Invalid YouTube URL format' };
      }

      // Extract video ID
      const videoIdMatch = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
      if (!videoIdMatch || !videoIdMatch[1]) {
        return { success: false, error: 'Could not extract video ID from URL' };
      }

      const videoId = videoIdMatch[1];
      const trackId = `youtube-${videoId}`;

      // Check if track already exists
      const existingTrack = await Track.findOne({ youtubeUrl });
      if (existingTrack) {
        return { success: false, error: 'Track with this YouTube URL already exists', track: existingTrack };
      }

      const existingById = await Track.findOne({ trackId });
      if (existingById) {
        return { success: false, error: 'Track with this video ID already exists', track: existingById };
      }

      // Fetch video info from YouTube
      const { getVideoInfo } = await import('./YouTubeService');
      const videoInfo = await getVideoInfo(youtubeUrl);

      if (!videoInfo || !videoInfo.videoDetails) {
        return { success: false, error: 'Could not fetch video information from YouTube' };
      }

      const videoDetails = videoInfo.videoDetails;

      // Use custom title/artist if provided, otherwise use YouTube data
      const title = customTitle || videoDetails.title || 'Unknown Title';
      const artist = customArtist || videoDetails.author?.name || 'PBZ Music';
      const duration = parseInt(videoDetails.lengthSeconds) || 0;
      const description = videoDetails.description?.substring(0, 500) || '';

      // Get thumbnail URL
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      // Create new track
      const newTrack = new Track({
        trackId,
        title,
        artist,
        youtubeUrl,
        audioSource: 'youtube',
        duration,
        category: 'pbz', // Single category
        description,
        instruments: [],
        isHidden: false,
        playCount: 0,
        monthlyPlayCount: 0,
        upvotes: 0,
        monthlyUpvotes: 0,
        pinCount: 0,
        monthlyPinCount: 0,
        upvotedBy: [],
        thumbnailUrl,
      });

      await newTrack.save();

      return { success: true, track: newTrack };
    } catch (error: any) {
      console.error('[QueueManager] Error saving YouTube track:', error);
      return { success: false, error: error.message || 'Unknown error occurred' };
    }
  }

  /**
   * Remove a track from the database
   */
  async removeTrack(trackId: string): Promise<boolean> {
    if (!isDBConnected()) return false;

    try {
      const result = await Track.deleteOne({ trackId });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('[QueueManager] Error removing track:', error);
      return false;
    }
  }

  /**
   * Get leaderboard data
   */
  async getLeaderboard(): Promise<{
    mostPlayed: ITrack | null;
    mostUpvoted: ITrack | null;
    mostPinned: ITrack | null;
  }> {
    if (!isDBConnected()) {
      return { mostPlayed: null, mostUpvoted: null, mostPinned: null };
    }

    try {
      const [mostPlayed] = await Track.find({})
        .sort({ monthlyPlayCount: -1 })
        .limit(1);

      const [mostUpvoted] = await Track.find({})
        .sort({ monthlyUpvotes: -1 })
        .limit(1);

      const [mostPinned] = await Track.find({})
        .sort({ monthlyPinCount: -1 })
        .limit(1);

      return {
        mostPlayed: mostPlayed || null,
        mostUpvoted: mostUpvoted || null,
        mostPinned: mostPinned || null,
      };
    } catch (error) {
      console.error('[QueueManager] Error fetching leaderboard:', error);
      return { mostPlayed: null, mostUpvoted: null, mostPinned: null };
    }
  }

  // Legacy methods for backward compatibility
  async getTracks(category?: TrackCategory | 'all', includeHidden: boolean = false): Promise<ITrack[]> {
    return this.getAllTracks();
  }

  async getPlaylist(category: TrackCategory | 'all'): Promise<ITrack[]> {
    return this.getAllTracks();
  }

  async addTrackToPlaylist(trackId: string, category: TrackCategory): Promise<boolean> {
    // No longer needed - single playlist
    return true;
  }

  async removeTrackFromPlaylist(trackId: string, category: TrackCategory): Promise<boolean> {
    return this.removeTrack(trackId);
  }

  async initializePlaylists(): Promise<void> {
    // No longer needed - single playlist
    console.log('[QueueManager] Using single playlist: Phantom Blade Zero Melody');
  }

  async shuffleAllPlaylists(): Promise<void> {
    // No longer needed - single playlist
  }
}
