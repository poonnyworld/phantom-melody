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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  VoiceChannel,
} from 'discord.js';
import { client } from '../index';
import { isDBConnected } from '../utils/connectDB';
import { MAX_QUEUE_SIZE, SKIP_VOTES_REQUIRED, formatDuration } from '../config/playlists';

export const name = Events.InteractionCreate;
export const once = false;

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
 * Check if user is in the designated voice channel
 */
async function checkVoiceChannel(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<VoiceChannel | null> {
  const member = interaction.member as GuildMember;
  const voiceChannel = member.voice.channel;
  const requiredChannelId = process.env.PHANTOM_MELODY_VOICE_CHANNEL_ID;

  if (!voiceChannel) {
    await interaction.reply({
      content: '🎵 You need to be in a voice channel to use this!',
      ephemeral: true,
    });
    return null;
  }

  if (requiredChannelId && voiceChannel.id !== requiredChannelId) {
    await interaction.reply({
      content: `🎵 You need to be in <#${requiredChannelId}> to use this!`,
      ephemeral: true,
    });
    return null;
  }

  return voiceChannel as VoiceChannel;
}

/**
 * Handle button interactions
 */
async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  // Vote Skip button
  if (customId === 'music_vote_skip') {
    await handleVoteSkipButton(interaction);
    return;
  }

  // View Queue button
  if (customId === 'music_queue') {
    await handleQueueButton(interaction);
    return;
  }

  // Admin: Add song button
  if (customId === 'admin_add_song') {
    await showAdminAddSongModal(interaction);
    return;
  }

  // Admin: View & Remove songs button
  if (customId === 'admin_view_songs') {
    await showAdminViewSongs(interaction);
    return;
  }

  // Admin: Confirm remove track
  if (customId.startsWith('admin_confirm_remove_')) {
    await handleAdminConfirmRemove(interaction);
    return;
  }

  // Admin: Cancel remove
  if (customId.startsWith('admin_cancel_remove')) {
    await handleAdminCancelRemove(interaction);
    return;
  }

  // Selection Queue: Join queue
  if (customId === 'selection_join_queue') {
    await handleSelectionJoinQueue(interaction);
    return;
  }

  // Selection Queue: Leave/Pass
  if (customId === 'selection_leave_queue') {
    await handleSelectionLeaveQueue(interaction);
    return;
  }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
  // User song selection
  if (interaction.customId === 'song_select') {
    await handleSongSelect(interaction);
    return;
  }

  // Admin: Remove track selection
  if (interaction.customId === 'admin_remove_select') {
    await handleAdminRemoveSelect(interaction);
    return;
  }
}

/**
 * Handle modal submissions
 */
async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;

  // Admin add song modal
  if (customId === 'admin_add_song_modal') {
    await handleAdminAddSongModal(interaction);
    return;
  }
}

// ============================================
// USER HANDLERS
// ============================================

/**
 * Handle song selection from dropdown
 */
