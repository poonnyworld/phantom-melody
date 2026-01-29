import {
  Events,
  Interaction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  MessageFlags,
  GuildMember,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { client } from '../index';
import { isDBConnected } from '../utils/connectDB';
import { honorPointService } from '../services/HonorPointService';
import { DEFAULT_PLAYLISTS } from '../config/playlists';
import { tryAcquire, release } from '../utils/ConcurrencyGuard';

export const name = Events.InteractionCreate;
export const once = false;

const ADD_SONG_CATEGORIES = ['battle', 'story', 'exploration', 'emotional', 'ambient', 'hidden'] as const;

export async function execute(interaction: Interaction) {
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
    return;
  }

  if (interaction.isStringSelectMenu()) {
    await handleSelectMenuInteraction(interaction);
    return;
  }

  if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
    return;
  }

  if (interaction.isAutocomplete()) {
    return;
  }
}

/**
 * Handle button interactions
 */
async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  // Music control buttons
  if (customId === 'music_playpause') {
    await handlePlayPauseButton(interaction);
    return;
  }

  if (customId === 'music_skip') {
    await handleSkipButton(interaction);
    return;
  }

  if (customId === 'music_queue') {
    await handleQueueButton(interaction);
    return;
  }

  if (customId === 'music_nowplaying') {
    await handleNowPlayingButton(interaction);
    return;
  }

  if (customId === 'music_stop') {
    await handleStopButton(interaction);
    return;
  }

  // Honor point buttons
  if (customId === 'honor_pin') {
    await handlePinButton(interaction);
    return;
  }

  if (customId === 'honor_upvote') {
    await handleUpvoteButton(interaction);
    return;
  }

  if (customId === 'honor_unlock') {
    await handleUnlockButton(interaction);
    return;
  }

  if (customId === 'honor_balance') {
    await handleBalanceButton(interaction);
    return;
  }

  // Save YouTube track button
  if (customId.startsWith('save_youtube_')) {
    await handleSaveYouTubeButton(interaction);
    return;
  }

  // Add Song channel buttons (bottom-based UX)
  if (customId === 'add_song_play_only') {
    await showAddSongModal(interaction, null);
    return;
  }
  if (ADD_SONG_CATEGORIES.some(c => customId === `add_song_${c}`)) {
    const category = customId.replace('add_song_', '') as typeof ADD_SONG_CATEGORIES[number];
    await showAddSongModal(interaction, category);
    return;
  }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
  if (interaction.customId === 'playlist_select') {
    await handlePlaylistSelect(interaction);
    return;
  }
}

/**
 * Handle modal submissions (Add Song flow)
 */
