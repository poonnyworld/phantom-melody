import { Client, Collection, GatewayIntentBits, Events, Interaction } from 'discord.js';
import { connectDB } from './utils/connectDB';
import { readdirSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
import * as cron from 'node-cron';
import { QueueManager } from './services/QueueManager';
import { ListeningRewardService } from './services/ListeningRewardService';
import { MusicInteractionService } from './services/MusicInteractionService';
import { musicLogService } from './services/MusicLogService';
import { nowPlayingDisplayService } from './services/NowPlayingDisplayService';
import { selectionQueueService } from './services/SelectionQueueService';

// Load environment variables
dotenv.config();

// Extend the Client type to include commands collection
declare module 'discord.js' {
  interface Client {
    commands: any;
    queueManager: any;
  }
}

// Create Discord client with required intents for music bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates, // Required for voice channel operations
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize commands collection
client.commands = new Collection();

// Initialize queue manager
client.queueManager = new QueueManager(client);

// Initialize music interaction service (for buttons)
const musicInteractionService = new MusicInteractionService(client, client.queueManager);

// Load commands
const loadCommands = async () => {
  const commandsPath = join(__dirname, 'commands');
  
  try {
    const commandFiles = readdirSync(commandsPath).filter(
      file => file.endsWith('.ts') || file.endsWith('.js')
    );

    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const command = await import(filePath);
      
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`✓ Loaded command: ${command.data.name}`);
      } else {
        console.warn(`⚠️  Command at ${filePath} is missing required "data" or "execute" property.`);
      }
    }
  } catch (error) {
    console.error('Error loading commands:', error);
  }
};

// Load events
const loadEvents = async () => {
  const eventsPath = join(__dirname, 'events');
  
  try {
    const eventFiles = readdirSync(eventsPath).filter(
      file => file.endsWith('.ts') || file.endsWith('.js')
    );

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);
      const event = await import(filePath);
      
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
      console.log(`✓ Loaded event: ${event.name}`);
    }
  } catch (error) {
    console.error('Error loading events:', error);
  }
};

// Handle interactions (slash commands)
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    
    const errorMessage = {
      content: 'There was an error while executing this command!',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// When bot is ready
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✓ Phantom Melody is online as ${readyClient.user.tag}`);
  console.log(`✓ Serving ${readyClient.guilds.cache.size} guild(s)`);

  // Start listening reward service
  const listeningRewardService = new ListeningRewardService(client);
  listeningRewardService.startMonthlyResetCron();

  // Start music interaction service (for buttons)
  musicInteractionService.start(readyClient);

  // Start music log service (for persistent log display)
  musicLogService.start(readyClient);
  
  // Start now playing display service (beautiful now playing view)
  nowPlayingDisplayService.start(readyClient);
  
  // Start selection queue service (turn-based song selection)
  selectionQueueService.start(readyClient);
  
  // Daily playlist shuffle at midnight UTC
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily playlist shuffle...');
    await client.queueManager.shuffleAllPlaylists();
    console.log('[Cron] Daily playlist shuffle completed');
  });

  // Monthly stats reset at midnight UTC on the 1st of each month
  cron.schedule('0 0 1 * *', async () => {
    console.log('[Cron] Running monthly stats reset...');
    await resetMonthlyStats();
    console.log('[Cron] Monthly stats reset completed');
  });
});

// Reset monthly stats for leaderboards
async function resetMonthlyStats() {
  try {
    const { Track } = await import('./models/Track');
    await Track.updateMany({}, {
      $set: {
        monthlyPlayCount: 0,
        monthlyUpvotes: 0,
        monthlyPinCount: 0,
      }
    });
    console.log('✓ Monthly track stats reset');
  } catch (error) {
    console.error('Error resetting monthly stats:', error);
  }
}

// Main startup function
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║       Phantom Melody Bot Starting      ║');
  console.log('╚════════════════════════════════════════╝');

  // Connect to database (non-blocking)
  connectDB().catch(err => {
    console.error('Database connection error:', err);
  });

  // Load commands and events
  await loadCommands();
  await loadEvents();

  // Login to Discord
  const token = process.env.DISCORD_TOKEN;
  
  if (!token) {
    console.error('❌ DISCORD_TOKEN is not defined in environment variables');
    process.exit(1);
  }

  try {
    await client.login(token);
  } catch (error) {
    console.error('❌ Failed to login to Discord:', error);
    process.exit(1);
  }
}

// Start the bot
main();

// Export client for use in other files
export { client };
