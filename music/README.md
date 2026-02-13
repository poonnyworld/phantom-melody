# Music Files Directory

This directory contains local audio files for the Phantom Radio bot. Tracks are organized by album in separate folders.

## Directory Structure

One folder per album (slug = folder name). Supported extensions: **.wav** (primary), **.mp3**, **.ogg**.

```
music/
├── 2014_Phantom-Blade-1/
├── 2016_Phantom-Blade-2/
├── 2017_Phantom-Blade-2-Desert/
├── 2023_Phantom-Blade-3/
├── 2025_Phantom-Blade-Zero-Soundtrack/
├── 2009_Rain-Blood-2/
└── 2012_Rain-Blood-Chronicles/
```

Only the **7 album folders** above are used. The sync script and bot do not use the legacy `pbz/` folder. Album slugs must match `src/config/playlists.ts` (`ALBUMS`). Place audio files inside the album folder; the sync script picks up `.wav`, `.mp3`, and `.ogg` files.

## Adding New Tracks

1. Place the audio file (`.wav`, `.mp3`, or `.ogg`) in the correct album folder under `music/`.
2. Run the sync script to update the database and main playlist:
   - From project root: `npm run sync-pbz` (or `npm run sync-pbz:host` if MongoDB is on localhost).
3. Tracks are added/updated with `localPath` = `{albumSlug}/{fileName}` and `albumKey` = album slug.

## Audio Requirements

- **Formats:** WAV (primary), MP3, OGG. All are supported for playback.
- **MP3:** 128–320 kbps recommended.
- **Sample rate:** 44.1 kHz or 48 kHz.

## Copyright Notice

All music files in this directory must be:

- Original compositions
- Licensed for use (purchased license)
- Creative Commons licensed
- Public domain

**Do NOT include copyrighted music without proper licensing.**
