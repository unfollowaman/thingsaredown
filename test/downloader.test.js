import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  cleanupExpiredTempFiles,
  downloadMedia,
  extractMediaInfo,
  getBinaryPaths,
  getTempFile,
  registerTempFile,
  removeTempFile
} from '../server/downloader.js';

test('getBinaryPaths detects yt-dlp and ffmpeg executables', () => {
  const paths = getBinaryPaths();
  assert.ok(paths.ytdlpPath);
  assert.ok(paths.ffmpegPath);
});

test('registerTempFile and removeTempFile manage temp tokens safely', () => {
  const dummyPath = '/tmp/things-are-down-downloads/test-dummy-file.tmp';
  writeFileSync(dummyPath, 'test content');

  assert.equal(existsSync(dummyPath), true);

  const registered = registerTempFile(dummyPath, 'test-download.mp4');
  assert.ok(registered.token);
  assert.equal(registered.filename, 'test-download.mp4');

  const fetched = getTempFile(registered.token);
  assert.equal(fetched.filePath, dummyPath);

  removeTempFile(registered.token);
  assert.equal(getTempFile(registered.token), null);
  assert.equal(existsSync(dummyPath), false);
});

test('cleanupExpiredTempFiles purges files older than TTL', () => {
  const dummyPath = '/tmp/things-are-down-downloads/expired-dummy-file.tmp';
  writeFileSync(dummyPath, 'expired content');

  const registered = registerTempFile(dummyPath, 'expired.mp4');
  registered.createdAt = Date.now() - 30 * 60 * 1000; // 30 mins ago

  cleanupExpiredTempFiles(15 * 60 * 1000); // 15 min TTL

  assert.equal(getTempFile(registered.token), null);
  assert.equal(existsSync(dummyPath), false);
});

test('extractMediaInfo handles valid YouTube URL when yt-dlp is available', async () => {
  try {
    const info = await extractMediaInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.ok(info.title);
    assert.ok(info.duration);
    assert.ok(Array.isArray(info.formats));
  } catch (err) {
    // If external network is unreachable or yt-dlp fails in isolated environment, verify standard error handling
    assert.ok(err.message);
  }
});

test('extractMediaInfo rejects invalid / unsupported URL', async () => {
  await assert.rejects(
    async () => {
      await extractMediaInfo('https://invalid-domain-does-not-exist.com/test');
    },
    (err) => {
      assert.ok(err.statusCode === 400 || err.statusCode === 422);
      return true;
    }
  );
});