async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;
  if (!customId.startsWith('add_song_modal_')) return;

  if (!interaction.guild) {
    await interaction.reply({ content: '❌ Use this in a server.', ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const action = 'add_song';

    if (!tryAcquire(guildId, action)) {
    await interaction.reply({
      content: '⏳ Another add-song or play request is in progress. Please wait a moment and try again.',
      ephemeral: true,
    });
    return;
  }

  try {
    if (customId === 'add_song_modal_play_only') {
      await handleAddSongModalPlayOnly(interaction);
    } else {
      const category = customId.replace('add_song_modal_', '') as typeof ADD_SONG_CATEGORIES[number];
      if (ADD_SONG_CATEGORIES.includes(category)) {
        await handleAddSongModalSave(interaction, category);
      }
    }
  } finally {
    release(guildId);
  }
}

/**
 * Show modal for adding a song (from Add Song channel buttons)
 */
async function showAddSongModal(
  interaction: ButtonInteraction,
  category: typeof ADD_SONG_CATEGORIES[number] | null
): Promise<void> {
  const isPlayOnly = category === null;
  const modalCustomId = isPlayOnly ? 'add_song_modal_play_only' : `add_song_modal_${category}`;
  const modalTitle = isPlayOnly ? 'Play YouTube URL' : `Add song to ${category.charAt(0).toUpperCase() + category.slice(1)}`;

  const urlInput = new TextInputBuilder()
    .setCustomId('url')
    .setLabel('YouTube URL')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://www.youtube.com/watch?v=...')
    .setRequired(true)
    .setMaxLength(500);

  const urlRow = new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(modalTitle)
    .addComponents(urlRow);

  if (!isPlayOnly) {
    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('Title (optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Leave blank to use YouTube title')
      .setRequired(false)
      .setMaxLength(200);
    const artistInput = new TextInputBuilder()
      .setCustomId('artist')
      .setLabel('Artist (optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Leave blank to use channel name')
      .setRequired(false)
      .setMaxLength(200);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(artistInput)
    );
  }

  await interaction.showModal(modal);
}

/**
 * Handle "Play URL Only" modal submit: add to queue and play, do not save
 */
async function handleAddSongModalPlayOnly(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guild) return;

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await interaction.editReply({ content: '🎵 You need to be in a voice channel to play music!' });
    return;
  }

  let url = interaction.fields.getTextInputValue('url').trim();
  if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)) {
    await interaction.editReply({ content: '❌ Invalid YouTube URL. Use a valid YouTube link.' });
    return;
  }
  // Normalize so YouTubeService and MusicPlayer don't get invalid URL
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url.replace(/^\/+/, '');
  }

  try {
    const { getVideoInfo } = await import('../services/YouTubeService');
    const videoInfo = await getVideoInfo(url);
    if (!videoInfo?.videoDetails) {
      await interaction.editReply({ content: '❌ Could not load video. It may be private or unavailable.' });
      return;
    }

    const vd = videoInfo.videoDetails;
    const track = {
      trackId: `temp-${Date.now()}`,
      title: vd.title || 'Unknown Title',
      artist: vd.author?.name || 'Unknown Artist',
      youtubeUrl: url,
      audioSource: 'youtube' as const,
      duration: parseInt(vd.lengthSeconds) || 0,
      category: 'battle' as const,
      description: vd.description || '',
      instruments: [],
      isHidden: false,
      playCount: 0,
      monthlyPlayCount: 0,
      upvotes: 0,
      monthlyUpvotes: 0,
      pinCount: 0,
      monthlyPinCount: 0,
      upvotedBy: [],
    };

    const queueManager = client.queueManager;
    const player = await queueManager.getOrCreatePlayer(interaction.guild.id, voiceChannel as any, interaction.channelId);
    await player.addToQueue(track, interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle('🎵 Added to Queue')
      .setDescription(`**${track.title}**`)
      .addFields(
        { name: 'Artist', value: track.artist || 'Unknown', inline: true },
        { name: 'Position', value: `#${player.getQueueLength()}`, inline: true }
      )
      .setColor(0x9B59B6)
      .setFooter({ text: `Requested by ${interaction.user.username}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    console.error('[Add Song Play Only] Error:', error);
    await interaction.editReply({
      content: `❌ Error: ${error.message || 'Could not add song.'}`,
    });
  }
}

/**
 * Handle "Add song to category" modal submit: save to DB, add to playlist, and add to queue
 */
async function handleAddSongModalSave(
  interaction: ModalSubmitInteraction,
  category: typeof ADD_SONG_CATEGORIES[number]
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guild) return;

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  const url = interaction.fields.getTextInputValue('url').trim();
  const customTitle = interaction.fields.getTextInputValue('title')?.trim() || undefined;
  const customArtist = interaction.fields.getTextInputValue('artist')?.trim() || undefined;

  if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)) {
    await interaction.editReply({ content: '❌ Invalid YouTube URL. Use a valid YouTube link.' });
    return;
  }

  if (!isDBConnected()) {
    await interaction.editReply({ content: '❌ Database is not connected. Try again later.' });
    return;
  }

  const queueManager = client.queueManager;
  const result = await queueManager.saveYouTubeTrack(url, category, customTitle, customArtist);

  if (!result.success) {
    await interaction.editReply({
      content: `❌ ${result.error || 'Could not save track.'}`,
    });
    return;
  }

  const track = result.track!;
  // Pass plain object so MusicPlayer always gets a string youtubeUrl (avoids Mongoose getter/ERR_INVALID_URL)
  const trackForQueue = (track as any).toObject
    ? (track as any).toObject()
    : { ...track, youtubeUrl: track.youtubeUrl };

  const embed = new EmbedBuilder()
    .setTitle('✅ Track Saved & Added to Queue')
    .setDescription(`**${track.title}**`)
    .addFields(
      { name: 'Artist', value: track.artist || 'Unknown', inline: true },
      { name: 'Category', value: category, inline: true },
      { name: 'Track ID', value: `\`${track.trackId}\``, inline: true }
    )
    .setColor(0x9B59B6)
    .setFooter({ text: `Added by ${interaction.user.username}` });

  // If user is in voice channel, add to queue and play
  if (voiceChannel) {
    try {
      const player = await queueManager.getOrCreatePlayer(interaction.guild!.id, voiceChannel as any, interaction.channelId);
      await player.addToQueue(trackForQueue, interaction.user.id);
      embed.setDescription(`**${track.title}**\n\n✅ Saved to database and added to queue.`);
    } catch (e) {
      embed.setDescription(`**${track.title}**\n\n✅ Saved to database. Join a voice channel and use Playlist or /play to play.`);
    }
  }

  await interaction.editReply({ embeds: [embed] });

  const { musicLogService } = await import('../services/MusicLogService');
  musicLogService.addLog(`Track added via channel: ${track.title} (${category})`, 'info');
}

// Button handlers
async function handlePlayPauseButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This command can only be used in a server!' });
    return;
  }

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.editReply({ content: '🎵 You need to be in a voice channel to use this command!' });
    return;
  }

  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);

  if (!player || !player.isConnected()) {
    await interaction.editReply({ content: '❌ There is no music playing right now!' });
    return;
  }

  // Toggle play/pause based on actual playback state (Playing vs Paused)
  const state = player.getPlaybackState();

  if (state === 'playing') {
    const paused = player.pause();
    if (paused) {
      const { musicLogService } = await import('../services/MusicLogService');
      musicLogService.addLog('Music paused', 'info');
      await interaction.editReply({ content: '⏸️ Music paused. Click again to resume!' });
    } else {
      await interaction.editReply({ content: '❌ Could not pause music.' });
    }
  } else if (state === 'paused') {
    const resumed = player.resume();
    if (resumed) {
      const { musicLogService } = await import('../services/MusicLogService');
      musicLogService.addLog('Music resumed', 'info');
      await interaction.editReply({ content: '▶️ Music resumed!' });
    } else {
      await interaction.editReply({ content: '❌ Could not resume music.' });
    }
  } else {
    await interaction.editReply({ content: '❌ No track is playing. Select a playlist or use /play first!' });
  }
}

