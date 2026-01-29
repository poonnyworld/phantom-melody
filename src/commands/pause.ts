import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pause the currently playing music');

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

  const paused = player.pause();

  if (paused) {
    await interaction.reply('⏸️ Music paused. Use `/resume` to continue playing.');
  } else {
    await interaction.reply({ 
      content: '❌ Could not pause. Music might already be paused.', 
      ephemeral: true 
    });
  }
}
