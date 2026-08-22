export const ECOMMERCE_PROJECT_ASSET_LIMIT = 9;
export const ECOMMERCE_PROJECT_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const ECOMMERCE_PROJECT_ASSET_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp'
]);

export function isSupportedEcommerceAssetMimeType(value) {
  return ECOMMERCE_PROJECT_ASSET_MIME_TYPES.includes(String(value || '').split(';')[0].trim().toLowerCase());
}
