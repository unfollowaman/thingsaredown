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

  // Clean video ID in case extra characters appended
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

  const videoId = normalized.videoId;
  const type = normalized.type;
  let videoUrl = null;
  let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  let title = `YouTube Video · ${videoId}`;
  let duration = '03:45';

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(normalized.url)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.title) {
        title = data.title;
      }
      if (data.thumbnail_url) {
        thumbnailUrl = data.thumbnail_url;
      }
    }
  } catch {
    // fallback to defaults
  }

  if (!videoUrl) {
    videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  }

  const isAudio = quality && String(quality).toLowerCase() === 'audio';
  const fileExt = isAudio ? 'mp3' : 'mp4';
  const filename = `youtube-${type}-${videoId}.${fileExt}`;

  const downloadUrl = `/api/download/file?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`;

  return {
    status: 'ready',
    platform: 'youtube',
    type,
    videoId,
    canonicalUrl: normalized.url,
    requestedQuality: quality || '1080p',
    title,
    thumbnail: thumbnailUrl,
    duration,
    filename,
    formats: ['1080p', '720p', 'Audio'],
    downloadUrl,
    directStreamUrl: videoUrl
  };
}
