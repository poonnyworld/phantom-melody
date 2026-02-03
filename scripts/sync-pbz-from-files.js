/**
 * Sync เพลย์ลิสต์ PBZ จากไฟล์ .wav ใน music/pbz/
 * ใส่ไฟล์ .wav ลงใน music/pbz/ แล้วรันสคริปต์นี้ แทร็กจะถูกเพิ่มใน DB และเพลย์ลิสต์อัตโนมัติ
 *
 * ใช้: node scripts/sync-pbz-from-files.js
 * ต้องมี MongoDB (MONGO_URI ใน .env)
 */
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();

const MUSIC_PBZ = path.join(__dirname, '..', 'music', 'pbz');
const PLAYLIST_NAME = 'Phantom Blade Zero Radio';
const PLAYLIST_CATEGORY = 'pbz';

function slugFromFilename(name) {
  return 'pbz-' + name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase().slice(0, 80) || 'pbz-track';
}

function uniqueTrackId(baseId, existing) {
  let id = baseId;
  let n = 0;
  while (existing.has(id)) {
    n++;
    id = baseId + '-' + n;
  }
  return id;
}

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
  if (!fs.existsSync(MUSIC_PBZ)) {
    console.error('โฟลเดอร์ music/pbz/ ไม่พบ');
    process.exit(1);
  }

  const files = fs.readdirSync(MUSIC_PBZ).filter((f) => f.toLowerCase().endsWith('.wav'));
  if (files.length === 0) {
    console.log('ไม่พบไฟล์ .wav ใน music/pbz/ — ใส่ไฟล์ .wav ลงในโฟลเดอร์นี้แล้วรันใหม่');
    process.exit(0);
  }

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/honorbot';
  console.log('Connecting to MongoDB...');
  try {
    await mongoose.connect(mongoUri);
  } catch (err) {
    if (err.message && err.message.includes('ENOTFOUND') && mongoUri.includes('mongodb:27017')) {
      console.error('\n❌ ไม่สามารถเชื่อม MongoDB ได้ (hostname "mongodb" ใช้ได้เฉพาะใน Docker)\n');
      console.error('   รันจากโฮสต์ให้ใช้:  npm run sync-pbz:host');
      console.error('   หรือ:  MONGO_URI=mongodb://localhost:27017/honorbot npm run sync-pbz\n');
    }
    throw err;
  }
  console.log('Connected.\n');

  const Track = mongoose.model('Track', TrackSchema);
  const Playlist = mongoose.model('Playlist', PlaylistSchema);
  const existingIds = new Set((await Track.find({ category: PLAYLIST_CATEGORY }).select('trackId')).map((t) => t.trackId));

  const trackIds = [];
  for (const fileName of files.sort()) {
    const title = fileName.replace(/\.wav$/i, '');
    const baseId = slugFromFilename(title);
    const trackId = uniqueTrackId(baseId, existingIds);
    existingIds.add(trackId);
    const localPath = `pbz/${fileName}`;

    await Track.findOneAndUpdate(
      { trackId },
      {
        trackId,
        title,
        artist: 'Phantom Blade Zero',
        localPath,
        audioSource: 'local',
        category: PLAYLIST_CATEGORY,
        isHidden: false,
      },
      { upsert: true, new: true }
    );
    trackIds.push(trackId);
    console.log(`  ${trackId}  ${title}  →  music/${localPath}`);
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
