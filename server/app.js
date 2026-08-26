import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractInstagramMedia, normalizeInstagramUrl } from '../src/instagram.js';
import { extractXMedia, normalizeXUrl } from '../src/x.js';
import { extractYoutubeMedia, normalizeYoutubeUrl } from '../src/youtube.js';
import { getTempFile, removeTempFile } from './downloader.js';

const ROOT = normalize(join(fileURLToPath(new URL('..', import.meta.url))));
const PUBLIC_ROOT = ROOT;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const ALLOWED_STREAM_DOMAINS = [
  'cdninstagram.com',
  'fbcdn.net',
  'instagram.com',
  'googleapis.com',
  'youtube.com',
  'youtu.be',
  'googlevideo.com'
];

function isAllowedUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();

    // Explicitly reject IP address literals and localhost
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith('[') || hostname === 'localhost') {
      return false;
    }

    return ALLOWED_STREAM_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

const ipRequests = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 15;

export function resetRateLimiter() {
  ipRequests.clear();
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function isRateLimited(ip) {
  const now = Date.now();
  let entry = ipRequests.get(ip);
  if (!entry || now - entry.startTime > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 1, startTime: now };
    ipRequests.set(ip, entry);
    return false;
  }
  entry.count += 1;
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  return false;
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req, maxBytes = 65536) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      const err = new Error('Payload size exceeds limit.');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function handleInstagramDownload(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    if (err.statusCode === 413) {
      sendJson(res, 413, { error: 'Request body exceeds maximum size limit.' });
      return;
    }
    sendJson(res, 400, { error: 'Request body must be valid JSON.' });
    return;
  }

  const normalized = normalizeInstagramUrl(body.url);
  if (!normalized.ok) {
    sendJson(res, 400, { error: normalized.error });
    return;
  }

  try {
    const downloadData = await extractInstagramMedia(normalized, body.quality);
    sendJson(res, 200, downloadData);
  } catch (err) {
    sendJson(res, err.statusCode || 422, { error: err.message || 'Unable to extract Instagram media.' });
  }
}

async function handleXDownload(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    if (err.statusCode === 413) {
      sendJson(res, 413, { error: 'Request body exceeds maximum size limit.' });
      return;
    }
    sendJson(res, 400, { error: 'Request body must be valid JSON.' });
    return;
  }

  const normalized = normalizeXUrl(body.url);
  if (!normalized.ok) {
    sendJson(res, 400, { error: normalized.error });
    return;
  }

  try {
    const downloadData = await extractXMedia(normalized, body.quality);
    sendJson(res, 200, downloadData);
  } catch (err) {
    sendJson(res, err.statusCode || 422, { error: err.message || 'Unable to extract X/Twitter media.' });
  }
}

async function handleYoutubeDownload(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    if (err.statusCode === 413) {
      sendJson(res, 413, { error: 'Request body exceeds maximum size limit.' });
      return;
    }
    sendJson(res, 400, { error: 'Request body must be valid JSON.' });
    return;
  }

  const normalized = normalizeYoutubeUrl(body.url);
  if (!normalized.ok) {
    sendJson(res, 400, { error: normalized.error });
    return;
  }

  try {
    const downloadData = await extractYoutubeMedia(normalized, body.quality);
    sendJson(res, 200, downloadData);
  } catch (err) {
    sendJson(res, err.statusCode || 422, { error: err.message || 'Unable to extract YouTube video media.' });
  }
}

