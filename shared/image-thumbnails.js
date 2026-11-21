export const GENERATED_THUMBNAIL_VARIANT = 'thumb';
export const GENERATED_THUMBNAIL_VERSION = 'v1';
export const GENERATED_IMAGE_URL_VERSION = 'v2';
export const GENERATED_IMAGE_VARIANT_URL_VERSION = 'v3';
export const GENERATED_PREVIEW_VARIANT = 'preview';
export const GENERATED_THUMBNAIL_MAX_SIDE = 480;

export function generatedImageUrl(generationId, variant = '') {
  const id = encodeURIComponent(String(generationId || '').trim());
  if (!id) return '';
  const normalized = variant === 'thumbnail' ? GENERATED_THUMBNAIL_VARIANT : variant;
  const useVariant = [GENERATED_THUMBNAIL_VARIANT, GENERATED_PREVIEW_VARIANT].includes(normalized);
  const suffix = useVariant ? `&variant=${normalized}` : '';
  return `/api/generated?id=${id}${suffix}&v=${useVariant ? GENERATED_IMAGE_VARIANT_URL_VERSION : GENERATED_IMAGE_URL_VERSION}`;
}

export function generatedImagePreviewSources(item = {}) {
  const original = item.imageUrl || item.image || '';
  const generationId = item.generationId || (original.startsWith('/api/generated?')
    ? new URL(original, 'http://localhost').searchParams.get('id') : '');
  return {
    thumbnail: generationId ? generatedImageUrl(generationId, GENERATED_THUMBNAIL_VARIANT) : item.thumbnailUrl || original,
    preview: generationId ? generatedImageUrl(generationId, GENERATED_PREVIEW_VARIANT) : item.previewUrl || original
  };
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
