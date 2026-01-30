import mongoose, { Document, Schema } from 'mongoose';
import { TrackCategory } from './Track';

export interface IPlaylist extends Document {
  name: string;
  category: TrackCategory | 'all';
  description: string;
  trackIds: string[]; // Array of track IDs
  isDefault: boolean; // Whether this is a system playlist
  createdBy?: string; // User ID if user-created
  shuffledOrder: string[]; // Daily shuffled order of track IDs
  lastShuffled: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const PlaylistSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    category: {
      type: String,
      enum: ['pbz', 'battle', 'story', 'exploration', 'emotional', 'ambient', 'hidden', 'all'],
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    trackIds: {
      type: [String],
      default: [],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: String,
      default: null,
    },
    shuffledOrder: {
      type: [String],
      default: [],
    },
    lastShuffled: {
      type: Date,
      default: new Date(0),
    },
  },
  {
    timestamps: true,
  }
);

PlaylistSchema.index({ category: 1 });
PlaylistSchema.index({ isDefault: 1 });

export const Playlist = mongoose.model<IPlaylist>('Playlist', PlaylistSchema);
