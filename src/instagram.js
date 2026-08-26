import { extractMediaInfo, downloadMedia } from '../server/downloader.js';

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

  const info = await extractMediaInfo(normalized.url);
  const downloadResult = await downloadMedia({
    url: normalized.url,
    quality,
    platform: 'instagram'
  });

  return {
    status: 'ready',
    platform: 'instagram',
    type: normalized.type,
    shortcode: normalized.shortcode,
    canonicalUrl: normalized.url,
    requestedQuality: quality || '1080p',
    title: info.title || `Instagram ${normalized.type} · ${normalized.shortcode}`,
    thumbnail: info.thumbnail,
    duration: info.duration,
    filename: downloadResult.filename,
    formats: info.formats,
    downloadUrl: downloadResult.downloadUrl
  };
}