async function handleSkipButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This command can only be used in a server!' });
    return;
  }

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.editReply({ content: '🎵 You need to be in a voice channel to use this command!' });
    return;
  }

  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);

  if (!player || !player.isConnected()) {
    await interaction.editReply({ content: '❌ There is no music playing right now!' });
    return;
  }

  const currentTrack = player.getCurrentTrack();
  const skipped = player.skip();

  if (skipped) {
    const { musicLogService } = await import('../services/MusicLogService');
    musicLogService.addLog(`Skipped: ${currentTrack?.track.title || 'Unknown track'}`, 'info');
    await interaction.editReply({ content: `⏭️ Skipped: **${currentTrack?.track.title || 'Unknown track'}**` });
  } else {
    await interaction.editReply({ content: '❌ Could not skip. No track is currently playing.' });
  }
}

async function handleQueueButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This command can only be used in a server!' });
    return;
  }

  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);

  if (!player || !player.isConnected()) {
    await interaction.editReply({ content: '❌ There is no active music queue!' });
    return;
  }

  const currentTrack = player.getCurrentTrack();
  const queue = player.getQueue();

  const embed = new EmbedBuilder()
    .setTitle('🎵 Music Queue')
    .setColor(0x9B59B6);

  if (currentTrack) {
    embed.addFields({
      name: '🎧 Now Playing',
      value: `**${currentTrack.track.title}** - ${currentTrack.track.artist}` +
             (currentTrack.isPinned ? ' 📌' : ''),
    });
  }

  if (queue.length > 0) {
    const queueList = queue.slice(0, 10).map((item: any, index: number) => {
      const pinIcon = item.isPinned ? ' 📌' : '';
      return `${index + 1}. **${item.track.title}** - ${item.track.artist}${pinIcon}`;
    }).join('\n');

    embed.addFields({
      name: `📋 Up Next (${queue.length} tracks)`,
      value: queueList,
    });
  } else {
    embed.addFields({
      name: '📋 Up Next',
      value: 'Queue is empty. Add tracks with playlist selection!',
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleNowPlayingButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This command can only be used in a server!' });
    return;
  }

  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);

  if (!player || !player.isConnected()) {
    await interaction.editReply({ content: '❌ There is no music playing right now!' });
    return;
  }

  const currentTrack = player.getCurrentTrack();

  if (!currentTrack) {
    await interaction.editReply({ content: '❌ No track is currently playing!' });
    return;
  }

  const track = currentTrack.track;
  const { formatDuration } = await import('../config/playlists');

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

  await interaction.editReply({ embeds: [embed] });
}

