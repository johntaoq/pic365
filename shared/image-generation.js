export const IMAGE_DIMENSION_STEP = 16;
export const IMAGE_MIN_SIDE = 480;
export const IMAGE_MAX_SIDE = 3840;
export const IMAGE_MIN_PIXELS = 655_360;
export const IMAGE_MAX_PIXELS = 8_294_400;
export const IMAGE_MIN_ASPECT = 1 / 3;
export const IMAGE_MAX_ASPECT = 3;

export const MAI_IMAGE_MIN_SIDE = 768;
export const MAI_IMAGE_MAX_PIXELS = 1_048_576;

const DEFAULT_IMAGE_MODEL_CONSTRAINTS = Object.freeze({
  modelFamily: 'default',
  isMai: false,
  allowAutoSize: true,
  minSide: IMAGE_MIN_SIDE,
  maxSide: IMAGE_MAX_SIDE,
  minPixels: IMAGE_MIN_PIXELS,
  maxPixels: IMAGE_MAX_PIXELS,
  minAspect: IMAGE_MIN_ASPECT,
  maxAspect: IMAGE_MAX_ASPECT,
  maxReferenceImages: 9,
  referenceMimeTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
});

const MAI_IMAGE_2_CONSTRAINTS = Object.freeze({
  modelFamily: 'mai-image-2',
  isMai: true,
  allowAutoSize: false,
  minSide: MAI_IMAGE_MIN_SIDE,
  maxSide: Math.floor((MAI_IMAGE_MAX_PIXELS / MAI_IMAGE_MIN_SIDE) / IMAGE_DIMENSION_STEP) * IMAGE_DIMENSION_STEP,
  minPixels: MAI_IMAGE_MIN_SIDE * MAI_IMAGE_MIN_SIDE,
  maxPixels: MAI_IMAGE_MAX_PIXELS,
  minAspect: 0,
  maxAspect: Number.POSITIVE_INFINITY,
  maxReferenceImages: 0,
  referenceMimeTypes: Object.freeze(['image/jpeg', 'image/png'])
});

const MAI_IMAGE_2_5_CONSTRAINTS = Object.freeze({
  ...MAI_IMAGE_2_CONSTRAINTS,
  modelFamily: 'mai-image-2.5',
  maxReferenceImages: 1
});

export const IMAGE_QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'];

export const IMAGE_RATIO_PRESETS = [
  { id: '1:1', width: 1, height: 1 },
  { id: '1:2', width: 1, height: 2 },
  { id: '2:1', width: 2, height: 1 },
  { id: '1:3', width: 1, height: 3 },
  { id: '3:1', width: 3, height: 1 },
  { id: '2:3', width: 2, height: 3 },
  { id: '3:2', width: 3, height: 2 },
  { id: '3:4', width: 3, height: 4 },
  { id: '4:3', width: 4, height: 3 },
  { id: '9:16', width: 9, height: 16 },
  { id: '16:9', width: 16, height: 9 }
];

export const COMMON_IMAGE_SIZES = [
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '2048x2048',
  '3840x2160',
  '2160x3840',
  '1024x3072'
];

export function alignImageDimension(value, { min = IMAGE_MIN_SIDE, max = IMAGE_MAX_SIDE } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  const aligned = Math.round(number / IMAGE_DIMENSION_STEP) * IMAGE_DIMENSION_STEP;
  return Math.max(min, Math.min(max, aligned));
}

export function parseImageSize(value) {
  if (value === 'auto') return { auto: true, width: null, height: null };
  const match = String(value || '').trim().toLowerCase().match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  return { auto: false, width: Number(match[1]), height: Number(match[2]) };
}

