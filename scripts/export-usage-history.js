#!/usr/bin/env node
/**
 * Export Phantom Radio / Phantom Melody usage history from MongoDB for customer reports.
 * Outputs:
 *   1. usage-history-YYYY-MM-DD.json / .csv — ListeningHistory (who listened, when, duration).
 *      Optional: --from YYYY-MM-DD --to YYYY-MM-DD to filter by date (e.g. --from 2026-02-01 --to 2026-02-29 for February).
 *   2. track-usage-summary-YYYY-MM-DD.json / .csv — Per-track play counts (playCount = all-time, monthlyPlayCount = current month).
 *   3. playback-log-* — PlaybackLogEntry events, if collection exists.
 *
 * Usage:
 *   MONGO_URI=mongodb://localhost:27017/honorbot node scripts/export-usage-history.js
 *   node scripts/export-usage-history.js --from 2026-02-01 --to 2026-02-29
 *   From Docker: docker exec phantom-radio-bot node scripts/export-usage-history.js [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *   Or: npm run export-usage
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not set. Set it in .env or: MONGO_URI=mongodb://... node scripts/export-usage-history.js');
  process.exit(1);
}

const outDir = process.argv.includes('--out-dir')
  ? process.argv[process.argv.indexOf('--out-dir') + 1]
  : path.join(__dirname, '..');
const dateStr = new Date().toISOString().slice(0, 10);
const baseName = `usage-history-${dateStr}`;

function parseArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return null;
  const d = new Date(process.argv[i + 1]);
  return isNaN(d.getTime()) ? null : d;
}
const fromDate = parseArg('--from');
const toDate = parseArg('--to');

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB');

    const db = mongoose.connection.db;
    const listeningCol = db.collection('listeninghistories');
    const tracksCol = db.collection('tracks');
    const usersCol = db.collection('users');

    let query = {};
    if (fromDate || toDate) {
      query.listenedAt = {};
      if (fromDate) query.listenedAt.$gte = fromDate;
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.listenedAt.$lte = end;
      }
    }
    const history = await listeningCol.find(query).sort({ listenedAt: -1 }).toArray();
    if (fromDate || toDate) {
      console.log(`Date filter: --from ${fromDate ? fromDate.toISOString().slice(0, 10) : 'any'} --to ${toDate ? toDate.toISOString().slice(0, 10) : 'any'}`);
    }
    console.log(`Found ${history.length} listening history records.`);

    const trackIds = [...new Set(history.map((h) => h.trackId))];
    const trackMap = {};
    if (trackIds.length > 0) {
      const tracks = await tracksCol.find({ trackId: { $in: trackIds } }).toArray();
      tracks.forEach((t) => { trackMap[t.trackId] = t; });
    }

    const userIds = [...new Set(history.map((h) => h.userId))];
    const userMap = {};
    if (userIds.length > 0) {
      const users = await usersCol.find({ userId: { $in: userIds } }).toArray();
      users.forEach((u) => { userMap[u.userId] = u; });
    }

    const rows = history.map((h) => {
      const track = trackMap[h.trackId];
      const user = userMap[h.userId];
      return {
        listenedAt: h.listenedAt,
        userId: h.userId,
        username: (user && user.username) || '',
        trackId: h.trackId,
        trackTitle: (track && track.title) || '',
        trackArtist: (track && track.artist) || '',
        durationSeconds: h.duration || 0,
        completed: !!h.completed,
      };
    });

    const jsonPath = path.join(outDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf8');
    console.log(`✓ Wrote ${jsonPath}`);

    const headers = ['listenedAt', 'userId', 'username', 'trackId', 'trackTitle', 'trackArtist', 'durationSeconds', 'completed'];
    const csvLines = [headers.join(',')];
    for (const r of rows) {
      const escape = (v) => {
        const s = String(v == null ? '' : v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      csvLines.push(headers.map((k) => escape(r[k])).join(','));
    }
    const csvPath = path.join(outDir, `${baseName}.csv`);
    fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
    console.log(`✓ Wrote ${csvPath}`);

    console.log('\nDone. Use these files for your customer report.');

    // Track usage summary (play counts) — สรุปว่าแต่ละเพลงถูกเล่นไปกี่ครั้ง (all-time + เดือนนี้)
    const tracks = await tracksCol.find({}).sort({ playCount: -1 }).toArray();
    const trackUsage = tracks.map((t) => ({
      trackId: t.trackId,
      title: t.title,
      artist: t.artist || '',
      playCount: t.playCount || 0,
      monthlyPlayCount: t.monthlyPlayCount || 0,
    }));
    const trackUsagePath = path.join(outDir, `track-usage-summary-${dateStr}.json`);
    fs.writeFileSync(trackUsagePath, JSON.stringify(trackUsage, null, 2), 'utf8');
    console.log(`✓ Wrote ${trackUsagePath} (${trackUsage.length} tracks)`);
    const trackCsvPath = path.join(outDir, `track-usage-summary-${dateStr}.csv`);
    const trackHeaders = ['trackId', 'title', 'artist', 'playCount', 'monthlyPlayCount'];
    const trackCsvLines = [trackHeaders.join(',')];
    for (const r of trackUsage) {
      const escape = (v) => {
        const s = String(v == null ? '' : v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      trackCsvLines.push(trackHeaders.map((k) => escape(r[k])).join(','));
    }
    fs.writeFileSync(trackCsvPath, trackCsvLines.join('\n'), 'utf8');
    console.log(`✓ Wrote ${trackCsvPath}`);

    if (history.length === 0) {
      console.log('\n⚠️  No listening-history records. ListeningHistory is recorded when users stay in the Phantom Radio voice channel for at least 10 seconds and then leave. Ensure MONGO_URI points to the same DB the bot uses. From this deploy onward, leaving-voice events will be saved (bug fix applied).');
    }

    // Also export playback log (Queued / Now playing / Skipped) if collection exists
    try {
      const playbackCol = db.collection('playbacklogentries');
      const playbackCount = await playbackCol.countDocuments();
      if (playbackCount > 0) {
        const playbackLog = await playbackCol.find({}).sort({ timestamp: -1 }).limit(500).toArray();
        const playbackPath = path.join(outDir, `playback-log-${dateStr}.json`);
        fs.writeFileSync(playbackPath, JSON.stringify(playbackLog, null, 2), 'utf8');
        console.log(`✓ Wrote ${playbackPath} (${playbackLog.length} events)`);
        const csvLinesP = ['timestamp', 'type', 'message'].join(',');
        const csvRows = playbackLog.map((p) => {
          const escape = (v) => {
            const s = String(v == null ? '' : v);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
            return s;
          };
          return [p.timestamp, p.type, p.message].map(escape).join(',');
        });
        fs.writeFileSync(path.join(outDir, `playback-log-${dateStr}.csv`), [csvLinesP, ...csvRows].join('\n'), 'utf8');
        console.log(`✓ Wrote playback-log-${dateStr}.csv`);
      }
    } catch (e) {
      // Collection may not exist yet (old DBs)
    }
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