async function handleStopButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This command can only be used in a server!' });
    return;
  }

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.editReply({ content: '🎵 You need to be in a voice channel to use this command!' });
    return;
  }

  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);

  if (!player || !player.isConnected()) {
    await interaction.editReply({ content: '❌ There is no music playing right now!' });
    return;
  }

  queueManager.destroyPlayer(interaction.guild.id);
  const { musicLogService } = await import('../services/MusicLogService');
  musicLogService.addLog('Music stopped and queue cleared', 'warning');
  await interaction.editReply({ content: '⏹️ Music stopped and queue cleared. Disconnected from voice channel.' });
}

async function handlePlaylistSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This command can only be used in a server!' });
    return;
  }

  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    await interaction.editReply({ content: '🎵 You need to be in a voice channel to play music!' });
    return;
  }

  const category = interaction.values[0] as any;
  const queueManager = client.queueManager;

  // Check if trying to access hidden playlist
  if (category === 'hidden') {
    const hasAccess = await honorPointService.hasUnlockedHidden(interaction.user.id);
    
    if (!hasAccess) {
      await interaction.editReply({
        content: '🔮 The **Hidden Treasures** playlist is locked! Use the **Unlock Hidden** button to spend Honor Points and gain access.',
      });
      return;
    }
  }

  // Get tracks for the category
  const tracks = await queueManager.getPlaylist(category);

  if (tracks.length === 0) {
    await interaction.editReply({
      content: `❌ No tracks found in the **${category}** playlist.`,
    });
    return;
  }

  // Get or create the music player for this guild
  const player = await queueManager.getOrCreatePlayer(
    interaction.guild.id,
    voiceChannel as any,
    interaction.channelId
  );

  // Clear current queue and add new playlist
  player.clearQueue();
  await player.addTracksToQueue(tracks, true); // Shuffle the playlist

  // Find the playlist config for the emoji
  const playlistConfig = DEFAULT_PLAYLISTS.find(p => p.category === category);

  // Add log entry
  const { musicLogService } = await import('../services/MusicLogService');
  musicLogService.addLog(`Playlist selected: ${playlistConfig?.name || category} (${tracks.length} tracks)`, 'success');

  // Build track list for embed (Discord field value limit 1024 chars)
  const maxList = 15;
  const listLines = tracks.slice(0, maxList).map((t: { title: string; artist?: string }, i: number) => `${i + 1}. ${t.title}${t.artist ? ` — ${t.artist}` : ''}`);
  const trackListText = listLines.length > 0
    ? listLines.join('\n') + (tracks.length > maxList ? `\n... and ${tracks.length - maxList} more` : '')
    : '—';

  const embed = new EmbedBuilder()
    .setTitle(`${playlistConfig?.emoji || '🎵'} ${playlistConfig?.name || category} Playlist`)
    .setDescription(playlistConfig?.description || `Playing ${category} music`)
    .addFields(
      { name: 'Tracks', value: tracks.length.toString(), inline: true },
      { name: 'Mode', value: 'Shuffled', inline: true },
      { name: '📋 Songs in this playlist', value: trackListText.slice(0, 1024), inline: false }
    )
    .setColor(category === 'hidden' ? 0xFFD700 : 0x9B59B6)
    .setFooter({ text: `Started by ${interaction.user.username}` });

  await interaction.editReply({ embeds: [embed] });
}

