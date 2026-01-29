import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

async function clearCommands() {
  console.log('Starting command cleanup...');

  try {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!token || !clientId) {
      console.error('❌ DISCORD_TOKEN and CLIENT_ID must be defined in .env');
      process.exit(1);
    }

    const rest = new REST().setToken(token);

    if (guildId) {
      // Clear guild commands
      console.log(`Clearing guild commands for guild ${guildId}...`);
      
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [] }
      );

      console.log('✓ Successfully cleared all guild commands!');
    }

    // Clear global commands
    console.log('Clearing global commands...');
    
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }
    );

    console.log('✓ Successfully cleared all global commands!');
  } catch (error) {
    console.error('❌ Error clearing commands:', error);
    process.exit(1);
  }
}

clearCommands();
