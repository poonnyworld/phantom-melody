/**
 * Seed PBZ BGM playlist จาก config/pbz-bgm-tracks.js
 * - สร้าง/อัปเดต Track ใน DB ให้ตรงกับรายการใน config
 * - อัปเดต Playlist "Phantom Blade Zero Melody" ให้ใช้ trackIds เหล่านี้
 *
 * ใช้: node scripts/seed-pbz-bgm.js
 * ต้องมี MongoDB (MONGO_URI ใน .env) และแก้ config/pbz-bgm-tracks.js ให้ตรงกับไฟล์ .wav จริง
 */
const mongoose = require('mongoose');
require('dotenv').config();

const path = require('path');
const TRACKS_CONFIG = require(path.join(__dirname, '..', 'config', 'pbz-bgm-tracks.js'));
const PLAYLIST_NAME = 'Phantom Blade Zero Melody';
const PLAYLIST_CATEGORY = 'pbz';

const TrackSchema = new mongoose.Schema({
  trackId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  artist: { type: String, default: 'Phantom Blade Zero' },
  youtubeUrl: { type: String },
  localPath: { type: String },
  audioSource: { type: String, enum: ['youtube', 'local'], default: 'local' },
  duration: { type: Number, default: 0 },
  category: { type: String, default: 'pbz' },
  description: { type: String, default: '' },
  instruments: { type: [String], default: [] },
  isHidden: { type: Boolean, default: false },
  playCount: { type: Number, default: 0 },
  monthlyPlayCount: { type: Number, default: 0 },
  upvotes: { type: Number, default: 0 },
  monthlyUpvotes: { type: Number, default: 0 },
  pinCount: { type: Number, default: 0 },
  monthlyPinCount: { type: Number, default: 0 },
  upvotedBy: { type: [String], default: [] },
}, { timestamps: true });

const PlaylistSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  trackIds: { type: [String], default: [] },
  isDefault: { type: Boolean, default: true },
  shuffledOrder: { type: [String], default: [] },
  lastShuffled: { type: Date, default: Date.now },
}, { timestamps: true });

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/honorbot';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  const Track = mongoose.model('Track', TrackSchema);
  const Playlist = mongoose.model('Playlist', PlaylistSchema);

  const trackIds = [];
  for (const row of TRACKS_CONFIG) {
    const localPath = `pbz/${row.fileName}`;
    await Track.findOneAndUpdate(
      { trackId: row.trackId },
      {
        trackId: row.trackId,
        title: row.title,
        artist: 'Phantom Blade Zero',
        localPath,
        audioSource: 'local',
        category: PLAYLIST_CATEGORY,
        isHidden: false,
      },
      { upsert: true, new: true }
    );
    trackIds.push(row.trackId);
    console.log(`  ${row.trackId}  ${row.title}  →  music/${localPath}`);
  }

  const shuffledOrder = shuffle(trackIds);
  await Playlist.findOneAndUpdate(
    { name: PLAYLIST_NAME },
    {
      name: PLAYLIST_NAME,
      category: PLAYLIST_CATEGORY,
      description: 'Official soundtrack from Phantom Blade Zero',
      trackIds,
      shuffledOrder,
      lastShuffled: new Date(),
      isDefault: true,
    },
    { upsert: true, new: true }
  );
  console.log(`\nPlaylist "${PLAYLIST_NAME}" updated with ${trackIds.length} tracks.`);
  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
