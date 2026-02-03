# Phantom Radio Bot

A Discord music bot for Phantom Blade Zero community. Features a turn-based song selection queue system for fair music sharing.

## Screenshots

### Playlist Channel

![Playlist Channel](./docs/images/playlist.png)
_Show available songs_

### Selection Queue

![Selection Queue](./docs/images/selection-queue.png)
_Turn-based queue system for fair song selection_

### Now Playing Display

![Now Playing](./docs/images/now-playing.png)
_Beautiful display with progress bar and upcoming queue_

### Vote Skip

![Vote Skip](./docs/images/vote-skip.png)
_Vote skip song (require 5 person to skip)_

### Admin Playlist Manager

![Admin Playlist Manager](./docs/images/admin-playlist-manager.png)
_Add and remove songs from playlist_

### Admin Logs

![Admin Logs](./docs/images/admin-logs.png)
_Activity logs for playlist changes and playback events_

### Admin Controls

![Admin Controls](./docs/images/admin-controls.png)
_Force Skip, Play and pause song by admin_

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

Each channel has a specific role. Set the Channel IDs in `.env` to match the channels you create in Discord.

### User channels

| Channel (example name)               | Env variable                              | Purpose                                                                                            |
| ------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `#phantom-radio-vote-skip`           | `PHANTOM_RADIO_VOTE_SKIP_CHANNEL_ID`      | **Vote Skip** — Embed + Vote Skip button only (skip when 5 votes are reached)                      |
| `#phantom-radio-music-player`        | `PHANTOM_RADIO_MUSIC_PLAYER_CHANNEL_ID`   | **Now Playing + View Queue** — Now Playing (title, progress bar, upcoming queue) and View Queue    |
| `#phantom-radio-playlist`            | `PHANTOM_RADIO_PLAYLIST_CHANNEL_ID`       | **Full playlist** — Multi-page embed (8 tracks per page) with Previous / Next buttons              |
| `#phantom-radio-song-selection`      | `PHANTOM_RADIO_SONG_SELECTION_CHANNEL_ID` | **Join queue & select song** — Join Queue → get your turn → Select Song (ephemeral), one song/turn |
| `#phantom-radio-manual`              | `PHANTOM_RADIO_MANUAL_CHANNEL_ID`         | **User guide** — Bot posts an embed with instructions and clickable channel links (<#id>)          |
| Voice channel (e.g. `phantom-radio`) | `PHANTOM_RADIO_VOICE_CHANNEL_ID`          | **Voice** — Music plays here; listeners must be in this channel                                    |

### Admin channels

| Channel (example name)          | Env variable                | Purpose                                                             |
| ------------------------------- | --------------------------- | ------------------------------------------------------------------- |
| `#admin-phantom-radio-logs`     | `ADMIN_LOGS_CHANNEL_ID`     | **Logs** — Queue additions, playback, skip, track removal, etc.     |
| `#admin-phantom-radio-playlist` | `ADMIN_PLAYLIST_CHANNEL_ID` | **Manage playlist** — View & Remove buttons to view/remove tracks   |
| `#admin-phantom-radio-control`  | `ADMIN_CONTROL_CHANNEL_ID`  | **Emergency/test control** — Force Skip, Pause, Resume (admin only) |

### Optional channels

| Channel               | Notes                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| `#phantom-radio-chat` | General chat; no env variable — use for discussion or bot-related questions |

## User Interface

### Vote Skip channel (`#phantom-radio-vote-skip`)

- Embed "♫ Music Player Controls" + **Vote Skip** button
- Current song skips when 5 votes are reached

### Music Player channel (`#phantom-radio-music-player`)

- **Now Playing** — Track title, artist, progress bar, time, requester, upcoming queue (~5 songs)
- **View Queue** button — Shows full queue (ephemeral, visible only to the user who clicked)

### Song Selection channel (`#phantom-radio-song-selection`)

1. **Track list embed** — Track count + instructions to Join queue then click Select Song
2. **Song Selection Queue** — Current selector, time remaining, waiting list, Join Queue / Leave / Select Song buttons
3. When it's your turn, you get an ephemeral message with song selection dropdowns

### Playlist channel (`#phantom-radio-playlist`)

- Multi-page embed (8 tracks per page)
- **Previous** / **Next** buttons to navigate pages

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
cd phantom-radio
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

2. Build and run Phantom Radio:

   ```bash
   cd phantom-radio
   docker-compose up -d --build
   ```

3. View logs:
   ```bash
   docker-compose logs -f phantom-radio
   ```

#### BGM / PBZ playlist when running with Docker

- Place BGM `.wav` files in `./music/pbz/` on the host (this folder is mounted into the container)
- Update `config/pbz-bgm-tracks.js` to match your filenames, then run the seed **on the host** (Mongo runs in Docker):

  ```bash
  # On host (from phantom-radio/)
  MONGO_URI=mongodb://localhost:27017/honorbot npm run sync-pbz:host
  ```

  If MongoDB is on a different host/port, set `MONGO_URI` accordingly (e.g. `mongodb://mongodb:27017/honorbot` only works from inside the Docker network)

- To keep only the PBZ playlist: run `node init-playlists.js` on the host with the same `MONGO_URI`

#### Docker Commands

```bash
# Start bot
docker-compose up -d

# Stop bot
docker-compose down

# View logs
docker-compose logs -f phantom-radio

# Rebuild after code changes
docker-compose up -d --build

# Restart bot
docker-compose restart phantom-radio
```

## Rebuild after code changes

If you change display text (e.g. placeholders, messages) or add new buttons, **rebuild and restart** so the bot uses the new code:

- **Docker:** `docker-compose up -d --build`
- **Local:** `npm run build` then restart the process (`npm start` or `node dist/index.js`)

## Environment Variables

| Variable                                  | Description                                                    |
| ----------------------------------------- | -------------------------------------------------------------- |
| `DISCORD_TOKEN`                           | Phantom Radio bot token                                        |
| `CLIENT_ID`                               | Discord application client ID                                  |
| `GUILD_ID`                                | Server (guild) ID for command deployment                       |
| `MONGO_URI`                               | MongoDB connection string                                      |
| **User Channels**                         |                                                                |
| `PHANTOM_RADIO_VOICE_CHANNEL_ID`          | Voice channel for music playback                               |
| `PHANTOM_RADIO_VOTE_SKIP_CHANNEL_ID`      | Vote Skip only (embed + Vote Skip button)                      |
| `PHANTOM_RADIO_MUSIC_PLAYER_CHANNEL_ID`   | Now Playing display + View Queue button                        |
| `PHANTOM_RADIO_PLAYLIST_CHANNEL_ID`       | Full playlist (multi-page embed, Prev/Next)                    |
| `PHANTOM_RADIO_SONG_SELECTION_CHANNEL_ID` | Join queue + Select Song (one song per turn)                   |
| `PHANTOM_RADIO_MANUAL_CHANNEL_ID`         | Guide message with clickable channel links (<#id>)             |
| **Admin Channels**                        |                                                                |
| `ADMIN_LOGS_CHANNEL_ID`                   | Admin logs - playlist changes, queue, playback events          |
| `ADMIN_PLAYLIST_CHANNEL_ID`               | Admin panel for Add/Remove songs                               |
| `ADMIN_CONTROL_CHANNEL_ID`                | Admin-only: Force Skip / Pause / Resume (emergency or testing) |
| **Legacy**                                |                                                                |
| `PHANTOM_RADIO_TEXT_CHANNEL_ID`           | Fallback text channel                                          |

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