async function handlePinButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This command can only be used in a server!' });
    return;
  }

  // Check if there's a current track playing
  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);
  const currentTrack = player?.getCurrentTrack();

  if (!currentTrack) {
    await interaction.editReply({
      content: '📌 **Pin Track**\n\n' +
               'To pin a track, use the `/pin` command:\n' +
               '`/pin [track name]`\n\n' +
               '**Cost:** 5 Honor Points\n' +
               '**Effect:** The pinned track will play next, even if there are other tracks in the queue.',
    });
    return;
  }

  // If there's a current track, offer to pin it
  try {
    const result = await honorPointService.pinTrack(
      interaction.user.id,
      interaction.user.username,
      currentTrack.track.trackId
    );

    if (!result.success) {
      await interaction.editReply({ content: `❌ ${result.message}` });
      return;
    }

    // Add to pinned queue
    if (player) {
      await player.addToQueue(currentTrack.track, interaction.user.id, true);
    }

    const { HONOR_COSTS } = await import('../config/playlists');
    const embed = new EmbedBuilder()
      .setTitle('📌 Track Pinned!')
      .setDescription(`**${currentTrack.track.title}** will play next!`)
      .addFields(
        { name: 'Cost', value: `${HONOR_COSTS.PIN_TRACK} Honor Points`, inline: true },
        { name: 'New Balance', value: `${result.newBalance} points`, inline: true }
      )
      .setColor(0xFFD700)
      .setFooter({ text: `Pinned by ${interaction.user.username}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[Pin Button] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while pinning the track.',
    });
  }
}

async function handleUpvoteButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This command can only be used in a server!' });
    return;
  }

  // Check if there's a current track playing
  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);
  const currentTrack = player?.getCurrentTrack();

  if (!currentTrack) {
    await interaction.editReply({
      content: '❤️ **Upvote Track**\n\n' +
               'To upvote a track, use the `/upvote` command:\n' +
               '`/upvote [track name]`\n\n' +
               '**Cost:** 2 Honor Points\n' +
               '**Effect:** Shows your support for the track and increases its upvote count.',
    });
    return;
  }

  // If there's a current track, offer to upvote it
  try {
    const result = await honorPointService.upvoteTrack(
      interaction.user.id,
      interaction.user.username,
      currentTrack.track.trackId
    );

    if (!result.success) {
      await interaction.editReply({ content: `❌ ${result.message}` });
      return;
    }

    const { HONOR_COSTS } = await import('../config/playlists');
    const embed = new EmbedBuilder()
      .setTitle('❤️ Track Upvoted!')
      .setDescription(`You upvoted **${currentTrack.track.title}**!`)
      .addFields(
        { name: 'Total Upvotes', value: `${currentTrack.track.upvotes + 1}`, inline: true },
        { name: 'Cost', value: `${HONOR_COSTS.UPVOTE_TRACK} Honor Points`, inline: true },
        { name: 'New Balance', value: `${result.newBalance} points`, inline: true }
      )
      .setColor(0xE91E63)
      .setFooter({ text: `Thanks for supporting ${currentTrack.track.artist || 'the artist'}!` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[Upvote Button] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while upvoting the track.',
    });
  }
}

async function handleUnlockButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This command can only be used in a server!' });
    return;
  }

  try {
    const hasAccess = await honorPointService.hasUnlockedHidden(interaction.user.id);
    
    if (hasAccess) {
      await interaction.editReply({
        content: '✨ You have already unlocked the **Hidden Treasures** playlist! Select it from the playlist menu.',
      });
      return;
    }

    const currentBalance = await honorPointService.getHonorPoints(interaction.user.id);
    const { HONOR_COSTS } = await import('../config/playlists');
    
    if (currentBalance < HONOR_COSTS.UNLOCK_HIDDEN) {
      await interaction.editReply({
        content: `❌ You need **${HONOR_COSTS.UNLOCK_HIDDEN} Honor Points** to unlock the Hidden Treasures playlist.\n\n` +
                 `Your current balance: **${currentBalance} points**\n\n` +
                 `Earn more points by interacting with Honor Bot!`,
      });
      return;
    }

    const result = await honorPointService.unlockHiddenPlaylist(
      interaction.user.id,
      interaction.user.username
    );

    if (!result.success) {
      await interaction.editReply({ content: `❌ ${result.message}` });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🔮 Hidden Treasures Unlocked!')
      .setDescription('You have unlocked exclusive access to the **Hidden Treasures** playlist!')
      .addFields(
        { name: 'Cost', value: `${HONOR_COSTS.UNLOCK_HIDDEN} Honor Points`, inline: true },
        { name: 'New Balance', value: `${result.newBalance} points`, inline: true }
      )
      .setColor(0xFFD700)
      .setFooter({ text: 'Select "Hidden Treasures" from the playlist menu!' });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[Unlock Button] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while unlocking the playlist.',
    });
  }
}

async function handleBalanceButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const balance = await honorPointService.getHonorPoints(interaction.user.id);
    const hasUnlockedHidden = await honorPointService.hasUnlockedHidden(interaction.user.id);
    const { HONOR_COSTS } = await import('../config/playlists');

    const embed = new EmbedBuilder()
      .setTitle('💰 Honor Points Balance')
      .setDescription(`You have **${balance}** Honor Points`)
      .setColor(0x9B59B6)
      .addFields(
        {
          name: '📋 Price List',
          value: 
            `📌 Pin a Track: **${HONOR_COSTS.PIN_TRACK}** points\n` +
            `❤️ Upvote a Track: **${HONOR_COSTS.UPVOTE_TRACK}** points\n` +
            `🔮 Unlock Hidden Playlist: **${HONOR_COSTS.UNLOCK_HIDDEN}** points`,
        },
        {
          name: '🔮 Hidden Playlist',
          value: hasUnlockedHidden ? '✅ Unlocked' : '🔒 Locked',
          inline: true,
        }
      )
      .setFooter({ text: 'Earn Honor Points by interacting with Honor Bot!' });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[Balance Button] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while fetching your balance.',
    });
  }
}

async function handleSaveYouTubeButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This command can only be used in a server!' });
    return;
  }

  if (!isDBConnected()) {
    await interaction.editReply({ 
      content: '❌ Database is not connected. Please try again later.', 
    });
    return;
  }

  try {
    // Parse customId: save_youtube_{videoId}_{encodedUrl}
    const customId = interaction.customId;
    const parts = customId.split('_');
    
    if (parts.length < 4) {
      await interaction.editReply({
        content: '❌ Invalid button data. Please use `/addtrack` command instead.',
      });
      return;
    }

    // Reconstruct encoded URL (everything after save_youtube_{videoId}_)
    const videoId = parts[2];
    const encodedUrl = customId.substring(`save_youtube_${videoId}_`.length);
    const youtubeUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

    // Check if track already exists
    const { Track } = await import('../models/Track');
    const existingTrack = await Track.findOne({ youtubeUrl });
    
    if (existingTrack) {
      await interaction.editReply({
        content: `✅ This track is already saved!\n\n**Track:** ${existingTrack.title}\n**Track ID:** \`${existingTrack.trackId}\`\n**Category:** ${existingTrack.category}\n\nUse \`/addtoplaylist trackid:${existingTrack.trackId} category:${existingTrack.category}\` to add it to a playlist.`,
      });
      return;
    }

    // Check if trackId already exists
    const trackId = `youtube-${videoId}`;
    const existingById = await Track.findOne({ trackId });
    if (existingById) {
      await interaction.editReply({
        content: `✅ A track with this video ID already exists!\n\n**Track:** ${existingById.title}\n**Track ID:** \`${existingById.trackId}\`\n**YouTube URL:** ${existingById.youtubeUrl}`,
      });
      return;
    }

    // Fetch video info (YouTubeService / youtubei.js)
    const { getVideoInfo } = await import('../services/YouTubeService');
    const videoInfo = await getVideoInfo(youtubeUrl);

    if (!videoInfo || !videoInfo.videoDetails) {
      await interaction.editReply({
        content: `❌ Could not fetch video information. The video may be private or deleted.`,
      });
      return;
    }

    const videoDetails = videoInfo.videoDetails;
    const title = videoDetails.title || 'Unknown Title';
    const artist = videoDetails.author?.name || 'Unknown Artist';
    const duration = parseInt(videoDetails.lengthSeconds) || 0;
    const description = videoDetails.description?.substring(0, 500) || '';

    // Create new track with default category 'battle'
    const newTrack = new Track({
      trackId,
      title,
      artist,
      youtubeUrl,
      audioSource: 'youtube',
      duration,
      category: 'battle', // Default category
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
    });

    await newTrack.save();

    // Add to playlist
    const { Playlist } = await import('../models/Playlist');
    let playlist = await Playlist.findOne({ category: 'battle', isDefault: true });
    
    if (!playlist) {
      playlist = new Playlist({
        name: 'Battle Music',
        category: 'battle',
        description: 'Default battle playlist',
        trackIds: [trackId],
        shuffledOrder: [trackId],
        isDefault: true,
        lastShuffled: new Date(),
      });
      await playlist.save();
    } else {
      if (!playlist.trackIds.includes(trackId)) {
        playlist.trackIds.push(trackId);
        playlist.shuffledOrder.push(trackId);
        await playlist.save();
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Track Saved Successfully!')
      .setDescription(`**${title}**\n\n✅ Saved to database and added to **Battle** playlist.\n\n💡 Use \`/addtoplaylist trackid:${trackId} category:<category>\` to add it to other playlists.`)
      .addFields(
        { name: 'Artist', value: artist, inline: true },
        { name: 'Category', value: 'battle (default)', inline: true },
        { name: 'Track ID', value: `\`${trackId}\``, inline: true },
        { name: 'Duration', value: duration > 0 ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : 'Unknown', inline: true }
      )
      .setColor(0x9B59B6)
      .setFooter({ text: `Saved by ${interaction.user.username}` });

    await interaction.editReply({ embeds: [embed] });

    // Log the addition
    const { musicLogService } = await import('../services/MusicLogService');
    musicLogService.addLog(`Track saved via button: ${title} by ${artist}`, 'info');

  } catch (error: any) {
    console.error('[Save YouTube Button] Error:', error);
    
    let errorMessage = '❌ An error occurred while saving the track.';
    
    if (error.message?.includes('duplicate key')) {
      errorMessage = '❌ A track with this ID already exists in the database.';
    } else if (error.message) {
      errorMessage = `❌ Error: ${error.message}`;
    }
    
    await interaction.editReply({
      content: errorMessage,
    });
  }
}
