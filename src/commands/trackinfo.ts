import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { formatDuration } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('trackinfo')
  .setDescription('Get detailed information about a specific track')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Track name to search for')
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

  const query = interaction.options.getString('query', true);
  const client = interaction.client;
  const queueManager = client.queueManager;

  try {
    const tracks = await queueManager.searchTracks(query);

    if (tracks.length === 0) {
      await interaction.editReply({
        content: `❌ No tracks found matching "${query}".`,
      });
      return;
    }

    const track = tracks[0];

    const embed = new EmbedBuilder()
      .setTitle(`🎵 ${track.title}`)
      .setColor(track.isHidden ? 0xFFD700 : 0x9B59B6)
      .addFields(
        { name: 'Artist', value: track.artist || 'Unknown', inline: true },
        { name: 'Duration', value: formatDuration(track.duration), inline: true },
        { name: 'Category', value: track.category, inline: true },
        { name: 'Total Plays', value: track.playCount.toString(), inline: true },
        { name: 'Monthly Plays', value: track.monthlyPlayCount.toString(), inline: true },
        { name: 'Upvotes', value: `❤️ ${track.upvotes}`, inline: true },
        { name: 'Pins', value: `📌 ${track.pinCount}`, inline: true }
      );

    if (track.description) {
      embed.addFields({
        name: '📖 Background Story',
        value: track.description.length > 1000 
          ? track.description.substring(0, 997) + '...' 
          : track.description,
      });
    }

    if (track.instruments && track.instruments.length > 0) {
      embed.addFields({
        name: '🎸 Featured Instruments',
        value: track.instruments.join(', '),
      });
    }

    if (track.isHidden) {
      embed.setFooter({ text: '🔮 Hidden Treasure - Exclusive Track' });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[TrackInfo Command] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while fetching track information.',
    });
  }
}
