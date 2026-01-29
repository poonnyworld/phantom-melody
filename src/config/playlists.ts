import { TrackCategory } from '../models/Track';

export interface PlaylistConfig {
  name: string;
  category: TrackCategory | 'all';
  description: string;
  emoji: string;
}

// Default playlist configurations
export const DEFAULT_PLAYLISTS: PlaylistConfig[] = [
  {
    name: 'Battle Music',
    category: 'battle',
    description: 'Epic battle themes and combat music',
    emoji: '⚔️',
  },
  {
    name: 'Story Music',
    category: 'story',
    description: 'Narrative and storytelling themes',
    emoji: '📖',
  },
  {
    name: 'Exploration Music',
    category: 'exploration',
    description: 'Adventure and exploration themes',
    emoji: '🗺️',
  },
  {
    name: 'Emotional Music',
    category: 'emotional',
    description: 'Touching and emotional pieces',
    emoji: '💫',
  },
  {
    name: 'Ambient Music',
    category: 'ambient',
    description: 'Background and atmospheric music',
    emoji: '🌙',
  },
  {
    name: 'Hidden Treasures',
    category: 'hidden',
    description: 'Exclusive tracks for true fans',
    emoji: '🔮',
  },
  {
    name: 'All Tracks',
    category: 'all',
    description: 'The complete music collection',
    emoji: '🎵',
  },
];

// Honor point costs
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
