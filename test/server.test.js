import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp, resetRateLimiter } from '../server/app.js';

function listen(app) {
  return new Promise((resolve) => {
    app.listen(0, () => {
      resolve(app.address().port);
    });
  });
}

test('POST /api/download/instagram returns ready download payload for valid Instagram URLs', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download/instagram`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://www.instagram.com/reel/C3x9P2xL8aZ/',
        quality: '1080p'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ready');
    assert.equal(payload.platform, 'instagram');
    assert.equal(payload.type, 'reel');
    assert.equal(payload.shortcode, 'C3x9P2xL8aZ');
    assert.ok(payload.downloadUrl);
    assert.ok(payload.downloadUrl.startsWith('/api/download/file'));
  } finally {
    app.close();
  }
});

test('POST /api/download/youtube returns ready download payload for valid YouTube URLs', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download/youtube`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://youtu.be/k6BnSIs3XUQ?si=WUwSQ5f_us33ezxA',
        quality: '1080p'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ready');
    assert.equal(payload.platform, 'youtube');
    assert.equal(payload.type, 'video');
    assert.equal(payload.videoId, 'k6BnSIs3XUQ');
    assert.ok(payload.downloadUrl);
    assert.ok(payload.downloadUrl.startsWith('/api/download/file'));
  } finally {
    app.close();
  }
});

test('POST /api/download/youtube rejects unsupported URLs', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download/youtube`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://example.com/watch?v=123'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /Only YouTube URLs/);
  } finally {
    app.close();
  }
});

test('GET /api/download/file proxies media stream with content-disposition header for permitted domain', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    const targetMediaUrl = 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const response = await fetch(`http://127.0.0.1:${port}/api/download/file?url=${encodeURIComponent(targetMediaUrl)}&filename=test-reel.mp4`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="test-reel.mp4"');
  } finally {
    app.close();
  }
});

test('POST /api/download/instagram rejects unsupported URLs', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download/instagram`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://example.com/video/123'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /Only Instagram URLs/);
  } finally {
    app.close();
  }
});

test('POST /api/download/x returns pending metadata for valid X status URLs', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download/x`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://twitter.com/tech/status/1758291048291?s=20',
        quality: '720p'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 202);
    assert.equal(payload.platform, 'x');
    assert.equal(payload.type, 'status');
    assert.equal(payload.username, 'tech');
    assert.equal(payload.statusId, '1758291048291');
    assert.equal(payload.canonicalUrl, 'https://x.com/tech/status/1758291048291');
    assert.equal(payload.requestedQuality, '720p');
    assert.equal(payload.downloadUrl, null);
  } finally {
    app.close();
  }
});

test('POST /api/download/x rejects unsupported URLs', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download/x`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://example.com/status/1758291048291'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /Only X\/Twitter URLs/);
  } finally {
    app.close();
  }
});

test('Static file serving isolates public frontend assets and blocks internal project files', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    // Permitted frontend files
    const indexRes = await fetch(`http://127.0.0.1:${port}/index.html`);
    assert.equal(indexRes.status, 200);

    const rootRes = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(rootRes.status, 200);

    const cssRes = await fetch(`http://127.0.0.1:${port}/src/styles.css`);
    assert.equal(cssRes.status, 200);

    // Forbidden internal server, test, configuration, and repository files
    const serverCodeRes = await fetch(`http://127.0.0.1:${port}/server/app.js`);
    assert.equal(serverCodeRes.status, 403);

    const packageJsonRes = await fetch(`http://127.0.0.1:${port}/package.json`);
    assert.equal(packageJsonRes.status, 403);

    const testFileRes = await fetch(`http://127.0.0.1:${port}/test/server.test.js`);
    assert.equal(testFileRes.status, 403);

    const gitConfigRes = await fetch(`http://127.0.0.1:${port}/.git/config`);
    assert.equal(gitConfigRes.status, 403);

    // Path traversal attempt
    const traversalRes = await fetch(`http://127.0.0.1:${port}/src/../server/app.js`);
    assert.equal(traversalRes.status, 403);
  } finally {
    app.close();
  }
});

