import { Events, Interaction, ButtonInteraction, StringSelectMenuInteraction, EmbedBuilder, MessageFlags, GuildMember } from 'discord.js';
import { client } from '../index';
import { isDBConnected } from '../utils/connectDB';
import { honorPointService } from '../services/HonorPointService';
import { DEFAULT_PLAYLISTS } from '../config/playlists';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction: Interaction) {
  // Handle button interactions
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
    return;
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    await handleSelectMenuInteraction(interaction);
    return;
  }

  // Autocomplete interactions
  if (interaction.isAutocomplete()) {
    // Handle autocomplete for track searches
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

  // Toggle play/pause based on current state
  const isPlaying = player.getIsPlaying();
  
  if (isPlaying) {
    // Currently playing, try to pause
    const paused = player.pause();
    if (paused) {
      const { musicLogService } = await import('../services/MusicLogService');
      musicLogService.addLog('Music paused', 'info');
      await interaction.editReply({ content: '⏸️ Music paused. Click again to resume!' });
    } else {
      await interaction.editReply({ content: '❌ Could not pause music.' });
    }
  } else {
    // Not playing, try to resume
    const resumed = player.resume();
    if (resumed) {
      const { musicLogService } = await import('../services/MusicLogService');
      musicLogService.addLog('Music resumed', 'info');
      await interaction.editReply({ content: '▶️ Music resumed!' });
    } else {
      await interaction.editReply({ content: '❌ Could not resume music. Music might not be paused.' });
    }
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

  const embed = new EmbedBuilder()
    .setTitle(`${playlistConfig?.emoji || '🎵'} ${playlistConfig?.name || category} Playlist`)
    .setDescription(playlistConfig?.description || `Playing ${category} music`)
    .addFields(
      { name: 'Tracks', value: tracks.length.toString(), inline: true },
      { name: 'Mode', value: 'Shuffled', inline: true }
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
