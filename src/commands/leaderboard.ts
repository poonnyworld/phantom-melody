import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { formatDuration } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View the music leaderboards for this month');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
    return;
  }

  if (!isDBConnected()) {
    await interaction.reply({ 
      content: '❌ Database is not connected. Please try again later.', 
      ephemeral: true 
    });
    return;
  }

  await interaction.deferReply();

  const client = interaction.client;
  const queueManager = client.queueManager;

  try {
    const leaderboard = await queueManager.getLeaderboard();

    const embed = new EmbedBuilder()
      .setTitle('🏆 Music Leaderboards')
      .setDescription('Top tracks of the month!')
      .setColor(0xFFD700)
      .setTimestamp();

    // Most Played
    if (leaderboard.mostPlayed) {
      const track = leaderboard.mostPlayed;
      embed.addFields({
        name: '🎧 Most Played Track',
        value: `**${track.title}**\n` +
               `Artist: ${track.artist}\n` +
               `Plays this month: ${track.monthlyPlayCount}`,
      });
    } else {
      embed.addFields({
        name: '🎧 Most Played Track',
        value: 'No plays recorded this month yet!',
      });
    }

    // Most Upvoted
    if (leaderboard.mostUpvoted) {
      const track = leaderboard.mostUpvoted;
      embed.addFields({
        name: '❤️ Most Upvoted Track',
        value: `**${track.title}**\n` +
               `Artist: ${track.artist}\n` +
               `Upvotes this month: ${track.monthlyUpvotes}`,
      });
    } else {
      embed.addFields({
        name: '❤️ Most Upvoted Track',
        value: 'No upvotes recorded this month yet!',
      });
    }

    // Most Pinned
    if (leaderboard.mostPinned) {
      const track = leaderboard.mostPinned;
      embed.addFields({
        name: '📌 Most Pinned Track',
        value: `**${track.title}**\n` +
               `Artist: ${track.artist}\n` +
               `Pins this month: ${track.monthlyPinCount}`,
      });
    } else {
      embed.addFields({
        name: '📌 Most Pinned Track',
        value: 'No pins recorded this month yet!',
      });
    }

    embed.setFooter({ text: 'Leaderboards reset at the start of each month' });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[Leaderboard Command] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while fetching the leaderboards.',
    });
  }
}
