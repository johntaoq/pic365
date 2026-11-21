export const MAX_LAYOUT_REFERENCE_EDGE = 512;
export const LAYOUT_REFERENCE_JPEG_QUALITY = 0.72;

const referenceCache = new Map();

export function layoutReferenceDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('INVALID_LAYOUT_REFERENCE_SIZE');
  }
  const scale = Math.min(1, MAX_LAYOUT_REFERENCE_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export function loadEcommerceLayoutReference(imageUrl) {
  if (!imageUrl) return Promise.reject(new Error('LAYOUT_REFERENCE_UNAVAILABLE'));
  if (referenceCache.has(imageUrl)) return referenceCache.get(imageUrl);
  const pending = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const { width, height } = layoutReferenceDimensions(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('LAYOUT_REFERENCE_UNAVAILABLE');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', LAYOUT_REFERENCE_JPEG_QUALITY);
        if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('LAYOUT_REFERENCE_ENCODING_FAILED');
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('LAYOUT_REFERENCE_UNAVAILABLE'));
    image.src = imageUrl;
  }).catch((error) => {
    referenceCache.delete(imageUrl);
    throw error;
  });
  referenceCache.set(imageUrl, pending);
  return pending;
}
