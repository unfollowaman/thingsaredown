import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const TEMP_DIR = '/tmp/things-are-down-downloads';

try {
  mkdirSync(TEMP_DIR, { recursive: true });
} catch {
  // Directory may already exist or error handled elsewhere
}

function findExecutable(name, envVar) {
  if (process.env[envVar] && existsSync(process.env[envVar])) {
    return process.env[envVar];
  }

  const pathDirs = (process.env.PATH || '').split(':').filter(Boolean);
  const extraDirs = ['/tmp/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  const searchDirs = Array.from(new Set([...pathDirs, ...extraDirs]));

  for (const dir of searchDirs) {
    const fullPath = join(dir, name);
    if (existsSync(fullPath)) {
      try {
        const stats = statSync(fullPath);
        if (stats.isFile()) {
          return fullPath;
        }
      } catch {
        // Continue searching
      }
    }
  }

  return name;
}

export function getBinaryPaths() {
  const ytdlpPath = findExecutable('yt-dlp', 'YTDLP_PATH');
  const ffmpegPath = findExecutable('ffmpeg', 'FFMPEG_PATH');
  return { ytdlpPath, ffmpegPath };
}

export function getFfmpegDir() {
  const { ffmpegPath } = getBinaryPaths();
  if (ffmpegPath && ffmpegPath.includes('/')) {
    return join(ffmpegPath, '..');
  }
  return null;
}

const activeTempFiles = new Map();

export function registerTempFile(filePath, originalFilename) {
  const token = randomUUID();
  const fileInfo = {
    token,
    filePath,
    filename: originalFilename || basename(filePath),
    createdAt: Date.now()
  };
  activeTempFiles.set(token, fileInfo);
  return fileInfo;
}

export function getTempFile(token) {
  return activeTempFiles.get(token) || null;
}

export function removeTempFile(token) {
  const info = activeTempFiles.get(token);
  if (info) {
    activeTempFiles.delete(token);
    try {
      if (existsSync(info.filePath)) {
        unlinkSync(info.filePath);
      }
    } catch (err) {
      console.error(`Failed to delete temp file ${info.filePath}:`, err);
    }
  }
}

export function cleanupExpiredTempFiles(ttlMs = 15 * 60 * 1000) {
  const now = Date.now();
  for (const [token, info] of activeTempFiles.entries()) {
    if (now - info.createdAt > ttlMs) {
      removeTempFile(token);
    }
  }
}

setInterval(cleanupExpiredTempFiles, 5 * 60 * 1000).unref();

function cleanupAllTempFilesOnExit() {
  for (const token of Array.from(activeTempFiles.keys())) {
    removeTempFile(token);
  }
}

process.on('SIGINT', () => {
  cleanupAllTempFilesOnExit();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanupAllTempFilesOnExit();
  process.exit(0);
});

function formatDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '00:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return `${mm}:${ss}`;
}

export async function extractMediaInfo(targetUrl) {
  const { ytdlpPath } = getBinaryPaths();
  const ffmpegDir = getFfmpegDir();

  const args = [
    '--dump-json',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '10'
  ];

  if (ffmpegDir) {
    args.push('--ffmpeg-location', ffmpegDir);
  }

  args.push(targetUrl);

  try {
    const { stdout } = await execFileAsync(ytdlpPath, args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000
    });

    const info = JSON.parse(stdout.trim());
    const availableQualities = new Set();

    if (Array.isArray(info.formats)) {
      for (const fmt of info.formats) {
        if (fmt.height) {
          if (fmt.height >= 1080) availableQualities.add('1080p');
          else if (fmt.height >= 720) availableQualities.add('720p');
          else if (fmt.height >= 480) availableQualities.add('480p');
          else if (fmt.height >= 360) availableQualities.add('360p');
        }
      }
    }

    const formats = Array.from(availableQualities);
    if (!formats.includes('1080p') && !formats.includes('720p')) {
      formats.unshift('1080p', '720p');
    }
    formats.push('Audio');

    return {
      title: info.title || info.fulltitle || 'Media Title',
      thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails[0]?.url) || null,
      duration: formatDuration(info.duration),
      durationSeconds: info.duration || 0,
      formats,
      extractor: info.extractor,
      id: info.id
    };
  } catch (err) {
    const errorMsg = err.stderr || err.message || '';
    if (errorMsg.includes('Unsupported URL') || errorMsg.includes('is not a valid URL')) {
      const e = new Error('Unsupported or invalid media URL.');
      e.statusCode = 400;
      throw e;
    }
    if (errorMsg.includes('Private video') || errorMsg.includes('login') || errorMsg.includes('empty media response')) {
      const e = new Error('Media is private, restricted, or requires authentication.');
      e.statusCode = 422;
      throw e;
    }
    const e = new Error(`Extraction failed: ${errorMsg.slice(0, 200)}`);
    e.statusCode = 422;
    throw e;
  }
}

export async function downloadMedia({ url, quality = '1080p', platform = 'media' }) {
  const { ytdlpPath } = getBinaryPaths();
  const ffmpegDir = getFfmpegDir();

  const fileId = randomBytes(8).toString('hex');
  const outputTemplate = join(TEMP_DIR, `${fileId}-%(title)s.%(ext)s`);

  const args = [
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '15',
    '-o', outputTemplate
  ];

  if (ffmpegDir) {
    args.push('--ffmpeg-location', ffmpegDir);
  }

  const isAudio = String(quality).toLowerCase() === 'audio';

  if (isAudio) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    let maxHeights = 1080;
    if (quality === '720p') maxHeights = 720;
    else if (quality === '480p') maxHeights = 480;
    else if (quality === '360p') maxHeights = 360;

    args.push('-f', `bestvideo[height<=${maxHeights}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${maxHeights}]+bestaudio/best[height<=${maxHeights}]/best`);
    args.push('--merge-output-format', 'mp4');
  }

  args.push(url);

  try {
    await execFileAsync(ytdlpPath, args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000
    });

    const files = readdirSync(TEMP_DIR);
    const matchedFile = files.find((f) => f.startsWith(`${fileId}-`));

    if (!matchedFile) {
      throw new Error('Downloaded file was not created.');
    }

    const fullPath = join(TEMP_DIR, matchedFile);
    const safeFilename = `${platform}-${fileId}${extname(matchedFile)}`;

    const registered = registerTempFile(fullPath, safeFilename);

    return {
      token: registered.token,
      filename: registered.filename,
      filePath: fullPath,
      downloadUrl: `/api/download/file?token=${registered.token}&filename=${encodeURIComponent(registered.filename)}`
    };
  } catch (err) {
    const files = readdirSync(TEMP_DIR);
    for (const f of files) {
      if (f.startsWith(`${fileId}-`)) {
        try { unlinkSync(join(TEMP_DIR, f)); } catch {}
      }
    }

    const errorMsg = err.stderr || err.message || '';
    if (errorMsg.includes('Requested format is not available')) {
      const e = new Error(`Requested quality '${quality}' is not available for this media.`);
      e.statusCode = 422;
      throw e;
    }
    const e = new Error(`Download failed: ${errorMsg.slice(0, 200)}`);
    e.statusCode = 422;
    throw e;
  }
}
