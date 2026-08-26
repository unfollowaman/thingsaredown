import { execFile, spawn } from 'node:child_process';
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
    '--socket-timeout', '10',
    '--js-runtimes', 'deno,node'
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

export function parseProgressLine(line) {
  if (!line || typeof line !== 'string') return null;
  const str = line.trim();

  // Handle structured template line: "ytdljob:<status>|<percent>|<downloaded>|<total>|<speed>|<eta>"
  if (str.startsWith('ytdljob:')) {
    const parts = str.slice(8).split('|');
    const statusStr = parts[0]?.trim() || 'downloading';
    const percentStr = parts[1]?.replace('%', '').trim();
    const percent = percentStr ? parseFloat(percentStr) : 0;
    const downloaded = parts[2] ? parseInt(parts[2], 10) : 0;
    const total = parts[3] ? parseInt(parts[3], 10) : 0;
    const speed = parts[4]?.trim() || null;
    const eta = parts[5]?.trim() || null;

    let state = 'downloading';
    if (statusStr === 'finished' || percent >= 100) {
      state = 'processing';
    }

    return {
      status: state,
      progress: Math.min(99, Math.max(0, isNaN(percent) ? 0 : percent)),
      downloadedBytes: isNaN(downloaded) ? 0 : downloaded,
      totalBytes: isNaN(total) ? 0 : total,
      speed: speed && speed !== 'NA' ? speed : null,
      eta: eta && eta !== 'NA' ? eta : null
    };
  }

  // Detect FFmpeg / post-processing indicators
  if (
    str.includes('[Merger]') ||
    str.includes('[ExtractAudio]') ||
    str.includes('[VideoConvertor]') ||
    str.includes('[FixupM3u8]') ||
    str.includes('[ffmpeg]') ||
    str.includes('[Exec]')
  ) {
    return {
      status: 'processing',
      progress: 99,
      speed: null,
      eta: null
    };
  }

  // Standard fallback yt-dlp line: "[download]  45.2% of  10.50MiB at  2.10MiB/s ETA 00:05"
  const stdMatch = str.match(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\s*\w+)?\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/i);
  if (stdMatch) {
    const percent = parseFloat(stdMatch[1]);
    return {
      status: percent >= 100 ? 'processing' : 'downloading',
      progress: Math.min(99, Math.max(0, isNaN(percent) ? 0 : percent)),
      speed: stdMatch[3] !== 'NA' ? stdMatch[3] : null,
      eta: stdMatch[4] !== 'NA' ? stdMatch[4] : null
    };
  }

  return null;
}

export async function downloadMedia({ url, quality = '1080p', platform = 'media', onProgress, onProcess }) {
  const { ytdlpPath } = getBinaryPaths();
  const ffmpegDir = getFfmpegDir();

  const fileId = randomBytes(8).toString('hex');
  const outputTemplate = join(TEMP_DIR, `${fileId}-%(title)s.%(ext)s`);

  const args = [
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '15',
    '--js-runtimes', 'deno,node',
    '--newline',
    '--progress-template', 'ytdljob:%(progress.status)s|%(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress._speed_str)s|%(progress._eta_str)s',
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

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(ytdlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return reject(new Error(`Failed to spawn yt-dlp process: ${err.message}`));
    }

    if (onProcess && typeof onProcess === 'function') {
      onProcess(child);
    }

    let stderrBuffer = '';
    let lineRemainder = '';

    const handleData = (chunk) => {
      const text = lineRemainder + chunk.toString('utf8');
      const lines = text.split(/\r?\n|\r/);
      lineRemainder = lines.pop() || '';

      for (const line of lines) {
        if (!line) continue;
        const parsed = parseProgressLine(line);
        if (parsed && onProgress && typeof onProgress === 'function') {
          onProgress(parsed);
        }
      }
    };

    child.stdout.on('data', handleData);
    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString('utf8');
      handleData(chunk);
    });

    child.on('error', (err) => {
      cleanupPartialFiles(fileId);
      reject(new Error(`yt-dlp error: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        cleanupPartialFiles(fileId);
        const e = new Error('Download process was terminated.');
        e.statusCode = 499;
        return reject(e);
      }

      if (code !== 0) {
        cleanupPartialFiles(fileId);
        const errorMsg = stderrBuffer || `Process exited with code ${code}`;
        if (errorMsg.includes('Requested format is not available')) {
          const e = new Error(`Requested quality '${quality}' is not available for this media.`);
          e.statusCode = 422;
          return reject(e);
        }
        const e = new Error(`Download failed: ${errorMsg.slice(0, 200)}`);
        e.statusCode = 422;
        return reject(e);
      }

      try {
        const files = readdirSync(TEMP_DIR);
        const matchedFile = files.find((f) => f.startsWith(`${fileId}-`));

        if (!matchedFile) {
          throw new Error('Downloaded file was not created.');
        }

        const fullPath = join(TEMP_DIR, matchedFile);
        const safeFilename = `${platform}-${fileId}${extname(matchedFile)}`;

        const registered = registerTempFile(fullPath, safeFilename);

        resolve({
          token: registered.token,
          filename: registered.filename,
          filePath: fullPath,
          downloadUrl: `/api/download/file?token=${registered.token}&filename=${encodeURIComponent(registered.filename)}`
        });
      } catch (err) {
        cleanupPartialFiles(fileId);
        const e = new Error(`Finalizing download failed: ${err.message}`);
        e.statusCode = 500;
        reject(e);
      }
    });
  });
}

function cleanupPartialFiles(fileId) {
  try {
    const files = readdirSync(TEMP_DIR);
    for (const f of files) {
      if (f.startsWith(`${fileId}-`)) {
        try { unlinkSync(join(TEMP_DIR, f)); } catch {}
      }
    }
  } catch {}
}
