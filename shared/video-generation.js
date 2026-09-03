export const VIDEO_DURATIONS = Object.freeze([4, 8, 12]);
export const VIDEO_SIZES = Object.freeze(['1280x720', '720x1280', '1920x1080', '1080x1920', '3840x2160', '2160x3840']);

export function videoProviderDurations(provider = {}) {
  const providerType = String(provider.providerType || provider.provider_type || '').toLowerCase();
  const model = String(provider.model || '').toLowerCase();
  if (providerType === 'baidu-kling-video') {
    if (model.includes('o1')) return [5, 10];
    return Array.from({ length: 13 }, (_, index) => index + 3);
  }
  return [...VIDEO_DURATIONS];
}

export function normalizeVideoDurationForProvider(value, provider = {}, fallback) {
  const durations = videoProviderDurations(provider);
  const preferred = durations.includes(Number(fallback)) ? Number(fallback) : durations[0];
  const parsed = Math.round(Number(value) || 0);
  return durations.includes(parsed) ? parsed : preferred;
}

export function normalizeVideoDuration(value, fallback = 4) {
  const parsed = Math.round(Number(value) || 0);
  return VIDEO_DURATIONS.includes(parsed) ? parsed : fallback;
}
export function normalizeVideoSize(value, fallback = '1280x720') {
  const normalized = String(value || '').trim().toLowerCase();
  return VIDEO_SIZES.includes(normalized) ? normalized : fallback;
}

export function videoSizeForSource({ width = 0, height = 0, direction = 'auto', mode = 'std' } = {}) {
  const normalizedMode = ['std', 'pro', '4k'].includes(String(mode || '').toLowerCase()) ? String(mode).toLowerCase() : 'std';
  const dimensions = normalizedMode === '4k'
    ? { landscape: '3840x2160', portrait: '2160x3840' }
    : normalizedMode === 'pro'
      ? { landscape: '1920x1080', portrait: '1080x1920' }
      : { landscape: '1280x720', portrait: '720x1280' };
  if (direction === 'portrait') return dimensions.portrait;
  if (direction === 'landscape') return dimensions.landscape;
  return Number(height || 0) > Number(width || 0) ? dimensions.portrait : dimensions.landscape;
}

export function parseVideoSize(value) {
  const normalized = normalizeVideoSize(value);
  const [width, height] = normalized.split('x').map(Number);
  return { size: normalized, width, height };
}

export function videoDirectionForSize(value) {
  const parsed = parseVideoSize(value);
  return parsed.height > parsed.width ? 'portrait' : 'landscape';
}
