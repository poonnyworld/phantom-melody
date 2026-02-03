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

แต่ละช่องมีหน้าที่ต่างกัน — ตั้งค่า Channel ID ใน `.env` ตามช่องที่สร้างใน Discord

### ช่องสำหรับผู้ใช้ (User channels)

| ช่อง (ตัวอย่างชื่อ)                   | ตัวแปรใน .env                              | ใช้ทำอะไร                                                                                               |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `#phantom-melody-vote-skip`           | `PHANTOM_MELODY_VOTE_SKIP_CHANNEL_ID`      | **โหวตข้ามเพลง** — แสดงเฉพาะ embed + ปุ่ม Vote Skip (โหวตครบ 5 ค่อยข้าม)                                |
| `#phantom-melody-music-player`        | `PHANTOM_MELODY_MUSIC_PLAYER_CHANNEL_ID`   | **เพลงที่กำลังเล่น + ดูคิว** — แสดง Now Playing (ชื่อเพลง, progress bar, คิวถัดไป) และปุ่ม View Queue   |
| `#phantom-melody-playlist`            | `PHANTOM_MELODY_PLAYLIST_CHANNEL_ID`       | **รายชื่อเพลงทั้งหมด** — embed หลายหน้า หน้าละ 8 เพลง พร้อมปุ่ม Previous / Next                         |
| `#phantom-melody-song-selection`      | `PHANTOM_MELODY_SONG_SELECTION_CHANNEL_ID` | **เข้าคิวเลือกเพลง** — Join Queue → ได้เทิร์นแล้วกด Select Song (เห็นเฉพาะตัวเอง), คนละ 1 เพลงต่อเทิร์น |
| `#phantom-melody-manual`              | `PHANTOM_MELODY_MANUAL_CHANNEL_ID`         | **คู่มือการใช้งาน** — บอทโพสต์ embed บอกแนวทางและลิงก์ไปแต่ละช่อง (กดแล้วกระโดดไปช่องนั้น)              |
| Voice channel (เช่น `phantom-melody`) | `PHANTOM_MELODY_VOICE_CHANNEL_ID`          | **ห้องเสียง** — เล่นเพลงและบังคับให้ผู้ฟังอยู่ห้องนี้เท่านั้น                                           |

### ช่องสำหรับแอดมิน (Admin channels)

| ช่อง (ตัวอย่างชื่อ)              | ตัวแปรใน .env               | ใช้ทำอะไร                                                                    |
| -------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `#admin-phantom-melody-logs`     | `ADMIN_LOGS_CHANNEL_ID`     | **Log** — แสดงเหตุการณ์เพิ่มเพลงลงคิว, เล่น, ข้าม, ลบแทร็ก ฯลฯ               |
| `#admin-phantom-melody-playlist` | `ADMIN_PLAYLIST_CHANNEL_ID` | **จัดการเพลย์ลิสต์** — ปุ่ม View & Remove สำหรับดู/ลบแทร็กในเพลย์ลิสต์       |
| `#admin-phantom-melody-control`  | `ADMIN_CONTROL_CHANNEL_ID`  | **ควบคุมฉุกเฉิน/ทดสอบ** — ปุ่ม Force Skip, Pause, Resume (ใช้ได้เฉพาะแอดมิน) |

### ช่องอื่น (ไม่บังคับ)

| ช่อง                   | หมายเหตุ                                                               |
| ---------------------- | ---------------------------------------------------------------------- |
| `#phantom-melody-chat` | ช่องแชททั่วไป ไม่มีตัวแปรใน .env — ใช้คุยหรือถามเรื่องบอทได้ตามต้องการ |

## User Interface

### ช่อง Vote Skip (`#phantom-melody-vote-skip`)

- Embed "♫ Music Player Controls" + ปุ่ม **Vote Skip**
- โหวตครบ 5 คน ถึงจะข้ามเพลงปัจจุบัน

### ช่อง Music Player (`#phantom-melody-music-player`)

- **Now Playing** — ชื่อเพลง, artist, progress bar, เวลา, ผู้ขอ, คิวถัดไป (ประมาณ 5 เพลง)
- ปุ่ม **View Queue** — กดแล้วแสดงคิวทั้งหมด (ข้อความเห็นเฉพาะคนกด)

