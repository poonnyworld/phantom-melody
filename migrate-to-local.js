/**
 * Migration Script: Convert tracks from YouTube to Local MP3 files
 * 
 * This script updates tracks in the database to use local MP3 files instead of YouTube URLs.
 * 
 * Usage:
 *   1. Make sure MongoDB is running
 *   2. Place MP3 files in the music/{category}/ folders
 *   3. Run: node migrate-to-local.js
 * 
 * Options:
 *   --dry-run     Preview changes without saving to database
 *   --category    Migrate only a specific category (e.g., --category battle)
 *   --track       Migrate only a specific track by trackId (e.g., --track battle-001)
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Track Schema (simplified version matching the main model)
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

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const categoryIndex = args.indexOf('--category');
const targetCategory = categoryIndex !== -1 ? args[categoryIndex + 1] : null;
const trackIndex = args.indexOf('--track');
const targetTrack = trackIndex !== -1 ? args[trackIndex + 1] : null;

// Music directory path
const MUSIC_DIR = path.join(__dirname, 'music');

async function main() {
  console.log('========================================');
  console.log('   Phantom Melody - Migration Script   ');
  console.log('========================================');
  console.log('');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be saved');
    console.log('');
  }

  // Connect to MongoDB
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/honorbot';
  console.log(`📡 Connecting to MongoDB: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    console.log('');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }

  // Build query based on arguments
  let query = {};
  if (targetCategory) {
    query.category = targetCategory;
    console.log(`📁 Filtering by category: ${targetCategory}`);
  }
  if (targetTrack) {
    query.trackId = targetTrack;
    console.log(`🎵 Filtering by trackId: ${targetTrack}`);
  }

  // Find tracks to migrate
  const tracks = await Track.find(query);
  console.log(`📊 Found ${tracks.length} tracks to process`);
  console.log('');

  // Check which tracks have local files available
  const results = {
    migrated: [],
    missing: [],
    alreadyLocal: [],
    errors: []
  };

  for (const track of tracks) {
    try {
      // Expected local path
      const expectedPath = `${track.category}/${track.trackId}.mp3`;
      const fullPath = path.join(MUSIC_DIR, expectedPath);

      // Check if already using local
      if (track.audioSource === 'local' && track.localPath) {
        results.alreadyLocal.push({
          trackId: track.trackId,
          title: track.title,
          localPath: track.localPath
        });
        continue;
      }

      // Check if local file exists
      if (fs.existsSync(fullPath)) {
        if (!isDryRun) {
          track.localPath = expectedPath;
          track.audioSource = 'local';
          await track.save();
        }
        results.migrated.push({
          trackId: track.trackId,
          title: track.title,
          localPath: expectedPath
        });
      } else {
        results.missing.push({
          trackId: track.trackId,
          title: track.title,
          expectedPath: expectedPath,
          category: track.category
        });
      }
    } catch (error) {
      results.errors.push({
        trackId: track.trackId,
        title: track.title,
        error: error.message
      });
    }
  }

  // Print results
  console.log('========================================');
  console.log('               RESULTS                 ');
  console.log('========================================');
  console.log('');

  if (results.migrated.length > 0) {
    console.log(`✅ ${isDryRun ? 'Would migrate' : 'Migrated'} ${results.migrated.length} tracks:`);
    results.migrated.forEach(t => {
      console.log(`   - ${t.trackId}: ${t.title}`);
      console.log(`     → ${t.localPath}`);
    });
    console.log('');
  }

  if (results.alreadyLocal.length > 0) {
    console.log(`⏭️  Already using local: ${results.alreadyLocal.length} tracks:`);
    results.alreadyLocal.forEach(t => {
      console.log(`   - ${t.trackId}: ${t.title}`);
    });
    console.log('');
  }

  if (results.missing.length > 0) {
    console.log(`⚠️  Missing MP3 files: ${results.missing.length} tracks:`);
    results.missing.forEach(t => {
      console.log(`   - ${t.trackId}: ${t.title}`);
      console.log(`     Expected: music/${t.expectedPath}`);
    });
    console.log('');
    console.log('   To add missing files, place MP3 files at:');
    const categories = [...new Set(results.missing.map(t => t.category))];
    categories.forEach(cat => {
      console.log(`   - music/${cat}/`);
    });
    console.log('');
  }

  if (results.errors.length > 0) {
    console.log(`❌ Errors: ${results.errors.length}`);
    results.errors.forEach(t => {
      console.log(`   - ${t.trackId}: ${t.error}`);
    });
    console.log('');
  }

  // Summary
  console.log('========================================');
  console.log('               SUMMARY                 ');
  console.log('========================================');
  console.log(`Total tracks processed: ${tracks.length}`);
  console.log(`Migrated to local:      ${results.migrated.length}`);
  console.log(`Already local:          ${results.alreadyLocal.length}`);
  console.log(`Missing MP3 files:      ${results.missing.length}`);
  console.log(`Errors:                 ${results.errors.length}`);
  console.log('');

  if (isDryRun && results.migrated.length > 0) {
    console.log('💡 Run without --dry-run to apply changes');
  }

  await mongoose.disconnect();
  console.log('✅ Done!');
}

main().catch(console.error);
