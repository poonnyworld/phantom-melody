// Script to initialize playlists with tracks
const mongoose = require('mongoose');
require('dotenv').config();

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

    // Get all tracks
    const tracks = await Track.find({});
    console.log(`✓ Found ${tracks.length} tracks`);

    // Get tracks by category
    const battleTracks = tracks.filter(t => t.category === 'battle' && !t.isHidden);
    const storyTracks = tracks.filter(t => t.category === 'story' && !t.isHidden);
    const explorationTracks = tracks.filter(t => t.category === 'exploration' && !t.isHidden);
    const emotionalTracks = tracks.filter(t => t.category === 'emotional' && !t.isHidden);
    const ambientTracks = tracks.filter(t => t.category === 'ambient' && !t.isHidden);
    const hiddenTracks = tracks.filter(t => t.isHidden);
    const allTracks = tracks.filter(t => !t.isHidden);

    // Shuffle function
    function shuffle(array) {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    const playlists = [
      {
        name: 'Battle Music',
        category: 'battle',
        description: 'Epic battle themes and combat music',
        trackIds: battleTracks.map(t => t.trackId),
        shuffledOrder: shuffle(battleTracks.map(t => t.trackId)),
        isDefault: true,
        lastShuffled: new Date(),
      },
      {
        name: 'Story Music',
        category: 'story',
        description: 'Narrative and storytelling themes',
        trackIds: storyTracks.map(t => t.trackId),
        shuffledOrder: shuffle(storyTracks.map(t => t.trackId)),
        isDefault: true,
        lastShuffled: new Date(),
      },
      {
        name: 'Exploration Music',
        category: 'exploration',
        description: 'Adventure and exploration themes',
        trackIds: explorationTracks.map(t => t.trackId),
        shuffledOrder: shuffle(explorationTracks.map(t => t.trackId)),
        isDefault: true,
        lastShuffled: new Date(),
      },
      {
        name: 'Emotional Music',
        category: 'emotional',
        description: 'Touching and emotional pieces',
        trackIds: emotionalTracks.map(t => t.trackId),
        shuffledOrder: shuffle(emotionalTracks.map(t => t.trackId)),
        isDefault: true,
        lastShuffled: new Date(),
      },
      {
        name: 'Ambient Music',
        category: 'ambient',
        description: 'Background and atmospheric music',
        trackIds: ambientTracks.map(t => t.trackId),
        shuffledOrder: shuffle(ambientTracks.map(t => t.trackId)),
        isDefault: true,
        lastShuffled: new Date(),
      },
      {
        name: 'Hidden Treasures',
        category: 'hidden',
        description: 'Exclusive tracks for true fans',
        trackIds: hiddenTracks.map(t => t.trackId),
        shuffledOrder: shuffle(hiddenTracks.map(t => t.trackId)),
        isDefault: true,
        lastShuffled: new Date(),
      },
      {
        name: 'All Tracks',
        category: 'all',
        description: 'The complete music collection',
        trackIds: allTracks.map(t => t.trackId),
        shuffledOrder: shuffle(allTracks.map(t => t.trackId)),
        isDefault: true,
        lastShuffled: new Date(),
      },
    ];

    // Update or create playlists
    for (const playlistData of playlists) {
      const existing = await Playlist.findOne({ name: playlistData.name });
      if (existing) {
        existing.trackIds = playlistData.trackIds;
        existing.shuffledOrder = playlistData.shuffledOrder;
        existing.lastShuffled = playlistData.lastShuffled;
        await existing.save();
        console.log(`✓ Updated playlist: ${playlistData.name} (${playlistData.trackIds.length} tracks)`);
      } else {
        await Playlist.create(playlistData);
        console.log(`✓ Created playlist: ${playlistData.name} (${playlistData.trackIds.length} tracks)`);
      }
    }

    console.log('\n✅ All playlists initialized successfully!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

initPlaylists();