### ช่อง Song Selection (`#phantom-melody-song-selection`)

1. **Embed รายการเพลง** — จำนวนแทร็ก + ข้อความให้ Join queue แล้วกด Select Song
2. **Song Selection Queue** — ใครกำลังเลือก, เวลาคงเหลือ, รายชื่อคนรอ, ปุ่ม Join Queue / Leave / Select Song
3. เมื่อถึงเทิร์น จะได้ข้อความแบบเห็นเฉพาะตัวเอง (ephemeral) พร้อม dropdown เลือกเพลง

### ช่อง Playlist (`#phantom-melody-playlist`)

- Embed รายชื่อเพลงหลายหน้า (8 เพลงต่อหน้า)
- ปุ่ม **Previous** / **Next** สำหรับเลื่อนหน้า

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

#### BGM / PBZ playlist เมื่อรัน Docker

- ใส่ไฟล์ BGM `.wav` ในโฟลเดอร์ `./music/pbz/` บนโฮสต์ (โฟลเดอร์นี้ถูก mount เข้า container)
- แก้ `config/pbz-bgm-tracks.js` ให้ตรงกับชื่อไฟล์ แล้วรัน seed **บนโฮสต์** (Mongo อยู่ในการ์ดของ Docker):

  ```bash
  # บนโฮสต์ (จาก phantom-melody/)
  MONGO_URI=mongodb://localhost:27017/honorbot npm run seed-pbz-bgm
  ```

  ถ้า Mongo อยู่คนละเครื่อง/port ให้ใช้ค่า MONGO_URI ให้ตรงกับที่ container ใช้ (เช่น `mongodb://mongodb:27017/honorbot` ใช้ได้เฉพาะจากภายใน Docker network)

- ลบเพลย์ลิสต์เก่าเหลือแค่ PBZ: `node init-playlists.js` (รันบนโฮสต์ พร้อม MONGO_URI เดียวกัน)

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

## Rebuild after code changes

If you change display text (e.g. placeholders, messages) or add new buttons, **rebuild and restart** so the bot uses the new code:

- **Docker:** `docker-compose up -d --build`
- **Local:** `npm run build` then restart the process (`npm start` or `node dist/index.js`)

## Environment Variables

| Variable                                   | Description                                                    |
| ------------------------------------------ | -------------------------------------------------------------- |
| `DISCORD_TOKEN`                            | Phantom Melody bot token                                       |
| `CLIENT_ID`                                | Discord application client ID                                  |
| `GUILD_ID`                                 | Server (guild) ID for command deployment                       |
| `MONGO_URI`                                | MongoDB connection string                                      |
| **User Channels**                          |                                                                |
| `PHANTOM_MELODY_VOICE_CHANNEL_ID`          | Voice channel for music playback                               |
| `PHANTOM_MELODY_VOTE_SKIP_CHANNEL_ID`      | Vote Skip only (embed + Vote Skip button)                      |
| `PHANTOM_MELODY_MUSIC_PLAYER_CHANNEL_ID`   | Now Playing display + View Queue button                        |
| `PHANTOM_MELODY_PLAYLIST_CHANNEL_ID`       | Full playlist (multi-page embed, Prev/Next)                    |
| `PHANTOM_MELODY_SONG_SELECTION_CHANNEL_ID` | Join queue + Select Song (one song per turn)                   |
| `PHANTOM_MELODY_MANUAL_CHANNEL_ID`         | Guide message with clickable channel links (<#id>)             |
| **Admin Channels**                         |                                                                |
| `ADMIN_LOGS_CHANNEL_ID`                    | Admin logs - playlist changes, queue, playback events          |
| `ADMIN_PLAYLIST_CHANNEL_ID`                | Admin panel for Add/Remove songs                               |
| `ADMIN_CONTROL_CHANNEL_ID`                 | Admin-only: Force Skip / Pause / Resume (emergency or testing) |
| **Legacy**                                 |                                                                |
| `PHANTOM_MELODY_TEXT_CHANNEL_ID`           | Fallback text channel                                          |

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
