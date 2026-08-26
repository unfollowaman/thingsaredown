import { downloadMedia, extractMediaInfo } from '../server/downloader.js';
import { cancelJob, createJob, getJob, JOB_STATES, setJobProcess, updateJob } from '../server/jobs.js';

export async function processDownloadJob(jobId) {
  const job = getJob(jobId);
  if (!job) return;

  try {
    updateJob(jobId, { status: JOB_STATES.EXTRACTING, progress: 5 });

    const info = await extractMediaInfo(job.url);
    updateJob(jobId, {
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      formats: info.formats || [],
      status: JOB_STATES.DOWNLOADING,
      progress: 10
    });

    const result = await downloadMedia({
      url: job.url,
      quality: job.quality,
      platform: job.platform,
      onProgress: (prog) => {
        // Only update if job has not been cancelled
        const current = getJob(jobId);
        if (current && current.status !== JOB_STATES.CANCELLED) {
          updateJob(jobId, {
            status: prog.status === 'processing' ? JOB_STATES.PROCESSING : JOB_STATES.DOWNLOADING,
            progress: prog.progress,
            downloadedBytes: prog.downloadedBytes,
            totalBytes: prog.totalBytes,
            speed: prog.speed,
            eta: prog.eta
          });
        }
      },
      onProcess: (childProc) => {
        setJobProcess(jobId, childProc);
      }
    });

    const current = getJob(jobId);
    if (current && current.status !== JOB_STATES.CANCELLED) {
      updateJob(jobId, {
        status: JOB_STATES.COMPLETED,
        progress: 100,
        filename: result.filename,
        downloadUrl: result.downloadUrl,
        process: null
      });
    }
  } catch (err) {
    const current = getJob(jobId);
    if (current && current.status !== JOB_STATES.CANCELLED) {
      updateJob(jobId, {
        status: JOB_STATES.FAILED,
        error: err.message || 'Download failed.',
        process: null
      });
    }
  }
}
