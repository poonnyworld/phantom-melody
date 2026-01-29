#!/usr/bin/env node

/**
 * Script to add a new track to the database
 * Usage: node add-track.js <trackId> <title> <artist> <youtubeUrl> [duration] [category] [description]
 * 
 * Example:
 *   node add-track.js "battle-003" "Epic Battle" "Artist" "https://www.youtube.com/watch?v=VIDEO_ID" 240 "battle" "Description"
 */

const args = process.argv.slice(2);

if (args.length < 4) {
  console.log('❌ Usage: node add-track.js <trackId> <title> <artist> <youtubeUrl> [duration] [category] [description]');
  console.log('');
  console.log('Example:');
  console.log('  node add-track.js "battle-003" "Epic Battle" "Artist" "https://www.youtube.com/watch?v=VIDEO_ID" 240 "battle" "Description"');
  console.log('');
  console.log('Required:');
  console.log('  trackId     - Unique track ID (e.g., "battle-003")');
  console.log('  title      - Track title');
  console.log('  artist     - Artist name');
  console.log('  youtubeUrl - YouTube URL');
  console.log('');
  console.log('Optional:');
  console.log('  duration   - Duration in seconds (default: 0)');
  console.log('  category   - Category: battle, story, exploration, ambient, hidden (default: battle)');
  console.log('  description - Track description (default: "")');
  process.exit(1);
}

const trackId = args[0];
const title = args[1];
const artist = args[2];
const youtubeUrl = args[3];
const duration = parseInt(args[4]) || 0;
const category = args[5] || 'battle';
const description = args[6] || '';

// Validate category
const validCategories = ['battle', 'story', 'exploration', 'ambient', 'hidden'];
if (!validCategories.includes(category)) {
  console.log(`❌ Invalid category: ${category}`);
  console.log(`   Valid categories: ${validCategories.join(', ')}`);
  process.exit(1);
}

// Validate YouTube URL
if (!youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) {
  console.log('⚠️  Warning: YouTube URL might be invalid');
  console.log(`   URL: ${youtubeUrl}`);
}

const track = {
  trackId,
  title,
  artist,
  youtubeUrl,
  duration,
  category,
  description,
  instruments: [],
  isHidden: category === 'hidden',
  playCount: 0,
  monthlyPlayCount: 0,
  upvotes: 0,
  monthlyUpvotes: 0,
  pinCount: 0,
  monthlyPinCount: 0,
  upvotedBy: []
};

console.log('📝 Track to add:');
console.log('================');
console.log(JSON.stringify(track, null, 2));
console.log('');

console.log('📋 MongoDB Command:');
console.log('===================');
console.log('');
console.log('db.tracks.insertOne(');
console.log(JSON.stringify(track, null, 2));
console.log(');');
console.log('');

console.log('🔄 To update playlist after adding:');
console.log('===================================');
console.log('');
console.log(`const ${category}Tracks = db.tracks.find({`);
console.log(`  category: "${category}",`);
console.log(`  youtubeUrl: { $exists: true, $ne: null }`);
console.log(`}).toArray();`);
console.log(`const trackIds = ${category}Tracks.map(t => t.trackId);`);
console.log(`db.playlists.updateOne(`);
console.log(`  { category: "${category}" },`);
console.log(`  { $set: { trackIds: trackIds, shuffledOrder: trackIds } }`);
console.log(`);`);
console.log('');

console.log('💡 To run the command:');
console.log('======================');
console.log(`docker exec -i honorbot-mongodb mongosh honorbot --eval "db.tracks.insertOne(${JSON.stringify(track)});"`);