async function handleFileDelivery(req, res) {
  const reqUrl = new URL(req.url, 'http://localhost');
  const token = reqUrl.searchParams.get('token');
  const targetUrl = reqUrl.searchParams.get('url');
  const filename = reqUrl.searchParams.get('filename') || 'download.mp4';

  if (token) {
    const tempFile = getTempFile(token);
    if (!tempFile) {
      sendJson(res, 404, { error: 'File token expired or invalid.' });
      return;
    }

    try {
      const stats = await stat(tempFile.filePath);
      const isAudio = filename.endsWith('.mp3');
      const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';

      res.writeHead(200, {
        'content-type': contentType,
        'content-length': stats.size,
        'content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`
      });

      const stream = createReadStream(tempFile.filePath);
      stream.pipe(res);

      const cleanup = () => removeTempFile(token);
      res.on('finish', cleanup);
      res.on('close', cleanup);
      stream.on('error', () => {
        cleanup();
        if (!res.headersSent) {
          sendJson(res, 500, { error: 'Failed to read downloaded file.' });
        }
      });
      return;
    } catch {
      removeTempFile(token);
      sendJson(res, 404, { error: 'File no longer exists on disk.' });
      return;
    }
  }

  if (!targetUrl) {
    sendJson(res, 400, { error: 'Missing target file URL or token.' });
    return;
  }

  if (!isAllowedUrl(targetUrl)) {
    sendJson(res, 403, { error: 'Access to the requested media URL is forbidden.' });
    return;
  }

  let mediaResponse;
  try {
    mediaResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
  } catch {
    sendJson(res, 502, { error: 'Failed to stream media file.' });
    return;
  }

  if (!mediaResponse.ok) {
    sendJson(res, 502, { error: `Remote media server returned HTTP ${mediaResponse.status}.` });
    return;
  }

  const isAudio = filename.endsWith('.mp3');
  const contentType = isAudio
    ? 'audio/mpeg'
    : (mediaResponse.headers.get('content-type') || 'video/mp4');
  const contentLength = mediaResponse.headers.get('content-length');

  const responseHeaders = {
    'content-type': contentType,
    'content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`
  };

  if (contentLength && !isAudio) {
    responseHeaders['content-length'] = contentLength;
  }

  res.writeHead(200, responseHeaders);

  if (mediaResponse.body && typeof mediaResponse.body.getReader === 'function') {
    const reader = mediaResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } else if (mediaResponse.body) {
    const arrayBuffer = await mediaResponse.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } else {
    res.end();
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');

  // Restrict to intentionally designated public frontend assets only: index.html and /src/*
  const isIndex = safePath === '/' || safePath === '/index.html' || safePath === '\\index.html' || safePath === '\\';
  const isSrcAsset = safePath.startsWith('/src/') || safePath.startsWith('\\src\\') || safePath.startsWith('src/') || safePath.startsWith('src\\');

  if (!isIndex && !isSrcAsset) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  const filePath = join(PUBLIC_ROOT, isIndex ? 'index.html' : safePath);

  const allowedIndexFile = join(PUBLIC_ROOT, 'index.html');
  const allowedSrcDir = join(PUBLIC_ROOT, 'src');

  if (filePath !== allowedIndexFile && !filePath.startsWith(allowedSrcDir + '/') && !filePath.startsWith(allowedSrcDir + '\\')) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new Error('Not a file');
    }

    res.writeHead(200, { 'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

export function createApp() {
  return createServer(async (req, res) => {
    // CORS configuration via ALLOWED_ORIGINS environment variable
    const origin = req.headers.origin;
    const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
    if (allowedOriginsEnv && origin) {
      const allowedList = allowedOriginsEnv.split(',').map((s) => s.trim());
      if (allowedList.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, 'http://localhost');
    const isApi = parsedUrl.pathname.startsWith('/api/');

    if (isApi) {
      const clientIp = getClientIp(req);
      if (isRateLimited(clientIp)) {
        res.setHeader('Retry-After', '60');
        sendJson(res, 429, { error: 'Too many requests. Please try again later.' });
        return;
      }

      if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
        sendJson(res, 503, { error: 'Server busy. Too many concurrent requests.' });
        return;
      }

      activeRequests += 1;
      try {
        if (req.method === 'POST' && req.url === '/api/download/instagram') {
          await handleInstagramDownload(req, res);
          return;
        }

        if (req.method === 'POST' && req.url === '/api/download/x') {
          await handleXDownload(req, res);
          return;
        }

        if (req.method === 'POST' && req.url === '/api/download/youtube') {
          await handleYoutubeDownload(req, res);
          return;
        }

        if ((req.method === 'GET' || req.method === 'HEAD') && parsedUrl.pathname === '/api/download/file') {
          await handleFileDelivery(req, res);
          return;
        }

        sendJson(res, 405, { error: 'Method not allowed.' });
        return;
      } finally {
        activeRequests -= 1;
      }
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed.' });
  });
}
