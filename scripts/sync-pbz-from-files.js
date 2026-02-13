/**
 * Sync เพลย์ลิสต์ PBZ จากไฟล์ใน music/{albumSlug}/
 * รองรับ .wav, .mp3, .ogg — ใส่ไฟล์ลงในโฟลเดอร์ตามอัลบั้ม แล้วรันสคริปต์นี้
 *
 * ใช้: node scripts/sync-pbz-from-files.js
 * ต้องมี MongoDB (MONGO_URI ใน .env)
 * ต้องใช้ Node.js 18 ขึ้นไป (npm run sync-pbz)
 */
const nodeVersion = process.versions && process.versions.node;
const major = nodeVersion ? parseInt(nodeVersion.split('.')[0], 10) : 0;
if (major < 18) {
  console.error('This script requires Node.js 18 or newer. Current:', process.version);
  console.error('Install a newer Node (e.g. from https://nodejs.org or via nvm) and run: npm run sync-pbz');
  process.exit(1);
}

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();

const MUSIC_DIR = path.join(__dirname, '..', 'music');
const PLAYLIST_NAME = 'Phantom Blade Zero Radio';
const PLAYLIST_CATEGORY = 'pbz';

// Must match src/config/playlists.ts ALBUMS (slug = folder name under music/)
const ALBUMS = [
  { slug: '2014_Phantom-Blade-1', displayName: 'Phantom Blade 1 (2014)' },
  { slug: '2016_Phantom-Blade-2', displayName: 'Phantom Blade 2 (2016)' },
  { slug: '2017_Phantom-Blade-2-Desert', displayName: 'Phantom Blade 2 Desert (2017)' },
  { slug: '2023_Phantom-Blade-3', displayName: 'Phantom Blade 3 (2023)' },
  { slug: '2025_Phantom-Blade-Zero-Soundtrack', displayName: 'Phantom Blade Zero Soundtrack (2025)' },
  { slug: '2009_Rain-Blood-2', displayName: 'Rain Blood 2 Original Sountrack (2009)' },
  { slug: '2012_Rain-Blood-Chronicles', displayName: 'Rain Blood Chronicles CD (2012)' },
];

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg'];

function slugFromFilename(name) {
  return name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase().slice(0, 80) || 'track';
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
  albumKey: { type: String },
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
  if (!fs.existsSync(MUSIC_DIR)) {
    console.error('โฟลเดอร์ music/ ไม่พบ');
    process.exit(1);
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

  const allTrackIds = [];

  for (const album of ALBUMS) {
    const albumDir = path.join(MUSIC_DIR, album.slug);
    if (!fs.existsSync(albumDir) || !fs.statSync(albumDir).isDirectory()) {
      console.log(`  [skip] ${album.slug} — โฟลเดอร์ไม่มี`);
      continue;
    }

    const rawFiles = fs.readdirSync(albumDir);
    const files = rawFiles.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return AUDIO_EXTENSIONS.includes(ext);
    }).sort();

    if (files.length === 0) {
      console.log(`  [skip] ${album.slug} — ไม่พบ .wav/.mp3/.ogg`);
      continue;
    }

    console.log(`\n  Album: ${album.displayName} (${album.slug}) — ${files.length} file(s)`);

    for (const fileName of files) {
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      const title = baseName;
      const baseId = album.slug + '-' + slugFromFilename(baseName);
      const trackId = uniqueTrackId(baseId, existingIds);
      existingIds.add(trackId);
      const localPath = `${album.slug}/${fileName}`;

      await Track.findOneAndUpdate(
        { trackId },
        {
          trackId,
          title,
          artist: 'Phantom Blade Zero',
          localPath,
          audioSource: 'local',
          category: PLAYLIST_CATEGORY,
          albumKey: album.slug,
          isHidden: false,
        },
        { upsert: true, new: true }
      );
      allTrackIds.push(trackId);
      console.log(`    ${trackId}  ${title}  →  music/${localPath}`);
    }
  }

  if (allTrackIds.length === 0) {
    console.log('\nไม่พบไฟล์ในโฟลเดอร์อัลบั้ม — ใส่ .wav/.mp3/.ogg ลงใน music/{albumSlug}/ แล้วรันใหม่');
    await mongoose.disconnect();
    process.exit(0);
  }

  const shuffledOrder = shuffle(allTrackIds);
  await Playlist.findOneAndUpdate(
    { name: PLAYLIST_NAME },
    {
      name: PLAYLIST_NAME,
      category: PLAYLIST_CATEGORY,
      description: 'Official soundtrack from Phantom Blade Zero',
      trackIds: allTrackIds,
      shuffledOrder,
      lastShuffled: new Date(),
      isDefault: true,
    },
    { upsert: true, new: true }
  );

  console.log(`\nPlaylist "${PLAYLIST_NAME}" updated with ${allTrackIds.length} tracks.`);
  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
