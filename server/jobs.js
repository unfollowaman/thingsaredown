import { randomUUID } from 'node:crypto';

// In-memory job registry for managing async download jobs
const jobs = new Map();

// Default TTL for completed/failed/cancelled jobs: 15 minutes (matches temp file TTL)
const DEFAULT_JOB_TTL_MS = 15 * 60 * 1000;

export const JOB_STATES = {
  QUEUED: 'queued',
  EXTRACTING: 'extracting',
  DOWNLOADING: 'downloading',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

export function createJob({ platform, url, quality = '1080p' }) {
  const id = randomUUID();
  const job = {
    id,
    platform: platform || 'media',
    url,
    quality,
    status: JOB_STATES.QUEUED,
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speed: null,
    eta: null,
    filename: null,
    downloadUrl: null,
    title: null,
    thumbnail: null,
    duration: null,
    formats: [],
    error: null,
    process: null, // Holds reference to spawned ChildProcess for cancellation
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  jobs.set(id, job);
  return job;
}

export function getJob(id) {
  const job = jobs.get(id);
  if (!job) return null;

  // Return public safe view (exclude internal process handle)
  return {
    id: job.id,
    platform: job.platform,
    url: job.url,
    quality: job.quality,
    status: job.status,
    progress: job.progress,
    downloadedBytes: job.downloadedBytes,
    totalBytes: job.totalBytes,
    speed: job.speed,
    eta: job.eta,
    filename: job.filename,
    downloadUrl: job.downloadUrl,
    title: job.title,
    thumbnail: job.thumbnail,
    duration: job.duration,
    formats: job.formats,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

export function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return null;

  Object.assign(job, updates, { updatedAt: Date.now() });
  return job;
}

export function setJobProcess(id, childProc) {
  const job = jobs.get(id);
  if (job) {
    job.process = childProc;
  }
}

export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return false;

  if ([JOB_STATES.COMPLETED, JOB_STATES.FAILED, JOB_STATES.CANCELLED].includes(job.status)) {
    return false;
  }

  if (job.process && typeof job.process.kill === 'function') {
    try {
      job.process.kill('SIGTERM');
    } catch (err) {
      console.error(`Failed to kill process for job ${id}:`, err);
    }
  }

  updateJob(id, {
    status: JOB_STATES.CANCELLED,
    error: 'Job was cancelled by user.',
    process: null
  });

  return true;
}

export function removeJob(id) {
  const job = jobs.get(id);
  if (job) {
    if (job.process && typeof job.process.kill === 'function') {
      try { job.process.kill('SIGKILL'); } catch {}
    }
    jobs.delete(id);
  }
}

export function cleanupExpiredJobs(ttlMs = DEFAULT_JOB_TTL_MS) {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > ttlMs) {
      removeJob(id);
    }
  }
}

// Automatically run cleanup every 5 minutes
setInterval(cleanupExpiredJobs, 5 * 60 * 1000).unref();

export function resetJobs() {
  for (const id of Array.from(jobs.keys())) {
    removeJob(id);
  }
}
