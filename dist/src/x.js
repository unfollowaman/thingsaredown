const X_HOSTS = new Set(['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);

function cleanStatusId(id) {
  return String(id || '').trim();
}

export function normalizeXUrl(rawUrl) {
  const input = String(rawUrl || '').trim();

  if (!input) {
    return {
      ok: false,
      error: 'Paste an X/Twitter status URL.'
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
  if (!X_HOSTS.has(hostname)) {
    return {
      ok: false,
      error: 'Only X/Twitter URLs are supported by this endpoint.'
    };
  }

  const segments = parsed.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const statusIndex = segments.findIndex((segment) => ['status', 'statuses'].includes(segment.toLowerCase()));
  const username = segments[0];
  const statusId = cleanStatusId(segments[statusIndex + 1]);

  if (!username || ['i', 'search', 'explore', 'hashtag', 'home'].includes(username.toLowerCase()) || statusIndex < 1) {
    return {
      ok: false,
      error: 'Use a direct X/Twitter status URL.'
    };
  }

  if (!statusId) {
    return {
      ok: false,
      error: 'This X/Twitter status URL is missing its status identifier.'
    };
  }

  if (!/^\d+$/.test(statusId)) {
    return {
      ok: false,
      error: 'This X/Twitter status URL has an invalid status identifier.'
    };
  }

  return {
    ok: true,
    url: `https://x.com/${username}/status/${statusId}`,
    platform: 'x',
    type: 'status',
    username,
    statusId,
    originalUrl: input
  };
}

export function buildPendingXDownload(normalized, quality = '1080p') {
  return {
    status: 'metadata_ready',
    platform: 'x',
    type: normalized.type,
    username: normalized.username,
    statusId: normalized.statusId,
    canonicalUrl: normalized.url,
    requestedQuality: quality,
    title: `X/Twitter status ${normalized.statusId}`,
    thumbnail: null,
    duration: null,
    formats: [],
    downloadUrl: null,
    nextStep: 'Connect a compliant X/Twitter media extraction provider or first-party ingestion service.'
  };
}
