import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { Track, TrackCategory } from '../models/Track';
import { Playlist } from '../models/Playlist';

export const data = new SlashCommandBuilder()
  .setName('addtrack')
  .setDescription('Add a YouTube URL as a permanent track to the database')
  .addStringOption(option =>
    option
      .setName('url')
      .setDescription('YouTube URL to add')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('category')
      .setDescription('Category for this track')
      .setRequired(true)
      .addChoices(
        { name: 'Battle', value: 'battle' },
        { name: 'Story', value: 'story' },
        { name: 'Exploration', value: 'exploration' },
        { name: 'Emotional', value: 'emotional' },
        { name: 'Ambient', value: 'ambient' },
        { name: 'Hidden', value: 'hidden' }
      )
  )
  .addStringOption(option =>
    option
      .setName('title')
      .setDescription('Custom title (optional, will use YouTube title if not provided)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('artist')
      .setDescription('Custom artist name (optional, will use channel name if not provided)')
      .setRequired(false)
  );

/**
 * Extract video ID from YouTube URL
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

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

  const url = interaction.options.getString('url', true);
  const category = interaction.options.getString('category', true) as TrackCategory;
  const customTitle = interaction.options.getString('title', false);
  const customArtist = interaction.options.getString('artist', false);

  try {
    // Validate YouTube URL format
    const isYouTubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
    
    if (!isYouTubeUrl) {
      await interaction.editReply({
        content: `❌ Invalid YouTube URL format.\n\n**Valid formats:**\n• \`https://www.youtube.com/watch?v=VIDEO_ID\`\n• \`https://youtu.be/VIDEO_ID\``,
      });
      return;
    }

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      await interaction.editReply({
        content: `❌ Could not extract video ID from URL. Please check the URL format.`,
      });
      return;
    }

    // Check if track with this YouTube URL already exists
    const existingTrack = await Track.findOne({ youtubeUrl: url });
    if (existingTrack) {
      await interaction.editReply({
        content: `❌ This YouTube URL is already in the database!\n\n**Track:** ${existingTrack.title}\n**Track ID:** \`${existingTrack.trackId}\`\n**Category:** ${existingTrack.category}`,
      });
      return;
    }

    // Fetch video info from YouTube
    const { getVideoInfo } = await import('../services/YouTubeService');
    const videoInfo = await getVideoInfo(url);
    
    if (!videoInfo || !videoInfo.videoDetails) {
      await interaction.editReply({
        content: `❌ Could not fetch video information from YouTube.\n\n**Possible reasons:**\n• Video is private or deleted\n• Video is region-blocked\n• Invalid URL\n\nPlease check the URL and try again.`,
      });
      return;
    }

    const videoDetails = videoInfo.videoDetails;
    
    // Use custom title/artist if provided, otherwise use YouTube data
    const title = customTitle || videoDetails.title || 'Unknown Title';
    const artist = customArtist || videoDetails.author?.name || 'Unknown Artist';
    const duration = parseInt(videoDetails.lengthSeconds) || 0;
    const description = videoDetails.description?.substring(0, 500) || '';

    // Generate trackId using video ID
    const trackId = `youtube-${videoId}`;

    // Check if trackId already exists (in case of different URL format pointing to same video)
    const existingById = await Track.findOne({ trackId });
    if (existingById) {
      await interaction.editReply({
        content: `❌ A track with this video ID already exists!\n\n**Track:** ${existingById.title}\n**Track ID:** \`${existingById.trackId}\`\n**YouTube URL:** ${existingById.youtubeUrl}`,
      });
      return;
    }

    // Create new track
    const newTrack = new Track({
      trackId,
      title,
      artist,
      youtubeUrl: url,
      audioSource: 'youtube',
      duration,
      category,
      description,
      instruments: [],
      isHidden: category === 'hidden',
      playCount: 0,
      monthlyPlayCount: 0,
      upvotes: 0,
      monthlyUpvotes: 0,
      pinCount: 0,
      monthlyPinCount: 0,
      upvotedBy: [],
    });

    await newTrack.save();

    // Add track to playlist
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
      // Add trackId to playlist if not already present
      if (!playlist.trackIds.includes(trackId)) {
        playlist.trackIds.push(trackId);
        playlist.shuffledOrder.push(trackId);
        await playlist.save();
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Track Added Successfully!')
      .setDescription(`**${title}**`)
      .addFields(
        { name: 'Artist', value: artist, inline: true },
        { name: 'Category', value: category, inline: true },
        { name: 'Track ID', value: `\`${trackId}\``, inline: true },
        { name: 'Duration', value: duration > 0 ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : 'Unknown', inline: true },
        { name: 'YouTube URL', value: `[Watch on YouTube](${url})`, inline: false }
      )
      .setColor(0x9B59B6)
      .setFooter({ text: `Added by ${interaction.user.username}` });

    await interaction.editReply({ embeds: [embed] });

    // Log the addition
    const { musicLogService } = await import('../services/MusicLogService');
    musicLogService.addLog(`Track added: ${title} by ${artist} (${category})`, 'info');

  } catch (error: any) {
    console.error('[AddTrack Command] Error:', error);
    
    let errorMessage = '❌ An error occurred while adding the track.';
    
    if (error.message?.includes('not a YouTube Watch URL')) {
      errorMessage = '❌ Invalid YouTube URL format. Please use a valid YouTube URL.';
    } else if (error.message?.includes('duplicate key')) {
      errorMessage = '❌ A track with this ID already exists in the database.';
    } else if (error.message) {
      errorMessage = `❌ Error: ${error.message}`;
    }
    
    await interaction.editReply({
      content: errorMessage,
    });
  }
}
