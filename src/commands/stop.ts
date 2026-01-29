import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop the music and clear the queue');

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

  // Disconnect and destroy the player
  queueManager.destroyPlayer(interaction.guild.id);

  await interaction.reply('⏹️ Music stopped and queue cleared. Disconnected from voice channel.');
}
