import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractInstagramMedia, normalizeInstagramUrl } from '../src/instagram.js';
import { buildPendingXDownload, normalizeXUrl } from '../src/x.js';

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
  '127.0.0.1',
  'localhost'
];

function isAllowedUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_STREAM_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];

  for await (const chunk of req) {
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
  } catch {
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
    sendJson(res, 422, { error: err.message || 'Unable to extract Instagram Reel media.' });
  }
}

async function handleXDownload(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    sendJson(res, 400, { error: 'Request body must be valid JSON.' });
    return;
  }

  const normalized = normalizeXUrl(body.url);
  if (!normalized.ok) {
    sendJson(res, 400, { error: normalized.error });
    return;
  }

  sendJson(res, 202, buildPendingXDownload(normalized, body.quality));
}

async function handleFileDelivery(req, res) {
  const reqUrl = new URL(req.url, 'http://localhost');
  const targetUrl = reqUrl.searchParams.get('url');
  const filename = reqUrl.searchParams.get('filename') || 'download.mp4';

  if (!targetUrl) {
    sendJson(res, 400, { error: 'Missing target file URL.' });
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
  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_ROOT, safePath === '/' ? 'index.html' : safePath);

  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403);
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
    if (req.method === 'POST' && req.url === '/api/download/instagram') {
      await handleInstagramDownload(req, res);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/download/x') {
      await handleXDownload(req, res);
      return;
    }

    const parsedUrl = new URL(req.url, 'http://localhost');
    if ((req.method === 'GET' || req.method === 'HEAD') && parsedUrl.pathname === '/api/download/file') {
      await handleFileDelivery(req, res);
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed.' });
  });
}
