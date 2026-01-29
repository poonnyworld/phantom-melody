# Phantom Melody Bot

A Discord music bot for PBZ that integrates with the Honor Points system from Honor Bot.

## Features

### Music Playback
- `/play [query]` - Play a track or search for music
- `/pause` - Pause the currently playing music
- `/resume` - Resume paused music
- `/skip` - Skip to the next track
- `/stop` - Stop music and clear the queue
- `/queue` - Display the current music queue
- `/nowplaying` - Show info about the current track
- `/loop [on/off]` - Toggle loop for the current track

### Playlists
- `/playlist [category]` - Play a themed playlist
  - ⚔️ Battle Music
  - 📖 Story Music
  - 🗺️ Exploration Music
  - 💫 Emotional Music
  - 🌙 Ambient Music
  - 🔮 Hidden Treasures (requires unlock)
  - 🎵 All Tracks

### Honor Point Features
- `/pin [track]` - Pin a track to play next (5 Honor Points)
- `/upvote [track]` - Upvote your favorite track (2 Honor Points)
- `/unlock` - Unlock the Hidden Treasures playlist (50 Honor Points)
- `/balance` - Check your Honor Points balance

### Track Information
- `/trackinfo [query]` - Get detailed info about a track
- `/leaderboard` - View monthly music leaderboards

### Listening Rewards
- `/listeningstats` - View your listening stats
- `/claimreward` - Claim monthly listening rewards

## Setup

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Discord Bot Token
- FFmpeg (for audio processing)

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd phantom-melody
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file based on `.env.example`
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`

5. Deploy slash commands
```bash
npm run deploy
```

6. Start the bot
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### Docker Setup

#### Option 1: Share MongoDB with Honor Bot (Recommended)

1. **Make sure Honor Bot is running first:**
   ```bash
   cd ../honorbot-pbz
   docker-compose up -d
   ```

2. **Find the network name:**
   ```bash
   docker network ls
   # Look for network like: honorbot-pbz_default
   ```

3. **Update docker-compose.yml** if network name is different:
   ```yaml
   networks:
     honorbot-network:
       external: true
       name: <actual-network-name>
   ```

4. **Build and run Phantom Melody:**
   ```bash
   cd phantom-melody
   docker-compose up -d --build
   ```

5. **View logs:**
   ```bash
   docker-compose logs -f phantom-melody
   ```

#### Option 2: Use Local MongoDB (Development)

If Honor Bot is not running in Docker, use the local compose file:

```bash
docker-compose -f docker-compose.local.yml up -d --build
```

#### Docker Commands

```bash
# Start bot
docker-compose up -d

# Stop bot
docker-compose down

# View logs
docker-compose logs -f phantom-melody

# Rebuild after code changes
docker-compose up -d --build

# Restart bot
docker-compose restart phantom-melody
```

## Database

This bot shares the MongoDB database with Honor Bot. Make sure both bots use the same `MONGO_URI` to share user data and Honor Points.

### Collections
- `users` - Shared with Honor Bot (Honor Points, user data)
- `tracks` - Music tracks with metadata
- `playlists` - Themed playlists
- `listeninghistories` - User listening history

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Phantom Melody bot token |
| `CLIENT_ID` | Discord application client ID |
| `GUILD_ID` | Server (guild) ID for command deployment |
| `MONGO_URI` | MongoDB connection string (same as Honor Bot) |
| `PHANTOM_MELODY_VOICE_CHANNEL_ID` | Voice channel for music |
| `PHANTOM_MELODY_TEXT_CHANNEL_ID` | Text channel for commands |
| `PIN_COST` | Honor Points cost for pinning (default: 5) |
| `UPVOTE_COST` | Honor Points cost for upvoting (default: 2) |
| `UNLOCK_COST` | Honor Points cost for unlock (default: 50) |
| `MONTHLY_LISTENING_THRESHOLD_HOURS` | Hours needed for reward (default: 5) |
| `LISTENING_REWARD_MIN` | Minimum reward points (default: 1) |
| `LISTENING_REWARD_MAX` | Maximum reward points (default: 10) |

## Adding Tracks

Tracks can be added to the database using MongoDB commands or a future admin dashboard:

```javascript
db.tracks.insertOne({
  trackId: "unique-track-id",
  title: "Track Title",
  artist: "Artist Name",
  youtubeUrl: "https://youtube.com/watch?v=...",
  duration: 180, // seconds
  category: "battle", // battle, story, exploration, emotional, ambient, hidden
  description: "Creative background story...",
  instruments: ["guzheng", "erhu", "drums"],
  isHidden: false,
  playCount: 0,
  monthlyPlayCount: 0,
  upvotes: 0,
  monthlyUpvotes: 0,
  pinCount: 0,
  monthlyPinCount: 0,
  upvotedBy: []
});
```

## Automatic Features

- **Daily Shuffle**: Playlists are shuffled at midnight UTC
- **Monthly Reset**: Play counts and stats reset on the 1st of each month
- **Listening Tracking**: Voice channel time is tracked for rewards

## License

ISC
