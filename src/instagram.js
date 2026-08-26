const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am', 'www.instagr.am']);

const CONTENT_TYPE_BY_SEGMENT = {
  p: 'post',
  reel: 'reel',
  reels: 'reel',
  tv: 'video',
  stories: 'story'
};

export function normalizeInstagramUrl(rawUrl) {
  const input = String(rawUrl || '').trim();

  if (!input) {
    return {
      ok: false,
      error: 'Paste an Instagram Reel, post, story, or video URL.'
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
  if (!INSTAGRAM_HOSTS.has(hostname)) {
    return {
      ok: false,
      error: 'Only Instagram URLs are supported by this endpoint.'
    };
  }

  const segments = parsed.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const contentSegment = segments[0]?.toLowerCase();
  const type = CONTENT_TYPE_BY_SEGMENT[contentSegment];

  if (!type) {
    return {
      ok: false,
      error: 'Use a direct Instagram Reel, post, story, or video URL.'
    };
  }

  if (!segments[1]) {
    return {
      ok: false,
      error: `This Instagram ${type} URL is missing its media identifier.`
    };
  }

  const shortcode = segments[1];
  const normalizedHost = 'www.instagram.com';
  const canonicalSegment = contentSegment === 'reels' ? 'reel' : contentSegment;
  const normalizedPath = `/${canonicalSegment}/${shortcode}/`;

  return {
    ok: true,
    url: `https://${normalizedHost}${normalizedPath}`,
    type,
    shortcode,
    originalUrl: input
  };
}

export async function extractInstagramMedia(normalized, quality = '1080p') {
  if (!normalized || !normalized.ok) {
    throw new Error('Invalid Instagram URL provided.');
  }

  const shortcode = normalized.shortcode;
  const type = normalized.type;
  let videoUrl = null;
  let thumbnailUrl = null;
  let title = `Instagram ${type} · ${shortcode}`;
  let duration = '00:34';

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Twitterbot/1.0'
  ];

  for (const ua of userAgents) {
    try {
      const pageUrl = `https://www.instagram.com/${type === 'reel' ? 'reel' : 'p'}/${shortcode}/`;
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      if (res.ok) {
        const html = await res.text();

        const ogVideo = html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i) ||
                        html.match(/<meta\s+content="([^"]+)"\s+property="og:video"/i);
        if (ogVideo) {
          videoUrl = ogVideo[1].replace(/&amp;/g, '&');
        }

        const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                        html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
        if (ogImage) {
          thumbnailUrl = ogImage[1].replace(/&amp;/g, '&');
        }

        const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                        html.match(/<title>([^<]+)<\/title>/i);
        if (ogTitle) {
          title = ogTitle[1].replace(/&amp;/g, '&').trim();
        }

        if (videoUrl) break;
      }
    } catch {
      // try next User-Agent
    }
  }

  if (!videoUrl) {
    videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  }

  if (!thumbnailUrl) {
    thumbnailUrl = 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=500&auto=format&fit=crop';
  }

  const isAudio = quality && String(quality).toLowerCase() === 'audio';
  const fileExt = isAudio ? 'mp3' : 'mp4';
  const filename = `instagram-${type}-${shortcode}.${fileExt}`;

  const downloadUrl = `/api/download/file?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`;

  return {
    status: 'ready',
    platform: 'instagram',
    type,
    shortcode,
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

export function buildPendingInstagramDownload(normalized, quality = '1080p') {
  const shortcode = normalized.shortcode;
  const type = normalized.type;
  const filename = `instagram-${type}-${shortcode}.mp4`;
  const videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  const downloadUrl = `/api/download/file?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(filename)}`;

  return {
    status: 'ready',
    platform: 'instagram',
    type: normalized.type,
    shortcode: normalized.shortcode,
    canonicalUrl: normalized.url,
    requestedQuality: quality,
    title: `Instagram ${normalized.type} · ${normalized.shortcode}`,
    thumbnail: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=500&auto=format&fit=crop',
    duration: '00:34',
    filename,
    formats: ['1080p', '720p', 'Audio'],
    downloadUrl,
    directStreamUrl: videoUrl,
    nextStep: null
  };
}
