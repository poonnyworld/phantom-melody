import { Client, TextChannel, EmbedBuilder, Message } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';

export interface MusicLogEntry {
  timestamp: Date;
  message: string;
  type: 'error' | 'info' | 'success' | 'warning';
}

export class MusicLogService {
  private logMessageId: string | null = null;
  private client: Client | null = null;
  private logEntries: MusicLogEntry[] = [];
  private readonly MAX_ENTRIES = 10;

  /**
   * Start the music log service
   */
  public start(client: Client): void {
    this.client = client;
    const channelId = process.env.ADMIN_LOGS_CHANNEL_ID || process.env.PHANTOM_RADIO_MUSIC_PLAYER_CHANNEL_ID || process.env.PHANTOM_RADIO_TEXT_CHANNEL_ID;

    console.log('[MusicLogService] Initializing music log service...');
    console.log(`[MusicLogService] Log channel ID from env: ${channelId || 'NOT SET'} (LOGS_ID for admin, else DISPLAY)`);

    if (!channelId) {
      console.warn('[MusicLogService] ⚠️ Display channel ID not set. Music log service will not start.');
      return;
    }

    // Validate channel ID is a valid snowflake
    if (!/^\d{17,19}$/.test(channelId)) {
      console.error(`[MusicLogService] ❌ Invalid channel ID format: "${channelId}"`);
      return;
    }

    console.log(`[MusicLogService] ✓ Channel ID validated: ${channelId}`);
    
    // Wait for client to be ready before initial setup
    if (client.isReady()) {
      this.ensureLogMessage().catch((error) => {
        console.error('[MusicLogService] ❌ Error in initial log message setup:', error);
      });
      // If DB wasn't ready at start, try loading from DB once after a delay
      setTimeout(() => {
        if (this.logEntries.length === 0 && isDBConnected()) {
          this.ensureLogMessage().catch(() => {});
        }
      }, 6000);
    } else {
      client.once('ready', () => {
        this.ensureLogMessage().catch((error) => {
          console.error('[MusicLogService] ❌ Error in initial log message setup:', error);
        });
        setTimeout(() => {
          if (this.logEntries.length === 0 && isDBConnected()) {
            this.ensureLogMessage().catch(() => {});
          }
        }, 6000);
      });
    }

    console.log('[MusicLogService] Music log service started successfully.');
  }

  /**
   * Stop the music log service
   */
  public stop(): void {
    console.log('[MusicLogService] Stopping music log service...');
    this.logMessageId = null;
    this.logEntries = [];
    this.client = null;
  }

  /**
   * Add a log entry
   */
  public addLog(message: string, type: 'error' | 'info' | 'success' | 'warning' = 'info'): void {
    const entry: MusicLogEntry = {
      timestamp: new Date(),
      message,
      type,
    };

    // Add to beginning of array
    this.logEntries.unshift(entry);

    // Keep only MAX_ENTRIES
    if (this.logEntries.length > this.MAX_ENTRIES) {
      this.logEntries = this.logEntries.slice(0, this.MAX_ENTRIES);
    }

    // Persist to DB so log survives container restarts
    if (isDBConnected()) {
      import('../models/PlaybackLogEntry').then(({ PlaybackLogEntry }) =>
        PlaybackLogEntry.create({ timestamp: entry.timestamp, message: entry.message, type: entry.type })
      ).catch((err) => console.error('[MusicLogService] Failed to save playback log to DB:', err));
    }

    // Update the log message
    this.updateLogMessage().catch((error) => {
      console.error('[MusicLogService] Error updating log message:', error);
    });
  }

  /**
   * Ensure the log message exists in the channel
   */
  private async ensureLogMessage(): Promise<void> {
    const channelId = process.env.ADMIN_LOGS_CHANNEL_ID || process.env.PHANTOM_RADIO_MUSIC_PLAYER_CHANNEL_ID || process.env.PHANTOM_RADIO_TEXT_CHANNEL_ID;

    if (!channelId || !this.client || !this.client.isReady()) {
      return;
    }

    // Restore last entries from DB after restart (so Discord log is repopulated)
    if (this.logEntries.length === 0 && isDBConnected()) {
      try {
        const { PlaybackLogEntry } = await import('../models/PlaybackLogEntry');
        const docs = await PlaybackLogEntry.find().sort({ timestamp: -1 }).limit(this.MAX_ENTRIES).lean();
        this.logEntries = docs.map((d) => ({
          timestamp: d.timestamp,
          message: d.message,
          type: d.type as MusicLogEntry['type'],
        }));
        if (this.logEntries.length > 0) {
          console.log(`[MusicLogService] ✓ Loaded ${this.logEntries.length} playback log entries from DB`);
        }
      } catch (e) {
        console.error('[MusicLogService] Failed to load playback log from DB:', e);
      }
    }

    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        console.error(`[MusicLogService] ❌ Channel ${channelId} not found or not text-based.`);
        return;
      }

      const textChannel = channel as TextChannel;

      // Check permissions
      const botMember = await textChannel.guild.members.fetch(this.client.user!.id);
      const permissions = textChannel.permissionsFor(botMember);

      if (!permissions || !permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        console.error(`[MusicLogService] ❌ Bot lacks required permissions in display channel ${channelId}.`);
        return;
      }

