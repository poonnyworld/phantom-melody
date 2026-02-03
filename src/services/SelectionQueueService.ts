import { Client, TextChannel, EmbedBuilder, Message, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

interface QueueEntry {
  userId: string;
  username: string;
  joinedAt: Date;
}

interface SelectionState {
  currentSelector: QueueEntry | null;
  selectionStartTime: number;
  selectionTimeout: NodeJS.Timeout | null;
  waitingQueue: QueueEntry[];
}

const SELECTION_TIME_LIMIT = 2 * 60 * 1000; // 2 minutes in milliseconds

class SelectionQueueService {
  private client: Client | null = null;
  private state: SelectionState = {
    currentSelector: null,
    selectionStartTime: 0,
    selectionTimeout: null,
    waitingQueue: [],
  };
  private displayMessageId: string | null = null;
  private updateInterval: NodeJS.Timeout | null = null;

  /**
   * Start the selection queue service
   */
  public start(client: Client): void {
    this.client = client;
    console.log('[SelectionQueueService] Started');

    // Update display every 10 seconds to show countdown
    this.updateInterval = setInterval(() => {
      if (this.state.currentSelector) {
        this.updateDisplay();
      }
    }, 10000);

    // Initial display
    this.updateDisplay();
  }

  /**
   * Stop the service
   */
  public stop(): void {
    if (this.state.selectionTimeout) {
      clearTimeout(this.state.selectionTimeout);
    }
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.client = null;
    console.log('[SelectionQueueService] Stopped');
  }

  /**
   * Check if a user can select a song (must be their turn — join queue first, one song per turn).
   */
  public canSelect(userId: string): { canSelect: boolean; position: number; message: string } {
    // No one is selecting — user must join the queue first to get a turn
    if (!this.state.currentSelector) {
      return {
        canSelect: false,
        position: 0,
        message: 'You must **Join Queue** first to get your turn. One song per turn; join again to add more.',
      };
    }

    // If current selector is this user, they can select one song
    if (this.state.currentSelector.userId === userId) {
      return { canSelect: true, position: 0, message: '' };
    }

    // Check position in queue
    const position = this.state.waitingQueue.findIndex(q => q.userId === userId);
    if (position === -1) {
      return {
        canSelect: false,
        position: this.state.waitingQueue.length + 1,
        message: `It's **${this.state.currentSelector.username}**'s turn. Join the queue to wait for your turn!`,
      };
    }

    return {
      canSelect: false,
      position: position + 1,
      message: `You're #${position + 2} in the selection queue. Please wait for your turn!`,
    };
  }

  /**
   * Join the selection queue
   */
  public joinQueue(userId: string, username: string): { success: boolean; position: number; message: string } {
    // Check if already in queue
    if (this.state.currentSelector?.userId === userId) {
      return { success: false, position: 0, message: "It's already your turn to select!" };
    }

    const existingIndex = this.state.waitingQueue.findIndex(q => q.userId === userId);
    if (existingIndex !== -1) {
      return {
        success: false,
        position: existingIndex + 1,
        message: `You're already in queue at position #${existingIndex + 2}`,
      };
    }

    // If no one is selecting, make this user the current selector
    if (!this.state.currentSelector) {
      this.setCurrentSelector({ userId, username, joinedAt: new Date() });
      return { success: true, position: 0, message: "It's your turn! You have 2 minutes to select a song." };
    }

    // Add to waiting queue
    this.state.waitingQueue.push({ userId, username, joinedAt: new Date() });
    const position = this.state.waitingQueue.length;

    this.updateDisplay();

    return {
      success: true,
      position,
      message: `You joined the selection queue at position #${position + 1}. Please wait for your turn!`,
    };
  }

  /**
   * User finished selecting (or wants to pass)
   */
  public finishSelection(userId: string): { success: boolean; message: string } {
    if (!this.state.currentSelector || this.state.currentSelector.userId !== userId) {
      return { success: false, message: "It's not your turn to select!" };
    }

    this.moveToNextSelector();
    return { success: true, message: 'Thanks! Moving to the next person in queue.' };
  }

  /**
   * Leave the queue (if waiting)
   */
  public leaveQueue(userId: string): { success: boolean; message: string } {
    // If current selector, finish their turn
    if (this.state.currentSelector?.userId === userId) {
      return this.finishSelection(userId);
    }

    // Remove from waiting queue
    const index = this.state.waitingQueue.findIndex(q => q.userId === userId);
    if (index === -1) {
      return { success: false, message: "You're not in the selection queue." };
    }

    this.state.waitingQueue.splice(index, 1);
    this.updateDisplay();

    return { success: true, message: 'You left the selection queue.' };
  }

  /**
   * Called when a user successfully adds a song to queue
   */
  public onSongSelected(userId: string): void {
    // If the current selector added a song, finish their turn
    if (this.state.currentSelector?.userId === userId) {
      this.moveToNextSelector();
    }
  }

  /**
   * Get remaining time for current selector
   */
  public getRemainingTime(): number {
    if (!this.state.currentSelector || !this.state.selectionStartTime) {
      return 0;
    }
    const elapsed = Date.now() - this.state.selectionStartTime;
    return Math.max(0, SELECTION_TIME_LIMIT - elapsed);
  }

  /**
   * Get queue status
   */
  public getQueueStatus(): {
    currentSelector: QueueEntry | null;
    waitingQueue: QueueEntry[];
    remainingTime: number;
  } {
    return {
      currentSelector: this.state.currentSelector,
      waitingQueue: [...this.state.waitingQueue],
      remainingTime: this.getRemainingTime(),
    };
  }

  /**
   * Set the current selector and start timer
   */
  private setCurrentSelector(entry: QueueEntry | null): void {
    // Clear existing timeout
    if (this.state.selectionTimeout) {
      clearTimeout(this.state.selectionTimeout);
      this.state.selectionTimeout = null;
    }

    this.state.currentSelector = entry;

    if (entry) {
      this.state.selectionStartTime = Date.now();

      // Set timeout for 2 minutes
      this.state.selectionTimeout = setTimeout(() => {
        this.handleTimeout();
      }, SELECTION_TIME_LIMIT);

      console.log(`[SelectionQueueService] ${entry.username} is now selecting (2 min timer started)`);
    } else {
      this.state.selectionStartTime = 0;
    }

    this.updateDisplay();
  }

  /**
   * Move to next person in queue
   */
  private moveToNextSelector(): void {
    const next = this.state.waitingQueue.shift() || null;
    this.setCurrentSelector(next);

    if (next) {
      console.log(`[SelectionQueueService] Moving to next selector: ${next.username}`);
    } else {
      console.log('[SelectionQueueService] Queue is empty, no current selector');
    }
  }

  /**
   * Handle timeout - move to next person
   */
  private handleTimeout(): void {
    if (this.state.currentSelector) {
      console.log(`[SelectionQueueService] ${this.state.currentSelector.username} timed out`);
    }
    this.moveToNextSelector();
  }

  /**
   * Update the display message
   */
  public async updateDisplay(): Promise<void> {
    const channelId = process.env.PHANTOM_RADIO_SONG_SELECTION_CHANNEL_ID || process.env.PHANTOM_RADIO_TEXT_CHANNEL_ID;

    if (!channelId || !this.client || !this.client.isReady()) {
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;

      const textChannel = channel as TextChannel;
      const embed = this.generateEmbed();
      const components = this.generateComponents();

      // Find existing message
      let displayMessage: Message | null = null;

      if (this.displayMessageId) {
        try {
          displayMessage = await textChannel.messages.fetch(this.displayMessageId);
        } catch {
          this.displayMessageId = null;
        }
      }

      // Search for existing message
      if (!displayMessage) {
        const messages = await textChannel.messages.fetch({ limit: 50 });
        for (const [id, msg] of messages) {
          if (msg.author.id === this.client.user!.id) {
            const hasEmbed = msg.embeds.some(emb =>
              emb.title?.includes('Selection Queue') || emb.title?.includes('Song Selection')
            );
            if (hasEmbed) {
              displayMessage = msg;
              this.displayMessageId = id;
              break;
            }
          }
        }
      }

      if (displayMessage) {
        await displayMessage.edit({ embeds: [embed], components });
      } else {
        const newMessage = await textChannel.send({ embeds: [embed], components });
        this.displayMessageId = newMessage.id;
      }
    } catch (error) {
      console.error('[SelectionQueueService] Error updating display:', error);
    }
  }

  /**
   * Generate the embed
   */
  private generateEmbed(): EmbedBuilder {
    const { currentSelector, waitingQueue } = this.state;
    const remainingTime = this.getRemainingTime();

    const embed = new EmbedBuilder()
      .setColor(currentSelector ? 0x57F287 : 0x99AAB5)
      .setTitle('🎯 Song Selection Queue')
      .setTimestamp();

    if (!currentSelector) {
      embed.setDescription(
        '**No one is currently selecting**\n\n' +
        'Click **Join Queue** below to get your turn.\n' +
        'You get **one song per turn** (2 min). Want to add more? Join the queue again after your turn.'
      );
    } else {
      const remainingSeconds = Math.ceil(remainingTime / 1000);
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      // Progress bar for time
      const totalBars = 20;
      const progress = remainingTime / SELECTION_TIME_LIMIT;
      const filledBars = Math.round(progress * totalBars);
      const progressBar = '█'.repeat(filledBars) + '░'.repeat(totalBars - filledBars);

      let description = `**🎵 Now Selecting:**\n`;
      description += `> <@${currentSelector.userId}>\n\n`;
      description += `**⏱️ Time Remaining:** \`${timeStr}\`\n`;
      description += `\`${progressBar}\`\n\n`;

      if (waitingQueue.length > 0) {
        description += '**📋 Waiting in Queue:**\n';
        waitingQueue.slice(0, 10).forEach((entry, index) => {
          description += `${index + 1}. <@${entry.userId}>\n`;
        });
        if (waitingQueue.length > 10) {
          description += `... and ${waitingQueue.length - 10} more\n`;
        }
      } else {
        description += '*No one else is waiting*';
      }

      embed.setDescription(description);
    }

    embed.setFooter({
      text: `${waitingQueue.length} user(s) in queue • 2 min per turn • One song per turn`,
    });

    return embed;
  }

  /**
   * Generate button components
   */
  private generateComponents(): ActionRowBuilder<ButtonBuilder>[] {
    const joinBtn = new ButtonBuilder()
      .setCustomId('selection_join_queue')
      .setLabel('Join Queue')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📥');

    const leaveBtn = new ButtonBuilder()
      .setCustomId('selection_leave_queue')
      .setLabel('Leave / Pass')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📤');

    const chooseBtn = new ButtonBuilder()
      .setCustomId('selection_choose_song')
      .setLabel('Select Song')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎵');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn, leaveBtn, chooseBtn);

    return [row];
  }
}

// Singleton instance
export const selectionQueueService = new SelectionQueueService();
