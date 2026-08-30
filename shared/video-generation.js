export const VIDEO_DURATIONS = Object.freeze([4, 8, 12]);
export const VIDEO_SIZES = Object.freeze(['1280x720', '720x1280']);

export function normalizeVideoDuration(value, fallback = 4) {
  const parsed = Math.round(Number(value) || 0);
  return VIDEO_DURATIONS.includes(parsed) ? parsed : fallback;
}
export function normalizeVideoSize(value, fallback = '1280x720') {
  const normalized = String(value || '').trim().toLowerCase();
  return VIDEO_SIZES.includes(normalized) ? normalized : fallback;
}

export function videoSizeForSource({ width = 0, height = 0, direction = 'auto' } = {}) {
  if (direction === 'portrait') return '720x1280';
  if (direction === 'landscape') return '1280x720';
  return Number(height || 0) > Number(width || 0) ? '720x1280' : '1280x720';
}

export function parseVideoSize(value) {
  const normalized = normalizeVideoSize(value);
  const [width, height] = normalized.split('x').map(Number);
  return { size: normalized, width, height };
}

export function videoDirectionForSize(value) {
  return normalizeVideoSize(value) === '720x1280' ? 'portrait' : 'landscape';
}
