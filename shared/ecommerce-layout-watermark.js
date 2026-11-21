export const LAYOUT_WATERMARK_PROTOCOL_VERSION = 3;
export const MAX_LAYOUT_WATERMARK_TEXT_CHARACTERS = 19;
export const MAX_LAYOUT_WATERMARK_COLUMNS = 8;
export const MAX_LAYOUT_WATERMARK_IMAGE_BYTES = 1024 * 1024;
export const MAX_LAYOUT_WATERMARK_TEXT_IMAGE_BYTES = 256 * 1024;
export const DEFAULT_ECOMMERCE_WATERMARK_SETTINGS = Object.freeze({
  angle: 0,
  columns: 1,
  textEnabled: true,
  text: '',
  textImageDataUrl: '',
  imageEnabled: false,
  imageDataUrl: '',
  imageName: ''
});

function invalidWatermark() {
  return Object.assign(new Error('LAYOUT_WATERMARK_INVALID'), { code: 'LAYOUT_WATERMARK_INVALID' });
}

function validateDataUrl(value, mimeTypes, maxBytes) {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 4 / 3) + 64) throw invalidWatermark();
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || !mimeTypes.includes(match[1]) || match[2].length % 4 !== 0) throw invalidWatermark();
  const byteLength = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (!byteLength || byteLength > maxBytes) throw invalidWatermark();
  return value;
}

export function normalizeEcommerceLayoutWatermark(value, { isLayout = false } = {}) {
  if (value == null) return null;
  // Keep earlier 45- and 135-degree tasks retryable with their original orientation.
  if (!isLayout || typeof value !== 'object' || Array.isArray(value) || ![0, -45, 45, 135].includes(value.angle)
    || (value.columns !== undefined
      && (!Number.isInteger(value.columns) || value.columns < 1 || value.columns > MAX_LAYOUT_WATERMARK_COLUMNS))) {
    throw invalidWatermark();
  }
  const hasText = Object.hasOwn(value, 'text');
  const hasTextImage = Object.hasOwn(value, 'textImageDataUrl');
  const hasImage = Object.hasOwn(value, 'imageDataUrl');
  if (hasText !== hasTextImage || (!hasText && !hasImage)) throw invalidWatermark();

  const normalized = { angle: value.angle, ...(value.columns === undefined ? {} : { columns: value.columns }) };
  if (hasText) {
    if (typeof value.text !== 'string') throw invalidWatermark();
    const text = value.text.trim();
    if (!text || Array.from(text).length > MAX_LAYOUT_WATERMARK_TEXT_CHARACTERS || /[\u0000-\u001f\u007f]/.test(text)) {
      throw invalidWatermark();
    }
    normalized.text = text;
    normalized.textImageDataUrl = validateDataUrl(value.textImageDataUrl, ['image/png'], MAX_LAYOUT_WATERMARK_TEXT_IMAGE_BYTES);
  }
  if (hasImage) {
    normalized.imageDataUrl = validateDataUrl(value.imageDataUrl,
      ['image/png', 'image/jpeg', 'image/webp'], MAX_LAYOUT_WATERMARK_IMAGE_BYTES);
  }
  return normalized;
}

export function normalizeEcommerceWatermarkSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidWatermark();
  const settings = { ...DEFAULT_ECOMMERCE_WATERMARK_SETTINGS, ...value };
  if (![0, -45].includes(settings.angle)
    || !Number.isInteger(settings.columns) || settings.columns < 1 || settings.columns > MAX_LAYOUT_WATERMARK_COLUMNS
    || typeof settings.textEnabled !== 'boolean' || typeof settings.imageEnabled !== 'boolean'
    || typeof settings.text !== 'string' || Array.from(settings.text).length > MAX_LAYOUT_WATERMARK_TEXT_CHARACTERS
    || /[\u0000-\u001f\u007f]/.test(settings.text)
    || typeof settings.textImageDataUrl !== 'string'
    || typeof settings.imageDataUrl !== 'string'
    || typeof settings.imageName !== 'string' || Array.from(settings.imageName).length > 120
    || /[\u0000-\u001f\u007f]/.test(settings.imageName)) throw invalidWatermark();
  if (settings.text.trim()) {
    validateDataUrl(settings.textImageDataUrl, ['image/png'], MAX_LAYOUT_WATERMARK_TEXT_IMAGE_BYTES);
  } else if (settings.textImageDataUrl) throw invalidWatermark();
  if (settings.imageDataUrl) {
    validateDataUrl(settings.imageDataUrl, ['image/png', 'image/jpeg', 'image/webp'], MAX_LAYOUT_WATERMARK_IMAGE_BYTES);
  } else if (settings.imageName) throw invalidWatermark();
  return {
    angle: settings.angle,
    columns: settings.columns,
    textEnabled: settings.textEnabled,
    text: settings.text,
    textImageDataUrl: settings.textImageDataUrl,
    imageEnabled: settings.imageEnabled,
    imageDataUrl: settings.imageDataUrl,
    imageName: settings.imageName
  };
}

export function activeEcommerceWatermarkSettings(value) {
  const settings = normalizeEcommerceWatermarkSettings(value);
  if ((!settings.textEnabled && !settings.imageEnabled)
    || (settings.textEnabled && !settings.text.trim())
    || (settings.imageEnabled && !settings.imageDataUrl)) {
    throw Object.assign(new Error('WATERMARK_SETTINGS_INCOMPLETE'), { code: 'WATERMARK_SETTINGS_INCOMPLETE' });
  }
  return normalizeEcommerceLayoutWatermark({
    angle: settings.angle,
    columns: settings.columns,
    ...(settings.textEnabled ? { text: settings.text, textImageDataUrl: settings.textImageDataUrl } : {}),
    ...(settings.imageEnabled ? { imageDataUrl: settings.imageDataUrl } : {})
  }, { isLayout: true });
}
