import { User, IUser } from '../models/User';
import { Track } from '../models/Track';
import { isDBConnected } from '../utils/connectDB';
import { HONOR_COSTS } from '../config/playlists';

export interface HonorPointResult {
  success: boolean;
  message: string;
  newBalance?: number;
  cost?: number;
}

/** When false, no points are deducted or added; pin/upvote/unlock still work (free). */
function isHonorEnabled(): boolean {
  return process.env.ENABLE_HONOR_POINTS === 'true';
}

export class HonorPointService {
  // Get or create user
  async getOrCreateUser(userId: string, username: string): Promise<IUser | null> {
    if (!isDBConnected()) return null;

    try {
      let user = await User.findOne({ userId });
      
      if (!user) {
        user = await User.create({
          userId,
          username,
          honorPoints: 0,
        });
      } else if (user.username !== username) {
        // Update username if changed
        user.username = username;
        await user.save();
      }

      return user;
    } catch (error) {
      console.error('[HonorPointService] Error getting/creating user:', error);
      return null;
    }
  }

  // Get user's honor points
  async getHonorPoints(userId: string): Promise<number> {
    if (!isDBConnected()) return 0;

    try {
      const user = await User.findOne({ userId });
      return user?.honorPoints || 0;
    } catch (error) {
      console.error('[HonorPointService] Error getting honor points:', error);
      return 0;
    }
  }

  // Deduct honor points
  async deductPoints(userId: string, amount: number, reason: string): Promise<HonorPointResult> {
    if (!isDBConnected()) {
      return { success: false, message: 'Database not connected' };
    }

    try {
      const user = await User.findOne({ userId });

      if (!isHonorEnabled()) {
        return {
          success: true,
          message: `Honor Points are disabled. Action allowed without cost.`,
          newBalance: user?.honorPoints ?? 0,
          cost: amount,
        };
      }

      if (!user) {
        return { success: false, message: 'User not found. Please interact with Honor Bot first!' };
      }

      if (user.honorPoints < amount) {
        return { 
          success: false, 
          message: `Insufficient Honor Points! You need ${amount} points but only have ${user.honorPoints}.`,
          newBalance: user.honorPoints,
          cost: amount,
        };
      }

      user.honorPoints -= amount;
      await user.save();

      console.log(`[HonorPointService] ${user.username} spent ${amount} points for ${reason}. Balance: ${user.honorPoints}`);

      return {
        success: true,
        message: `Successfully spent ${amount} Honor Points for ${reason}!`,
        newBalance: user.honorPoints,
        cost: amount,
      };
    } catch (error) {
      console.error('[HonorPointService] Error deducting points:', error);
      return { success: false, message: 'An error occurred while processing your request.' };
    }
  }

  // Add honor points (for listening rewards)
  async addPoints(userId: string, amount: number, reason: string): Promise<HonorPointResult> {
    if (!isDBConnected()) {
      return { success: false, message: 'Database not connected' };
    }

    try {
      const user = await User.findOne({ userId });

      if (!isHonorEnabled()) {
        if (!user) {
          return { success: false, message: 'User not found' };
        }
        return {
          success: true,
          message: `Honor Points are disabled. Reward not added; progress still saved.`,
          newBalance: user.honorPoints,
        };
      }

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      user.honorPoints += amount;
      await user.save();

      console.log(`[HonorPointService] ${user.username} earned ${amount} points for ${reason}. Balance: ${user.honorPoints}`);

      return {
        success: true,
        message: `You earned ${amount} Honor Points for ${reason}!`,
        newBalance: user.honorPoints,
      };
    } catch (error) {
      console.error('[HonorPointService] Error adding points:', error);
      return { success: false, message: 'An error occurred while processing your request.' };
    }
  }

  // Pin a track (costs Honor Points)
  async pinTrack(userId: string, username: string, trackId: string): Promise<HonorPointResult> {
    const cost = HONOR_COSTS.PIN_TRACK;

    // First, verify the track exists
    const track = await Track.findOne({ trackId });
    if (!track) {
      return { success: false, message: 'Track not found!' };
    }

    // Deduct points
    const result = await this.deductPoints(userId, cost, `pinning "${track.title}"`);
    
    if (result.success) {
      // Update track pin count
      track.pinCount += 1;
      track.monthlyPinCount += 1;
      await track.save();
    }

    return result;
  }

  // Upvote a track (costs Honor Points)
  async upvoteTrack(userId: string, username: string, trackId: string): Promise<HonorPointResult> {
    const cost = HONOR_COSTS.UPVOTE_TRACK;

    // First, verify the track exists
    const track = await Track.findOne({ trackId });
    if (!track) {
      return { success: false, message: 'Track not found!' };
    }

    // Check if user already upvoted this track
    if (track.upvotedBy.includes(userId)) {
      return { success: false, message: 'You have already upvoted this track!' };
    }

    // Deduct points
    const result = await this.deductPoints(userId, cost, `upvoting "${track.title}"`);
    
    if (result.success) {
      // Update track upvote count
      track.upvotes += 1;
      track.monthlyUpvotes += 1;
      track.upvotedBy.push(userId);
      await track.save();
    }

    return result;
  }

  // Unlock hidden playlist (costs Honor Points)
  async unlockHiddenPlaylist(userId: string, username: string): Promise<HonorPointResult> {
    const cost = HONOR_COSTS.UNLOCK_HIDDEN;

    // Check if already unlocked
    const user = await this.getOrCreateUser(userId, username);
    if (!user) {
      return { success: false, message: 'Could not find or create user!' };
    }

    if (user.unlockedHiddenPlaylist) {
      return { success: false, message: 'You have already unlocked the hidden playlist!' };
    }

    // Deduct points
    const result = await this.deductPoints(userId, cost, 'unlocking hidden playlist');
    
    if (result.success) {
      // Mark playlist as unlocked for user
      user.unlockedHiddenPlaylist = true;
      await user.save();
    }

    return result;
  }

  // Check if user has unlocked hidden playlist
  async hasUnlockedHidden(userId: string): Promise<boolean> {
    if (!isDBConnected()) return false;

    try {
      const user = await User.findOne({ userId });
      return user?.unlockedHiddenPlaylist || false;
    } catch (error) {
      console.error('[HonorPointService] Error checking hidden unlock:', error);
      return false;
    }
  }
}

// Export singleton instance
export const honorPointService = new HonorPointService();
