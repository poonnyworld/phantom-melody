import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { QueueManager } from './QueueManager';
import { MAIN_PLAYLIST, MAX_QUEUE_SIZE, MAX_QUEUES_PER_USER, SKIP_VOTES_REQUIRED } from '../config/playlists';

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

    const songSelectionChannelId = process.env.PHANTOM_RADIO_SONG_SELECTION_CHANNEL_ID || process.env.PHANTOM_RADIO_TEXT_CHANNEL_ID;
    const musicPlayerChannelId = process.env.PHANTOM_RADIO_MUSIC_PLAYER_CHANNEL_ID;
    const manualChannelId = process.env.PHANTOM_RADIO_MANUAL_CHANNEL_ID;
    const playlistControlAdminId = process.env.ADMIN_PLAYLIST_CHANNEL_ID;
    const adminControlChannelId = process.env.ADMIN_CONTROL_CHANNEL_ID;

    // Music player channel: single message (Now Playing + buttons) is managed by NowPlayingDisplayService
    if (musicPlayerChannelId) {
      await this.cleanupOldMusicPlayerMessages(client, musicPlayerChannelId);
    }
    if (songSelectionChannelId) {
      await this.ensureSongSelectionMessage(client, songSelectionChannelId);
      await this.ensurePlaylistDisplayMessage(client, songSelectionChannelId);
    }
    if (manualChannelId) {
      await this.ensureManualMessage(client, manualChannelId);
    }
    if (playlistControlAdminId) {
      await this.ensureAdminPlaylistControl(client, playlistControlAdminId);
    }
    if (adminControlChannelId) {
      await this.ensureAdminControlButtons(client, adminControlChannelId);
    }
  }

  /**
   * Remove old separate "Music Player Controls" and "View Queue" messages so only the single
   * Now Playing message (with buttons below) remains in the music player channel.
   */
  private async cleanupOldMusicPlayerMessages(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;
      const textChannel = channel as TextChannel;
      const messages = await textChannel.messages.fetch({ limit: 20 });
      for (const [, msg] of messages) {
        if (msg.author.id !== client.user!.id || !msg.embeds[0]) continue;
        const title = msg.embeds[0].title ?? '';
        const isOldControls = title === '♫ Music Player Controls';
        const isOldViewQueue = title === '📋 View Queue';
        if (isOldControls || isOldViewQueue) {
          await msg.delete().catch(() => {});
        }
      }
    } catch (error) {
      console.error('[MusicInteractionService] Error cleaning up music player channel:', error);
    }
  }

  /**
   * PHANTOM_RADIO_VOTE_SKIP_CHANNEL_ID — Vote Skip only (embed + Vote Skip button)
   */
  private async ensureVoteSkipMessage(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`[MusicInteractionService] ❌ Vote Skip channel ${channelId} not found.`);
        return;
      }
      const textChannel = channel as TextChannel;
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);
      if (!permissions?.has('SendMessages') || !permissions?.has('ViewChannel')) {
        console.error(`[MusicInteractionService] ❌ Bot lacks permissions in vote skip channel ${channelId}.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('♫ Music Player Controls')
        .setDescription(
          '**Control the music player with the buttons below**\n\n' +
          `• **Vote Skip** — Vote to skip (requires ${SKIP_VOTES_REQUIRED} votes)`
        )
        .setFooter({ text: `${MAIN_PLAYLIST.displayName} • Queue: ${MAX_QUEUE_SIZE} max, ${MAX_QUEUES_PER_USER} per user` })
        .setTimestamp();

      const skipButton = new ButtonBuilder()
        .setCustomId('music_vote_skip')
        .setLabel('Vote Skip')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⏭️');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(skipButton);

      const storageKey = `${channelId}_vote_skip`;
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
        const messages = await textChannel.messages.fetch({ limit: 30 });
        for (const [id, msg] of messages) {
          if (msg.author.id === client.user!.id && msg.components.some((r: any) => r.components.some((c: any) => c.customId === 'music_vote_skip'))) {
            message = msg;
            this.buttonMessageIds.set(storageKey, id);
            break;
          }
        }
      }
      if (message) {
        await message.edit({ embeds: [embed], components: [row] }).catch(() => {
          this.buttonMessageIds.delete(storageKey);
          message = null;
        });
      }
      if (!message) {
        const newMsg = await textChannel.send({ embeds: [embed], components: [row] });
        this.buttonMessageIds.set(storageKey, newMsg.id);
      }

      // Remove song-selection messages from this channel (they belong in SONG_SELECTION_CHANNEL_ID only)
      const voteSkipMessageId = this.buttonMessageIds.get(storageKey);
      const allInChannel = await textChannel.messages.fetch({ limit: 20 });
      for (const [, msg] of allInChannel) {
        if (msg.author.id !== client.user!.id || msg.id === voteSkipMessageId) continue;
        const title = msg.embeds[0]?.title ?? '';
        const isPlaylistInfo = (title.includes(MAIN_PLAYLIST.displayName) || title.includes(MAIN_PLAYLIST.name)) && !title.includes('— Playlist') && !title.includes('♫');
        const isSelectionQueue = title.includes('Song Selection Queue');
        if (isPlaylistInfo || isSelectionQueue) {
          await msg.delete().catch(() => {});
        }
      }
      console.log(`[MusicInteractionService] ✓ Vote Skip message updated`);
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Error setting up vote skip:`, error);
    }
  }

  /**
   * PHANTOM_RADIO_MUSIC_PLAYER_CHANNEL_ID — View Queue button (Now Playing is shown by NowPlayingDisplayService)
   */
  private async ensureMusicPlayerMessage(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;
      const textChannel = channel as TextChannel;
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      if (!textChannel.permissionsFor(botMember)?.has('SendMessages')) return;

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📋 View Queue')
        .setDescription('Click the button below to view the current queue.')
        .setFooter({ text: MAIN_PLAYLIST.displayName })
        .setTimestamp();
      const queueButton = new ButtonBuilder()
        .setCustomId('music_queue')
        .setLabel('View Queue')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(queueButton);

      const storageKey = `${channelId}_music_player`;
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
        const messages = await textChannel.messages.fetch({ limit: 30 });
        for (const [id, msg] of messages) {
          if (msg.author.id === client.user!.id && msg.components.some((r: any) => r.components.some((c: any) => c.customId === 'music_queue'))) {
            message = msg;
            this.buttonMessageIds.set(storageKey, id);
            break;
          }
        }
      }
      if (message) {
        await message.edit({ embeds: [embed], components: [row] }).catch(() => {
          this.buttonMessageIds.delete(storageKey);
          message = null;
        });
      }
      if (!message) {
        const newMsg = await textChannel.send({ embeds: [embed], components: [row] });
        this.buttonMessageIds.set(storageKey, newMsg.id);
      }
      console.log(`[MusicInteractionService] ✓ Music Player (View Queue) message updated`);
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Error setting up music player message:`, error);
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

      const hasTracks = trackCount > 0;
      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`${MAIN_PLAYLIST.emoji} ${MAIN_PLAYLIST.displayName}`)
        .setDescription(
          `${MAIN_PLAYLIST.description}\n\n` +
          `**${trackCount}** tracks in playlist\n\n` +
          (hasTracks
            ? `📋 **Join the queue** below to get your turn — then use **Select Song** to choose a track (ephemeral).\n💡 Queue: max ${MAX_QUEUE_SIZE} songs total • up to ${MAX_QUEUES_PER_USER} songs per user (slots free when your song finishes)`
            : '⚠️ No tracks in playlist — Add .wav files to `music/pbz/` and run `npm run sync-pbz` (or `npm run seed-pbz-bgm` if using config)')
        )
        .setFooter({
          text: `${MAIN_PLAYLIST.emoji} ${MAIN_PLAYLIST.displayName}`,
        })
        .setTimestamp();

      // No dropdowns here — song selection is ephemeral (only when it's your turn, via "Select Song" button)
      const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

      // Try to find existing message (look for our embed title, no select menu now)
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
          if (msg.author.id === client.user!.id && msg.embeds.length > 0) {
            const hasPlaylistEmbed = msg.embeds.some((emb: any) => emb.title?.includes(MAIN_PLAYLIST.name) || emb.title?.includes(MAIN_PLAYLIST.displayName));
            if (hasPlaylistEmbed) {
              buttonMessage = msg;
              this.buttonMessageIds.set(`${channelId}_songs`, id);
              break;
            }
          }
        }
      }

      if (buttonMessage) {
        try {
          await buttonMessage.edit({ embeds: [embed], components: [] });
          console.log(`[MusicInteractionService] ✓ Song selection message updated (no dropdowns in channel)`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error editing song selection message:`, error);
          this.buttonMessageIds.delete(`${channelId}_songs`);
          buttonMessage = null;
        }
      }

      if (!buttonMessage) {
        try {
          const newMessage = await textChannel.send({ embeds: [embed], components: [] });
          this.buttonMessageIds.set(`${channelId}_songs`, newMessage.id);
          console.log(`[MusicInteractionService] ✓ Song selection message sent`);
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
        .setTitle(`🔧 Admin: ${MAIN_PLAYLIST.emoji} ${MAIN_PLAYLIST.displayName}`)
        .setDescription(
          `**${trackCount}** tracks in playlist\n\n` +
          '• **View & Remove** — View playlist and remove tracks\n\n' +
          (trackCount === 0
            ? '💡 No tracks yet — Add .wav files to `music/pbz/` and run `npm run sync-pbz`\n\n'
            : '') +
          '⚠️ Admin only'
        )
        .setFooter({ text: `${MAIN_PLAYLIST.displayName} - Admin Panel` })
        .setTimestamp();

      const viewBtn = new ButtonBuilder()
        .setCustomId('admin_view_songs')
        .setLabel('View & Remove')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(viewBtn);

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
          if (msg.author.id === client.user!.id && msg.components.some((row: any) => row.components.some((c: any) => c.customId === 'admin_view_songs'))) {
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
   * Setup Admin Control channel (admin-only: Force Skip, Pause, Resume)
   */
  private async ensureAdminControlButtons(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`[MusicInteractionService] ❌ Admin control channel ${channelId} not found.`);
        return;
      }

      const textChannel = channel as TextChannel;
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);
      if (!permissions?.has('SendMessages') || !permissions?.has('ViewChannel')) {
        console.error(`[MusicInteractionService] ❌ Bot lacks permissions in admin control channel ${channelId}.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🔧 Admin Controls')
        .setDescription(
          '**Emergency / testing only** — Admin only.\n\n' +
          '• **Force Skip** — Skip current track immediately\n' +
          '• **Pause** — Pause playback\n' +
          '• **Resume** — Resume playback'
        )
        .setFooter({ text: 'Admin only • Phantom Radio' })
        .setTimestamp();

      const skipBtn = new ButtonBuilder()
        .setCustomId('admin_force_skip')
        .setLabel('Force Skip')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⏭️');
      const pauseBtn = new ButtonBuilder()
        .setCustomId('admin_pause')
        .setLabel('Pause')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏸️');
      const resumeBtn = new ButtonBuilder()
        .setCustomId('admin_resume')
        .setLabel('Resume')
        .setStyle(ButtonStyle.Success)
        .setEmoji('▶️');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(skipBtn, pauseBtn, resumeBtn);

      const storageKey = `${channelId}_admin_control`;
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
        const messages = await textChannel.messages.fetch({ limit: 30 });
        for (const [, msg] of messages) {
          if (msg.author.id === client.user!.id && msg.components.some((r: any) => r.components.some((c: any) => c.customId === 'admin_force_skip'))) {
            message = msg;
            this.buttonMessageIds.set(storageKey, msg.id);
            break;
          }
        }
      }
      if (message) {
        await message.edit({ embeds: [embed], components: [row] }).catch(() => {
          this.buttonMessageIds.delete(storageKey);
          message = null;
        });
      }
      if (!message) {
        const newMessage = await textChannel.send({ embeds: [embed], components: [row] });
        this.buttonMessageIds.set(storageKey, newMessage.id);
      }
      console.log(`[MusicInteractionService] ✓ Admin control message updated`);
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Error setting up admin control:`, error);
    }
  }

  /** Tracks per page in display channel playlist embed */
  public static readonly PLAYLIST_PAGE_SIZE = 8;

  /**
   * Build playlist page embed and Prev/Next buttons (for display channel or button update).
   * Used by ensurePlaylistDisplayMessage and by interactionCreate handlePlaylistPage.
   */
  public static buildPlaylistPageEmbed(
    tracks: any[],
    page: number
  ): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
    const totalPages = Math.max(1, Math.ceil(tracks.length / MusicInteractionService.PLAYLIST_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const start = safePage * MusicInteractionService.PLAYLIST_PAGE_SIZE;
    const chunk = tracks.slice(start, start + MusicInteractionService.PLAYLIST_PAGE_SIZE);

    const listLines = chunk.map(
      (t: any, i: number) => `${start + i + 1}. **${(t.title || t.trackId).slice(0, 80)}**${t.artist ? ` — ${(t.artist as string).slice(0, 40)}` : ''}`
    );
    const description =
      listLines.length > 0
        ? listLines.join('\n')
        : '*No tracks*';
    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle(`${MAIN_PLAYLIST.emoji} ${MAIN_PLAYLIST.displayName} — Playlist`)
      .setDescription(description.slice(0, 4096))
      .setFooter({ text: `Page ${safePage + 1} / ${totalPages} • ${tracks.length} tracks total` })
      .setTimestamp();

    const prevBtn = new ButtonBuilder()
      .setCustomId(`playlist_prev_${safePage}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀')
      .setDisabled(safePage === 0);
    const nextBtn = new ButtonBuilder()
      .setCustomId(`playlist_next_${safePage}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('▶')
      .setDisabled(safePage >= totalPages - 1);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);
    return { embed, components: [row] };
  }

  /**
   * PHANTOM_RADIO_PLAYLIST_CHANNEL_ID — multi-page playlist embed only (8 tracks per page, Prev/Next).
   */
  private async ensurePlaylistDisplayMessage(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`[MusicInteractionService] ❌ Playlist channel ${channelId} not found.`);
        return;
      }
      const textChannel = channel as TextChannel;
      const tracks = await this.queueManager.getAllTracks();
      const { embed, components } = MusicInteractionService.buildPlaylistPageEmbed(tracks, 0);

      const storageKey = `${channelId}_playlist_display`;
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
        const messages = await textChannel.messages.fetch({ limit: 30 });
        for (const [, msg] of messages) {
          if (msg.author.id === client.user!.id && msg.components.some((r: any) => r.components.some((c: any) => c.customId?.startsWith?.('playlist_prev_')))) {
            message = msg;
            this.buttonMessageIds.set(storageKey, msg.id);
            break;
          }
        }
      }
      if (message) {
        await message.edit({ embeds: [embed], components }).catch(() => {
          this.buttonMessageIds.delete(storageKey);
          message = null;
        });
      }
      if (!message) {
        const newMessage = await textChannel.send({ embeds: [embed], components });
        this.buttonMessageIds.set(storageKey, newMessage.id);
      }
      console.log(`[MusicInteractionService] ✓ Playlist display message updated`);
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Error setting up playlist display:`, error);
    }
  }

  /**
   * PHANTOM_RADIO_MANUAL_CHANNEL_ID — guide message with clickable channel links (<#id>).
   */
  private async ensureManualMessage(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;
      const textChannel = channel as TextChannel;
      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      if (!textChannel.permissionsFor(botMember)?.has('SendMessages')) return;

      const musicPlayerId = process.env.PHANTOM_RADIO_MUSIC_PLAYER_CHANNEL_ID || '';
      const songSelectionId = process.env.PHANTOM_RADIO_SONG_SELECTION_CHANNEL_ID || '';

      const lines: string[] = [
        '**How to use Phantom Radio**',
        '',
        musicPlayerId ? `• **Vote to skip & view queue** — Go to <#${musicPlayerId}> for Vote Skip, Now Playing, and View Queue.` : '',
        songSelectionId ? `• **Full playlist & add songs** — Go to <#${songSelectionId}> to browse the playlist and add songs (Join Queue → Select Song when it's your turn; up to 5 songs per user, 20 max in queue).` : '',
      ].filter(Boolean);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📖 Phantom Radio — Guide')
        .setDescription(lines.join('\n').slice(0, 4096) || '*Set channel IDs in .env to show links.*')
        .setFooter({ text: MAIN_PLAYLIST.displayName })
        .setTimestamp();

      const storageKey = `${channelId}_manual`;
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
        const messages = await textChannel.messages.fetch({ limit: 20 });
        for (const [id, msg] of messages) {
          if (msg.author.id === client.user!.id && msg.embeds.some((e: any) => e.title?.includes('Guide'))) {
            message = msg;
            this.buttonMessageIds.set(storageKey, id);
            break;
          }
        }
      }
      if (message) {
        await message.edit({ embeds: [embed] }).catch(() => {
          this.buttonMessageIds.delete(storageKey);
          message = null;
        });
      }
      if (!message) {
        const newMsg = await textChannel.send({ embeds: [embed] });
        this.buttonMessageIds.set(storageKey, newMsg.id);
      }
      console.log(`[MusicInteractionService] ✓ Manual message updated`);
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Error setting up manual:`, error);
    }
  }

  /**
   * Refresh the song selection menu (call after adding/removing tracks)
   */
  public async refreshSongSelection(): Promise<void> {
    const songSelectionChannelId = process.env.PHANTOM_RADIO_SONG_SELECTION_CHANNEL_ID || process.env.PHANTOM_RADIO_TEXT_CHANNEL_ID;
    if (songSelectionChannelId && this.client) {
      await this.ensureSongSelectionMessage(this.client, songSelectionChannelId);
      await this.ensurePlaylistDisplayMessage(this.client, songSelectionChannelId);
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
