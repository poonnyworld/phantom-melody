import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play a track or search for music')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Track name to search or YouTube URL')
      .setRequired(true)
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
      content: '🎵 You need to be in a voice channel to play music!', 
      ephemeral: true 
    });
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
    // Check if query is a YouTube URL
    const isYouTubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(query);
    
    let track;
    let isTemporaryTrack = false;
    let youtubeUrlForSave: string | null = null;
    let videoIdForSave: string | null = null;

    if (isYouTubeUrl) {
      // If it's a YouTube URL, get video info and create a temporary track
      try {
        const { getVideoInfo } = await import('../services/YouTubeService');

        // Validate URL format first
        if (query.includes('VIDEO_ID') || query.includes('watch?v=') && !query.match(/watch\?v=[a-zA-Z0-9_-]{11}/)) {
          await interaction.editReply({
            content: `❌ Invalid YouTube URL format. Please use a valid YouTube URL.\n\n**Examples:**\n\`https://www.youtube.com/watch?v=dQw4w9WgXcQ\`\n\`https://youtu.be/dQw4w9WgXcQ\``,
          });
          return;
        }

        const videoInfo = await getVideoInfo(query);
        
        if (!videoInfo || !videoInfo.videoDetails) {
          await interaction.editReply({
            content: `❌ Could not fetch video information from "${query}".\n\n**Possible reasons:**\n• Video is private or deleted\n• Video is region-blocked\n• Invalid URL\n\nPlease check the URL and try again.`,
          });
          return;
        }

        const videoDetails = videoInfo.videoDetails;
        
        // Extract video ID for save button
        const videoIdMatch = query.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
        videoIdForSave = videoIdMatch ? videoIdMatch[1] : null;
        youtubeUrlForSave = query;
        isTemporaryTrack = true;
        
        // Create a temporary track object
        track = {
          trackId: `temp-${Date.now()}`,
          title: videoDetails.title || 'Unknown Title',
          artist: videoDetails.author?.name || 'Unknown Artist',
          youtubeUrl: query,
          audioSource: 'youtube' as const, // Temporary tracks from URL are always YouTube
          duration: parseInt(videoDetails.lengthSeconds) || 0,
          category: 'battle', // Default category
          description: videoDetails.description || '',
          instruments: [],
          isHidden: false,
          playCount: 0,
          monthlyPlayCount: 0,
          upvotes: 0,
          monthlyUpvotes: 0,
          pinCount: 0,
          monthlyPinCount: 0,
          upvotedBy: []
        };

        // Add log entry
        const { musicLogService } = await import('../services/MusicLogService');
        musicLogService.addLog(`Playing YouTube URL: ${track.title}`, 'info');
      } catch (error: any) {
        console.error('[Play Command] Error fetching YouTube video:', error);
        const errorMessage = error.message || 'Unknown error';
        
        let userMessage = `❌ Error fetching video from "${query}".\n\n`;
        
        if (errorMessage.includes('not a YouTube Watch URL')) {
          userMessage += '**Invalid URL format.** Please use a valid YouTube URL.\n\n';
          userMessage += '**Correct formats:**\n';
          userMessage += '• `https://www.youtube.com/watch?v=VIDEO_ID`\n';
          userMessage += '• `https://youtu.be/VIDEO_ID`\n';
          userMessage += '• `https://youtube.com/watch?v=VIDEO_ID`\n\n';
          userMessage += '**Example:** `https://www.youtube.com/watch?v=dQw4w9WgXcQ`';
        } else if (errorMessage.includes('private') || errorMessage.includes('unavailable')) {
          userMessage += '**Video is unavailable.**\n\n';
          userMessage += '**Possible reasons:**\n';
          userMessage += '• Video is private\n';
          userMessage += '• Video is deleted\n';
          userMessage += '• Video is region-blocked\n';
          userMessage += '• Video has age restrictions';
        } else {
          userMessage += `**Error:** ${errorMessage}\n\n`;
          userMessage += 'Please check the URL and try again.';
        }
        
        await interaction.editReply({
          content: userMessage,
        });
        return;
      }
    } else {
      // Search for the track in the database
      const tracks = await queueManager.searchTracks(query);

      if (tracks.length === 0) {
        await interaction.editReply({
          content: `❌ No tracks found matching "${query}". Try a different search term or use a YouTube URL.`,
        });
        return;
      }

      const found = tracks[0];
      track = (found as any).toObject ? (found as any).toObject() : { ...found, youtubeUrl: found.youtubeUrl };
    }

    // Debug: Log track before adding to queue
    console.log(`[Play Command] Track before adding to queue:`);
    console.log(`  - Title: ${track.title}`);
    console.log(`  - Track ID: ${track.trackId}`);
    console.log(`  - Audio Source: ${track.audioSource || 'youtube'}`);
    console.log(`  - Local Path: ${track.localPath || 'none'}`);
    console.log(`  - YouTube URL: ${track.youtubeUrl || 'none'}`);
    console.log(`  - Artist: ${track.artist}`);

    // Get or create the music player for this guild
    const player = await queueManager.getOrCreatePlayer(
      interaction.guild.id,
      voiceChannel as any,
      interaction.channelId
    );

    // Add the track to the queue
    await player.addToQueue(track, interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle('🎵 Added to Queue')
      .setDescription(`**${track.title}**`)
      .addFields(
        { name: 'Artist', value: track.artist || 'Unknown', inline: true },
        { name: 'Category', value: track.category, inline: true },
        { name: 'Position', value: `#${player.getQueueLength()}`, inline: true }
      )
      .setColor(0x9B59B6)
      .setFooter({ text: `Requested by ${interaction.user.username}` });

    // If it's a temporary YouTube track, add a Save button
    if (isTemporaryTrack && youtubeUrlForSave && videoIdForSave) {
      // Encode URL to base64 for safe storage in customId
      const encodedUrl = Buffer.from(youtubeUrlForSave).toString('base64');
      const saveButton = new ButtonBuilder()
        .setCustomId(`save_youtube_${videoIdForSave}_${encodedUrl}`)
        .setLabel('💾 Save to Database')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(saveButton);

      await interaction.editReply({ 
        embeds: [embed],
        components: [row]
      });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('[Play Command] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while trying to play the track.',
    });
  }
}
