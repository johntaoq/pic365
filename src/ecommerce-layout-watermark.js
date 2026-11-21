import { MAX_LAYOUT_WATERMARK_IMAGE_BYTES } from '../shared/ecommerce-layout-watermark.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function prepareEcommerceWatermarkImage(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('WATERMARK_IMAGE_INVALID');
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('WATERMARK_IMAGE_TOO_LARGE');

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('WATERMARK_IMAGE_INVALID'));
      image.src = objectUrl;
    });
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width > 10000 || height > 10000 || width * height > 40_000_000) {
      throw new Error('WATERMARK_IMAGE_INVALID');
    }
    for (const maxSide of [512, 384, 256]) {
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('WATERMARK_IMAGE_INVALID');
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.86, .7]) {
        const imageDataUrl = canvas.toDataURL('image/webp', quality);
        if (imageDataUrl.length <= Math.ceil(MAX_LAYOUT_WATERMARK_IMAGE_BYTES * 4 / 3) + 64) {
          return { imageDataUrl, name: file.name };
        }
      }
    }
    throw new Error('WATERMARK_IMAGE_TOO_LARGE');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function renderEcommerceWatermarkText(text) {
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('WATERMARK_TEXT_INVALID');
  let fontSize = 64;
  const family = '"Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", sans-serif';
  measure.font = `700 ${fontSize}px ${family}`;
  fontSize = Math.min(fontSize, Math.floor(fontSize * 1150 / Math.max(1, measure.measureText(text).width)));

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(Math.min(1200, measure.measureText(text).width * fontSize / 64 + 42));
  canvas.height = 100;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('WATERMARK_TEXT_INVALID');
  context.font = `700 ${fontSize}px ${family}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = 3;
  context.strokeStyle = 'rgba(17, 30, 28, .88)';
  context.fillStyle = '#ffffff';
  context.strokeText(text, canvas.width / 2, canvas.height / 2);
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL('image/png');
}
