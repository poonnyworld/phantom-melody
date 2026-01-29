import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { DEFAULT_PLAYLISTS } from '../config/playlists';
import { TrackCategory } from '../models/Track';
import { honorPointService } from '../services/HonorPointService';

export const data = new SlashCommandBuilder()
  .setName('playlist')
  .setDescription('Play a themed playlist')
  .addStringOption(option =>
    option
      .setName('category')
      .setDescription('Choose a playlist category')
      .setRequired(true)
      .addChoices(
        { name: '⚔️ Battle Music', value: 'battle' },
        { name: '📖 Story Music', value: 'story' },
        { name: '🗺️ Exploration Music', value: 'exploration' },
        { name: '💫 Emotional Music', value: 'emotional' },
        { name: '🌙 Ambient Music', value: 'ambient' },
        { name: '🔮 Hidden Treasures (Requires Unlock)', value: 'hidden' },
        { name: '🎵 All Tracks', value: 'all' }
      )
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

  const category = interaction.options.getString('category', true) as TrackCategory | 'all';
  const client = interaction.client;
  const queueManager = client.queueManager;

  try {
    // Check if trying to access hidden playlist
    if (category === 'hidden') {
      const hasAccess = await honorPointService.hasUnlockedHidden(interaction.user.id);
      
      if (!hasAccess) {
        await interaction.editReply({
          content: '🔮 The **Hidden Treasures** playlist is locked! Use `/unlock` to spend Honor Points and gain access.',
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
  } catch (error) {
    console.error('[Playlist Command] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while loading the playlist.',
    });
  }
}
