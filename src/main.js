// Things Are Down - Interactive Application Logic

import { normalizeInstagramUrl } from './instagram.js';

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
      url: 'https://instagram.com/reel/C3x9P2xL8aZ',
      label: '✓ Instagram link detected',
      title: 'Summer reel pack · 00:34',
      details: 'MP4 · 1080p · 24.8 MB',
      thumbBg: 'linear-gradient(135deg, #ff2d55, #8b5cf6)',
      icon: '◎'
    },
    youtube: {
      url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
      label: '✓ YouTube link detected',
      title: 'Ultra HD Cinematic Video · 03:45',
      details: 'MP4 · 4K 60fps · 142.5 MB',
      thumbBg: 'linear-gradient(135deg, #ff0033, #e60000)',
      icon: '▶'
    },
    x: {
      url: 'https://x.com/tech/status/1758291048291',
      label: '✓ X (Twitter) link detected',
      title: 'Product Launch Reveal · 00:15',
      details: 'MP4 · 1080p · 12.3 MB',
      thumbBg: 'linear-gradient(135deg, #171717, #333333)',
      icon: '𝕏'
    },
    telegram: {
      url: 'https://t.me/media_channel/8492',
      label: '✓ Telegram link detected',
      title: 'Broadcast Highlight Clip · 01:20',
      details: 'MP4 · 720p · 18.1 MB',
      thumbBg: 'linear-gradient(135deg, #229ed9, #0088cc)',
      icon: '✈'
    }
  };

  function detectPlatform(val) {
    const inputVal = (val || '').toLowerCase().trim();
    const instagramResult = normalizeInstagramUrl(inputVal);

    if (instagramResult.ok) {
      return platformSamples.instagram;
    } else if (inputVal.includes('youtube.com') || inputVal.includes('youtu.be')) {
      return platformSamples.youtube;
    } else if (inputVal.includes('x.com') || inputVal.includes('twitter.com')) {
      return platformSamples.x;
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
      if (mediaTitle) mediaTitle.textContent = 'Media stream detected';
      if (mediaDetails) mediaDetails.textContent = 'MP4 · Auto Quality · Variable size';
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
        progressFill.style.transition = 'width 1.2s ease-in-out';
        progressFill.style.width = '25%';
      }

      try {
        const instagramResult = normalizeInstagramUrl(urlInput.value);

        if (!instagramResult.ok) {
          throw new Error(instagramResult.error);
        }

        const response = await fetch('/api/download/instagram', {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            url: urlInput.value,
            quality: qualitySelect ? qualitySelect.value : '1080p'
          })
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Unable to prepare this Instagram download.');
        }

        if (progressFill) {
          progressFill.style.width = payload.downloadUrl ? '100%' : '65%';
        }

        if (mediaTitle) mediaTitle.textContent = payload.title;
        if (mediaDetails) {
          mediaDetails.textContent = payload.downloadUrl
            ? `${payload.requestedQuality} · Ready`
            : `${payload.requestedQuality} · Extractor setup required`;
        }

        setDownloadState(payload.downloadUrl ? 'Downloaded' : 'Setup needed', Boolean(payload.downloadUrl));
        setTimeout(() => {
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = origText;
        }, 2000);
      } catch (err) {
        if (progressFill) {
          progressFill.style.width = '0%';
        }

        if (mediaDetails) mediaDetails.textContent = err.message;
        setDownloadState('Could not download');
        setTimeout(() => {
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = origText;
        }, 2500);
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
