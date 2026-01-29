import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { ListeningRewardService } from '../services/ListeningRewardService';
import { formatListeningTime, LISTENING_REWARDS } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('listeningstats')
  .setDescription('View your listening stats and progress towards monthly reward');

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
    const listeningRewardService = new ListeningRewardService(interaction.client);
    const stats = await listeningRewardService.getListeningStats(interaction.user.id);

    if (!stats) {
      await interaction.editReply({
        content: '❌ Could not find your listening stats. Start listening to music to track your progress!',
      });
      return;
    }

    // Create progress bar
    const progressBarLength = 20;
    const filledLength = Math.floor((stats.progress / 100) * progressBarLength);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);

    const embed = new EmbedBuilder()
      .setTitle('🎧 Your Listening Stats')
      .setColor(stats.canClaimReward ? 0x00FF00 : 0x9B59B6)
      .addFields(
        { 
          name: 'Monthly Listening Time', 
          value: formatListeningTime(stats.monthlyTime), 
          inline: true 
        },
        { 
          name: 'Goal', 
          value: `${LISTENING_REWARDS.MONTHLY_THRESHOLD_HOURS} hours`, 
          inline: true 
        },
        {
          name: 'Progress',
          value: `\`${progressBar}\` ${stats.progress.toFixed(1)}%`,
        }
      );

    if (stats.canClaimReward) {
      embed.addFields({
        name: '🎉 Reward Available!',
        value: `You've reached ${LISTENING_REWARDS.MONTHLY_THRESHOLD_HOURS} hours of listening!\n` +
               `Use \`/claimreward\` to receive your Honor Points!`,
      });
    } else {
      const remainingSeconds = stats.thresholdTime - stats.monthlyTime;
      embed.addFields({
        name: '⏳ Time Until Reward',
        value: `Listen for ${formatListeningTime(remainingSeconds)} more to earn ${LISTENING_REWARDS.REWARD_MIN}-${LISTENING_REWARDS.REWARD_MAX} Honor Points!`,
      });
    }

    embed.setFooter({ text: 'Stats reset at the start of each month' });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[ListeningStats Command] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while fetching your stats.',
    });
  }
}