async function handleSongSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const voiceChannel = await checkVoiceChannel(interaction);
  if (!voiceChannel) return;

  await interaction.deferReply({ ephemeral: true });

  // Check if user can select (selection queue system)
  const { selectionQueueService } = await import('../services/SelectionQueueService');
  const canSelectResult = selectionQueueService.canSelect(interaction.user.id);

  if (!canSelectResult.canSelect) {
    await interaction.editReply({
      content: `⏳ ${canSelectResult.message}\n\nClick **Join Queue** in the Selection Queue panel to wait for your turn.`,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This can only be used in a server!' });
    return;
  }

  const trackId = interaction.values[0];
  const queueManager = client.queueManager;

  // Get the track
  const track = await queueManager.getTrackById(trackId);
  if (!track) {
    await interaction.editReply({ content: '❌ Track not found!' });
    return;
  }

  // Get or create player
  const player = await queueManager.getOrCreatePlayer(
    interaction.guild.id,
    voiceChannel,
    interaction.channelId
  );

  // Check queue limit
  if (player.getQueueLength() >= MAX_QUEUE_SIZE) {
    await interaction.editReply({
      content: `❌ Queue is full! (max ${MAX_QUEUE_SIZE} tracks)\nWait for current track to finish or Vote Skip`,
    });
    return;
  }

  // Convert to plain object for MusicPlayer
  const trackForQueue = (track as any).toObject ? (track as any).toObject() : { ...track, youtubeUrl: track.youtubeUrl };

  // Add to queue
  const added = await player.addToQueue(trackForQueue, interaction.user.id, interaction.user.username);

  if (!added) {
    await interaction.editReply({
      content: `❌ Could not add track. Queue may be full.`,
    });
    return;
  }

  // Notify selection queue that user finished selecting
  selectionQueueService.onSongSelected(interaction.user.id);

  // Log user adding song to queue
  const { musicLogService } = await import('../services/MusicLogService');
  musicLogService.addLog(`📋 Queued: **${track.title}** by ${interaction.user.username}`, 'info');

  const embed = new EmbedBuilder()
    .setTitle('🎵 Added to Queue!')
    .setDescription(`**${track.title}**`)
    .addFields(
      { name: 'Artist', value: track.artist || 'Unknown', inline: true },
      { name: 'Duration', value: formatDuration(track.duration || 0), inline: true },
      { name: 'Position', value: `#${player.getQueueLength()}`, inline: true }
    )
    .setColor(0x9B59B6)
    .setFooter({ text: `Added by ${interaction.user.username}` })
    .setTimestamp();

  if (track.thumbnailUrl) {
    embed.setThumbnail(track.thumbnailUrl);
  } else if (track.youtubeUrl) {
    const videoIdMatch = track.youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (videoIdMatch && videoIdMatch[1]) {
      embed.setThumbnail(`https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`);
    }
  }

  await interaction.editReply({ embeds: [embed] });

  // Update display
  const { nowPlayingDisplayService } = await import('../services/NowPlayingDisplayService');
  nowPlayingDisplayService.updateDisplay();
}

/**
 * Handle Vote Skip button
 */
async function handleVoteSkipButton(interaction: ButtonInteraction): Promise<void> {
  const voiceChannel = await checkVoiceChannel(interaction);
  if (!voiceChannel) return;

  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This can only be used in a server!' });
    return;
  }

  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);

  if (!player || !player.isConnected()) {
    await interaction.editReply({ content: '❌ No music is currently playing!' });
    return;
  }

  const currentTrack = player.getCurrentTrack();
  if (!currentTrack) {
    await interaction.editReply({ content: '❌ No music is currently playing!' });
    return;
  }

  const result = player.addSkipVote(interaction.user.id);

  if (!result.voted) {
    await interaction.editReply({
      content: `⏭️ You already voted to skip this track!\n\nCurrent votes: **${result.totalVotes}/${result.required}**`,
    });
    return;
  }

  if (result.skipped) {
    const { musicLogService } = await import('../services/MusicLogService');
    musicLogService.addLog(`⏭️ Skipped: ${currentTrack.track.title} (vote skip - ${result.totalVotes} votes)`, 'info');

    await interaction.editReply({
      content: `⏭️ Skipped **${currentTrack.track.title}**!\n\n✅ Reached ${result.required} votes`,
    });
  } else {
    await interaction.editReply({
      content: `⏭️ Voted to skip **${currentTrack.track.title}**\n\nCurrent votes: **${result.totalVotes}/${result.required}**\nNeed **${result.required - result.totalVotes}** more votes`,
    });
  }
}

/**
 * Handle View Queue button
 */
