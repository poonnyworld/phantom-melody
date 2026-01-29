import { Client, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { QueueManager } from './QueueManager';
import { DEFAULT_PLAYLISTS } from '../config/playlists';

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

    // Get channel IDs (support both new separate channels and legacy single channel)
    const controlChannelId = process.env.PHANTOM_MELODY_CONTROL_CHANNEL_ID || process.env.PHANTOM_MELODY_TEXT_CHANNEL_ID;
    const displayChannelId = process.env.PHANTOM_MELODY_DISPLAY_CHANNEL_ID || process.env.PHANTOM_MELODY_TEXT_CHANNEL_ID;
    const honorChannelId = process.env.PHANTOM_MELODY_HONOR_CHANNEL_ID || process.env.PHANTOM_MELODY_TEXT_CHANNEL_ID;
    const addChannelId = process.env.PHANTOM_MELODY_ADD_CHANNEL_ID;

    if (!controlChannelId || !displayChannelId || !honorChannelId) {
      console.warn('[MusicInteractionService] Channel IDs not set, skipping button setup.');
      return;
    }

    // Setup Music Control buttons (in control channel)
    await this.ensureMusicControlButtons(client, controlChannelId);

    // Setup Playlist Selection buttons (in control channel)
    await this.ensurePlaylistButtons(client, controlChannelId);

    // Setup Honor Point buttons (in honor channel)
    await this.ensureHonorButtons(client, honorChannelId);

    // Setup Add Song buttons (in add channel - optional)
    if (addChannelId) {
      await this.ensureAddSongButtons(client, addChannelId);
    }

    // Display channel is now handled by MusicLogService
    // No need to create a separate "Display Channel" embed
  }

  /**
   * Setup Music Control buttons (Play/Pause/Skip/Queue)
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
          '**Control the music player with the buttons below!**\n\n' +
          '• **Play/Pause** - Control playback\n' +
          '• **Skip** - Skip to next track\n' +
          '• **Queue** - View current queue\n' +
          '• **Now Playing** - View current track info\n\n' +
          '💡 Make sure you\'re in the voice channel to use these controls!'
        )
        .setFooter({
          text: 'Use the buttons below to control music playback!',
        })
        .setTimestamp();

      // Create buttons
      const playPauseButton = new ButtonBuilder()
        .setCustomId('music_playpause')
        .setLabel('Play/Pause')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⏯️');

      const skipButton = new ButtonBuilder()
        .setCustomId('music_skip')
        .setLabel('Skip')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏭️');

      const queueButton = new ButtonBuilder()
        .setCustomId('music_queue')
        .setLabel('View Queue')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋');

      const nowPlayingButton = new ButtonBuilder()
        .setCustomId('music_nowplaying')
        .setLabel('Now Playing')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🎵');

      const stopButton = new ButtonBuilder()
        .setCustomId('music_stop')
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⏹️');

      const row1 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(playPauseButton, skipButton, queueButton, nowPlayingButton, stopButton);

      // Try to find existing button message
      let buttonMessage: Message | null = null;
      const storedMessageId = this.buttonMessageIds.get(`${channelId}_controls`);

      if (storedMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(storedMessageId);
          if (storedMessage) {
            buttonMessage = storedMessage;
            console.log(`[MusicInteractionService] ✓ Found existing music control button message: ${storedMessageId}`);
          }
        } catch (error) {
          console.log(`[MusicInteractionService] Stored music control button message ID ${storedMessageId} was deleted, clearing...`);
          this.buttonMessageIds.delete(`${channelId}_controls`);
        }
      }

      if (!buttonMessage) {
        console.log(`[MusicInteractionService] Searching for existing music control button message...`);
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === client.user!.id) {
            const hasButton = msg.components.some((row: any) =>
              row.components.some((component: any) =>
                component.type === 2 && component.customId === 'music_playpause'
              )
            );
            if (hasButton) {
              buttonMessage = msg;
              this.buttonMessageIds.set(`${channelId}_controls`, id);
              console.log(`[MusicInteractionService] ✓ Found music control button message: ${id}`);
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
          console.log(`[MusicInteractionService] Stored music control button message ID: ${newMessage.id}`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error sending music control button message:`, error);
        }
      }
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Critical error setting up music control buttons:`, error);
    }
  }

  /**
   * Setup Playlist Selection buttons
   */
  private async ensurePlaylistButtons(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return;
      }

      const textChannel = channel as TextChannel;

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🎵 Playlist Selection')
        .setDescription(
          '**Choose a playlist to play!**\n\n' +
          'Select a playlist from the menu below to start playing music.\n\n' +
          '💡 Make sure you\'re in the voice channel first!'
        )
        .setFooter({
          text: 'Select a playlist from the menu below!',
        })
        .setTimestamp();

      // Create select menu for playlists
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('playlist_select')
        .setPlaceholder('Choose a playlist...');

      for (const playlist of DEFAULT_PLAYLISTS) {
        // Include all playlists including hidden (users will see error if not unlocked)
        selectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(playlist.name)
            .setDescription(playlist.description + (playlist.category === 'hidden' ? ' (Requires Unlock)' : ''))
            .setValue(playlist.category)
            .setEmoji(playlist.emoji)
        );
      }

      const row = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(selectMenu);

      // Try to find existing message
      let buttonMessage: Message | null = null;
      const storedMessageId = this.buttonMessageIds.get(`${channelId}_playlist`);

      if (storedMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(storedMessageId);
          if (storedMessage) {
            buttonMessage = storedMessage;
          }
        } catch (error) {
          this.buttonMessageIds.delete(`${channelId}_playlist`);
        }
      }

      if (!buttonMessage) {
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === client.user!.id) {
            const hasSelectMenu = msg.components.some((row: any) =>
              row.components.some((component: any) =>
                component.type === 3 && component.customId === 'playlist_select'
              )
            );
            if (hasSelectMenu) {
              buttonMessage = msg;
              this.buttonMessageIds.set(`${channelId}_playlist`, id);
              break;
            }
          }
        }
      }

      if (buttonMessage) {
        try {
          await buttonMessage.edit({ embeds: [embed], components: [row] });
          console.log(`[MusicInteractionService] ✓ Playlist button message updated successfully`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error editing playlist button message:`, error);
          this.buttonMessageIds.delete(`${channelId}_playlist`);
          buttonMessage = null;
        }
      }

      if (!buttonMessage) {
        try {
          const newMessage = await textChannel.send({ embeds: [embed], components: [row] });
          this.buttonMessageIds.set(`${channelId}_playlist`, newMessage.id);
          console.log(`[MusicInteractionService] ✓ Playlist button message sent successfully`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error sending playlist button message:`, error);
        }
      }
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Critical error setting up playlist buttons:`, error);
    }
  }

  /**
   * Setup Honor Point buttons (Pin/Upvote/Unlock)
   */
  private async ensureHonorButtons(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return;
      }

      const textChannel = channel as TextChannel;

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('💎 Honor Points Features')
        .setDescription(
          '**Use Honor Points to enhance your music experience!**\n\n' +
          '• **Pin Track** (5 points) - Pin a track to play next\n' +
          '• **Upvote Track** (2 points) - Show love for your favorite tracks\n' +
          '• **Unlock Hidden Playlist** (50 points) - Access exclusive tracks\n\n' +
          '💡 Earn Honor Points by interacting with Honor Bot!'
        )
        .setFooter({
          text: 'Use the buttons below to use Honor Points features!',
        })
        .setTimestamp();

      const pinButton = new ButtonBuilder()
        .setCustomId('honor_pin')
        .setLabel('Pin Track')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📌');

      const upvoteButton = new ButtonBuilder()
        .setCustomId('honor_upvote')
        .setLabel('Upvote Track')
        .setStyle(ButtonStyle.Success)
        .setEmoji('❤️');

      const unlockButton = new ButtonBuilder()
        .setCustomId('honor_unlock')
        .setLabel('Unlock Hidden')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔮');

      const balanceButton = new ButtonBuilder()
        .setCustomId('honor_balance')
        .setLabel('Check Balance')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('💰');

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(pinButton, upvoteButton, unlockButton, balanceButton);

      // Try to find existing message
      let buttonMessage: Message | null = null;
      const storedMessageId = this.buttonMessageIds.get(`${channelId}_honor`);

      if (storedMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(storedMessageId);
          if (storedMessage) {
            buttonMessage = storedMessage;
          }
        } catch (error) {
          this.buttonMessageIds.delete(`${channelId}_honor`);
        }
      }

      if (!buttonMessage) {
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === client.user!.id) {
            const hasButton = msg.components.some((row: any) =>
              row.components.some((component: any) =>
                component.type === 2 && component.customId === 'honor_pin'
              )
            );
            if (hasButton) {
              buttonMessage = msg;
              this.buttonMessageIds.set(`${channelId}_honor`, id);
              break;
            }
          }
        }
      }

      if (buttonMessage) {
        try {
          await buttonMessage.edit({ embeds: [embed], components: [row] });
          console.log(`[MusicInteractionService] ✓ Honor button message updated successfully`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error editing honor button message:`, error);
          this.buttonMessageIds.delete(`${channelId}_honor`);
          buttonMessage = null;
        }
      }

      if (!buttonMessage) {
        try {
          const newMessage = await textChannel.send({ embeds: [embed], components: [row] });
          this.buttonMessageIds.set(`${channelId}_honor`, newMessage.id);
          console.log(`[MusicInteractionService] ✓ Honor button message sent successfully`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error sending honor button message:`, error);
        }
      }
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Critical error setting up honor buttons:`, error);
    }
  }

  /**
   * Setup Add Song buttons (bottom-based UX: add songs via buttons in dedicated channel)
   */
  private async ensureAddSongButtons(client: Client, channelId: string): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error(`[MusicInteractionService] ❌ Add song channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;

      const botMember = await textChannel.guild.members.fetch(client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);
      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[MusicInteractionService] ❌ Bot lacks permissions in add song channel ${channelId}.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('➕ Add Songs')
        .setDescription(
          '**Add songs with the buttons below!**\n\n' +
          '• Choose a **category** to **save** the song to the database and add it to that playlist.\n' +
          '• **Play URL Only** adds the song to the queue and plays it without saving.\n\n' +
          '💡 You must be in the voice channel to play. One request at a time per server.'
        )
        .setFooter({ text: 'Use the buttons below to add songs!' })
        .setTimestamp();

      const battleBtn = new ButtonBuilder()
        .setCustomId('add_song_battle')
        .setLabel('Battle')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚔️');
      const storyBtn = new ButtonBuilder()
        .setCustomId('add_song_story')
        .setLabel('Story')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📖');
      const explorationBtn = new ButtonBuilder()
        .setCustomId('add_song_exploration')
        .setLabel('Exploration')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🗺️');
      const emotionalBtn = new ButtonBuilder()
        .setCustomId('add_song_emotional')
        .setLabel('Emotional')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💫');
      const ambientBtn = new ButtonBuilder()
        .setCustomId('add_song_ambient')
        .setLabel('Ambient')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🌙');

      const row1 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(battleBtn, storyBtn, explorationBtn, emotionalBtn, ambientBtn);

      const hiddenBtn = new ButtonBuilder()
        .setCustomId('add_song_hidden')
        .setLabel('Hidden')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔮');
      const playOnlyBtn = new ButtonBuilder()
        .setCustomId('add_song_play_only')
        .setLabel('Play URL Only')
        .setStyle(ButtonStyle.Success)
        .setEmoji('▶️');

      const row2 = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(hiddenBtn, playOnlyBtn);

      let buttonMessage: Message | null = null;
      const storedMessageId = this.buttonMessageIds.get(`${channelId}_addsong`);

      if (storedMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(storedMessageId);
          if (storedMessage) buttonMessage = storedMessage;
        } catch {
          this.buttonMessageIds.delete(`${channelId}_addsong`);
        }
      }

      if (!buttonMessage) {
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === client.user!.id) {
            const hasAddSong = msg.components.some((row: any) =>
              row.components.some((c: any) => c.type === 2 && c.customId === 'add_song_battle')
            );
            if (hasAddSong) {
              buttonMessage = msg;
              this.buttonMessageIds.set(`${channelId}_addsong`, id);
              break;
            }
          }
        }
      }

      if (buttonMessage) {
        try {
          await buttonMessage.edit({ embeds: [embed], components: [row1, row2] });
          console.log(`[MusicInteractionService] ✓ Add song button message updated`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error editing add song message:`, error);
          this.buttonMessageIds.delete(`${channelId}_addsong`);
          buttonMessage = null;
        }
      }

      if (!buttonMessage) {
        try {
          const newMessage = await textChannel.send({ embeds: [embed], components: [row1, row2] });
          this.buttonMessageIds.set(`${channelId}_addsong`, newMessage.id);
          console.log(`[MusicInteractionService] ✓ Add song button message sent`);
        } catch (error) {
          console.error(`[MusicInteractionService] ❌ Error sending add song message:`, error);
        }
      }
    } catch (error) {
      console.error(`[MusicInteractionService] ❌ Critical error setting up add song buttons:`, error);
    }
  }

  /**
   * Clear all button message IDs (for cleanup)
   */
  public clearButtonMessageIds(): void {
    this.buttonMessageIds.clear();
  }
}
