import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Extend Client type for deploy script
declare module 'discord.js' {
  interface Client {
    commands: any;
    queueManager: any;
  }
}

const commands: any[] = [];
// Use dist/commands when running from compiled code, src/commands when running from ts-node
const commandsPath = __dirname.includes('dist') 
  ? join(__dirname, 'commands')
  : join(__dirname, 'commands');

async function deployCommands() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║    Phantom Radio Command Deployment   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');

  try {
    // Load all command files
    const commandFiles = readdirSync(commandsPath).filter(
      file => file.endsWith('.ts') || file.endsWith('.js')
    );

    console.log(`📁 Found ${commandFiles.length} command files in ${commandsPath}`);

    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      try {
        const command = await import(filePath);
        
        if ('data' in command && 'execute' in command) {
          commands.push(command.data.toJSON());
          console.log(`✓ Loaded command: ${command.data.name}`);
        } else {
          console.warn(`⚠️  Command at ${filePath} is missing required "data" or "execute" property.`);
        }
      } catch (error) {
        console.error(`❌ Error loading command ${file}:`, error);
      }
    }

    if (commands.length === 0) {
      console.error('❌ No commands were successfully loaded!');
      process.exit(1);
    }

    console.log(`\n✅ Loaded ${commands.length} commands successfully.`);

    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!token || !clientId) {
      console.error('❌ DISCORD_TOKEN and CLIENT_ID must be defined in .env');
      process.exit(1);
    }

    if (!guildId) {
      console.error('❌ GUILD_ID must be defined in .env');
      process.exit(1);
    }

    // Validate GUILD_ID format
    if (!/^\d{17,19}$/.test(guildId)) {
      console.error('❌ GUILD_ID must be a valid Discord snowflake (17-19 digit number)');
      process.exit(1);
    }

    const rest = new REST().setToken(token);

    console.log(`\n📤 Client ID: ${clientId}`);
    console.log(`📤 Guild ID: ${guildId}`);

    // CRITICAL: Clear global commands first to prevent duplicates
    console.log(`\n🧹 Clearing global commands to prevent duplicates...`);
    try {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: [] }
      );
      console.log(`✓ Global commands cleared successfully`);
    } catch (error: any) {
      console.warn(`⚠️  Warning: Could not clear global commands:`, error.message);
      // Continue anyway - this is not critical
    }

    // Register commands to the guild for instant updates
    console.log(`\n🚀 Deploying ${commands.length} commands to guild...`);
    
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    ) as any[];

    console.log(`\n✅ Successfully deployed ${data.length} application (/) commands!`);
    console.log(`\n📋 Registered commands:`);
    data.forEach((cmd: any) => {
      console.log(`   - /${cmd.name}`);
    });
    
    console.log(`\n💡 Commands should appear in Discord within a few seconds!`);
    console.log(`   Try typing "/" in your Discord server to see them.`);
  } catch (error: any) {
    console.error('\n❌ Error deploying commands:');
    if (error.code === 50001) {
      console.error('   Missing Access: Bot does not have permission to manage commands in this guild.');
      console.error('   Make sure the bot has "applications.commands" scope when invited.');
    } else if (error.code === 50035) {
      console.error('   Invalid Form Body: One or more commands have invalid data.');
      console.error('   Check command definitions for errors.');
    } else {
      console.error('   ', error.message || error);
    }
    process.exit(1);
  }
}

deployCommands();
