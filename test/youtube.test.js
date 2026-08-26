import assert from 'node:assert/strict';
import test from 'node:test';
import { extractYoutubeMedia, normalizeYoutubeUrl } from '../src/youtube.js';

test('normalizes standard YouTube watch URLs', () => {
  const result = normalizeYoutubeUrl('https://www.youtube.com/watch?v=k6BnSIs3XUQ&si=WUwSQ5f_us33ezxA');

  assert.equal(result.ok, true);
  assert.equal(result.type, 'video');
  assert.equal(result.videoId, 'k6BnSIs3XUQ');
  assert.equal(result.url, 'https://www.youtube.com/watch?v=k6BnSIs3XUQ');
});

test('normalizes short YouTube (youtu.be) URLs', () => {
  const result = normalizeYoutubeUrl('https://youtu.be/k6BnSIs3XUQ?si=WUwSQ5f_us33ezxA');

  assert.equal(result.ok, true);
  assert.equal(result.type, 'video');
  assert.equal(result.videoId, 'k6BnSIs3XUQ');
  assert.equal(result.url, 'https://www.youtube.com/watch?v=k6BnSIs3XUQ');
});

test('normalizes YouTube Shorts URLs', () => {
  const result = normalizeYoutubeUrl('https://www.youtube.com/shorts/k6BnSIs3XUQ');

  assert.equal(result.ok, true);
  assert.equal(result.type, 'short');
  assert.equal(result.videoId, 'k6BnSIs3XUQ');
  assert.equal(result.url, 'https://www.youtube.com/watch?v=k6BnSIs3XUQ');
});

test('rejects non-YouTube URLs', () => {
  const result = normalizeYoutubeUrl('https://example.com/watch?v=k6BnSIs3XUQ');

  assert.equal(result.ok, false);
  assert.match(result.error, /Only YouTube URLs/);
});

test('rejects YouTube URLs without video ID', () => {
  const result = normalizeYoutubeUrl('https://www.youtube.com/watch');

  assert.equal(result.ok, false);
  assert.match(result.error, /missing its video identifier/);
});

test('extracts YouTube media metadata and download URL', async () => {
  const normalized = normalizeYoutubeUrl('https://www.youtube.com/watch?v=k6BnSIs3XUQ');
  const result = await extractYoutubeMedia(normalized, '1080p');

  assert.equal(result.status, 'ready');
  assert.equal(result.platform, 'youtube');
  assert.equal(result.type, 'video');
  assert.equal(result.videoId, 'k6BnSIs3XUQ');
  assert.equal(result.requestedQuality, '1080p');
  assert.ok(result.downloadUrl.includes('/api/download/file'));
  assert.ok(result.downloadUrl.includes('youtube-video-k6BnSIs3XUQ.mp4'));
});
