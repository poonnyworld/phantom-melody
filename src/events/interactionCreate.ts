import {
  Events,
  Interaction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  MessageFlags,
  GuildMember,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  VoiceChannel,
  PermissionFlagsBits,
} from 'discord.js';
import { client } from '../index';
import { isDBConnected } from '../utils/connectDB';
import { MAX_QUEUE_SIZE, MAX_QUEUES_PER_USER, SKIP_VOTES_REQUIRED, formatDuration, ALBUMS } from '../config/playlists';

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
  const requiredChannelId = process.env.PHANTOM_RADIO_VOICE_CHANNEL_ID;

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

  // Admin: View & Remove songs button
  if (customId === 'admin_view_songs') {
    await showAdminViewSongs(interaction);
    return;
  }

  // Admin-only: Force Skip / Pause / Resume (ADMIN_CONTROL_CHANNEL_ID)
  if (customId === 'admin_force_skip') {
    await handleAdminForceSkip(interaction);
    return;
  }
  if (customId === 'admin_pause') {
    await handleAdminPause(interaction);
    return;
  }
  if (customId === 'admin_resume') {
    await handleAdminResume(interaction);
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

  // Selection Queue: Select Song (shows ephemeral dropdown when it's your turn)
  if (customId === 'selection_choose_song') {
    await handleSelectionChooseSong(interaction);
    return;
  }

  if (customId === 'selection_back_to_albums') {
    await handleSelectionBackToAlbums(interaction);
    return;
  }

  // Playlist display: Previous/Next page
  if (customId.startsWith('playlist_prev_') || customId.startsWith('playlist_next_')) {
    await handlePlaylistPage(interaction);
    return;
  }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
  // Album selection (first step: choose album, then we show song list for that album)
  if (interaction.customId === 'album_select') {
    await handleAlbumSelect(interaction);
    return;
  }

  // User song selection (song_select, song_select_0, song_select_1, ...)
  if (interaction.customId.startsWith('song_select')) {
    await handleSongSelect(interaction);
    return;
  }

  // Admin: Remove track selection (admin_remove_select, admin_remove_select_0, ...)
  if (interaction.customId.startsWith('admin_remove_select')) {
    await handleAdminRemoveSelect(interaction);
    return;
  }
}

/**
 * Handle modal submissions
 */
async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;
}

// ============================================
// USER HANDLERS
// ============================================

/**
 * Handle album selection — show song dropdowns for the chosen album
 */
async function handleAlbumSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const albumKey = interaction.values[0];
  const tracks = await client.queueManager.getTracksByAlbum(albumKey);
  if (tracks.length === 0) {
    await interaction.update({
      content: 'No tracks in that album yet.',
      components: [],
    });
    return;
  }
  // Max 4 song menus so we can add a 5th row with Back button (Discord limit 5 action rows)
  const songRows = buildSongSelectComponents(tracks, 4);
  const components = [...songRows, buildBackToAlbumsButtonRow()];
  await interaction.update({
    content: '**Select a song below** (only you can see this):',
    components,
  });
}

/**
 * Handle "Back to albums" button — show album select menu again
 */
