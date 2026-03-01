import mongoose, { Document, Schema } from 'mongoose';

export interface IPlaybackLogEntry extends Document {
  timestamp: Date;
  message: string;
  type: 'error' | 'info' | 'success' | 'warning';
  createdAt?: Date;
}

const PlaybackLogEntrySchema: Schema = new Schema(
  {
    timestamp: { type: Date, required: true, default: Date.now },
    message: { type: String, required: true },
    type: { type: String, enum: ['error', 'info', 'success', 'warning'], default: 'info' },
  },
  { timestamps: true }
);

PlaybackLogEntrySchema.index({ timestamp: -1 });

export const PlaybackLogEntry = mongoose.model<IPlaybackLogEntry>('PlaybackLogEntry', PlaybackLogEntrySchema);
