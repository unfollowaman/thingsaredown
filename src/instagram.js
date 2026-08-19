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

  const normalizedHost = 'www.instagram.com';
  const normalizedPath = `/${contentSegment}/${segments.slice(1).join('/')}/`;

  return {
    ok: true,
    url: `https://${normalizedHost}${normalizedPath}`,
    type,
    shortcode: segments[1],
    originalUrl: input
  };
}

export function buildPendingInstagramDownload(normalized, quality = '1080p') {
  return {
    status: 'metadata_ready',
    platform: 'instagram',
    type: normalized.type,
    shortcode: normalized.shortcode,
    canonicalUrl: normalized.url,
    requestedQuality: quality,
    title: `Instagram ${normalized.type} ${normalized.shortcode}`,
    thumbnail: null,
    duration: null,
    formats: [],
    downloadUrl: null,
    nextStep: 'Connect a compliant Instagram media extraction provider or first-party ingestion service.'
  };
}
