import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { QueueManager } from './QueueManager';
import { MAIN_PLAYLIST, MAX_QUEUE_SIZE, SKIP_VOTES_REQUIRED } from '../config/playlists';

export class MusicInteractionService {
  private client: Client | null = null;
  private buttonMessageIds: Map<string, string> = new Map(); // channelId -> messageId
  private queueManager: QueueManager;

  constructor(client: Client, queueManager: QueueManager) {
    this.client = client;
    this.queueManager = queueManager;
  }

  /**
   * Start the music interaction service
   */
  public start(client: Client): void {
    this.client = client;
    console.log('[MusicInteractionService] Initializing music interaction service...');

    // Wait for client to be ready before initial setup
    if (client.isReady()) {
      this.setupAllButtons(client).catch((error) => {
        console.error('[MusicInteractionService] ❌ Error in initial button setup:', error);
      });
    } else {
      client.once('ready', () => {
        this.setupAllButtons(client).catch((error) => {
          console.error('[MusicInteractionService] ❌ Error in initial button setup:', error);
        });
      });
    }

    // Setup buttons every 3 minutes (auto-refresh)
    setInterval(() => {
      if (client.isReady()) {
        this.setupAllButtons(client).catch((error) => {
          console.error('[MusicInteractionService] ❌ Error in periodic button setup:', error);
        });
      }
    }, 3 * 60 * 1000);
  }

  /**
   * Setup all persistent buttons in their respective channels
   */
  private async setupAllButtons(client: Client): Promise<void> {
    console.log('[MusicInteractionService] Setting up all persistent buttons...');

    const controlChannelId = process.env.PHANTOM_MELODY_CONTROL_CHANNEL_ID || process.env.PHANTOM_MELODY_TEXT_CHANNEL_ID;
    const playlistControlAdminId = process.env.ADMIN_PLAYLIST_CHANNEL_ID;

    if (!controlChannelId) {
      console.warn('[MusicInteractionService] Channel IDs not set, skipping button setup.');
      return;
    }

    // Setup simplified Music Control buttons (Skip vote + View Queue + Song selection)
    await this.ensureMusicControlButtons(client, controlChannelId);

    // Setup song selection from playlist (for users to pick songs)
    await this.ensureSongSelectionMessage(client, controlChannelId);

    // Setup Playlist Control Admin channel (admin-only add songs)
    if (playlistControlAdminId) {
      await this.ensureAdminPlaylistControl(client, playlistControlAdminId);
    }
  }

