import { Events, VoiceState } from 'discord.js';
import { User } from '../models/User';
import { ListeningHistory } from '../models/ListeningHistory';
import { isDBConnected } from '../utils/connectDB';
import { client } from '../index';

export const name = Events.VoiceStateUpdate;
export const once = false;

// Track users in voice channel with timestamps
const voiceTimestamps = new Map<string, { joinedAt: Date; trackId?: string }>();

export async function execute(oldState: VoiceState, newState: VoiceState) {
  const phantomRadioVoiceChannel = process.env.PHANTOM_RADIO_VOICE_CHANNEL_ID;
  if (phantomRadioVoiceChannel && !oldState.channelId && newState.channelId === phantomRadioVoiceChannel) {
    // User joined the Phantom Radio voice channel — touch activity for idle disconnect
    client.queueManager?.touchActivityForGuild(newState.guild.id);
  }

  if (!isDBConnected()) return;

  const userId = newState.member?.user.id;
  if (!userId || newState.member?.user.bot) return;

  if (!phantomRadioVoiceChannel) return;

  // User joined the Phantom Radio voice channel
  if (!oldState.channelId && newState.channelId === phantomRadioVoiceChannel) {
    voiceTimestamps.set(userId, { joinedAt: new Date() });
    console.log(`[Voice] ${newState.member?.user.username} joined Phantom Radio channel`);
  }

  // User left the Phantom Radio voice channel
  if (oldState.channelId === phantomRadioVoiceChannel && newState.channelId !== phantomRadioVoiceChannel) {
    const timestamp = voiceTimestamps.get(userId);
    if (timestamp) {
      const duration = Math.floor((Date.now() - timestamp.joinedAt.getTime()) / 1000);
      
      // Only record if listened for at least 10 seconds
      if (duration >= 10) {
        try {
          // Update user's monthly listening time
          const user = await User.findOne({ userId });
          if (user) {
            user.monthlyListeningTime = (user.monthlyListeningTime || 0) + duration;
            await user.save();
            console.log(`[Voice] ${newState.member?.user.username} listened for ${duration}s (total: ${user.monthlyListeningTime}s this month)`);
          }

          // Record listening history if there was a track playing
          if (timestamp.trackId) {
            await ListeningHistory.create({
              userId,
              trackId: timestamp.trackId,
              listenedAt: timestamp.joinedAt,
              duration,
              completed: false,
            });
          }
        } catch (error) {
          console.error('[Voice] Error recording listening time:', error);
        }
      }
      
      voiceTimestamps.delete(userId);
    }
  }
}

// Export helper to update current track for listening history
export function setUserCurrentTrack(userId: string, trackId: string) {
  const timestamp = voiceTimestamps.get(userId);
  if (timestamp) {
    timestamp.trackId = trackId;
    voiceTimestamps.set(userId, timestamp);
  }
}

// Export helper to get users in voice channel
export function getUsersInVoice(): string[] {
  return Array.from(voiceTimestamps.keys());
}