async function handleSelectionBackToAlbums(interaction: ButtonInteraction): Promise<void> {
  const albumRow = buildAlbumSelectComponent();
  await interaction.update({
    content: '**Choose an album below**, then pick a song (only you can see this):',
    components: [albumRow],
  });
}

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

  // Check per-user limit (5 songs per user; slot freed when your song finishes)
  const userQueued = player.getQueuedCountForUser(interaction.user.id);
  if (userQueued >= MAX_QUEUES_PER_USER) {
    await interaction.editReply({
      content: `❌ You already have ${MAX_QUEUES_PER_USER} songs in the queue. When one of yours finishes playing, you can add another.`,
    });
    return;
  }

  // Check total queue limit
  if (player.getQueueLength() >= MAX_QUEUE_SIZE) {
    await interaction.editReply({
      content: `❌ Queue is full (max ${MAX_QUEUE_SIZE} songs). Wait for a track to finish or use Vote Skip.`,
    });
    return;
  }

  // Convert to plain object for MusicPlayer
  const trackForQueue = (track as any).toObject ? (track as any).toObject() : { ...track, youtubeUrl: track.youtubeUrl };

  // Add to queue
  const added = await player.addToQueue(trackForQueue, interaction.user.id, interaction.user.username);

  if (!added) {
    await interaction.editReply({
      content: `❌ Could not add track. Queue may be full or you may have reached your limit (${MAX_QUEUES_PER_USER} songs per user).`,
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

const OPTIONS_PER_SELECT = 25;
const MAX_SELECT_ROWS = 5;

/** Build multiple select menu rows for removing songs (Discord limit: 25 options per menu) */
function buildAdminRemoveSelectRows(tracks: any[]): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  const menuCount = Math.min(MAX_SELECT_ROWS, Math.ceil(tracks.length / OPTIONS_PER_SELECT));
  for (let i = 0; i < menuCount; i++) {
    const chunk = tracks.slice(i * OPTIONS_PER_SELECT, (i + 1) * OPTIONS_PER_SELECT);
    const options = chunk.map((t: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel((t.title || t.trackId).slice(0, 100))
        .setValue(t.trackId)
        .setDescription((t.artist || 'PBZ Music').slice(0, 100))
    );
    const start = i * OPTIONS_PER_SELECT + 1;
    const end = Math.min((i + 1) * OPTIONS_PER_SELECT, tracks.length);
    const select = new StringSelectMenuBuilder()
      .setCustomId(`admin_remove_select_${i}`)
      .setPlaceholder(`Songs ${start}–${end} — Select to remove...`)
      .addOptions(options);
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  return rows;
}

/**
 * Show admin view songs panel (playlist tracks)
 */
async function showAdminViewSongs(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const queueManager = client.queueManager;
  const tracks = await queueManager.getAllTracks();

  const maxListLines = 50;
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

  const components = buildAdminRemoveSelectRows(tracks);

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
  const maxListLines = 50;
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

  const components = buildAdminRemoveSelectRows(tracks);

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

  const maxListLines = 50;
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

  const components = buildAdminRemoveSelectRows(tracks);

  await interaction.editReply({ embeds: [embed], components: components.length > 0 ? components : [] });
}

/**
 * Check if user has Administrator permission (for admin-only controls)
 */
function isAdmin(interaction: ButtonInteraction): boolean {
  const perms = interaction.memberPermissions ?? (interaction.member as GuildMember)?.permissions;
  return perms?.has(PermissionFlagsBits.Administrator) ?? false;
}

/**
 * Handle admin Force Skip (admin only)
 */
async function handleAdminForceSkip(interaction: ButtonInteraction): Promise<void> {
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({ content: '❌ This can only be used in a server.' });
    return;
  }
  const player = client.queueManager.getPlayer(guildId);
  if (!player) {
    await interaction.editReply({ content: '❌ No active player. Connect to voice first.' });
    return;
  }
  const skipped = player.skip();
  if (skipped) {
    const { musicLogService } = await import('../services/MusicLogService');
    musicLogService.addLog('⏭️ Admin force skipped current track.', 'info');
    await interaction.editReply({ content: '✅ Force skipped current track.' });
  } else {
    await interaction.editReply({ content: 'ℹ️ Nothing playing to skip.' });
  }
}

/**
 * Handle admin Pause (admin only)
 */
async function handleAdminPause(interaction: ButtonInteraction): Promise<void> {
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({ content: '❌ This can only be used in a server.' });
    return;
  }
  const player = client.queueManager.getPlayer(guildId);
  if (!player) {
    await interaction.editReply({ content: '❌ No active player. Connect to voice first.' });
    return;
  }
  const paused = player.pause();
  await interaction.editReply({ content: paused ? '✅ Playback paused.' : 'ℹ️ Not playing or already paused.' });
}

/**
 * Handle admin Resume (admin only)
 */
async function handleAdminResume(interaction: ButtonInteraction): Promise<void> {
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply({ content: '❌ This can only be used in a server.' });
    return;
  }
  const player = client.queueManager.getPlayer(guildId);
  if (!player) {
    await interaction.editReply({ content: '❌ No active player. Connect to voice first.' });
    return;
  }
  const resumed = player.resume();
  await interaction.editReply({ content: resumed ? '✅ Playback resumed.' : 'ℹ️ Not paused or already playing.' });
}

// ============================================
// SELECTION QUEUE HANDLERS
// ============================================

const SONG_SELECT_OPTIONS_PER_MENU = 25;
const SONG_SELECT_MAX_MENUS = 5;

/** Build album select menu (one row, 7 albums). */
function buildAlbumSelectComponent(): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = ALBUMS.map((a) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(a.displayName)
      .setValue(a.slug)
  );
  const select = new StringSelectMenuBuilder()
    .setCustomId('album_select')
    .setPlaceholder('Choose an album...')
    .addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

/** Build a row with "Back to albums" button (for ephemeral song list). */
function buildBackToAlbumsButtonRow(): ActionRowBuilder<ButtonBuilder> {
  const backBtn = new ButtonBuilder()
    .setCustomId('selection_back_to_albums')
    .setLabel('Back to albums')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('◀');
  return new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn);
}

