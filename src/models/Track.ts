import mongoose, { Document, Schema } from 'mongoose';

export type TrackCategory = 'battle' | 'story' | 'exploration' | 'emotional' | 'ambient' | 'hidden';
export type AudioSource = 'youtube' | 'local';

export interface ITrack extends Document {
  trackId: string;
  title: string;
  artist: string;
  youtubeUrl?: string; // Optional - for YouTube streaming
  localPath?: string; // Optional - path to local MP3 file (relative to music/ folder)
  audioSource: AudioSource; // Source type: 'youtube' or 'local'
  duration: number; // Duration in seconds
  category: TrackCategory;
  description: string; // Creative background
  instruments: string[]; // Featured instruments
  isHidden: boolean; // Hidden/treasure track
  playCount: number; // Total plays
  monthlyPlayCount: number; // Monthly plays (for leaderboard)
  upvotes: number; // Total upvotes
  monthlyUpvotes: number; // Monthly upvotes
  pinCount: number; // Total pins
  monthlyPinCount: number; // Monthly pins
  upvotedBy: string[]; // Array of user IDs who upvoted
  createdAt?: Date;
  updatedAt?: Date;
}

const TrackSchema: Schema = new Schema(
  {
    trackId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    artist: {
      type: String,
      default: 'Unknown Artist',
    },
    youtubeUrl: {
      type: String,
      required: false, // Optional - for YouTube streaming
    },
    localPath: {
      type: String,
      required: false, // Optional - path to local MP3 file
    },
    audioSource: {
      type: String,
      enum: ['youtube', 'local'],
      default: 'youtube', // Default to YouTube for backward compatibility
    },
    duration: {
      type: Number,
      default: 0,
    },
    category: {
      type: String,
      enum: ['battle', 'story', 'exploration', 'emotional', 'ambient', 'hidden'],
      default: 'ambient',
    },
    description: {
      type: String,
      default: '',
    },
    instruments: {
      type: [String],
      default: [],
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    playCount: {
      type: Number,
      default: 0,
    },
    monthlyPlayCount: {
      type: Number,
      default: 0,
    },
    upvotes: {
      type: Number,
      default: 0,
    },
    monthlyUpvotes: {
      type: Number,
      default: 0,
    },
    pinCount: {
      type: Number,
      default: 0,
    },
    monthlyPinCount: {
      type: Number,
      default: 0,
    },
    upvotedBy: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Index for leaderboard queries
TrackSchema.index({ monthlyPlayCount: -1 });
TrackSchema.index({ monthlyUpvotes: -1 });
TrackSchema.index({ monthlyPinCount: -1 });
TrackSchema.index({ category: 1 });

export const Track = mongoose.model<ITrack>('Track', TrackSchema);
