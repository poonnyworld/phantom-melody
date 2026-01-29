import mongoose, { Document, Schema } from 'mongoose';

export interface IListeningHistory extends Document {
  userId: string;
  trackId: string;
  listenedAt: Date;
  duration: number; // How long they listened (seconds)
  completed: boolean; // Whether they listened to the full track
  createdAt?: Date;
  updatedAt?: Date;
}

const ListeningHistorySchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    trackId: {
      type: String,
      required: true,
      index: true,
    },
    listenedAt: {
      type: Date,
      default: Date.now,
    },
    duration: {
      type: Number,
      default: 0,
    },
    completed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user listening history queries
ListeningHistorySchema.index({ userId: 1, listenedAt: -1 });
ListeningHistorySchema.index({ trackId: 1, listenedAt: -1 });

export const ListeningHistory = mongoose.model<IListeningHistory>('ListeningHistory', ListeningHistorySchema);
