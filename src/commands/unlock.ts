import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { isDBConnected } from '../utils/connectDB';
import { honorPointService } from '../services/HonorPointService';
import { HONOR_COSTS } from '../config/playlists';

export const data = new SlashCommandBuilder()
  .setName('unlock')
  .setDescription(`Unlock the Hidden Treasures playlist (costs ${HONOR_COSTS.UNLOCK_HIDDEN} Honor Points)`);

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
    // Check if already unlocked
    const hasAccess = await honorPointService.hasUnlockedHidden(interaction.user.id);
    
    if (hasAccess) {
      await interaction.editReply({
        content: '✨ You have already unlocked the **Hidden Treasures** playlist! Use `/playlist hidden` to play it.',
      });
      return;
    }

    // Get current balance first
    const currentBalance = await honorPointService.getHonorPoints(interaction.user.id);
    
    if (currentBalance < HONOR_COSTS.UNLOCK_HIDDEN) {
      await interaction.editReply({
        content: `❌ You need **${HONOR_COSTS.UNLOCK_HIDDEN} Honor Points** to unlock the Hidden Treasures playlist.\n` +
                 `Your current balance: **${currentBalance} points**\n\n` +
                 `Earn more points by interacting with Honor Bot!`,
      });
      return;
    }

    // Process the unlock
    const result = await honorPointService.unlockHiddenPlaylist(
      interaction.user.id,
      interaction.user.username
    );

    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.message}`,
      });
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
      .setFooter({ text: 'Use /playlist hidden to explore the treasures!' });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[Unlock Command] Error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while unlocking the playlist.',
    });
  }
}
