import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { ListeningRewardService } from '../services/ListeningRewardService';
import { LISTENING_REWARDS } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('claimreward')
  .setDescription('Claim your monthly listening reward');

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

  await interaction.deferReply();

  try {
    const listeningRewardService = new ListeningRewardService(interaction.client);
    const result = await listeningRewardService.checkAndRewardListening(
      interaction.user.id,
      interaction.user.username
    );

    if (result.rewarded) {
      const embed = new EmbedBuilder()
        .setTitle('🎉 Listening Reward Claimed!')
        .setDescription(result.message)
        .addFields(
          { name: 'Reward', value: `+${result.amount} Honor Points`, inline: true }
        )
        .setColor(0x00FF00)
        .setFooter({ text: 'Keep listening to earn more rewards next month!' });

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({
        content: `❌ ${result.message}\n\n` +
                 `Listen for ${LISTENING_REWARDS.MONTHLY_THRESHOLD_HOURS} hours each month to earn rewards!`,
      });
    }
  } catch (error) {
    console.error('[ClaimReward Command] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while claiming your reward.',
    });
  }
}
