import { TrackCategory } from '../models/Track';

export interface PlaylistConfig {
  name: string;        // DB playlist document name (do not change without migration)
  displayName: string; // Shown in Discord embeds/titles/footers
  category: TrackCategory | 'all';
  description: string;
  emoji: string;
}

// Single playlist configuration for Phantom Blade Zero
export const MAIN_PLAYLIST: PlaylistConfig = {
  name: 'Phantom Blade Zero Radio',
  displayName: 'Phantom Radio',
  category: 'pbz', // Single category for all tracks
  description: 'Official soundtrack from Phantom Blade Zero',
  emoji: '🗡️',
};

// Keep for backward compatibility (but only one playlist)
export const DEFAULT_PLAYLISTS: PlaylistConfig[] = [MAIN_PLAYLIST];

// Queue limits
export const MAX_QUEUE_SIZE = 20;
export const MAX_QUEUES_PER_USER = 5;
export const SKIP_VOTES_REQUIRED = 5;

// Idle disconnect: leave voice channel after this many minutes of no activity
export const IDLE_DISCONNECT_MINUTES = parseInt(process.env.IDLE_DISCONNECT_MINUTES || '20', 10);

// Honor point costs (kept for future use)
export const HONOR_COSTS = {
  PIN_TRACK: parseInt(process.env.PIN_COST || '5'),
  UPVOTE_TRACK: parseInt(process.env.UPVOTE_COST || '2'),
  UNLOCK_HIDDEN: parseInt(process.env.UNLOCK_COST || '50'),
};

// Listening rewards configuration
export const LISTENING_REWARDS = {
  MONTHLY_THRESHOLD_HOURS: parseInt(process.env.MONTHLY_LISTENING_THRESHOLD_HOURS || '5'),
  REWARD_MIN: parseInt(process.env.LISTENING_REWARD_MIN || '1'),
  REWARD_MAX: parseInt(process.env.LISTENING_REWARD_MAX || '10'),
};

// Format duration from seconds to mm:ss
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format listening time to hours and minutes
export function formatListeningTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}