      // Find existing message
      let logMessage: Message | null = null;

      if (this.logMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(this.logMessageId);
          if (storedMessage && storedMessage.author.id === this.client.user?.id) {
            logMessage = storedMessage;
            console.log(`[MusicLogService] ✓ Found existing log message: ${this.logMessageId}`);
          } else {
            this.logMessageId = null;
          }
        } catch (fetchError: any) {
          if (fetchError.code === 10008 || fetchError.code === 404) {
            console.log(`[MusicLogService] Stored log message ID ${this.logMessageId} was deleted, clearing...`);
            this.logMessageId = null;
          }
        }
      }

      // If not found, search for it (look for Music Playback Log embed)
      if (!logMessage) {
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === this.client.user!.id) {
            const hasLogEmbed = msg.embeds.some(emb => 
              emb.title?.includes('Music Playback Log') || 
              emb.title?.includes('Playback Log') ||
              emb.title?.includes('Status Updates')
            );
            if (hasLogEmbed) {
              logMessage = msg;
              this.logMessageId = id;
              console.log(`[MusicLogService] ✓ Found log message in channel: ${id}`);
              break;
            }
          }
        }
      }

      // Create new message if not found
      if (!logMessage) {
        const embed = this.generateEmbed();
        const newMessage = await textChannel.send({ embeds: [embed] });
        this.logMessageId = newMessage.id;
        console.log(`[MusicLogService] ✓ Created new log message: ${newMessage.id}`);
      } else {
        // Update existing message
        const embed = this.generateEmbed();
        await logMessage.edit({ embeds: [embed] });
        console.log(`[MusicLogService] ✓ Updated existing log message`);
      }
    } catch (error) {
      console.error(`[MusicLogService] ❌ Critical error ensuring log message:`, error);
    }
  }

  /**
   * Update the log message in the channel
   */
  private async updateLogMessage(): Promise<void> {
    const channelId = process.env.ADMIN_LOGS_CHANNEL_ID || process.env.PHANTOM_RADIO_MUSIC_PLAYER_CHANNEL_ID || process.env.PHANTOM_RADIO_TEXT_CHANNEL_ID;

    if (!channelId || !this.client || !this.client.isReady()) {
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        return;
      }

      const textChannel = channel as TextChannel;

      // Generate embed content
      const embed = this.generateEmbed();

      // Find existing message
      let logMessage: Message | null = null;

      if (this.logMessageId) {
        try {
          const storedMessage = await textChannel.messages.fetch(this.logMessageId);
          if (storedMessage && storedMessage.author.id === this.client.user?.id) {
            logMessage = storedMessage;
          } else {
            this.logMessageId = null;
          }
        } catch (fetchError: any) {
          if (fetchError.code === 10008 || fetchError.code === 404) {
            this.logMessageId = null;
          }
        }
      }

      // If not found, search for it (look for Music Playback Log embed)
      if (!logMessage) {
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === this.client.user!.id) {
            const hasLogEmbed = msg.embeds.some(emb => 
              emb.title?.includes('Music Playback Log') || 
              emb.title?.includes('Playback Log') ||
              emb.title?.includes('Status Updates')
            );
            if (hasLogEmbed) {
              logMessage = msg;
              this.logMessageId = id;
              break;
            }
          }
        }
      }

      if (logMessage) {
        try {
          await logMessage.edit({ embeds: [embed] });
        } catch (error) {
          console.error('[MusicLogService] Error editing log message:', error);
          this.logMessageId = null;
        }
      } else {
        // Create new message if not found
        const newMessage = await textChannel.send({ embeds: [embed] });
        this.logMessageId = newMessage.id;
      }
    } catch (error) {
      console.error('[MusicLogService] Error updating log message:', error);
    }
  }

  /**
   * Generate the embed for the log message (similar to Honor Bot's Status Log)
   */
  private generateEmbed(): EmbedBuilder {
    let description = '';

    if (this.logEntries.length === 0) {
      description = '*No music playback events yet. Playback events will appear here automatically.*';
    } else {
      // Show chronological order (oldest first): "Queued" then "Now playing"
      const chronological = [...this.logEntries].reverse();
      for (const entry of chronological) {
        const timestamp = Math.floor(entry.timestamp.getTime() / 1000);
        const emoji = this.getEmojiForType(entry.type);
        const timeStr = `<t:${timestamp}:T>`;
        description += `${timeStr} ${emoji} ${entry.message}\n`;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('📊 Music Playback Log - Status Updates')
      .setDescription(description)
      .setFooter({
        text: `Showing last ${this.logEntries.length} event${this.logEntries.length !== 1 ? 's' : ''}`,
      })
      .setTimestamp();

    return embed;
  }

  /**
   * Get emoji for log type
   */
  private getEmojiForType(type: 'error' | 'info' | 'success' | 'warning'): string {
    switch (type) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      case 'info':
      default:
        return 'ℹ️';
    }
  }

  /**
   * Clear all logs
   */
  public clearLogs(): void {
    this.logEntries = [];
    this.updateLogMessage().catch((error) => {
      console.error('[MusicLogService] Error clearing logs:', error);
    });
  }
}

// Singleton instance
export const musicLogService = new MusicLogService();
