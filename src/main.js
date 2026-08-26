// Things Are Down - Interactive Application Logic

import { normalizeInstagramUrl } from './instagram.js';
import { normalizeXUrl } from './x.js';
import { normalizeYoutubeUrl } from './youtube.js';

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('media-url');
  const downloadBtn = document.querySelector('.url-input-wrap button');
  const detectPill = document.querySelector('.detect-pill');
  const pasteBtn = document.querySelector('.paste-button');
  const mediaPreview = document.querySelector('.media-preview');
  const thumb = mediaPreview ? mediaPreview.querySelector('.thumb') : null;
  const mediaTitle = mediaPreview ? mediaPreview.querySelector('strong') : null;
  const mediaDetails = mediaPreview ? mediaPreview.querySelector('small') : null;
  const progressFill = document.querySelector('.progress-demo span');
  const qualitySelect = mediaPreview ? mediaPreview.querySelector('select') : null;
  const platformButtons = document.querySelectorAll('.platform-tile');
  const utilityButtons = document.querySelectorAll('.utility-button, .directory-nav button');

  const platformSamples = {
    instagram: {
      platform: 'instagram',
      endpoint: '/api/download/instagram',
      url: 'https://instagram.com/reel/C3x9P2xL8aZ',
      label: '✓ Instagram link detected',
      title: 'Instagram Reel',
      details: 'MP4 · Select quality',
      thumbBg: 'linear-gradient(135deg, #ff2d55, #8b5cf6)',
      icon: '◎'
    },
    youtube: {
      platform: 'youtube',
      endpoint: '/api/download/youtube',
      url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
      label: '✓ YouTube link detected',
      title: 'YouTube Video',
      details: 'MP4 · Select quality',
      thumbBg: 'linear-gradient(135deg, #ff0033, #e60000)',
      icon: '▶'
    },
    x: {
      platform: 'x',
      endpoint: '/api/download/x',
      url: 'https://x.com/tech/status/1758291048291',
      label: '✓ X (Twitter) link detected',
      title: 'X/Twitter Post',
      details: 'MP4 · Select quality',
      thumbBg: 'linear-gradient(135deg, #171717, #333333)',
      icon: '𝕏'
    },
    telegram: {
      platform: 'telegram',
      endpoint: null,
      url: 'https://t.me/media_channel/8492',
      label: '✓ Telegram link detected',
      title: 'Broadcast Highlight Clip',
      details: 'MP4 · 720p · 18.1 MB',
      thumbBg: 'linear-gradient(135deg, #229ed9, #0088cc)',
      icon: '✈'
    }
  };

  function detectPlatform(val) {
    const inputVal = (val || '').toLowerCase().trim();
    const instagramResult = normalizeInstagramUrl(inputVal);
    const xResult = normalizeXUrl(inputVal);
    const youtubeResult = normalizeYoutubeUrl(inputVal);

    if (instagramResult.ok) {
      return platformSamples.instagram;
    } else if (xResult.ok) {
      return platformSamples.x;
    } else if (youtubeResult.ok || inputVal.includes('youtube.com') || inputVal.includes('youtu.be')) {
      return platformSamples.youtube;
    } else if (inputVal.includes('t.me') || inputVal.includes('telegram.org') || inputVal.includes('telegram.me')) {
      return platformSamples.telegram;
    }
    return null;
  }

  function updateUIForInput(val) {
    const match = detectPlatform(val);
    if (match) {
      if (detectPill) detectPill.textContent = match.label;
      if (mediaTitle) mediaTitle.textContent = match.title;
      if (mediaDetails) mediaDetails.textContent = match.details;
      if (thumb) {
        thumb.style.background = match.thumbBg;
        thumb.textContent = match.icon;
      }
    } else if (val.trim().length > 0) {
      if (detectPill) detectPill.textContent = '✓ Media link detected';
      if (mediaTitle) mediaTitle.textContent = 'Media link entered';
      if (mediaDetails) mediaDetails.textContent = 'Ready to download';
    } else {
      if (detectPill) detectPill.textContent = '✓ Instagram link detected';
      if (mediaTitle) mediaTitle.textContent = 'Summer reel pack · 00:34';
      if (mediaDetails) mediaDetails.textContent = 'MP4 · 1080p · 24.8 MB';
      if (thumb) {
        thumb.style.background = 'linear-gradient(135deg, var(--yt), #8b5cf6)';
        thumb.textContent = '▶';
      }
    }
  }

  function setDownloadState(message, isComplete = false) {
    if (downloadBtn) {
      downloadBtn.innerHTML = isComplete ? `${message} <span>✓</span>` : `${message} <span>⌁</span>`;
    }
  }

  function triggerBrowserDownload(downloadUrl, filename) {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    if (filename) {
      a.download = filename;
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function getDownloadTarget(val) {
    const platform = detectPlatform(val);

    if (platform) {
      if (platform.platform === 'instagram') {
        const instagramResult = normalizeInstagramUrl(val);
        if (instagramResult.ok) {
          return {
            sample: platform,
            normalized: instagramResult
          };
        }
      } else if (platform.platform === 'x') {
        const xResult = normalizeXUrl(val);
        if (xResult.ok) {
          return {
            sample: platform,
            normalized: xResult
          };
        }
        throw new Error(xResult.error);
      } else if (platform.platform === 'youtube') {
        const youtubeResult = normalizeYoutubeUrl(val);
        if (youtubeResult.ok) {
          return {
            sample: platform,
            normalized: youtubeResult
          };
        }
        throw new Error(youtubeResult.error);
      } else if (platform.platform === 'telegram') {
        throw new Error('Telegram downloads are not connected yet.');
      }
    }

    const inputVal = (val || '').toLowerCase();
    if (inputVal.includes('x.com') || inputVal.includes('twitter.com')) {
      const xResult = normalizeXUrl(val);
      throw new Error(xResult.error);
    }
    if (inputVal.includes('youtube.com') || inputVal.includes('youtu.be')) {
      const youtubeResult = normalizeYoutubeUrl(val);
      throw new Error(youtubeResult.error);
    }

    throw new Error('Paste a supported Instagram, YouTube, or X/Twitter media URL.');
  }

  async function pollJobUntilCompletion(jobId) {
    const pollIntervalMs = 1500;
    const statusEndpoint = `/api/download/jobs/${jobId}`;

    while (true) {
      const res = await fetch(statusEndpoint);
      if (!res.ok) {
        throw new Error(`Failed to query job status (HTTP ${res.status}).`);
      }

      const job = await res.json();

      if (job.title && mediaTitle) {
        mediaTitle.textContent = job.title;
      }
      if (job.thumbnail && thumb) {
        thumb.style.background = `url("${job.thumbnail}") center/cover no-repeat`;
        thumb.textContent = '';
      }

      if (job.formats && Array.isArray(job.formats) && job.formats.length > 0 && qualitySelect) {
        const currentSelected = qualitySelect.value;
        qualitySelect.innerHTML = '';
        for (const fmt of job.formats) {
          const opt = document.createElement('option');
          opt.value = fmt;
          opt.textContent = fmt;
          if (fmt === currentSelected || fmt === job.quality) {
            opt.selected = true;
          }
          qualitySelect.appendChild(opt);
        }
      }

      if (job.status === 'queued' || job.status === 'extracting') {
        setDownloadState(job.status === 'queued' ? 'Queued...' : 'Extracting info...');
        if (progressFill) progressFill.style.width = '15%';
      } else if (job.status === 'downloading') {
        const pct = Math.max(15, Math.min(95, job.progress || 20));
        if (progressFill) progressFill.style.width = `${pct}%`;

        const detailsParts = [];
        if (job.speed) detailsParts.push(job.speed);
        if (job.eta) detailsParts.push(`ETA ${job.eta}`);
        if (detailsParts.length === 0) detailsParts.push('Downloading media...');

        if (mediaDetails) mediaDetails.textContent = detailsParts.join(' · ');
        setDownloadState(`Downloading ${Math.round(job.progress || 0)}%`);
      } else if (job.status === 'processing') {
        if (progressFill) progressFill.style.width = '98%';
        if (mediaDetails) mediaDetails.textContent = 'Processing & merging video streams...';
        setDownloadState('Processing...');
      } else if (job.status === 'completed') {
        if (progressFill) progressFill.style.width = '100%';
        if (mediaDetails) {
          const parts = [];
          if (job.duration) parts.push(job.duration);
          if (job.quality) parts.push(job.quality);
          parts.push('Ready');
          mediaDetails.textContent = parts.join(' · ');
        }
        setDownloadState('Downloaded', true);
        if (job.downloadUrl) {
          triggerBrowserDownload(job.downloadUrl, job.filename);
        }
        return job;
      } else if (job.status === 'failed') {
        throw new Error(job.error || 'Download failed on server.');
      } else if (job.status === 'cancelled') {
        throw new Error('Download was cancelled.');
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  if (urlInput) {
    urlInput.addEventListener('input', (e) => {
      updateUIForInput(e.target.value);
    });
  }

  if (pasteBtn) {
    pasteBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text && urlInput) {
            urlInput.value = text;
            updateUIForInput(text);
          }
        } else {
          urlInput.focus();
        }
      } catch (err) {
        urlInput.focus();
      }
    });
  }

  platformButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      let key = null;
      if (btn.classList.contains('telegram')) key = 'telegram';
      else if (btn.classList.contains('x')) key = 'x';
      else if (btn.classList.contains('instagram')) key = 'instagram';
      else if (btn.classList.contains('youtube')) key = 'youtube';

      if (key && platformSamples[key]) {
        const sample = platformSamples[key];
        if (urlInput) {
          urlInput.value = sample.url;
          updateUIForInput(sample.url);
        }
        document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      if (!urlInput || !urlInput.value.trim()) {
        urlInput.placeholder = 'Please paste a valid URL first...';
        urlInput.focus();
        setTimeout(() => {
          urlInput.placeholder = 'Paste Instagram, YouTube or X link...';
        }, 2500);
        return;
      }

      const origText = downloadBtn.innerHTML;
      downloadBtn.disabled = true;
      setDownloadState('Preparing...');

      if (progressFill) {
        progressFill.style.transition = 'width 0.5s ease-in-out';
        progressFill.style.width = '10%';
      }

      try {
        const target = getDownloadTarget(urlInput.value);

        if (!target.sample.endpoint) {
          throw new Error(`${target.sample.platform} downloads are not connected yet.`);
        }

        const response = await fetch(target.sample.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            url: urlInput.value,
            quality: qualitySelect ? qualitySelect.value : '1080p'
          })
        });
        const initialPayload = await response.json();

        if (!response.ok) {
          throw new Error(initialPayload.error || `Unable to start this ${target.sample.label.replace('✓ ', '').replace(' link detected', '')} download.`);
        }

        const jobId = initialPayload.id || initialPayload.jobId;
        if (!jobId) {
          throw new Error('Server did not return a valid download job ID.');
        }

        await pollJobUntilCompletion(jobId);

        setTimeout(() => {
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = origText;
        }, 3000);
      } catch (err) {
        if (progressFill) {
          progressFill.style.width = '0%';
        }

        if (mediaDetails) mediaDetails.textContent = err.message;
        setDownloadState('Could not download');
        setTimeout(() => {
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = origText;
        }, 3000);
      }
    });
  }

  utilityButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.style.transform = 'scale(1.2) rotate(45deg)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 300);
    });
  });
});
