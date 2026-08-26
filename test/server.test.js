import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../server/app.js';

function listen(app) {
  return new Promise((resolve) => {
    app.listen(0, () => {
      resolve(app.address().port);
    });
  });
}

test('POST /api/download/instagram returns ready download payload for valid Instagram URLs', async () => {
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

test('GET /api/download/file proxies media stream with content-disposition header', async () => {
  const app = createApp();
  const port = await listen(app);

  try {
    const targetMediaUrl = `http://127.0.0.1:${port}/index.html`;
    const response = await fetch(`http://127.0.0.1:${port}/api/download/file?url=${encodeURIComponent(targetMediaUrl)}&filename=test-reel.mp4`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="test-reel.mp4"');
  } finally {
    app.close();
  }
});

test('POST /api/download/instagram rejects unsupported URLs', async () => {
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
