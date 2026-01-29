# Music Files Directory

This directory contains local MP3 files for the Phantom Melody bot.

## Directory Structure

```
music/
├── battle/       # Battle/action music
├── story/        # Story/narrative music
├── exploration/  # Exploration/adventure music
├── emotional/    # Emotional/dramatic music
├── ambient/      # Ambient/background music
└── hidden/       # Hidden/treasure tracks (unlockable)
```

## File Naming Convention

Files should be named using the track ID:

- `{category}/{trackId}.mp3`
- Example: `battle/battle-001.mp3`

## Adding New Tracks

1. Place the MP3 file in the appropriate category folder
2. Update the database with the track information using the migration script
3. Set `localPath` to the relative path (e.g., `battle/battle-001.mp3`)
4. Set `audioSource` to `local`

## Audio Requirements

- Format: MP3
- Bitrate: 128-320 kbps recommended
- Sample Rate: 44.1 kHz or 48 kHz

## Copyright Notice

All music files in this directory must be:

- Original compositions
- Licensed for use (purchased license)
- Creative Commons licensed
- Public domain

**Do NOT include copyrighted music without proper licensing.**
