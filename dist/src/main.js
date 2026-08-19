// Things Are Down - Interactive Application Logic

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('media-url');
  const downloadBtn = document.querySelector('.url-input-wrap button');
  const detectPill = document.querySelector('.detect-pill');
  const pasteBtn = document.querySelector('.paste-button');
  const mediaPreview = document.querySelector('.media-preview');
  const thumb = mediaPreview ? mediaPreview.querySelector('.thumb') : null;
  const mediaTitle = mediaPreview ? mediaPreview.querySelector('strong') : null;
  const mediaDetails = mediaPreview ? mediaPreview.querySelector('small') : null;
  const qualitySelect = mediaPreview ? mediaPreview.querySelector('select') : null;
  const progressFill = document.querySelector('.progress-demo span');
  const platformButtons = document.querySelectorAll('.platform-tile');
  const utilityButtons = document.querySelectorAll('.utility-button, .directory-nav button');

  let currentDebounceTimer = null;
  let activeFetchedUrl = '';

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

  function isYouTubeUrl(val) {
    const inputVal = (val || '').toLowerCase().trim();
    return inputVal.includes('youtube.com') || inputVal.includes('youtu.be');
  }

  function detectPlatform(val) {
    const inputVal = (val || '').toLowerCase().trim();
    if (inputVal.includes('instagram.com') || inputVal.includes('instagr.am')) {
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

  async function fetchYouTubeInfo(url) {
    if (!isYouTubeUrl(url)) return;
    if (activeFetchedUrl === url) return;

    if (detectPill) detectPill.textContent = '⏳ Fetching YouTube details...';
    if (mediaTitle) mediaTitle.textContent = 'Loading video metadata...';
    if (mediaDetails) mediaDetails.textContent = 'Connecting to YouTube server...';

    try {
      const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (!response.ok || data.error) {
        if (detectPill) detectPill.textContent = '⚠️ Unable to fetch YouTube video';
        if (mediaTitle) mediaTitle.textContent = 'Error loading video details';
        if (mediaDetails) mediaDetails.textContent = data.error || 'Invalid or unavailable YouTube link';
        return;
      }

      activeFetchedUrl = url;

      if (detectPill) detectPill.textContent = '✓ YouTube video ready';
      if (mediaTitle) mediaTitle.textContent = data.title;
      if (mediaDetails) mediaDetails.textContent = `${data.uploader} · ${data.duration} · ${data.filesize}`;

      if (thumb) {
        if (data.thumbnail) {
          thumb.style.background = `url("${data.thumbnail}") center/cover no-repeat`;
          thumb.textContent = '';
        } else {
          thumb.style.background = 'linear-gradient(135deg, var(--yt), #e60000)';
          thumb.textContent = '▶';
        }
      }

      if (qualitySelect && data.qualities && data.qualities.length > 0) {
        qualitySelect.innerHTML = '';
        data.qualities.forEach(q => {
          const opt = document.createElement('option');
          opt.value = q;
          opt.textContent = q;
          qualitySelect.appendChild(opt);
        });
        const audioOpt = document.createElement('option');
        audioOpt.value = 'Audio';
        audioOpt.textContent = 'Audio (.mp3)';
        qualitySelect.appendChild(audioOpt);
      }
    } catch (err) {
      console.error('Fetch info error:', err);
      if (detectPill) detectPill.textContent = '⚠️ Connection error';
      if (mediaTitle) mediaTitle.textContent = 'Could not reach server';
      if (mediaDetails) mediaDetails.textContent = 'Ensure backend server is running.';
    }
  }

  function handleInputChange(val) {
    clearTimeout(currentDebounceTimer);
    const trimmed = (val || '').trim();

    if (!trimmed) {
      activeFetchedUrl = '';
      if (detectPill) detectPill.textContent = '✓ Instagram link detected';
      if (mediaTitle) mediaTitle.textContent = 'Summer reel pack · 00:34';
      if (mediaDetails) mediaDetails.textContent = 'MP4 · 1080p · 24.8 MB';
      if (thumb) {
        thumb.style.background = 'linear-gradient(135deg, var(--yt), #8b5cf6)';
        thumb.textContent = '▶';
      }
      return;
    }

    if (isYouTubeUrl(trimmed)) {
      currentDebounceTimer = setTimeout(() => {
        fetchYouTubeInfo(trimmed);
      }, 400);
    } else {
      const match = detectPlatform(trimmed);
      if (match) {
        if (detectPill) detectPill.textContent = match.label;
        if (mediaTitle) mediaTitle.textContent = match.title;
        if (mediaDetails) mediaDetails.textContent = match.details;
        if (thumb) {
          thumb.style.background = match.thumbBg;
          thumb.textContent = match.icon;
        }
      } else {
        if (detectPill) detectPill.textContent = '✓ Media link detected';
        if (mediaTitle) mediaTitle.textContent = 'Media stream detected';
        if (mediaDetails) mediaDetails.textContent = 'MP4 · Auto Quality · Variable size';
      }
    }
  }

  if (urlInput) {
    urlInput.addEventListener('input', (e) => {
      handleInputChange(e.target.value);
    });
  }

  if (pasteBtn) {
    pasteBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text && urlInput) {
            urlInput.value = text;
            handleInputChange(text);
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
          handleInputChange(sample.url);
        }
        document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const url = urlInput ? urlInput.value.trim() : '';

      if (!url) {
        urlInput.placeholder = 'Please paste a valid URL first...';
        urlInput.focus();
        setTimeout(() => {
          urlInput.placeholder = 'Paste Instagram, YouTube or X link...';
        }, 2500);
        return;
      }

      const origText = downloadBtn.innerHTML;
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = 'Starting download... <span>⌁</span>';

      if (progressFill) {
        progressFill.style.transition = 'width 2s ease-in-out';
        progressFill.style.width = '0%';
        setTimeout(() => {
          progressFill.style.width = '100%';
        }, 50);
      }

      if (isYouTubeUrl(url)) {
        const selectedQuality = qualitySelect ? qualitySelect.value : '1080p';
        const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&quality=${encodeURIComponent(selectedQuality)}`;

        // Trigger file download in browser
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = downloadUrl;
        downloadAnchor.download = '';
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);

        setTimeout(() => {
          downloadBtn.innerHTML = 'Downloading in progress ✓';
          setTimeout(() => {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = origText;
          }, 3000);
        }, 1500);
      } else {
        // Fallback simulation for non-youtube links
        setTimeout(() => {
          downloadBtn.innerHTML = 'Downloaded ✓';
          setTimeout(() => {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = origText;
          }, 2000);
        }, 1300);
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
