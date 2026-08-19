import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPendingInstagramDownload, normalizeInstagramUrl } from '../src/instagram.js';

const ROOT = normalize(join(fileURLToPath(new URL('..', import.meta.url))));
const PUBLIC_ROOT = ROOT;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

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

  sendJson(res, 202, buildPendingInstagramDownload(normalized, body.quality));
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

    if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed.' });
  });
}
