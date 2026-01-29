import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { Track, TrackCategory } from '../models/Track';
import { Playlist } from '../models/Playlist';

export const data = new SlashCommandBuilder()
  .setName('addtoplaylist')
  .setDescription('Add an existing track to a playlist')
  .addStringOption(option =>
    option
      .setName('trackid')
      .setDescription('Track ID to add to playlist')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('category')
      .setDescription('Category of the playlist to add to')
      .setRequired(true)
      .addChoices(
        { name: 'Battle', value: 'battle' },
        { name: 'Story', value: 'story' },
        { name: 'Exploration', value: 'exploration' },
        { name: 'Emotional', value: 'emotional' },
        { name: 'Ambient', value: 'ambient' },
        { name: 'Hidden', value: 'hidden' }
      )
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

  const trackId = interaction.options.getString('trackid', true);
  const category = interaction.options.getString('category', true) as TrackCategory;

  try {
    // Check if track exists
    const track = await Track.findOne({ trackId });
    
    if (!track) {
      await interaction.editReply({
        content: `❌ Track with ID \`${trackId}\` not found in the database.\n\nUse \`/addtrack\` to add a new track first.`,
      });
      return;
    }

    // Check if track has a valid YouTube URL (required for playlist)
    if (!track.youtubeUrl || 
        track.youtubeUrl === 'undefined' || 
        track.youtubeUrl === 'null' ||
        track.youtubeUrl.trim() === '' ||
        !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(track.youtubeUrl)) {
      await interaction.editReply({
        content: `❌ Track \`${trackId}\` does not have a valid YouTube URL.\n\nTracks in playlists must have a YouTube URL.`,
      });
      return;
    }

    // Get or create playlist
    let playlist = await Playlist.findOne({ category, isDefault: true });
    
    if (!playlist) {
      // Create playlist if it doesn't exist
      playlist = new Playlist({
        name: category === 'hidden' ? 'Hidden Treasures' : `${category.charAt(0).toUpperCase() + category.slice(1)} Music`,
        category,
        description: `Default ${category} playlist`,
        trackIds: [trackId],
        shuffledOrder: [trackId],
        isDefault: true,
        lastShuffled: new Date(),
      });
      await playlist.save();
    } else {
      // Check if track is already in playlist
      if (playlist.trackIds.includes(trackId)) {
        await interaction.editReply({
          content: `⚠️ Track \`${trackId}\` is already in the **${category}** playlist.`,
        });
        return;
      }

      // Add trackId to playlist
      playlist.trackIds.push(trackId);
      playlist.shuffledOrder.push(trackId);
      await playlist.save();
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Track Added to Playlist!')
      .setDescription(`**${track.title}**`)
      .addFields(
        { name: 'Track ID', value: `\`${trackId}\``, inline: true },
        { name: 'Playlist', value: category, inline: true },
        { name: 'Artist', value: track.artist || 'Unknown', inline: true },
        { name: 'Total Tracks in Playlist', value: playlist.trackIds.length.toString(), inline: true }
      )
      .setColor(0x9B59B6)
      .setFooter({ text: `Added by ${interaction.user.username}` });

    await interaction.editReply({ embeds: [embed] });

    // Log the addition
    const { musicLogService } = await import('../services/MusicLogService');
    musicLogService.addLog(`Track ${track.title} added to ${category} playlist`, 'info');

  } catch (error: any) {
    console.error('[AddToPlaylist Command] Error:', error);
    
    await interaction.editReply({
      content: `❌ An error occurred while adding the track to the playlist: ${error.message || 'Unknown error'}`,
    });
  }
}
