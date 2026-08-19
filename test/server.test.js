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

test('POST /api/download/instagram returns pending metadata for valid Instagram URLs', async () => {
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

    assert.equal(response.status, 202);
    assert.equal(payload.platform, 'instagram');
    assert.equal(payload.type, 'reel');
    assert.equal(payload.shortcode, 'C3x9P2xL8aZ');
    assert.equal(payload.downloadUrl, null);
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