test('SSRF prevention blocks internal loopback, private IP, and arbitrary domain targets', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    // Loopback target
    const localhostRes = await fetch(`http://127.0.0.1:${port}/api/download/file?url=${encodeURIComponent('http://localhost:5173/package.json')}`);
    assert.equal(localhostRes.status, 403);

    // IPv4 address target
    const ipRes = await fetch(`http://127.0.0.1:${port}/api/download/file?url=${encodeURIComponent('http://127.0.0.1:5173/server/app.js')}`);
    assert.equal(ipRes.status, 403);

    // AWS metadata endpoint target
    const metadataRes = await fetch(`http://127.0.0.1:${port}/api/download/file?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`);
    assert.equal(metadataRes.status, 403);

    // Unsupported protocol target
    const ftpRes = await fetch(`http://127.0.0.1:${port}/api/download/file?url=${encodeURIComponent('ftp://youtube.com/video.mp4')}`);
    assert.equal(ftpRes.status, 403);

    // Unpermitted domain target
    const externalRes = await fetch(`http://127.0.0.1:${port}/api/download/file?url=${encodeURIComponent('https://evil.com/malware.mp4')}`);
    assert.equal(externalRes.status, 403);
  } finally {
    app.close();
  }
});

test('URL validation rejects non-HTTP/HTTPS protocols across endpoints', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    const fileSchemeRes = await fetch(`http://127.0.0.1:${port}/api/download/youtube`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'file:///etc/passwd' })
    });
    assert.equal(fileSchemeRes.status, 400);

    const jsSchemeRes = await fetch(`http://127.0.0.1:${port}/api/download/instagram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'javascript:alert(1)' })
    });
    assert.equal(jsSchemeRes.status, 400);
  } finally {
    app.close();
  }
});

test('Rejects oversized request body payloads with 413 Payload Too Large', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    const oversizedUrl = 'https://www.youtube.com/watch?v=' + 'a'.repeat(70000);
    const response = await fetch(`http://127.0.0.1:${port}/api/download/youtube`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: oversizedUrl })
    });

    assert.equal(response.status, 413);
    const payload = await response.json();
    assert.match(payload.error, /exceeds maximum size limit/);
  } finally {
    app.close();
  }
});

test('Enforces rate limiting on API endpoints with 429 Too Many Requests', async () => {
  resetRateLimiter();
  const app = createApp();
  const port = await listen(app);

  try {
    // Send 60 allowed requests with specific test IP
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/download/x`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.42'
        },
        body: JSON.stringify({ url: 'https://x.com/tech/status/1758291048291' })
      });
      assert.notEqual(res.status, 429);
    }

    // Request 61 should trigger rate limiting
    const blockedRes = await fetch(`http://127.0.0.1:${port}/api/download/x`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.42'
      },
      body: JSON.stringify({ url: 'https://x.com/tech/status/1758291048291' })
    });

    assert.equal(blockedRes.status, 429);
    assert.equal(blockedRes.headers.get('retry-after'), '60');
    const payload = await blockedRes.json();
    assert.match(payload.error, /Too many requests/);
  } finally {
    resetRateLimiter();
    app.close();
  }
});

test('Enforces CORS when ALLOWED_ORIGINS environment variable is set', async () => {
  resetRateLimiter();
  const origAllowedOrigins = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = 'https://trusted-frontend.example.com';

  const app = createApp();
  const port = await listen(app);

  try {
    // Preflight OPTIONS request from trusted origin
    const optionsRes = await fetch(`http://127.0.0.1:${port}/api/download/youtube`, {
      method: 'OPTIONS',
      headers: { 'origin': 'https://trusted-frontend.example.com' }
    });
    assert.equal(optionsRes.status, 204);
    assert.equal(optionsRes.headers.get('access-control-allow-origin'), 'https://trusted-frontend.example.com');

    // POST request from untrusted origin
    const untrustedRes = await fetch(`http://127.0.0.1:${port}/api/download/youtube`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': 'https://untrusted-domain.com'
      },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=k6BnSIs3XUQ' })
    });
    assert.equal(untrustedRes.headers.get('access-control-allow-origin'), null);
  } finally {
    if (origAllowedOrigins !== undefined) {
      process.env.ALLOWED_ORIGINS = origAllowedOrigins;
    } else {
      delete process.env.ALLOWED_ORIGINS;
    }
    app.close();
  }
});
