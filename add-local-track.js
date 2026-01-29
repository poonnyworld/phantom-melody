/**
 * Add Local Track Script
 * 
 * Adds a new track to the database that uses a local MP3 file.
 * 
 * Usage:
 *   node add-local-track.js <trackId> <title> <artist> <category> [duration]
 * 
 * Example:
 *   node add-local-track.js battle-001 "Epic Battle Theme" "Composer Name" battle 180
 * 
 * The MP3 file should be placed at: music/{category}/{trackId}.mp3
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Track Schema
const TrackSchema = new mongoose.Schema({
  trackId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  artist: { type: String, default: 'Unknown Artist' },
  youtubeUrl: { type: String },
  localPath: { type: String },
  audioSource: { type: String, enum: ['youtube', 'local'], default: 'youtube' },
  duration: { type: Number, default: 0 },
  category: { type: String, enum: ['battle', 'story', 'exploration', 'emotional', 'ambient', 'hidden'] },
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

const Track = mongoose.model('Track', TrackSchema);

const MUSIC_DIR = path.join(__dirname, 'music');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log('Usage: node add-local-track.js <trackId> <title> <artist> <category> [duration]');
    console.log('');
    console.log('Arguments:');
    console.log('  trackId   - Unique identifier (e.g., battle-001)');
    console.log('  title     - Track title (use quotes if contains spaces)');
    console.log('  artist    - Artist name (use quotes if contains spaces)');
    console.log('  category  - One of: battle, story, exploration, emotional, ambient, hidden');
    console.log('  duration  - Duration in seconds (optional)');
    console.log('');
    console.log('Example:');
    console.log('  node add-local-track.js battle-001 "Epic Battle Theme" "Kevin MacLeod" battle 180');
    process.exit(1);
  }

  const [trackId, title, artist, category, durationStr] = args;
  const duration = durationStr ? parseInt(durationStr, 10) : 0;
  
  // Validate category
  const validCategories = ['battle', 'story', 'exploration', 'emotional', 'ambient', 'hidden'];
  if (!validCategories.includes(category)) {
    console.error(`❌ Invalid category: ${category}`);
    console.log(`   Valid categories: ${validCategories.join(', ')}`);
    process.exit(1);
  }

  // Check if MP3 file exists
  const localPath = `${category}/${trackId}.mp3`;
  const fullPath = path.join(MUSIC_DIR, localPath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ MP3 file not found: ${fullPath}`);
    console.log('');
    console.log('Please place the MP3 file at the expected location:');
    console.log(`   music/${localPath}`);
    process.exit(1);
  }

  // Connect to MongoDB
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/honorbot';
  console.log(`📡 Connecting to MongoDB...`);
  
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected');
  } catch (error) {
    console.error('❌ Failed to connect:', error.message);
    process.exit(1);
  }

  // Check if track already exists
  const existing = await Track.findOne({ trackId });
  if (existing) {
    console.error(`❌ Track with ID "${trackId}" already exists`);
    console.log(`   Title: ${existing.title}`);
    console.log(`   Use a different trackId or update the existing track`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Create new track
  const track = new Track({
    trackId,
    title,
    artist,
    category,
    localPath,
    audioSource: 'local',
    duration,
    isHidden: category === 'hidden',
    description: '',
    instruments: [],
  });

  await track.save();

  console.log('');
  console.log('✅ Track added successfully!');
  console.log('');
  console.log('Track Details:');
  console.log(`   ID:       ${track.trackId}`);
  console.log(`   Title:    ${track.title}`);
  console.log(`   Artist:   ${track.artist}`);
  console.log(`   Category: ${track.category}`);
  console.log(`   Duration: ${track.duration}s`);
  console.log(`   Source:   ${track.audioSource}`);
  console.log(`   Path:     music/${track.localPath}`);
  console.log('');

  await mongoose.disconnect();
}

main().catch(console.error);
