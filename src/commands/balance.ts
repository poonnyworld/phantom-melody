import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { honorPointService } from '../services/HonorPointService';
import { HONOR_COSTS } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your Honor Points balance');

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

  await interaction.deferReply({ ephemeral: true });

  try {
    const balance = await honorPointService.getHonorPoints(interaction.user.id);
    const hasUnlockedHidden = await honorPointService.hasUnlockedHidden(interaction.user.id);

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
    console.error('[Balance Command] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while fetching your balance.',
    });
  }
}
