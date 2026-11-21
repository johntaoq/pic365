import sharp from 'sharp';
import { normalizeEcommerceLayoutWatermark } from '../../shared/ecommerce-layout-watermark.js';

const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 45 * 1000;
const WATERMARK_SIZE_SCALE = 1.2;

function invalidWatermark() {
  return Object.assign(new Error('LAYOUT_WATERMARK_INVALID'), { code: 'LAYOUT_WATERMARK_INVALID' });
}

async function checkedRaster(dataUrl, { text = false } = {}) {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false });
    const metadata = await image.metadata();
    const expectedFormat = dataUrl.slice(5, dataUrl.indexOf(';')).replace('image/jpeg', 'jpeg').replace('image/', '');
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height
      || metadata.width > (text ? 1200 : 4096) || metadata.height > (text ? 256 : 4096)
      || (text && !metadata.hasAlpha)) throw invalidWatermark();
    const stats = await image.stats();
    if (metadata.hasAlpha && !stats.channels[3]?.max) throw invalidWatermark();
    return bytes;
  } catch {
    throw invalidWatermark();
  }
}

export async function prepareEcommerceLayoutWatermark(value) {
  const watermark = normalizeEcommerceLayoutWatermark(value, { isLayout: true });
  if (!watermark) return null;
  return {
    angle: watermark.angle,
    columns: watermark.columns ?? 1,
    text: watermark.text ? await checkedRaster(watermark.textImageDataUrl, { text: true }) : null,
    image: watermark.imageDataUrl ? await checkedRaster(watermark.imageDataUrl) : null
  };
}

async function readGeneratedImage(value, fetchImpl) {
  if (Buffer.isBuffer(value)) {
    if (!value.length || value.length > MAX_SOURCE_BYTES) throw new Error('LAYOUT_WATERMARK_SOURCE_INVALID');
    return value;
  }
  const inline = String(value || '').match(/^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/);
  if (inline) {
    const bytes = Buffer.from(inline[1], 'base64');
    if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error('LAYOUT_WATERMARK_SOURCE_INVALID');
    return bytes;
  }
  const url = new URL(String(value || ''));
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('LAYOUT_WATERMARK_SOURCE_INVALID');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok || Number(response.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) {
      throw new Error('LAYOUT_WATERMARK_SOURCE_INVALID');
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > MAX_SOURCE_BYTES) throw new Error('LAYOUT_WATERMARK_SOURCE_INVALID');
      chunks.push(Buffer.from(chunk));
    }
    if (!length) throw new Error('LAYOUT_WATERMARK_SOURCE_INVALID');
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timeout);
  }
}

async function fadedMark(bytes, width, height, opacity) {
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize({ width, height, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += 4) {
    data[index] = Math.round(data[index] * opacity);
  }
  return {
    width: info.width,
    height: info.height,
    bytes: await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
  };
}

async function compositeEcommerceLayoutWatermark(image, prepared, fetchImpl) {
  const source = await readGeneratedImage(image, fetchImpl);
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) throw new Error('LAYOUT_WATERMARK_SOURCE_INVALID');
  const sideways = [5, 6, 7, 8].includes(metadata.orientation);
  const width = sideways ? metadata.height : metadata.width;
  const height = sideways ? metadata.width : metadata.height;
  const columns = prepared.columns ?? 1;
  // Square-ish cells keep the spacing balanced on portrait and landscape outputs.
  const rows = Math.min(24, Math.max(1, Math.round(height * columns / width)));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const marks = [];
  if (prepared.image) marks.push(await fadedMark(prepared.image,
    Math.max(1, Math.round(cellWidth * .36 * WATERMARK_SIZE_SCALE)),
    Math.max(1, Math.round(cellHeight * .14 * WATERMARK_SIZE_SCALE)), .36));
  if (prepared.text) marks.push(await fadedMark(prepared.text,
    Math.max(1, Math.round(cellWidth * .52 * WATERMARK_SIZE_SCALE)),
    Math.max(1, Math.round(cellHeight * .075 * WATERMARK_SIZE_SCALE)), .52));
  const gap = marks.length > 1
    ? Math.max(2, Math.round(Math.min(cellWidth, cellHeight) * .018 * WATERMARK_SIZE_SCALE)) : 0;
  const stampWidth = Math.max(...marks.map((mark) => mark.width));
  const stampHeight = marks.reduce((sum, mark) => sum + mark.height, gap);
  let top = 0;
  const stamp = await sharp({
    create: { width: stampWidth, height: stampHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(marks.map((mark) => {
    const overlay = { input: mark.bytes, left: Math.round((stampWidth - mark.width) / 2), top };
    top += mark.height + gap;
    return overlay;
  })).png().toBuffer();
  let overlay = prepared.angle
    ? await sharp(stamp).rotate(prepared.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    : stamp;
  let overlayInfo = await sharp(overlay).metadata();
  const cellMaxWidth = Math.max(1, Math.floor(cellWidth * .72 * WATERMARK_SIZE_SCALE));
  const cellMaxHeight = Math.max(1, Math.floor(cellHeight * .72 * WATERMARK_SIZE_SCALE));
  if (overlayInfo.width > cellMaxWidth || overlayInfo.height > cellMaxHeight) {
    overlay = await sharp(overlay).resize({
      width: cellMaxWidth,
      height: cellMaxHeight,
      fit: 'inside'
    }).png().toBuffer();
    overlayInfo = await sharp(overlay).metadata();
  }

  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles.push({
        input: overlay,
        left: Math.round((column + .5) * cellWidth - overlayInfo.width / 2),
        top: Math.round((row + .5) * cellHeight - overlayInfo.height / 2)
      });
    }
  }
  const format = ['jpeg', 'webp', 'png'].includes(metadata.format) ? metadata.format : 'png';
  let output = sharp(source).rotate().composite(tiles);
  if (format === 'jpeg') output = output.jpeg({ quality: 92 });
  if (format === 'webp') output = output.webp({ quality: 92 });
  if (format === 'png') output = output.png();
  return { bytes: await output.toBuffer(), format };
}

export async function applyEcommerceLayoutWatermark(image, prepared, { fetchImpl = fetch } = {}) {
  if (!prepared) return image;
  const { bytes, format } = await compositeEcommerceLayoutWatermark(image, prepared, fetchImpl);
  const mimeType = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

export async function applyEcommerceLayoutWatermarkBytes(bytes, prepared) {
  if (!prepared) return bytes;
  return (await compositeEcommerceLayoutWatermark(bytes, prepared, fetch)).bytes;
}
