import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { formatDuration } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Display the current music queue');

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server!', ephemeral: true });
    return;
  }

  const client = interaction.client;
  const queueManager = client.queueManager;
  const player = queueManager.getPlayer(interaction.guild.id);

  if (!player || !player.isConnected()) {
    await interaction.reply({ 
      content: '❌ There is no active music queue!', 
      ephemeral: true 
    });
    return;
  }

  const currentTrack = player.getCurrentTrack();
  const queue = player.getQueue();

  const embed = new EmbedBuilder()
    .setTitle('🎵 Music Queue')
    .setColor(0x9B59B6);

  // Now Playing section
  if (currentTrack) {
    embed.addFields({
      name: '🎧 Now Playing',
      value: `**${currentTrack.track.title}** - ${currentTrack.track.artist}\n` +
             `Duration: ${formatDuration(currentTrack.track.duration)} | ` +
             `Category: ${currentTrack.track.category}` +
             (currentTrack.isPinned ? ' 📌' : ''),
    });
  } else {
    embed.addFields({
      name: '🎧 Now Playing',
      value: 'Nothing is playing right now',
    });
  }

  // Up Next section
  if (queue.length > 0) {
    const queueList = queue.slice(0, 10).map((item: any, index: number) => {
      const pinIcon = item.isPinned ? ' 📌' : '';
      return `${index + 1}. **${item.track.title}** - ${item.track.artist}${pinIcon}`;
    }).join('\n');

    embed.addFields({
      name: `📋 Up Next (${queue.length} tracks)`,
      value: queueList,
    });

    if (queue.length > 10) {
      embed.setFooter({ text: `...and ${queue.length - 10} more tracks` });
    }
  } else {
    embed.addFields({
      name: '📋 Up Next',
      value: 'Queue is empty. Add tracks with `/play` or `/playlist`!',
    });
  }

  // Loop status
  if (player.isLoopEnabled()) {
    embed.addFields({
      name: '🔂 Loop',
      value: 'Enabled - Current track will repeat',
    });
  }

  await interaction.reply({ embeds: [embed] });
}
