import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { honorPointService } from '../services/HonorPointService';
import { HONOR_COSTS } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('upvote')
  .setDescription(`Upvote your favorite track (costs ${HONOR_COSTS.UPVOTE_TRACK} Honor Points)`)
  .addStringOption(option =>
    option
      .setName('track')
      .setDescription('Track name to upvote')
      .setRequired(true)
  );

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

  const trackQuery = interaction.options.getString('track', true);
  const client = interaction.client;
  const queueManager = client.queueManager;

  try {
    // Search for the track
    const tracks = await queueManager.searchTracks(trackQuery);

    if (tracks.length === 0) {
      await interaction.editReply({
        content: `❌ No tracks found matching "${trackQuery}".`,
      });
      return;
    }

    const track = tracks[0];

    // Process the upvote (deduct Honor Points)
    const result = await honorPointService.upvoteTrack(
      interaction.user.id,
      interaction.user.username,
      track.trackId
    );

    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.message}`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('❤️ Track Upvoted!')
      .setDescription(`You upvoted **${track.title}**!`)
      .addFields(
        { name: 'Total Upvotes', value: `${track.upvotes + 1}`, inline: true },
        { name: 'Cost', value: `${HONOR_COSTS.UPVOTE_TRACK} Honor Points`, inline: true },
        { name: 'New Balance', value: `${result.newBalance} points`, inline: true }
      )
      .setColor(0xE91E63)
      .setFooter({ text: `Thanks for supporting ${track.artist || 'the artist'}!` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[Upvote Command] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while upvoting the track.',
    });
  }
}
