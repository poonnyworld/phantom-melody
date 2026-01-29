import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('loop')
  .setDescription('Toggle loop for the current track')
  .addStringOption(option =>
    option
      .setName('mode')
      .setDescription('Loop mode')
      .setRequired(false)
      .addChoices(
        { name: 'On', value: 'on' },
        { name: 'Off', value: 'off' }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
    return;
  }

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({ 
      content: '🎵 You need to be in a voice channel to use this command!', 
      ephemeral: true 
    });
    return;
  }

  const client = interaction.client;
  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);

  if (!player || !player.isConnected()) {
    await interaction.reply({ 
      content: '❌ There is no music playing right now!', 
      ephemeral: true 
    });
    return;
  }

  const mode = interaction.options.getString('mode');
  
  if (mode === 'on') {
    player.setLoop(true);
    await interaction.reply('🔂 Loop enabled! Current track will repeat.');
  } else if (mode === 'off') {
    player.setLoop(false);
    await interaction.reply('▶️ Loop disabled! Queue will continue normally.');
  } else {
    // Toggle
    const newState = !player.isLoopEnabled();
    player.setLoop(newState);
    
    if (newState) {
      await interaction.reply('🔂 Loop enabled! Current track will repeat.');
    } else {
      await interaction.reply('▶️ Loop disabled! Queue will continue normally.');
    }
  }
}
