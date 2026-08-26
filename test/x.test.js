import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeXUrl } from '../src/x.js';

test('normalizes X status URLs', () => {
  const result = normalizeXUrl('https://x.com/tech/status/1758291048291?s=20');

  assert.equal(result.ok, true);
  assert.equal(result.type, 'status');
  assert.equal(result.username, 'tech');
  assert.equal(result.statusId, '1758291048291');
  assert.equal(result.url, 'https://x.com/tech/status/1758291048291');
});

test('normalizes Twitter status URLs to X canonical URLs', () => {
  const result = normalizeXUrl('https://twitter.com/tech/statuses/1758291048291/video/1');

  assert.equal(result.ok, true);
  assert.equal(result.type, 'status');
  assert.equal(result.username, 'tech');
  assert.equal(result.statusId, '1758291048291');
  assert.equal(result.url, 'https://x.com/tech/status/1758291048291');
});

test('rejects non-X/Twitter URLs', () => {
  const result = normalizeXUrl('https://example.com/tech/status/1758291048291');

  assert.equal(result.ok, false);
  assert.match(result.error, /Only X\/Twitter URLs/);
});

test('rejects X/Twitter URLs without status IDs', () => {
  const result = normalizeXUrl('https://x.com/tech/status/');

  assert.equal(result.ok, false);
  assert.match(result.error, /missing its status identifier/);
});