async function handleQueueButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This can only be used in a server!' });
    return;
  }

  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);

  if (!player || !player.isConnected()) {
    await interaction.editReply({ content: '❌ No active music queue!' });
    return;
  }

  const currentTrack = player.getCurrentTrack();
  const queue = player.getQueue();

  const embed = new EmbedBuilder()
    .setTitle('🎵 Music Queue')
    .setColor(0x9B59B6);

  if (currentTrack) {
    const position = player.getPlaybackPosition();
    const duration = currentTrack.track.duration || 0;
    const progressBar = createProgressBar(position, duration);

    embed.addFields({
      name: '🎧 Now Playing',
      value: `**${currentTrack.track.title}** — ${currentTrack.track.artist || 'Unknown'}\n` +
        `\`${formatDuration(position)}\` ${progressBar} \`${formatDuration(duration)}\`` +
        (currentTrack.requestedByUsername ? `\n🙋 ${currentTrack.requestedByUsername}` : ''),
    });
  }

  if (queue.length > 0) {
    const queueList = queue.slice(0, 10).map((item: any, index: number) => {
      const requester = item.requestedByUsername ? ` • 🙋 ${item.requestedByUsername}` : '';
      return `**${index + 1}.** ${item.track.title} — ${item.track.artist || 'Unknown'}${requester}`;
    }).join('\n');

    embed.addFields({
      name: `📋 Up Next (${queue.length} tracks)`,
      value: queueList,
    });

    if (queue.length > 10) {
      embed.setFooter({ text: `and ${queue.length - 10} more...` });
    }
  } else {
    embed.addFields({
      name: '📋 Up Next',
      value: '*No tracks in queue — Select songs from the menu!*',
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ============================================
// ADMIN HANDLERS
// ============================================

/**
 * Show admin add song modal
 */
async function showAdminAddSongModal(interaction: ButtonInteraction): Promise<void> {
  const urlInput = new TextInputBuilder()
    .setCustomId('url')
    .setLabel('YouTube URL')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://www.youtube.com/watch?v=...')
    .setRequired(true)
    .setMaxLength(500);

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
    .setPlaceholder('Leave blank to use YouTube channel name')
    .setRequired(false)
    .setMaxLength(200);

  const modal = new ModalBuilder()
    .setCustomId('admin_add_song_modal')
    .setTitle('Add New Track')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(artistInput)
    );

  await interaction.showModal(modal);
}

/**
 * Handle admin add song modal submission
 */
async function handleAdminAddSongModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ content: '❌ This can only be used in a server!' });
    return;
  }

  const url = interaction.fields.getTextInputValue('url').trim();
  const customTitle = interaction.fields.getTextInputValue('title')?.trim() || undefined;
  const customArtist = interaction.fields.getTextInputValue('artist')?.trim() || undefined;

  if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)) {
    await interaction.editReply({ content: '❌ Invalid URL. Please use a YouTube link.' });
    return;
  }

  if (!isDBConnected()) {
    await interaction.editReply({ content: '❌ Database not connected. Try again later.' });
    return;
  }

  const queueManager = client.queueManager;
  const result = await queueManager.saveYouTubeTrack(url, customTitle, customArtist);

  if (!result.success) {
    await interaction.editReply({ content: `❌ ${result.error || 'Could not save track.'}` });
    return;
  }

  const track = result.track!;
  const { musicLogService } = await import('../services/MusicLogService');
  musicLogService.addLog(`Admin added track: **${track.title}**`, 'success');

  const embed = new EmbedBuilder()
    .setTitle('✅ Track Added Successfully!')
    .setDescription(`**${track.title}**`)
    .addFields(
      { name: 'Artist', value: track.artist || 'Unknown', inline: true },
      { name: 'Duration', value: formatDuration(track.duration || 0), inline: true },
      { name: 'Track ID', value: `\`${track.trackId}\``, inline: true }
    )
    .setColor(0x57F287)
    .setFooter({ text: `Added by ${interaction.user.username}` });

  if (track.thumbnailUrl) {
    embed.setThumbnail(track.thumbnailUrl);
  }

  await interaction.editReply({ embeds: [embed] });

  // Refresh song selection menus
  const { MusicInteractionService } = await import('../services/MusicInteractionService');
  const musicInteractionService = new MusicInteractionService(client, queueManager);
  await musicInteractionService.refreshSongSelection();
}

/**
 * Show admin view songs panel
 */
async function showAdminViewSongs(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const queueManager = client.queueManager;
  const tracks = await queueManager.getAllTracks();

  const maxListLines = 20;
  const listLines = tracks.slice(0, maxListLines).map(
    (t: any, i: number) => `${i + 1}. ${t.title}${t.artist ? ` — ${t.artist}` : ''}`
  );
  const listText = listLines.length > 0
    ? listLines.join('\n') + (tracks.length > maxListLines ? `\n... and ${tracks.length - maxListLines} more` : '')
    : '*No tracks in playlist*';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 All Tracks')
    .setDescription(listText.slice(0, 4096))
    .setFooter({ text: `${tracks.length} tracks • Select below to remove` })
    .setTimestamp();

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

  if (tracks.length > 0) {
    const maxOptions = 25;
    const options = tracks.slice(0, maxOptions).map((t: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel((t.title || t.trackId).slice(0, 100))
        .setValue(t.trackId)
        .setDescription((t.artist || 'PBZ Music').slice(0, 100))
    );
    const select = new StringSelectMenuBuilder()
      .setCustomId('admin_remove_select')
      .setPlaceholder('Select track to remove...')
      .addOptions(options);
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  await interaction.editReply({
    embeds: [embed],
    components: components.length > 0 ? components : undefined,
  });
}

/**
 * Handle admin remove track selection
 */
async function handleAdminRemoveSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const trackId = interaction.values[0];
  if (!trackId) return;

  await interaction.deferUpdate();

  const queueManager = client.queueManager;
  const track = await queueManager.getTrackById(trackId);
  const trackTitle = track?.title || trackId;

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('⚠️ Confirm Removal')
    .setDescription(`Remove **${trackTitle}** from playlist?`)
    .setFooter({ text: 'Press Confirm to remove or Cancel to go back' })
    .setTimestamp();

  const confirmBtn = new ButtonBuilder()
    .setCustomId(`admin_confirm_remove_${trackId}`)
    .setLabel('Confirm Remove')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('✅');
  const cancelBtn = new ButtonBuilder()
    .setCustomId('admin_cancel_remove')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('❌');
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn);

  await interaction.editReply({ embeds: [embed], components: [row] });
}

/**
 * Handle admin confirm remove
 */
