import sharp from 'sharp';

const WATERMARK_TEXT = 'www.pic365.org';
const WATERMARK_WIDTH_RATIO = 0.08;
const WATERMARK_MARGIN_RATIO = 0.015;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 45 * 1000;

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error('FREE_IMAGE_WATERMARK_SOURCE_INVALID');
  return bytes;
}

async function readSourceImage(value, fetchImpl = fetch) {
  const inline = parseDataUrl(value);
  if (inline) return inline;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(String(value || ''), { signal: controller.signal });
    if (!response.ok) throw new Error(`FREE_IMAGE_WATERMARK_DOWNLOAD_${response.status}`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_SOURCE_BYTES) throw new Error('FREE_IMAGE_WATERMARK_SOURCE_TOO_LARGE');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error('FREE_IMAGE_WATERMARK_SOURCE_TOO_LARGE');
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

export function getFreeImageWatermarkLayout(width, height) {
  const imageWidth = Math.max(1, Math.round(Number(width) || 1));
  const imageHeight = Math.max(1, Math.round(Number(height) || 1));
  const watermarkWidth = Math.max(48, Math.round(imageWidth * WATERMARK_WIDTH_RATIO));
  const watermarkHeight = Math.max(12, Math.round(watermarkWidth * 0.2));
  const margin = Math.max(6, Math.round(imageWidth * WATERMARK_MARGIN_RATIO));
  return {
    width: watermarkWidth,
    height: watermarkHeight,
    left: Math.max(0, imageWidth - watermarkWidth - margin),
    top: Math.min(Math.max(0, margin), Math.max(0, imageHeight - watermarkHeight))
  };
}

function watermarkSvg(width, height) {
  const safeText = escapeXml(WATERMARK_TEXT);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1000 200">
      <text x="4" y="158" textLength="992" lengthAdjust="spacingAndGlyphs"
        font-family="Arial, Helvetica, sans-serif" font-size="170" font-weight="700"
        fill="rgba(255,255,255,0.86)" stroke="rgba(0,0,0,0.62)" stroke-width="18"
        paint-order="stroke fill">${safeText}</text>
    </svg>
  `);
}

export async function addFreeImageWatermark(image, { fetchImpl = fetch } = {}) {
  const source = await readSourceImage(image, fetchImpl);
  const rotated = sharp(source, { animated: false, failOn: 'none' }).rotate();
  const metadata = await rotated.metadata();
  if (!metadata.width || !metadata.height) throw new Error('FREE_IMAGE_WATERMARK_SOURCE_INVALID');

  const layout = getFreeImageWatermarkLayout(metadata.width, metadata.height);
  const watermark = await sharp(watermarkSvg(layout.width, layout.height)).png().toBuffer();
  const bytes = await rotated
    .composite([{ input: watermark, left: layout.left, top: layout.top }])
    .webp({ quality: 88, effort: 5 })
    .toBuffer();

  return {
    image: `data:image/webp;base64,${bytes.toString('base64')}`,
    contentType: 'image/webp',
    width: metadata.width,
    height: metadata.height,
    watermark: {
      text: WATERMARK_TEXT,
      ...layout
    }
  };
}

export async function ensureFreeImageWatermark(result, options = {}) {
  const source = typeof result === 'string' ? result : result?.image;
  const knownWatermark = typeof result === 'object' && result?.watermarked === true
    && result?.watermark?.text === WATERMARK_TEXT;
  if (knownWatermark && source) return result;
  return addFreeImageWatermark(source, options);
}
