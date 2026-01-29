import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { formatDuration } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Show information about the currently playing track');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
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

  const currentTrack = player.getCurrentTrack();

  if (!currentTrack) {
    await interaction.reply({ 
      content: '❌ No track is currently playing!', 
      ephemeral: true 
    });
    return;
  }

  const track = currentTrack.track;

  const embed = new EmbedBuilder()
    .setTitle('🎵 Now Playing')
    .setDescription(`**${track.title}**`)
    .addFields(
      { name: 'Artist', value: track.artist || 'Unknown', inline: true },
      { name: 'Duration', value: formatDuration(track.duration), inline: true },
      { name: 'Category', value: track.category, inline: true },
      { name: 'Play Count', value: track.playCount.toString(), inline: true },
      { name: 'Upvotes', value: `❤️ ${track.upvotes}`, inline: true },
      { name: 'Pins', value: `📌 ${track.pinCount}`, inline: true }
    )
    .setColor(currentTrack.isPinned ? 0xFFD700 : 0x9B59B6);

  if (track.description) {
    embed.addFields({
      name: '📖 About This Track',
      value: track.description.substring(0, 1000),
    });
  }

  if (track.instruments && track.instruments.length > 0) {
    embed.addFields({
      name: '🎸 Featured Instruments',
      value: track.instruments.join(', '),
    });
  }

  if (player.isLoopEnabled()) {
    embed.setFooter({ text: '🔂 Loop enabled' });
  }

  await interaction.reply({ embeds: [embed] });
}
