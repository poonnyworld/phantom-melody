# Phantom Melody Bot

A Discord music bot for Phantom Blade Zero community. Features a turn-based song selection queue system for fair music sharing.

## Screenshots

### Control Channel

![Control Channel](./docs/images/control-channel.png)
_Music controls, song selection dropdown, and selection queue panel_

### Selection Queue

![Selection Queue](./docs/images/selection-queue.png)
_Turn-based queue system for fair song selection_

### Now Playing Display

![Now Playing](./docs/images/now-playing.png)
_Beautiful display with progress bar and upcoming queue_

### Admin Panel

![Admin Panel](./docs/images/admin-panel.png)
_Add and remove songs from playlist_

### Admin Logs

![Admin Logs](./docs/images/admin-logs.png)
_Activity logs for playlist changes and playback events_

## Features

### 🎵 Single Playlist System

All music is organized in the **Phantom Blade Zero Melody** playlist. Users can select songs from this playlist and add them to the shared queue.

### 🎯 Selection Queue System

A fair turn-based system for selecting songs:

- Users join a selection queue to wait for their turn
- Each user has **2 minutes** to select a song
- After selecting, the next person in queue gets their turn
- If time expires, the turn passes to the next person
- Prevents multiple users from competing to add songs simultaneously

### 🎧 Music Playback

- **Now Playing Display** - Beautiful real-time display showing current track, progress bar, and upcoming queue
- **Vote Skip** - Requires 5 votes to skip a song
- **View Queue** - See the current music queue (up to 20 songs)
- Single voice channel enforcement for shared listening experience

### 👑 Admin Features

- Add songs via YouTube URL
- Remove songs from playlist
- Activity logs for all playlist changes, queue additions, and playback events

## Channels

| Channel             | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| **Voice Channel**   | Single voice channel for music playback                    |
| **Control Channel** | Selection Queue + Song dropdown + Vote Skip + View Queue   |
| **Display Channel** | Now Playing embed with progress bar and queue preview      |
| **Admin Logs**      | Logs for playlist changes, queue activity, playback events |
| **Admin Playlist**  | Add/Remove songs panel                                     |

## User Interface

### Control Channel

Contains three main components:

1. **Selection Queue Panel**
   - Shows who is currently selecting
   - Countdown timer (2 minutes)
   - List of users waiting in queue
   - Join Queue / Leave buttons

2. **Music Controls**
   - ⏭️ **Vote Skip** - Vote to skip current song (needs 5 votes)
   - 📋 **View Queue** - View the current music queue

3. **Song Selection Dropdown**
   - Select songs from the playlist to add to queue
   - Only works when it's your turn in the selection queue

### Display Channel

Shows a beautiful Now Playing embed:

- Current track title and artist
- Thumbnail image
- Progress bar with time
- Requested by username
- Next 5 songs in queue

## YouTube Playback

The bot uses **yt-dlp** for reliable YouTube audio streaming:

| Component      | Technology                        |
| -------------- | --------------------------------- |
| Metadata       | yt-dlp `--dump-json`              |
| Audio Stream   | yt-dlp + Android client → Discord |
| Voice Playback | @discordjs/voice + FFmpeg         |

This approach avoids common issues with JavaScript YouTube libraries that break frequently.

## Setup

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Discord Bot Token
- FFmpeg (for audio processing)
- **yt-dlp** (Docker image includes this)

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

3. Create a `.env` file

```bash
cp .env.example .env
```

4. Configure environment variables (see below)

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

#### Share MongoDB with Honor Bot (Recommended)

1. Make sure Honor Bot is running:

   ```bash
   cd ../honorbot-pbz
   docker-compose up -d
   ```

2. Build and run Phantom Melody:

   ```bash
   cd phantom-melody
   docker-compose up -d --build
   ```

3. View logs:
   ```bash
   docker-compose logs -f phantom-melody
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

## Environment Variables

| Variable                            | Description                                              |
| ----------------------------------- | -------------------------------------------------------- |
| `DISCORD_TOKEN`                     | Phantom Melody bot token                                 |
| `CLIENT_ID`                         | Discord application client ID                            |
| `GUILD_ID`                          | Server (guild) ID for command deployment                 |
| `MONGO_URI`                         | MongoDB connection string                                |
| **User Channels**                   |                                                          |
| `PHANTOM_MELODY_VOICE_CHANNEL_ID`   | Voice channel for music playback                         |
| `PHANTOM_MELODY_CONTROL_CHANNEL_ID` | Channel for controls, selection queue, and song dropdown |
| `PHANTOM_MELODY_DISPLAY_CHANNEL_ID` | Channel for Now Playing display                          |
| **Admin Channels**                  |                                                          |
| `ADMIN_LOGS_CHANNEL_ID`             | Admin logs - playlist changes, queue, playback events    |
| `ADMIN_PLAYLIST_CHANNEL_ID`         | Admin panel for Add/Remove songs                         |
| **Legacy**                          |                                                          |
| `PHANTOM_MELODY_TEXT_CHANNEL_ID`    | Fallback text channel                                    |

## Admin: Adding Songs

Admins can add songs through the Admin Playlist channel:

1. Click **Add Song** button
2. Enter YouTube URL in the modal
3. Optionally customize title and artist
4. Song is automatically added to the playlist

Songs can also be added via the `/addtrack` slash command (admin only).

## Logs

The Admin Logs channel displays:

| Event          | Example                                    |
| -------------- | ------------------------------------------ |
| Track added    | `✅ Admin added track: **Track Name**`     |
| Track removed  | `ℹ️ Admin removed track: **Track Name**`   |
| Song queued    | `ℹ️ 📋 Queued: **Track Name** by Username` |
| Now playing    | `✅ 🎵 Now playing: **Track Name**`        |
| Track finished | `ℹ️ 🏁 Finished: **Track Name**`           |
| Vote skip      | `ℹ️ ⏭️ Skipped: Track Name (vote skip)`    |

## Database

Shares MongoDB with Honor Bot for user data consistency.

### Collections

- `tracks` - Music tracks with metadata
- `playlists` - Playlist configuration
- `users` - Shared with Honor Bot
- `listeninghistories` - User listening history

## Automatic Features

- **Daily Shuffle**: Playlists shuffled at midnight UTC
- **Listening Tracking**: Voice channel time tracked for rewards

## License

ISC
