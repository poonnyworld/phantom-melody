import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { Track } from '../models/Track';
import { formatDuration } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('addtrack')
  .setDescription('[Admin] Add a YouTube URL as a track to the playlist')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(option =>
    option
      .setName('url')
      .setDescription('YouTube URL to add')
      .setRequired(true)
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
        content: `❌ This YouTube URL is already in the database!\n\n**Track:** ${existingTrack.title}\n**Track ID:** \`${existingTrack.trackId}\``,
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
    const artist = customArtist || videoDetails.author?.name || 'PBZ Music';
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

    // Get thumbnail URL
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    // Create new track with single category 'pbz'
    const newTrack = new Track({
      trackId,
      title,
      artist,
      youtubeUrl: url,
      audioSource: 'youtube',
      duration,
      category: 'pbz',
      description,
      instruments: [],
      isHidden: false,
      playCount: 0,
      monthlyPlayCount: 0,
      upvotes: 0,
      monthlyUpvotes: 0,
      pinCount: 0,
      monthlyPinCount: 0,
      upvotedBy: [],
      thumbnailUrl,
    });

    await newTrack.save();

    const embed = new EmbedBuilder()
      .setTitle('✅ Track Added Successfully!')
      .setDescription(`**${title}**`)
      .addFields(
        { name: 'Artist', value: artist, inline: true },
        { name: 'Track ID', value: `\`${trackId}\``, inline: true },
        { name: 'Duration', value: formatDuration(duration), inline: true },
        { name: 'YouTube URL', value: `[Watch on YouTube](${url})`, inline: false }
      )
      .setColor(0x57F287)
      .setThumbnail(thumbnailUrl)
      .setFooter({ text: `Added by ${interaction.user.username}` });

    await interaction.editReply({ embeds: [embed] });

    // Log the addition
    const { musicLogService } = await import('../services/MusicLogService');
    musicLogService.addLog(`Admin added track: ${title} by ${artist}`, 'info');

    // Refresh song selection menus
    const client = interaction.client;
    const queueManager = client.queueManager;
    const { MusicInteractionService } = await import('../services/MusicInteractionService');
    const musicInteractionService = new MusicInteractionService(client, queueManager);
    await musicInteractionService.refreshSongSelection();

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
