import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { honorPointService } from '../services/HonorPointService';
import { HONOR_COSTS } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('pin')
  .setDescription(`Pin a track to play next (costs ${HONOR_COSTS.PIN_TRACK} Honor Points)`)
  .addStringOption(option =>
    option
      .setName('track')
      .setDescription('Track name to pin')
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
      content: '🎵 You need to be in a voice channel to use this command!', 
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

  const trackQuery = interaction.options.getString('track', true);
  const client = interaction.client;
  const queueManager = client.queueManager;

  try {
    // Search for the track
    const tracks = await queueManager.searchTracks(trackQuery);

    if (tracks.length === 0) {
      await interaction.editReply({
        content: `❌ No tracks found matching "${trackQuery}".`,
      });
      return;
    }

    const track = tracks[0];

    // Process the pin (deduct Honor Points)
    const result = await honorPointService.pinTrack(
      interaction.user.id,
      interaction.user.username,
      track.trackId
    );

    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.message}`,
      });
      return;
    }

    // Get or create the music player and add the track as pinned
    const player = await queueManager.getOrCreatePlayer(
      interaction.guild.id,
      voiceChannel as any,
      interaction.channelId
    );

    await player.addToQueue(track, interaction.user.id, true); // isPinned = true

    const embed = new EmbedBuilder()
      .setTitle('📌 Track Pinned!')
      .setDescription(`**${track.title}** will play next!`)
      .addFields(
        { name: 'Cost', value: `${HONOR_COSTS.PIN_TRACK} Honor Points`, inline: true },
        { name: 'New Balance', value: `${result.newBalance} points`, inline: true }
      )
      .setColor(0xFFD700)
      .setFooter({ text: `Pinned by ${interaction.user.username}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[Pin Command] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while pinning the track.',
    });
  }
}
