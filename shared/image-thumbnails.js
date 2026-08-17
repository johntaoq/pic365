export const GENERATED_THUMBNAIL_VARIANT = 'thumb';
export const GENERATED_THUMBNAIL_VERSION = 'v1';
export const GENERATED_IMAGE_URL_VERSION = 'v2';
export const GENERATED_THUMBNAIL_MAX_SIDE = 480;

export function generatedImageUrl(generationId, variant = '') {
  const id = encodeURIComponent(String(generationId || '').trim());
  if (!id) return '';
  const suffix = variant === GENERATED_THUMBNAIL_VARIANT ? '&variant=thumb' : '';
  return `/api/generated?id=${id}${suffix}&v=${GENERATED_IMAGE_URL_VERSION}`;
}

export function generatedThumbnailStoragePath(storagePath) {
  const normalized = String(storagePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('../') || normalized.includes('/..')) return '';
  const withoutExtension = normalized.replace(/\.[^./]+$/, '');
  return `thumbnails/${GENERATED_THUMBNAIL_VERSION}/${withoutExtension}.webp`;
}

export function galleryThumbnailUrl(imageUrl) {
  const value = String(imageUrl || '');
  if (!value.startsWith('/images/') || value.startsWith('/images/thumbnails/')) return value;
  const queryIndex = value.search(/[?#]/);
  const pathname = queryIndex >= 0 ? value.slice(0, queryIndex) : value;
  const suffix = queryIndex >= 0 ? value.slice(queryIndex) : '';
  const relative = pathname.slice('/images/'.length).replace(/\.[^./]+$/, '');
  return `/images/thumbnails/${relative}.webp${suffix}`;
}
