import { Client, VoiceChannel, Guild } from 'discord.js';
import { MusicPlayer } from './MusicPlayer';
import { Track, ITrack, TrackCategory } from '../models/Track';
import { Playlist } from '../models/Playlist';
import { isDBConnected } from '../utils/connectDB';
import { DEFAULT_PLAYLISTS } from '../config/playlists';

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

  // Get all tracks, optionally filtered by category
  async getTracks(category?: TrackCategory | 'all', includeHidden: boolean = false): Promise<ITrack[]> {
    if (!isDBConnected()) return [];

    try {
      const query: any = {};
      
      if (category && category !== 'all') {
        query.category = category;
      }

      if (!includeHidden) {
        query.isHidden = { $ne: true };
      }

      // Only get tracks with valid YouTube URLs
      query.$and = [
        { youtubeUrl: { $exists: true } },
        { youtubeUrl: { $ne: null } },
        { youtubeUrl: { $ne: '' } },
        { youtubeUrl: { $ne: 'undefined' } },
        { youtubeUrl: { $regex: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/ } }
      ];

      const tracks = await Track.find(query).sort({ title: 1 });
      // Double-check and filter tracks with valid URLs
      return tracks.filter(track => 
        track.youtubeUrl && 
        track.youtubeUrl !== 'undefined' && 
        track.youtubeUrl !== 'null' &&
        track.youtubeUrl.trim() !== '' &&
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(track.youtubeUrl)
      );
    } catch (error) {
      console.error('[QueueManager] Error fetching tracks:', error);
      return [];
    }
  }

  // Get hidden tracks only
  async getHiddenTracks(): Promise<ITrack[]> {
    if (!isDBConnected()) return [];

    try {
      const tracks = await Track.find({ 
        isHidden: true,
        $and: [
          { youtubeUrl: { $exists: true } },
          { youtubeUrl: { $ne: null } },
          { youtubeUrl: { $ne: '' } },
          { youtubeUrl: { $ne: 'undefined' } },
          { youtubeUrl: { $regex: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/ } }
        ]
      }).sort({ title: 1 });
      // Double-check and filter tracks with valid URLs
      return tracks.filter(track => 
        track.youtubeUrl && 
        track.youtubeUrl !== 'undefined' && 
        track.youtubeUrl !== 'null' &&
        track.youtubeUrl.trim() !== '' &&
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(track.youtubeUrl)
      );
    } catch (error) {
      console.error('[QueueManager] Error fetching hidden tracks:', error);
      return [];
    }
  }

  // Search tracks by title or artist
  async searchTracks(query: string): Promise<ITrack[]> {
    if (!isDBConnected()) return [];

    try {
      const regex = new RegExp(query, 'i');
      const tracks = await Track.find({
        $or: [
          { title: regex },
          { artist: regex },
        ],
        isHidden: { $ne: true },
        $and: [
          { youtubeUrl: { $exists: true } },
          { youtubeUrl: { $ne: null } },
          { youtubeUrl: { $ne: '' } },
          { youtubeUrl: { $ne: 'undefined' } },
          { youtubeUrl: { $regex: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/ } }
        ],
      }).limit(25);
      // Double-check and filter tracks with valid URLs
      return tracks.filter(track => 
        track.youtubeUrl && 
        track.youtubeUrl !== 'undefined' && 
        track.youtubeUrl !== 'null' &&
        track.youtubeUrl.trim() !== '' &&
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(track.youtubeUrl)
      );
    } catch (error) {
      console.error('[QueueManager] Error searching tracks:', error);
      return [];
    }
  }

  // Get a single track by ID
  async getTrackById(trackId: string): Promise<ITrack | null> {
    if (!isDBConnected()) return null;

    try {
      return await Track.findOne({ trackId });
    } catch (error) {
      console.error('[QueueManager] Error fetching track:', error);
      return null;
    }
  }

  // Shuffle array using Fisher-Yates algorithm
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Shuffle all playlists (called daily by cron)
  async shuffleAllPlaylists(): Promise<void> {
    if (!isDBConnected()) return;

    try {
      const playlists = await Playlist.find({ isDefault: true });

      for (const playlist of playlists) {
        const shuffled = this.shuffleArray(playlist.trackIds);
        playlist.shuffledOrder = shuffled;
        playlist.lastShuffled = new Date();
        await playlist.save();
      }

      console.log(`[QueueManager] Shuffled ${playlists.length} playlists`);
    } catch (error) {
      console.error('[QueueManager] Error shuffling playlists:', error);
    }
  }

  // Initialize default playlists in database
  async initializePlaylists(): Promise<void> {
    if (!isDBConnected()) return;

    try {
      for (const config of DEFAULT_PLAYLISTS) {
        const existing = await Playlist.findOne({ name: config.name });
        
        if (!existing) {
          // Get tracks for this category
          const tracks = await this.getTracks(
            config.category as TrackCategory | 'all',
            config.category === 'hidden'
          );

          const trackIds = tracks.map(t => t.trackId);
          const shuffled = this.shuffleArray(trackIds);

          await Playlist.create({
            name: config.name,
            category: config.category,
            description: config.description,
            trackIds,
            shuffledOrder: shuffled,
            isDefault: true,
            lastShuffled: new Date(),
          });

          console.log(`[QueueManager] Created playlist: ${config.name}`);
        }
      }
    } catch (error) {
      console.error('[QueueManager] Error initializing playlists:', error);
    }
  }

  // Get playlist by category
  async getPlaylist(category: TrackCategory | 'all'): Promise<ITrack[]> {
    if (!isDBConnected()) return [];

    try {
      // Find the playlist
      let playlist = await Playlist.findOne({ category, isDefault: true });

      if (!playlist) {
        // If playlist doesn't exist, return tracks directly
        return await this.getTracks(category, category === 'hidden');
      }

      // Get tracks in shuffled order (plain objects so MusicPlayer gets string youtubeUrl)
      const tracks: ITrack[] = [];
      for (const trackId of playlist.shuffledOrder) {
        const track = await Track.findOne({ trackId });
        // Only add tracks with valid YouTube URL
        if (track && track.youtubeUrl && 
            track.youtubeUrl !== 'undefined' && 
            track.youtubeUrl !== 'null' &&
            String(track.youtubeUrl).trim() !== '' &&
            /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(String(track.youtubeUrl))) {
          const plain = (track as any).toObject ? (track as any).toObject() : { ...track, youtubeUrl: track.youtubeUrl };
          tracks.push(plain);
        } else if (track && (!track.youtubeUrl || track.youtubeUrl === 'undefined')) {
          console.warn(`[QueueManager] Skipping track "${track.title}" (${trackId}) - no valid YouTube URL`);
        }
      }

      return tracks;
    } catch (error) {
      console.error('[QueueManager] Error getting playlist:', error);
      return [];
    }
  }

  // Add track to playlist
  async addTrackToPlaylist(trackId: string, category: TrackCategory): Promise<boolean> {
    if (!isDBConnected()) return false;

    try {
      let playlist = await Playlist.findOne({ category, isDefault: true });
      
      if (!playlist) {
        // Create playlist if it doesn't exist
        playlist = new Playlist({
          name: category === 'hidden' ? 'Hidden Treasures' : `${category.charAt(0).toUpperCase() + category.slice(1)} Music`,
          category,
          description: `Default ${category} playlist`,
          trackIds: [trackId],
          shuffledOrder: [trackId],
          isDefault: true,
          lastShuffled: new Date(),
        });
        await playlist.save();
        return true;
      }

      if (!playlist.trackIds.includes(trackId)) {
        playlist.trackIds.push(trackId);
        playlist.shuffledOrder.push(trackId);
        await playlist.save();
        return true;
      }

      return false;
    } catch (error) {
      console.error('[QueueManager] Error adding track to playlist:', error);
      return false;
    }
  }

  /**
   * Save a YouTube URL as a permanent track in the database
   * @param youtubeUrl YouTube URL to save
   * @param category Category for the track
   * @param customTitle Optional custom title (uses YouTube title if not provided)
   * @param customArtist Optional custom artist (uses channel name if not provided)
   * @returns Object with success status and track data or error message
   */
  async saveYouTubeTrack(
    youtubeUrl: string,
    category: TrackCategory,
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

      // Fetch video info from YouTube (YouTubeService / youtubei.js)
      const { getVideoInfo } = await import('./YouTubeService');
      const videoInfo = await getVideoInfo(youtubeUrl);

      if (!videoInfo || !videoInfo.videoDetails) {
        return { success: false, error: 'Could not fetch video information from YouTube' };
      }

      const videoDetails = videoInfo.videoDetails;
      
      // Use custom title/artist if provided, otherwise use YouTube data
      const title = customTitle || videoDetails.title || 'Unknown Title';
      const artist = customArtist || videoDetails.author?.name || 'Unknown Artist';
      const duration = parseInt(videoDetails.lengthSeconds) || 0;
      const description = videoDetails.description?.substring(0, 500) || '';

      // Create new track
      const newTrack = new Track({
        trackId,
        title,
        artist,
        youtubeUrl,
        audioSource: 'youtube',
        duration,
        category,
        description,
        instruments: [],
        isHidden: category === 'hidden',
        playCount: 0,
        monthlyPlayCount: 0,
        upvotes: 0,
        monthlyUpvotes: 0,
        pinCount: 0,
        monthlyPinCount: 0,
        upvotedBy: [],
      });

      await newTrack.save();

      // Add track to playlist
      await this.addTrackToPlaylist(trackId, category);

      return { success: true, track: newTrack };
    } catch (error: any) {
      console.error('[QueueManager] Error saving YouTube track:', error);
      return { success: false, error: error.message || 'Unknown error occurred' };
    }
  }

  // Get leaderboard data
  async getLeaderboard(): Promise<{
    mostPlayed: ITrack | null;
    mostUpvoted: ITrack | null;
    mostPinned: ITrack | null;
  }> {
    if (!isDBConnected()) {
      return { mostPlayed: null, mostUpvoted: null, mostPinned: null };
    }

    try {
      const [mostPlayed] = await Track.find({ isHidden: { $ne: true } })
        .sort({ monthlyPlayCount: -1 })
        .limit(1);

      const [mostUpvoted] = await Track.find({ isHidden: { $ne: true } })
        .sort({ monthlyUpvotes: -1 })
        .limit(1);

      const [mostPinned] = await Track.find({ isHidden: { $ne: true } })
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
}
