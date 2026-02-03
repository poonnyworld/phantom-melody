// Script to initialize playlists – เหลือเฉพาะ PBZ (Phantom Blade Zero Melody)
// ลบเพลย์ลิสต์อื่นทั้งหมด แล้วสร้าง/อัปเดตเฉพาะเพลย์ลิสต์ PBZ
const mongoose = require('mongoose');
require('dotenv').config();

const PLAYLIST_NAME = 'Phantom Blade Zero Melody';
const PLAYLIST_CATEGORY = 'pbz';

const PlaylistSchema = new mongoose.Schema({
  name: String,
  category: String,
  description: String,
  trackIds: [String],
  isDefault: Boolean,
  shuffledOrder: [String],
  lastShuffled: Date,
}, { timestamps: true });

const TrackSchema = new mongoose.Schema({
  trackId: String,
  category: String,
  isHidden: Boolean,
}, { timestamps: true });

async function initPlaylists() {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/honorbot';
    await mongoose.connect(mongoURI);
    console.log('✓ Connected to MongoDB');

    const Playlist = mongoose.model('Playlist', PlaylistSchema);
    const Track = mongoose.model('Track', TrackSchema);

    // ลบเพลย์ลิสต์ที่ไม่ใช่ PBZ
    const deleted = await Playlist.deleteMany({ name: { $ne: PLAYLIST_NAME } });
    if (deleted.deletedCount > 0) {
      console.log(`✓ Removed ${deleted.deletedCount} non-PBZ playlist(s)`);
    }

    // ดึงเฉพาะแทร็ก category pbz (ไม่ซ่อน)
    const pbzTracks = await Track.find({ category: PLAYLIST_CATEGORY, isHidden: { $ne: true } });
    console.log(`✓ Found ${pbzTracks.length} PBZ tracks`);

    function shuffle(array) {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    const trackIds = pbzTracks.map((t) => t.trackId);
    const shuffledOrder = shuffle(trackIds);

    const existing = await Playlist.findOne({ name: PLAYLIST_NAME });
    if (existing) {
      existing.trackIds = trackIds;
      existing.shuffledOrder = shuffledOrder;
      existing.lastShuffled = new Date();
      existing.category = PLAYLIST_CATEGORY;
      existing.description = 'Official soundtrack from Phantom Blade Zero';
      await existing.save();
      console.log(`✓ Updated playlist: ${PLAYLIST_NAME} (${trackIds.length} tracks)`);
    } else {
      await Playlist.create({
        name: PLAYLIST_NAME,
        category: PLAYLIST_CATEGORY,
        description: 'Official soundtrack from Phantom Blade Zero',
        trackIds,
        shuffledOrder,
        isDefault: true,
        lastShuffled: new Date(),
      });
      console.log(`✓ Created playlist: ${PLAYLIST_NAME} (${trackIds.length} tracks)`);
    }

    console.log('\n✅ PBZ playlist only. All other playlists removed.');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

initPlaylists();