function normalizeModelName(value) {
  return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

export function getImageModelConstraints(model) {
  const normalized = normalizeModelName(model);
  if (normalized === 'mai-image-2.5' || normalized.startsWith('mai-image-2.5-')) {
    return MAI_IMAGE_2_5_CONSTRAINTS;
  }
  if (normalized === 'mai-image-2' || normalized.startsWith('mai-image-2-')) {
    return MAI_IMAGE_2_CONSTRAINTS;
  }
  return DEFAULT_IMAGE_MODEL_CONSTRAINTS;
}

export function validateImageReferenceInputsForModel({ model = '', count = 0, mimeTypes = [] } = {}) {
  const constraints = getImageModelConstraints(model);
  const safeCount = Math.max(0, Math.round(Number(count) || 0));
  if (safeCount && constraints.maxReferenceImages === 0) {
    return { valid: false, error: 'REFERENCE_IMAGES_UNSUPPORTED', constraints };
  }
  if (safeCount > constraints.maxReferenceImages) {
    return { valid: false, error: 'TOO_MANY_REFERENCE_IMAGES', constraints };
  }
  const allowedTypes = new Set(constraints.referenceMimeTypes);
  const invalidType = (Array.isArray(mimeTypes) ? mimeTypes : [])
    .map((value) => String(value || '').split(';')[0].trim().toLowerCase())
    .find((value) => value && !allowedTypes.has(value === 'image/jpg' ? 'image/jpeg' : value));
  if (invalidType) {
    return { valid: false, error: 'INVALID_REFERENCE_IMAGE_FORMAT', invalidType, constraints };
  }
  return { valid: true, constraints };
}

export function validateImageSize(value) {
  const parsed = parseImageSize(value);
  if (!parsed) return { valid: false, error: 'FORMAT' };
  if (parsed.auto) return { valid: true, ...parsed, pixels: null, aspect: null };

  const { width, height } = parsed;
  if (!width || !height || width % IMAGE_DIMENSION_STEP || height % IMAGE_DIMENSION_STEP) {
    return { valid: false, error: 'STEP', ...parsed };
  }
  if (width < IMAGE_MIN_SIDE || height < IMAGE_MIN_SIDE) {
    return { valid: false, error: 'MIN_SIDE', ...parsed };
  }
  if (width > IMAGE_MAX_SIDE || height > IMAGE_MAX_SIDE) {
    return { valid: false, error: 'MAX_SIDE', ...parsed };
  }
  const pixels = width * height;
  if (pixels < IMAGE_MIN_PIXELS) return { valid: false, error: 'MIN_PIXELS', ...parsed, pixels };
  if (pixels > IMAGE_MAX_PIXELS) return { valid: false, error: 'MAX_PIXELS', ...parsed, pixels };
  const aspect = width / height;
  if (aspect < IMAGE_MIN_ASPECT || aspect > IMAGE_MAX_ASPECT) {
    return { valid: false, error: 'ASPECT', ...parsed, pixels, aspect };
  }
  return { valid: true, ...parsed, pixels, aspect };
}

export function validateImageSizeForModel(value, model) {
  const constraints = getImageModelConstraints(model);
  if (!constraints.isMai) return validateImageSize(value);

  const parsed = parseImageSize(value);
  if (!parsed) return { valid: false, error: 'FORMAT' };
  if (parsed.auto) return { valid: false, error: 'AUTO_SIZE_UNSUPPORTED', ...parsed };

  const { width, height } = parsed;
  if (!width || !height || width % IMAGE_DIMENSION_STEP || height % IMAGE_DIMENSION_STEP) {
    return { valid: false, error: 'STEP', ...parsed };
  }
  if (width < constraints.minSide || height < constraints.minSide) {
    return { valid: false, error: 'MAI_MIN_SIDE', ...parsed };
  }
  const pixels = width * height;
  if (pixels > constraints.maxPixels) {
    return { valid: false, error: 'MAI_MAX_PIXELS', ...parsed, pixels, aspect: width / height };
  }
  return { valid: true, ...parsed, pixels, aspect: width / height };
}

function constrainedRatioDimensions(widthRatio, heightRatio, targetLongSide, constraints) {
  const ratioWidth = Math.max(1, Number(widthRatio) || 1);
  const ratioHeight = Math.max(1, Number(heightRatio) || 1);
  const minMultiplier = Math.ceil(
    Math.max(constraints.minSide / ratioWidth, constraints.minSide / ratioHeight) / IMAGE_DIMENSION_STEP
  ) * IMAGE_DIMENSION_STEP;
  const maxMultiplier = Math.floor(
    Math.min(
      constraints.maxSide / ratioWidth,
      constraints.maxSide / ratioHeight,
      Math.sqrt(constraints.maxPixels / (ratioWidth * ratioHeight))
    ) / IMAGE_DIMENSION_STEP
  ) * IMAGE_DIMENSION_STEP;
  if (!Number.isFinite(minMultiplier) || !Number.isFinite(maxMultiplier) || minMultiplier > maxMultiplier) return null;

  const targetMultiplier = Math.floor(
    Number(targetLongSide || 1536) / Math.max(ratioWidth, ratioHeight) / IMAGE_DIMENSION_STEP
  ) * IMAGE_DIMENSION_STEP;
  const multiplier = Math.max(minMultiplier, Math.min(maxMultiplier, targetMultiplier || minMultiplier));
  return {
    width: ratioWidth * multiplier,
    height: ratioHeight * multiplier
  };
}

export function dimensionsForRatio(widthRatio, heightRatio, targetLongSide = 1536) {
  return constrainedRatioDimensions(widthRatio, heightRatio, targetLongSide, DEFAULT_IMAGE_MODEL_CONSTRAINTS);
}

export function dimensionsForImageModelRatio(model, widthRatio, heightRatio, targetLongSide = 1536) {
  return constrainedRatioDimensions(widthRatio, heightRatio, targetLongSide, getImageModelConstraints(model));
}

export function dimensionsFromLockedValue({ changed, value, ratioWidth, ratioHeight, constraints = DEFAULT_IMAGE_MODEL_CONSTRAINTS }) {
  const widthRatio = Math.max(1, Number(ratioWidth) || 1);
  const heightRatio = Math.max(1, Number(ratioHeight) || 1);
  const ratioComponent = changed === 'height' ? heightRatio : widthRatio;
  const maxMultiplier = Math.floor(
    Math.min(
      constraints.maxSide / widthRatio,
      constraints.maxSide / heightRatio,
      Math.sqrt(constraints.maxPixels / (widthRatio * heightRatio))
    ) / IMAGE_DIMENSION_STEP
  ) * IMAGE_DIMENSION_STEP;
  const minMultiplier = Math.ceil(
    Math.max(constraints.minSide / widthRatio, constraints.minSide / heightRatio) / IMAGE_DIMENSION_STEP
  ) * IMAGE_DIMENSION_STEP;
  if (minMultiplier > maxMultiplier) return null;
  const rawMultiplier = Number(value) / ratioComponent;
  const multiplier = Math.max(
    minMultiplier,
    Math.min(maxMultiplier, Math.round(rawMultiplier / IMAGE_DIMENSION_STEP) * IMAGE_DIMENSION_STEP)
  );
  return {
    width: widthRatio * multiplier,
    height: heightRatio * multiplier
  };
}

export function normalizeImageQuality(value, fallback = 'auto') {
  return IMAGE_QUALITY_OPTIONS.includes(value) ? value : fallback;
}

export function resolveProviderImageQuality(value, fallback = 'low') {
  const normalized = normalizeImageQuality(value, fallback);
  return normalized === 'auto' ? 'medium' : normalized;
}

export function normalizeImageCount(value) {
  return Math.max(1, Math.min(4, Math.round(Number(value) || 1)));
}