  /**
   * Setup simplified Music Control buttons (Skip vote + View Queue)
   */
  private async ensureMusicControlButtons(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`[MusicInteractionService] ❌ Channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;

      // Check permissions
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[MusicInteractionService] ❌ Bot lacks required permissions in music control channel ${channelId}.`);
        return;
      }

      // Create the embed
      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🎵 Music Player Controls')
        .setDescription(
          '**Control the music player with the buttons below**\n\n' +
          `• **Vote Skip** — Vote to skip (requires ${SKIP_VOTES_REQUIRED} votes)\n` +
          '• **View Queue** — View current queue\n\n' +
          '💡 Select songs from the menu below to add to queue!'
        )
        .setFooter({
          text: `🗡️ Phantom Blade Zero Melody • Queue limit: ${MAX_QUEUE_SIZE} songs`,
        })
        .setTimestamp();

      // Create buttons - only Skip (vote) and View Queue
      const skipButton = new ButtonBuilder()
        .setCustomId('music_vote_skip')
        .setLabel('Vote Skip')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⏭️');

      const queueButton = new ButtonBuilder()
        .setCustomId('music_queue')
        .setLabel('View Queue')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋');

      const row1 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(skipButton, queueButton);

      // Try to find existing button message
      let buttonMessage: Message | null = null;
      const storedMessageId = this.buttonMessageIds.get(`${channelId}_controls`);

      if (storedMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(storedMessageId);
          if (storedMessage) {
            buttonMessage = storedMessage;
          }
        } catch (error) {
          this.buttonMessageIds.delete(`${channelId}_controls`);
        }
      }

      if (!buttonMessage) {
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === client.user!.id) {
            const hasButton = msg.components.some((row: any) =>
              row.components.some((component: any) =>
                component.type === 2 && (component.customId === 'music_vote_skip' || component.customId === 'music_playpause')
              )
            );
            if (hasButton) {
              buttonMessage = msg;
              this.buttonMessageIds.set(`${channelId}_controls`, id);
              break;
            }
          }
        }
      }

      if (buttonMessage) {
        try {
          await buttonMessage.edit({ embeds: [embed], components: [row1] });
          console.log(`[MusicInteractionService] ✓ Music control button message updated successfully`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error editing music control button message:`, error);
          this.buttonMessageIds.delete(`${channelId}_controls`);
          buttonMessage = null;
        }
      }

      if (!buttonMessage) {
        try {
          const newMessage = await textChannel.send({ embeds: [embed], components: [row1] });
          this.buttonMessageIds.set(`${channelId}_controls`, newMessage.id);
          console.log(`[MusicInteractionService] ✓ Music control button message sent successfully`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error sending music control button message:`, error);
        }
      }
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Critical error setting up music control buttons:`, error);
    }
  }

  /**
   * Setup song selection from the single playlist
   */
  private async ensureSongSelectionMessage(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return;
      }

      const textChannel = channel as TextChannel;

      // Get all tracks from the main playlist
      const tracks = await this.queueManager.getAllTracks();
      const trackCount = tracks.length;

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`${MAIN_PLAYLIST.emoji} ${MAIN_PLAYLIST.name}`)
        .setDescription(
          `${MAIN_PLAYLIST.description}\n\n` +
          `**${trackCount}** tracks in playlist\n\n` +
          '📋 Select songs from the menu below to add to queue\n' +
          `💡 Queue supports up to ${MAX_QUEUE_SIZE} tracks`
        )
        .setFooter({
          text: '🗡️ Phantom Blade Zero Melody',
        })
        .setTimestamp();

      // Create select menu for songs (up to 25 options)
      const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

      if (tracks.length > 0) {
        const maxOptions = 25;
        const options = tracks.slice(0, maxOptions).map((track: any) =>
          new StringSelectMenuOptionBuilder()
            .setLabel((track.title || track.trackId).slice(0, 100))
            .setDescription((track.artist || 'PBZ Music').slice(0, 100))
            .setValue(track.trackId)
        );

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('song_select')
          .setPlaceholder('Select a song to add to queue...')
          .addOptions(options);

        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
      }

      // Try to find existing message
      let buttonMessage: Message | null = null;
      const storedMessageId = this.buttonMessageIds.get(`${channelId}_songs`);

      if (storedMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(storedMessageId);
          if (storedMessage) {
            buttonMessage = storedMessage;
          }
        } catch (error) {
          this.buttonMessageIds.delete(`${channelId}_songs`);
        }
      }

      if (!buttonMessage) {
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === client.user!.id) {
            const hasSelectMenu = msg.components.some((row: any) =>
              row.components.some((component: any) =>
                component.type === 3 && component.customId === 'song_select'
              )
            );
            if (hasSelectMenu) {
              buttonMessage = msg;
              this.buttonMessageIds.set(`${channelId}_songs`, id);
              break;
            }
          }
        }
      }

      if (buttonMessage) {
        try {
          await buttonMessage.edit({ embeds: [embed], components });
          console.log(`[MusicInteractionService] ✓ Song selection message updated successfully`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error editing song selection message:`, error);
          this.buttonMessageIds.delete(`${channelId}_songs`);
          buttonMessage = null;
        }
      }

      if (!buttonMessage) {
        try {
          const newMessage = await textChannel.send({ embeds: [embed], components });
          this.buttonMessageIds.set(`${channelId}_songs`, newMessage.id);
          console.log(`[MusicInteractionService] ✓ Song selection message sent successfully`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error sending song selection message:`, error);
        }
      }
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Critical error setting up song selection:`, error);
    }
  }

  /**
   * Setup Admin Playlist Control channel (admin-only add/remove songs)
   */
  private async ensureAdminPlaylistControl(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`[MusicInteractionService] ❌ Admin playlist control channel ${channelId} not found.`);
        return;
      }

      const textChannel = channel as TextChannel;
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);
      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[MusicInteractionService] ❌ Bot lacks permissions in admin channel ${channelId}.`);
        return;
      }

      const tracks = await this.queueManager.getAllTracks();
      const trackCount = tracks.length;

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔧 Admin: ${MAIN_PLAYLIST.emoji} ${MAIN_PLAYLIST.name}`)
        .setDescription(
          `**${trackCount}** tracks in playlist\n\n` +
          '**Admin Commands:**\n' +
          '• **Add Song** — Add song via YouTube URL\n' +
          '• **View & Remove** — View track list and remove\n\n' +
          '⚠️ Admin only'
        )
        .setFooter({ text: 'Phantom Blade Zero Melody - Admin Panel' })
        .setTimestamp();

      const addBtn = new ButtonBuilder()
        .setCustomId('admin_add_song')
        .setLabel('Add Song')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕');
      const viewBtn = new ButtonBuilder()
        .setCustomId('admin_view_songs')
        .setLabel('View & Remove')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(addBtn, viewBtn);

      const storageKey = `${channelId}_admin`;
      let message: Message | null = null;
      const storedId = this.buttonMessageIds.get(storageKey);
      if (storedId) {
        try {
          const msg = await textChannel.messages.fetch(storedId);
          if (msg) message = msg;
        } catch {
          this.buttonMessageIds.delete(storageKey);
        }
      }
      if (!message) {
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === client.user!.id && msg.components.some((row: any) => row.components.some((c: any) => c.customId === 'admin_add_song'))) {
            message = msg;
            this.buttonMessageIds.set(storageKey, id);
            break;
          }
        }
      }
      if (message) {
        try {
          await message.edit({ embeds: [embed], components: [row] });
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error editing admin message:`, error);
          this.buttonMessageIds.delete(storageKey);
          message = null;
        }
      }
      if (!message) {
        try {
          const newMessage = await textChannel.send({ embeds: [embed], components: [row] });
          this.buttonMessageIds.set(storageKey, newMessage.id);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error sending admin message:`, error);
        }
      }

      console.log(`[MusicInteractionService] ✓ Admin playlist control message updated`);
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Critical error setting up admin playlist control:`, error);
    }
  }

  /**
   * Refresh the song selection menu (call after adding/removing tracks)
   */
  public async refreshSongSelection(): Promise<void> {
    const controlChannelId = process.env.PHANTOM_MELODY_CONTROL_CHANNEL_ID || process.env.PHANTOM_MELODY_TEXT_CHANNEL_ID;
    if (controlChannelId && this.client) {
      await this.ensureSongSelectionMessage(this.client, controlChannelId);
    }

    const adminChannelId = process.env.ADMIN_PLAYLIST_CHANNEL_ID;
    if (adminChannelId && this.client) {
      await this.ensureAdminPlaylistControl(this.client, adminChannelId);
    }
  }

  /**
   * Clear all button message IDs (for cleanup)
   */
  public clearButtonMessageIds(): void {
    this.buttonMessageIds.clear();
  }
}