async function handleAdminConfirmRemove(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  if (!customId.startsWith('admin_confirm_remove_')) return;

  await interaction.deferUpdate();

  const trackId = customId.replace('admin_confirm_remove_', '');
  const queueManager = client.queueManager;

  const track = await queueManager.getTrackById(trackId);
  const trackTitle = track?.title || trackId;

  const removed = await queueManager.removeTrack(trackId);

  if (removed) {
    const { musicLogService } = await import('../services/MusicLogService');
    musicLogService.addLog(`Admin removed track: **${trackTitle}**`, 'info');
  }

  // Show updated list
  const tracks = await queueManager.getAllTracks();
  const maxListLines = 20;
  const listLines = tracks.slice(0, maxListLines).map(
    (t: any, i: number) => `${i + 1}. ${t.title}${t.artist ? ` — ${t.artist}` : ''}`
  );
  const listText = listLines.length > 0
    ? listLines.join('\n') + (tracks.length > maxListLines ? `\n... and ${tracks.length - maxListLines} more` : '')
    : '*No tracks in playlist*';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 All Tracks')
    .setDescription(listText.slice(0, 4096))
    .setFooter({ text: removed ? `✅ Removed "${trackTitle}" • ${tracks.length} tracks` : `❌ Could not remove • ${tracks.length} tracks` })
    .setTimestamp();

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

  if (tracks.length > 0) {
    const maxOptions = 25;
    const options = tracks.slice(0, maxOptions).map((t: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel((t.title || t.trackId).slice(0, 100))
        .setValue(t.trackId)
        .setDescription((t.artist || 'PBZ Music').slice(0, 100))
    );
    const select = new StringSelectMenuBuilder()
      .setCustomId('admin_remove_select')
      .setPlaceholder('Select track to remove...')
      .addOptions(options);
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  await interaction.editReply({ embeds: [embed], components: components.length > 0 ? components : [] });

  // Refresh song selection menus
  const { MusicInteractionService } = await import('../services/MusicInteractionService');
  const musicInteractionService = new MusicInteractionService(client, queueManager);
  await musicInteractionService.refreshSongSelection();
}

/**
 * Handle admin cancel remove
 */
async function handleAdminCancelRemove(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();

  // Show list again
  const queueManager = client.queueManager;
  const tracks = await queueManager.getAllTracks();

  const maxListLines = 20;
  const listLines = tracks.slice(0, maxListLines).map(
    (t: any, i: number) => `${i + 1}. ${t.title}${t.artist ? ` — ${t.artist}` : ''}`
  );
  const listText = listLines.length > 0
    ? listLines.join('\n') + (tracks.length > maxListLines ? `\n... and ${tracks.length - maxListLines} more` : '')
    : '*No tracks in playlist*';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 All Tracks')
    .setDescription(listText.slice(0, 4096))
    .setFooter({ text: `${tracks.length} tracks • Select below to remove` })
    .setTimestamp();

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

  if (tracks.length > 0) {
    const maxOptions = 25;
    const options = tracks.slice(0, maxOptions).map((t: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel((t.title || t.trackId).slice(0, 100))
        .setValue(t.trackId)
        .setDescription((t.artist || 'PBZ Music').slice(0, 100))
    );
    const select = new StringSelectMenuBuilder()
      .setCustomId('admin_remove_select')
      .setPlaceholder('Select track to remove...')
      .addOptions(options);
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  await interaction.editReply({ embeds: [embed], components: components.length > 0 ? components : [] });
}

// ============================================
// SELECTION QUEUE HANDLERS
// ============================================

/**
 * Handle joining the selection queue
 */
async function handleSelectionJoinQueue(interaction: ButtonInteraction): Promise<void> {
  const voiceChannel = await checkVoiceChannel(interaction);
  if (!voiceChannel) return;

  const { selectionQueueService } = await import('../services/SelectionQueueService');
  const result = selectionQueueService.joinQueue(interaction.user.id, interaction.user.username);

  await interaction.reply({
    content: result.success
      ? `✅ ${result.message}`
      : `ℹ️ ${result.message}`,
    ephemeral: true,
  });
}

/**
 * Handle leaving the selection queue or passing turn
 */
async function handleSelectionLeaveQueue(interaction: ButtonInteraction): Promise<void> {
  const { selectionQueueService } = await import('../services/SelectionQueueService');
  const result = selectionQueueService.leaveQueue(interaction.user.id);

  await interaction.reply({
    content: result.success
      ? `✅ ${result.message}`
      : `ℹ️ ${result.message}`,
    ephemeral: true,
  });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Create a visual progress bar
 */
function createProgressBar(position: number, duration: number): string {
  const totalBars = 15;
  if (duration <= 0) return '─'.repeat(totalBars);

  const progress = Math.min(position / duration, 1);
  const filledBars = Math.round(progress * totalBars);
  const emptyBars = totalBars - filledBars;

  const filled = '━'.repeat(Math.max(0, filledBars - 1));
  const pointer = filledBars > 0 ? '⬤' : '';
  const empty = '─'.repeat(emptyBars);

  return filled + pointer + empty;
}
