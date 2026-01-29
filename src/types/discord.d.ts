// Type definitions for Discord.js Client extensions
import { Client } from 'discord.js';
import { QueueManager } from '../services/QueueManager';

declare module 'discord.js' {
  interface Client {
    commands: import('discord.js').Collection<string, any>;
    queueManager: QueueManager;
  }
}
