import { Client } from 'discord.js';
import * as cron from 'node-cron';
import { User } from '../models/User';
import { isDBConnected } from '../utils/connectDB';
import { LISTENING_REWARDS } from '../config/playlists';
import { honorPointService } from './HonorPointService';

export class ListeningRewardService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  // Start monthly reset cron job
  startMonthlyResetCron() {
    // Run at midnight UTC on the 1st of each month
    cron.schedule('0 0 1 * *', async () => {
      console.log('[ListeningRewardService] Running monthly listening time reset...');
      await this.resetMonthlyListeningTime();
    });

    console.log('[ListeningRewardService] Monthly reset cron job started');
  }

  // Check and reward users who reached the listening threshold
  async checkAndRewardListening(userId: string, username: string): Promise<{
    rewarded: boolean;
    amount?: number;
    message: string;
  }> {
    if (!isDBConnected()) {
      return { rewarded: false, message: 'Database not connected' };
    }

    try {
      const user = await User.findOne({ userId });
      if (!user) {
        return { rewarded: false, message: 'User not found' };
      }

      const thresholdSeconds = LISTENING_REWARDS.MONTHLY_THRESHOLD_HOURS * 3600;
      
      // Check if user has reached the threshold and hasn't been rewarded this month
      if (user.monthlyListeningTime >= thresholdSeconds) {
        // Check if already rewarded this month
        const now = new Date();
        const lastReward = user.lastListeningRewardDate || new Date(0);
        
        if (lastReward.getMonth() === now.getMonth() && 
            lastReward.getFullYear() === now.getFullYear()) {
          return { 
            rewarded: false, 
            message: 'You have already claimed your listening reward this month!' 
          };
        }

        // Calculate random reward
        const rewardAmount = this.getRandomReward();

        // Award points
        const result = await honorPointService.addPoints(
          userId, 
          rewardAmount, 
          'monthly listening milestone'
        );

        if (result.success) {
          // Update last reward date
          user.lastListeningRewardDate = now;
          await user.save();

          return {
            rewarded: true,
            amount: rewardAmount,
            message: `Congratulations! You've earned ${rewardAmount} Honor Points for reaching ${LISTENING_REWARDS.MONTHLY_THRESHOLD_HOURS} hours of listening this month!`,
          };
        }

        return { rewarded: false, message: result.message };
      }

      const remainingSeconds = thresholdSeconds - user.monthlyListeningTime;
      const remainingHours = Math.ceil(remainingSeconds / 3600);
      
      return { 
        rewarded: false, 
        message: `You need ${remainingHours} more hour(s) of listening to earn your monthly reward!` 
      };
    } catch (error) {
      console.error('[ListeningRewardService] Error checking/rewarding:', error);
      return { rewarded: false, message: 'An error occurred' };
    }
  }

  // Get random reward amount
  private getRandomReward(): number {
    const min = LISTENING_REWARDS.REWARD_MIN;
    const max = LISTENING_REWARDS.REWARD_MAX;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Reset monthly listening time for all users
  async resetMonthlyListeningTime(): Promise<void> {
    if (!isDBConnected()) return;

    try {
      const result = await User.updateMany(
        {},
        { $set: { monthlyListeningTime: 0 } }
      );

      console.log(`[ListeningRewardService] Reset monthly listening time for ${result.modifiedCount} users`);
    } catch (error) {
      console.error('[ListeningRewardService] Error resetting listening time:', error);
    }
  }

  // Get user's listening stats
  async getListeningStats(userId: string): Promise<{
    monthlyTime: number;
    thresholdTime: number;
    progress: number;
    canClaimReward: boolean;
  } | null> {
    if (!isDBConnected()) return null;

    try {
      const user = await User.findOne({ userId });
      if (!user) return null;

      const thresholdSeconds = LISTENING_REWARDS.MONTHLY_THRESHOLD_HOURS * 3600;
      const monthlyTime = user.monthlyListeningTime || 0;
      const progress = Math.min((monthlyTime / thresholdSeconds) * 100, 100);

      // Check if can claim reward
      const now = new Date();
      const lastReward = user.lastListeningRewardDate || new Date(0);
      const alreadyClaimed = lastReward.getMonth() === now.getMonth() && 
                            lastReward.getFullYear() === now.getFullYear();

      return {
        monthlyTime,
        thresholdTime: thresholdSeconds,
        progress,
        canClaimReward: monthlyTime >= thresholdSeconds && !alreadyClaimed,
      };
    } catch (error) {
      console.error('[ListeningRewardService] Error getting stats:', error);
      return null;
    }
  }
}