/** Build song select dropdown rows. Use maxMenus=4 when adding a Back button row (Discord max 5 rows). */
function buildSongSelectComponents(tracks: any[], maxMenus: number = SONG_SELECT_MAX_MENUS): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  const menuCount = Math.min(maxMenus, SONG_SELECT_MAX_MENUS, Math.ceil(tracks.length / SONG_SELECT_OPTIONS_PER_MENU));
  for (let i = 0; i < menuCount; i++) {
    const chunk = tracks.slice(i * SONG_SELECT_OPTIONS_PER_MENU, (i + 1) * SONG_SELECT_OPTIONS_PER_MENU);
    const options = chunk.map((track: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel((track.title || track.trackId).slice(0, 100))
        .setDescription((track.artist || 'PBZ Music').slice(0, 100))
        .setValue(track.trackId)
    );
    const start = i * SONG_SELECT_OPTIONS_PER_MENU + 1;
    const end = Math.min((i + 1) * SONG_SELECT_OPTIONS_PER_MENU, tracks.length);
    const select = new StringSelectMenuBuilder()
      .setCustomId(`song_select_${i}`)
      .setPlaceholder(`Songs ${start}–${end} — Select to add to queue...`)
      .addOptions(options);
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  return rows;
}

/**
 * Handle joining the selection queue
 */
async function handleSelectionJoinQueue(interaction: ButtonInteraction): Promise<void> {
  const voiceChannel = await checkVoiceChannel(interaction);
  if (!voiceChannel) return;

  const { selectionQueueService } = await import('../services/SelectionQueueService');
  const result = selectionQueueService.joinQueue(interaction.user.id, interaction.user.username);

  // When it's their turn (position === 0), show ephemeral message with album selection first
  if (result.success && result.position === 0) {
    const albumRow = buildAlbumSelectComponent();
    await interaction.reply({
      content: `✅ ${result.message}\n\n**Choose an album below**, then pick a song (only you can see this):`,
      ephemeral: true,
      components: [albumRow],
    });
    return;
  }

  await interaction.reply({
    content: result.success ? `✅ ${result.message}` : `ℹ️ ${result.message}`,
    ephemeral: true,
  });
}

/**
 * Handle "Select Song" button — show ephemeral dropdowns only when it's your turn
 */
async function handleSelectionChooseSong(interaction: ButtonInteraction): Promise<void> {
  const { selectionQueueService } = await import('../services/SelectionQueueService');
  const canSelectResult = selectionQueueService.canSelect(interaction.user.id);

  if (!canSelectResult.canSelect) {
    await interaction.reply({
      content: `⏳ ${canSelectResult.message}\n\nClick **Join Queue** first to get your turn.`,
      ephemeral: true,
    });
    return;
  }

  const tracks = await client.queueManager.getAllTracks();
  if (tracks.length === 0) {
    await interaction.reply({
      content: 'No tracks in playlist yet.',
      ephemeral: true,
    });
    return;
  }

  const albumRow = buildAlbumSelectComponent();
  await interaction.reply({
    content: '**Choose an album below**, then pick a song (only you can see this):',
    ephemeral: true,
    components: [albumRow],
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

/**
 * Handle playlist display Prev/Next (multi-page embed in display channel)
 */
async function handlePlaylistPage(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  let page = 0;
  if (customId.startsWith('playlist_prev_')) {
    page = parseInt(customId.replace('playlist_prev_', ''), 10) - 1;
  } else if (customId.startsWith('playlist_next_')) {
    page = parseInt(customId.replace('playlist_next_', ''), 10) + 1;
  }
  page = Math.max(0, page);

  const tracks = await client.queueManager.getAllTracks();
  const { MusicInteractionService } = await import('../services/MusicInteractionService');
  const { embed, components } = MusicInteractionService.buildPlaylistPageEmbed(tracks, page);

  await interaction.update({ embeds: [embed], components });
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
