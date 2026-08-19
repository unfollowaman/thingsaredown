import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPendingInstagramDownload, normalizeInstagramUrl } from '../src/instagram.js';

test('normalizes Instagram reel URLs', () => {
  const result = normalizeInstagramUrl('https://instagram.com/reel/C3x9P2xL8aZ/?utm_source=ig_web_copy_link');

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

test('builds pending download metadata for the API response', () => {
  const normalized = normalizeInstagramUrl('https://www.instagram.com/p/ABC123/');
  const result = buildPendingInstagramDownload(normalized, '720p');

  assert.equal(result.status, 'metadata_ready');
  assert.equal(result.platform, 'instagram');
  assert.equal(result.type, 'post');
  assert.equal(result.requestedQuality, '720p');
  assert.equal(result.downloadUrl, null);
});
