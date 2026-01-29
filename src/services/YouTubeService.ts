/**
 * YouTube service using yt-dlp (CLI). Reliable for metadata + streaming
 * without decipher/403 issues from YouTube's player changes.
 */

import { spawn } from 'child_process';
import { Readable } from 'stream';

const YT_DLP = 'yt-dlp';

/** Use Android client to reduce 403 when downloading; fallback to web */
const EXTRACTOR_ARGS = 'youtube:player_client=android,web';
const COMMON_ARGS = ['--no-playlist', '--default-search', 'auto', '--extractor-args', EXTRACTOR_ARGS];

/** Shape compatible with existing videoDetails usage */
export interface VideoDetailsLike {
  title: string;
  author: { name: string };
  lengthSeconds: string;
  description: string;
}

export interface GetVideoInfoResult {
  videoDetails: VideoDetailsLike;
}

/** Extract YouTube video ID from URL or return as-is if it looks like an ID */
export function extractVideoId(input: string): string | null {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1]) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

/** Normalize URL for yt-dlp (must be a valid YouTube URL or ID) */
function toYouTubeUrl(input: string): string | null {
  const trimmed = String(input ?? '').trim().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  if (!trimmed) return null;
  const videoId = extractVideoId(trimmed);
  if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

/**
 * Get video metadata via yt-dlp --dump-json.
 */
export function getVideoInfo(urlOrVideoId: string): Promise<GetVideoInfoResult | null> {
  const url = toYouTubeUrl(urlOrVideoId);
  if (!url) return Promise.resolve(null);

  return new Promise((resolve) => {
    const proc = spawn(
      YT_DLP,
      [
        '--dump-json',
        '--no-download',
        '--no-warnings',
        ...COMMON_ARGS,
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const chunks: Buffer[] = [];
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', () => {});

    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const data = JSON.parse(raw) as {
          title?: string;
          uploader?: string;
          duration?: number;
          description?: string;
        };
        resolve({
          videoDetails: {
            title: data.title ?? 'Unknown Title',
            author: { name: data.uploader ?? 'Unknown Artist' },
            lengthSeconds: String(Math.floor(data.duration ?? 0)),
            description: (data.description ?? '').substring(0, 500),
          },
        });
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Get an audio-only Node.js Readable stream for playback via yt-dlp.
 */
export function getAudioStream(videoIdOrUrl: string): Readable {
  const url = toYouTubeUrl(videoIdOrUrl);
  if (!url) throw new Error('Invalid YouTube video ID or URL');

  const proc = spawn(
    YT_DLP,
    [
      '-x',
      '-f', 'bestaudio/best',
      '--no-warnings',
      '-o', '-',
      ...COMMON_ARGS,
      url,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const stdout = proc.stdout;
  if (!stdout) throw new Error('yt-dlp stdout not available');

  proc.stderr.on('data', (chunk: Buffer) => {
    const msg = chunk.toString('utf8').trim();
    if (msg) console.warn('[yt-dlp]', msg);
  });

  proc.on('error', (err) => {
    console.error('[YouTubeService] yt-dlp spawn error:', err);
  });

  return stdout as Readable;
}
