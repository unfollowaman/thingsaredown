import assert from 'node:assert/strict';
import test from 'node:test';
import { extractInstagramMedia, normalizeInstagramUrl } from '../src/instagram.js';

test('normalizes Instagram reel URLs', () => {
  const result = normalizeInstagramUrl('https://instagram.com/reel/C3x9P2xL8aZ/?utm_source=ig_web_copy_link');

  assert.equal(result.ok, true);
  assert.equal(result.type, 'reel');
  assert.equal(result.shortcode, 'C3x9P2xL8aZ');
  assert.equal(result.url, 'https://www.instagram.com/reel/C3x9P2xL8aZ/');
});

test('canonicalizes reels plural path segment to reel', () => {
  const result = normalizeInstagramUrl('https://www.instagram.com/reels/C3x9P2xL8aZ/');

  assert.equal(result.ok, true);
  assert.equal(result.type, 'reel');
  assert.equal(result.shortcode, 'C3x9P2xL8aZ');
  assert.equal(result.url, 'https://www.instagram.com/reel/C3x9P2xL8aZ/');
});

test('rejects non-Instagram URLs', () => {
  const result = normalizeInstagramUrl('https://example.com/reel/C3x9P2xL8aZ/');

  assert.equal(result.ok, false);
  assert.match(result.error, /Only Instagram URLs/);
});

test('extracts Instagram media metadata and download URL', async () => {
  const normalized = normalizeInstagramUrl('https://www.instagram.com/reel/C3x9P2xL8aZ/');
  const result = await extractInstagramMedia(normalized, '720p');

  assert.equal(result.status, 'ready');
  assert.equal(result.platform, 'instagram');
  assert.equal(result.type, 'reel');
  assert.equal(result.shortcode, 'C3x9P2xL8aZ');
  assert.equal(result.requestedQuality, '720p');
  assert.ok(result.downloadUrl.includes('/api/download/file'));
  assert.ok(result.downloadUrl.includes('instagram-reel-C3x9P2xL8aZ.mp4'));
});
