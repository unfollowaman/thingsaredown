import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp, resetRateLimiter } from '../server/app.js';
import { parseProgressLine } from '../server/downloader.js';
import { cancelJob, cleanupExpiredJobs, createJob, getJob, JOB_STATES, resetJobs, updateJob } from '../server/jobs.js';

function listen(app) {
  return new Promise((resolve) => {
    app.listen(0, () => {
      resolve(app.address().port);
    });
  });
}

test('Job Manager lifecycle: creation, retrieval, updates, and TTL cleanup', () => {
  resetJobs();

  const job = createJob({ platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', quality: '1080p' });
  assert.ok(job.id);
  assert.equal(job.status, JOB_STATES.QUEUED);
  assert.equal(job.progress, 0);

  const fetched = getJob(job.id);
  assert.equal(fetched.id, job.id);
  assert.equal(fetched.platform, 'youtube');

  updateJob(job.id, {
    status: JOB_STATES.DOWNLOADING,
    progress: 42,
    speed: '2.5MiB/s',
    eta: '00:10'
  });

  const updated = getJob(job.id);
  assert.equal(updated.status, JOB_STATES.DOWNLOADING);
  assert.equal(updated.progress, 42);
  assert.equal(updated.speed, '2.5MiB/s');
  assert.equal(updated.eta, '00:10');

  // Verify TTL cleanup by updating job creation timestamp
  updateJob(job.id, { createdAt: Date.now() - 30 * 60 * 1000 });
  cleanupExpiredJobs(15 * 60 * 1000);
  assert.equal(getJob(job.id), null);
});

test('Job Cancellation: cancels active job and marks status as cancelled', () => {
  resetJobs();

  const mockChild = {
    killed: false,
    kill(sig) {
      this.killed = true;
      this.signal = sig;
    }
  };

  const job = createJob({ platform: 'instagram', url: 'https://www.instagram.com/reel/C3x9P2xL8aZ/' });
  updateJob(job.id, { status: JOB_STATES.DOWNLOADING, process: mockChild });

  const success = cancelJob(job.id);
  assert.equal(success, true);
  assert.equal(mockChild.killed, true);

  const cancelled = getJob(job.id);
  assert.equal(cancelled.status, JOB_STATES.CANCELLED);
  assert.match(cancelled.error, /cancelled/i);

  // Re-cancelling completed/cancelled job returns false
  const repeatCancel = cancelJob(job.id);
  assert.equal(repeatCancel, false);
});

test('parseProgressLine parses structured yt-dlp progress and FFmpeg states', () => {
  const structuredLine = 'ytdljob:downloading|45.5%|5000000|10000000|1.5MiB/s|00:04';
  const parsedStruct = parseProgressLine(structuredLine);
  assert.equal(parsedStruct.status, 'downloading');
  assert.equal(parsedStruct.progress, 45.5);
  assert.equal(parsedStruct.downloadedBytes, 5000000);
  assert.equal(parsedStruct.totalBytes, 10000000);
  assert.equal(parsedStruct.speed, '1.5MiB/s');
  assert.equal(parsedStruct.eta, '00:04');

  const finishedStruct = 'ytdljob:finished|100%|10000000|10000000|NA|00:00';
  const parsedFinished = parseProgressLine(finishedStruct);
  assert.equal(parsedFinished.status, 'processing');
  assert.equal(parsedFinished.progress, 99);

  const mergerLine = '[Merger] Merging formats into "output.mp4"';
  const parsedMerger = parseProgressLine(mergerLine);
  assert.equal(parsedMerger.status, 'processing');
  assert.equal(parsedMerger.progress, 99);
});

test('API endpoints: HTTP 202 job creation, GET job status, and cancel API', async () => {
  resetRateLimiter();
  resetJobs();
  const app = createApp();
  const port = await listen(app);

  try {
    const createRes = await fetch(`http://127.0.0.1:${port}/api/download/youtube`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    });

    assert.equal(createRes.status, 202);
    const createPayload = await createRes.json();
    assert.ok(createPayload.id);
    assert.ok(createPayload.statusUrl);

    // GET /api/download/jobs/:id
    const statusRes = await fetch(`http://127.0.0.1:${port}${createPayload.statusUrl}`);
    assert.equal(statusRes.status, 200);
    const statusPayload = await statusRes.json();
    assert.equal(statusPayload.id, createPayload.id);

    // Ensure status can be set to active state for cancellation test
    updateJob(createPayload.id, { status: JOB_STATES.DOWNLOADING });

    // GET non-existent job returns 404
    const notFoundRes = await fetch(`http://127.0.0.1:${port}/api/download/jobs/non-existent-job-uuid`);
    assert.equal(notFoundRes.status, 404);

    // POST /api/download/jobs/:id/cancel
    const cancelRes = await fetch(`http://127.0.0.1:${port}/api/download/jobs/${createPayload.id}/cancel`, {
      method: 'POST'
    });
    assert.equal(cancelRes.status, 200);
    const cancelPayload = await cancelRes.json();
    assert.equal(cancelPayload.status, JOB_STATES.CANCELLED);
  } finally {
    app.close();
  }
});
