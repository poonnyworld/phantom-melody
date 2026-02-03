import { Client, TextChannel, EmbedBuilder, Message, AttachmentBuilder } from 'discord.js';
import { formatDuration, MAIN_PLAYLIST } from '../config/playlists';
import { QueueItem } from './MusicPlayer';

/**
 * Service for displaying the beautiful Now Playing view
 * Shows current track, next 5 songs, and playback timeline
 */
export class NowPlayingDisplayService {
  private client: Client | null = null;
  private displayMessageId: string | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private lastUpdate: number = 0;
  private readonly UPDATE_INTERVAL = 10000; // Update every 10 seconds for timeline
  private readonly MIN_UPDATE_INTERVAL = 2000; // Minimum 2 seconds between updates

  /**
   * Start the display service
   */
  public start(client: Client): void {
    this.client = client;
    console.log('[NowPlayingDisplayService] Starting display service...');

    // Wait for client to be ready
    if (client.isReady()) {
      this.ensureDisplayMessage().catch(console.error);
      this.startUpdateLoop();
    } else {
      client.once('ready', () => {
        this.ensureDisplayMessage().catch(console.error);
        this.startUpdateLoop();
      });
    }
  }

  /**
   * Stop the display service
   */
  public stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.client = null;
    this.displayMessageId = null;
  }

  /** Clear stored message ID so next updateDisplay() will create a new message (e.g. after reorder). */
  public clearStoredMessageId(): void {
    this.displayMessageId = null;
  }

  /**
   * Start the periodic update loop
   */
  private startUpdateLoop(): void {
    this.updateInterval = setInterval(() => {
      this.updateDisplay().catch(console.error);
    }, this.UPDATE_INTERVAL);
  }

  /**
   * Manually trigger a display update
   */
  public async updateDisplay(): Promise<void> {
    // Rate limit updates
    const now = Date.now();
    if (now - this.lastUpdate < this.MIN_UPDATE_INTERVAL) {
      return;
    }
    this.lastUpdate = now;

    await this.ensureDisplayMessage();
  }

  /**
   * Ensure the display message exists and is updated
   */
  private async ensureDisplayMessage(): Promise<void> {
    const channelId = process.env.PHANTOM_RADIO_MUSIC_PLAYER_CHANNEL_ID || process.env.PHANTOM_RADIO_TEXT_CHANNEL_ID;

    if (!channelId || !this.client || !this.client.isReady()) {
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`[NowPlayingDisplayService] ❌ Channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;
      const botMember = await textChannel.guild.members.fetch(this.client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[NowPlayingDisplayService] ❌ Bot lacks permissions in display channel.`);
        return;
      }

      // Generate the embed
      const embed = await this.generateDisplayEmbed();

      // Find existing message
      let displayMessage: Message | null = null;

      if (this.displayMessageId) {
        try {
          displayMessage = await textChannel.messages.fetch(this.displayMessageId);
        } catch {
          this.displayMessageId = null;
        }
      }

      // Search for existing display message
      if (!displayMessage) {
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === this.client.user!.id) {
            const hasDisplayEmbed = msg.embeds.some(emb =>
              emb.title?.includes('Now Playing') || emb.title?.includes(MAIN_PLAYLIST.displayName) || emb.title?.includes(MAIN_PLAYLIST.name)
            );
            if (hasDisplayEmbed) {
              displayMessage = msg;
              this.displayMessageId = id;
              break;
            }
          }
        }
      }

      if (displayMessage) {
        try {
          await displayMessage.edit({ embeds: [embed] });
        } catch (error) {
          console.error('[NowPlayingDisplayService] Error editing display message:', error);
          this.displayMessageId = null;
        }
      } else {
        try {
          const newMessage = await textChannel.send({ embeds: [embed] });
          this.displayMessageId = newMessage.id;
          console.log(`[NowPlayingDisplayService] ✓ Created new display message: ${newMessage.id}`);
        } catch (error) {
          console.error('[NowPlayingDisplayService] Error sending display message:', error);
        }
      }
    } catch (error) {
      console.error('[NowPlayingDisplayService] ❌ Error ensuring display message:', error);
    }
  }

  /**
   * Generate the beautiful display embed
   */
  private async generateDisplayEmbed(): Promise<EmbedBuilder> {
    const { client } = await import('../index');
    const queueManager = client.queueManager;

    // Get guild ID from environment or first available guild
    const guildId = process.env.GUILD_ID || this.client?.guilds.cache.first()?.id;
    if (!guildId) {
      return this.generateIdleEmbed();
    }

    const player = queueManager.getPlayer(guildId);
    if (!player || !player.isConnected()) {
      return this.generateIdleEmbed();
    }

    const currentTrack = player.getCurrentTrack();
    if (!currentTrack) {
      return this.generateIdleEmbed();
    }

    const track = currentTrack.track;
    const queue = player.getQueue();
    const playbackPosition = player.getPlaybackPosition();
    const duration = track.duration || 0;
    const state = player.getPlaybackState();

    // Create progress bar
    const progressBar = this.createProgressBar(playbackPosition, duration);
    const positionStr = formatDuration(playbackPosition);
    const durationStr = formatDuration(duration);

    // Status indicator
    const statusEmoji = state === 'playing' ? '● Playing in:' : state === 'paused' ? '⏸️ Paused' : '⏹️ Stopped';
    
    // Get voice channel name
    const voiceChannelId = process.env.PHANTOM_RADIO_VOICE_CHANNEL_ID;
    let voiceChannelName = 'Voice Channel';
    if (voiceChannelId && this.client) {
      try {
        const voiceChannel = await this.client.channels.fetch(voiceChannelId);
        if (voiceChannel && 'name' in voiceChannel && voiceChannel.name) {
          voiceChannelName = voiceChannel.name as string;
        }
      } catch {
        // Use default name
      }
    }

    const embed = new EmbedBuilder()
      .setColor(state === 'playing' ? 0x57F287 : 0x99AAB5) // Green when playing, gray otherwise
      .setAuthor({
        name: `${statusEmoji} 🎧 ${voiceChannelName}`,
        iconURL: this.client?.user?.displayAvatarURL(),
      })
      .setTitle(track.title)
      .setDescription(track.artist || 'Unknown Artist');

    // Add thumbnail if available
    if (track.thumbnailUrl) {
      embed.setThumbnail(track.thumbnailUrl);
    } else if (track.youtubeUrl) {
      // Extract video ID for thumbnail
      const videoIdMatch = track.youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
      if (videoIdMatch && videoIdMatch[1]) {
        embed.setThumbnail(`https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`);
      }
    }

    // Add requester info if available
    if (currentTrack.requestedByUsername) {
      embed.addFields({
        name: '\u200B',
        value: `🙋 Requested by **${currentTrack.requestedByUsername}**`,
        inline: false,
      });
    }

    // Progress bar section
    embed.addFields({
      name: '\u200B',
      value: `\`${positionStr}\` ${progressBar} \`${durationStr}\``,
      inline: false,
    });

    // Queue section (next 5 songs)
    if (queue.length > 0) {
      const totalQueueDuration = queue.reduce((sum: number, item: QueueItem) => sum + (item.track.duration || 0), 0);
      const queueDurationStr = formatDuration(totalQueueDuration);

      let queueText = '';
      const maxDisplay = 5;
      const displayQueue = queue.slice(0, maxDisplay);

      displayQueue.forEach((item: QueueItem, index: number) => {
        const trackDuration = formatDuration(item.track.duration || 0);
        const requester = item.requestedByUsername ? `  🙋 ${item.requestedByUsername}` : '';
        queueText += `**${index + 1}**  ${item.track.title}\n`;
        queueText += `    ${item.track.artist || 'Unknown'} • \`${trackDuration}\`${requester}\n`;
      });

      if (queue.length > maxDisplay) {
        queueText += `\n--- and ${queue.length - maxDisplay} more ---`;
      }

      embed.addFields({
        name: `⊙ Up Next\n${queue.length} tracks • ~${Math.ceil(totalQueueDuration / 60)} min`,
        value: queueText || '*No tracks in queue*',
        inline: false,
      });
    } else {
      embed.addFields({
        name: '⊙ Up Next',
        value: '*No tracks in queue — Select songs from the playlist!*',
        inline: false,
      });
    }

    embed.setFooter({
      text: '🎵 Phantom Radio',
    });
    embed.setTimestamp();

    return embed;
  }

  /**
   * Generate idle state embed
   */
  private generateIdleEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0x2F3136)
      .setTitle(`🎵 ${MAIN_PLAYLIST.displayName}`)
      .setDescription('*No music currently playing*\n\nSelect songs from the playlist in the Control channel to start listening!')
      .setFooter({
        text: `🎵 ${MAIN_PLAYLIST.displayName}`,
      })
      .setTimestamp();
  }

  /**
   * Create a visual progress bar
   */
  private createProgressBar(position: number, duration: number): string {
    const totalBars = 20;
    if (duration <= 0) return '─'.repeat(totalBars);

    const progress = Math.min(position / duration, 1);
    const filledBars = Math.round(progress * totalBars);
    const emptyBars = totalBars - filledBars;

    // Use filled and empty characters for progress bar
    const filled = '━'.repeat(Math.max(0, filledBars - 1));
    const pointer = filledBars > 0 ? '⬤' : '';
    const empty = '─'.repeat(emptyBars);

    return filled + pointer + empty;
  }
}

// Singleton instance
export const nowPlayingDisplayService = new NowPlayingDisplayService();
