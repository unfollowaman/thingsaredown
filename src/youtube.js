import { extractMediaInfo, downloadMedia } from '../server/downloader.js';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be'
]);

export function normalizeYoutubeUrl(rawUrl) {
  const input = String(rawUrl || '').trim();

  if (!input) {
    return {
      ok: false,
      error: 'Paste a YouTube video URL.'
    };
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return {
      ok: false,
      error: 'That does not look like a valid URL.'
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: 'Only http and https URLs are supported.'
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(hostname)) {
    return {
      ok: false,
      error: 'Only YouTube URLs are supported by this endpoint.'
    };
  }

  let videoId = null;
  let type = 'video';

  if (hostname.includes('youtu.be')) {
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0]) {
      videoId = segments[0];
    }
  } else {
    const pathname = parsed.pathname.toLowerCase();
    if (pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    } else if (pathname.startsWith('/shorts/')) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      videoId = segments[1];
      type = 'short';
    } else if (pathname.startsWith('/embed/')) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      videoId = segments[1];
    } else if (pathname.startsWith('/v/')) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      videoId = segments[1];
    }
  }

  if (!videoId) {
    return {
      ok: false,
      error: 'This YouTube URL is missing its video identifier.'
    };
  }

  videoId = videoId.trim();
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return {
    ok: true,
    url: canonicalUrl,
    type,
    videoId,
    originalUrl: input
  };
}

export async function extractYoutubeMedia(normalized, quality = '1080p') {
  if (!normalized || !normalized.ok) {
    throw new Error('Invalid YouTube URL provided.');
  }

  const info = await extractMediaInfo(normalized.url);
  const downloadResult = await downloadMedia({
    url: normalized.url,
    quality,
    platform: 'youtube'
  });

  return {
    status: 'ready',
    platform: 'youtube',
    type: normalized.type,
    videoId: normalized.videoId,
    canonicalUrl: normalized.url,
    requestedQuality: quality || '1080p',
    title: info.title,
    thumbnail: info.thumbnail,
    duration: info.duration,
    filename: downloadResult.filename,
    formats: info.formats,
    downloadUrl: downloadResult.downloadUrl
  };
}
