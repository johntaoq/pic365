export const IMAGE_DIMENSION_STEP = 16;
export const IMAGE_MIN_SIDE = 480;
export const IMAGE_MAX_SIDE = 3840;
export const IMAGE_MIN_PIXELS = 655_360;
export const IMAGE_MAX_PIXELS = 8_294_400;
export const IMAGE_MIN_ASPECT = 1 / 3;
export const IMAGE_MAX_ASPECT = 3;
export const IMAGE_REFERENCE_MAX_BYTES = 7 * 1024 * 1024;
export const IMAGE_REFERENCE_MAX_MEGABYTES = 7;

export const MAI_IMAGE_MIN_SIDE = 768;
export const MAI_IMAGE_MAX_PIXELS = 1_048_576;

const DEFAULT_IMAGE_MODEL_CONSTRAINTS = Object.freeze({
  modelFamily: 'default',
  isMai: false,
  isGeminiImage: false,
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
  isGeminiImage: false,
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

export const GEMINI_IMAGE_RATIO_PRESETS = Object.freeze([
  { id: '1:1', width: 1, height: 1 },
  { id: '1:4', width: 1, height: 4 },
  { id: '1:8', width: 1, height: 8 },
  { id: '2:3', width: 2, height: 3 },
  { id: '3:2', width: 3, height: 2 },
  { id: '3:4', width: 3, height: 4 },
  { id: '4:1', width: 4, height: 1 },
  { id: '4:3', width: 4, height: 3 },
  { id: '4:5', width: 4, height: 5 },
  { id: '5:4', width: 5, height: 4 },
  { id: '8:1', width: 8, height: 1 },
  { id: '9:16', width: 9, height: 16 },
  { id: '16:9', width: 16, height: 9 },
  { id: '21:9', width: 21, height: 9 }
]);

export const GEMINI_IMAGE_COMMON_SIZES = Object.freeze([
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '768x1024',
  '1024x768',
  '1024x1280',
  '1280x1024',
  '1008x1792',
  '1792x1008',
  '1792x768',
  '512x2048',
  '2048x512',
  '512x4096',
  '4096x512'
]);

const GEMINI_IMAGE_CONSTRAINTS = Object.freeze({
  modelFamily: 'gemini-image',
  isMai: false,
  isGeminiImage: true,
  allowAutoSize: true,
  minSide: 512,
  maxSide: 4096,
  minPixels: 512 * 512,
  maxPixels: 4096 * 4096,
  minAspect: 1 / 8,
  maxAspect: 8,
  // Gemini supports more inputs, while Pic365 intentionally keeps the
  // established nine-reference product limit for predictable request sizes.
  maxReferenceImages: 9,
  referenceMimeTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
  supportedAspectRatios: GEMINI_IMAGE_RATIO_PRESETS
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

export function isGeminiImageModel(value) {
  const normalized = normalizeModelName(value);
  return normalized.includes('gemini') && normalized.includes('image')
    || normalized.includes('nano-banana')
    || /^banana(?:-|$)/.test(normalized);
}

export function getImageModelConstraints(model) {
  const normalized = normalizeModelName(model);
  if (isGeminiImageModel(normalized)) return GEMINI_IMAGE_CONSTRAINTS;
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
  if (constraints.isGeminiImage) {
    const parsed = parseImageSize(value);
    if (!parsed) return { valid: false, error: 'FORMAT' };
    if (parsed.auto) return { valid: true, ...parsed, pixels: null, aspect: null };
    const { width, height } = parsed;
    if (!width || !height || width % IMAGE_DIMENSION_STEP || height % IMAGE_DIMENSION_STEP) {
      return { valid: false, error: 'STEP', ...parsed };
    }
    if (width < constraints.minSide || height < constraints.minSide) {
      return { valid: false, error: 'GEMINI_MIN_SIDE', ...parsed };
    }
    if (width > constraints.maxSide || height > constraints.maxSide) {
      return { valid: false, error: 'GEMINI_MAX_SIDE', ...parsed };
    }
    const pixels = width * height;
    if (pixels > constraints.maxPixels) {
      return { valid: false, error: 'GEMINI_MAX_PIXELS', ...parsed, pixels, aspect: width / height };
    }
    const supportedRatio = GEMINI_IMAGE_RATIO_PRESETS.find((preset) => width * preset.height === height * preset.width);
    if (!supportedRatio) {
      return { valid: false, error: 'GEMINI_ASPECT_RATIO', ...parsed, pixels, aspect: width / height };
    }
    return { valid: true, ...parsed, pixels, aspect: width / height, aspectRatio: supportedRatio.id };
  }
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

export function resolveReferenceImageSize(reference, model, fallbackSize = '1024x1024') {
  const explicitWidth = Math.round(Number(reference?.width || 0));
  const explicitHeight = Math.round(Number(reference?.height || 0));
  const parsedReference = explicitWidth > 0 && explicitHeight > 0
    ? { width: explicitWidth, height: explicitHeight }
    : parseImageSize(reference?.size);
  const candidate = parsedReference && !parsedReference.auto
    ? `${parsedReference.width}x${parsedReference.height}`
    : '';

  if (candidate && validateImageSizeForModel(candidate, model).valid) {
    return {
      width: parsedReference.width,
      height: parsedReference.height,
      size: candidate,
      usedFallback: false
    };
  }

  const parsedFallback = parseImageSize(fallbackSize) || parseImageSize('1024x1024');
  return {
    width: parsedFallback.width,
    height: parsedFallback.height,
    size: `${parsedFallback.width}x${parsedFallback.height}`,
    usedFallback: true
  };
}

function alignedBoundary(value, direction = 'up') {
  const operation = direction === 'down' ? Math.floor : Math.ceil;
  return operation(Number(value || 0) / IMAGE_DIMENSION_STEP) * IMAGE_DIMENSION_STEP;
}

function sourceDimensions(reference) {
  const explicitWidth = Math.round(Number(reference?.sourceWidth || reference?.width || 0));
  const explicitHeight = Math.round(Number(reference?.sourceHeight || reference?.height || 0));
  if (explicitWidth > 0 && explicitHeight > 0) return { width: explicitWidth, height: explicitHeight };
  const parsed = parseImageSize(reference?.sourceSize || reference?.size);
  return parsed && !parsed.auto ? { width: parsed.width, height: parsed.height } : null;
}

/**
 * Fits a source image into a provider canvas without changing its orientation or
 * intended aspect ratio. The preferred dimensions are rounded upward to the
 * provider's 16px grid. If that upward rounding crosses a provider limit, the
 * nearest legal grid point is selected instead. No generic fallback is used:
 * callers can surface an unsupported-source-size state before billing or work.
 */
export function resolveSourceImageSizeForModel(reference, model) {
  const source = sourceDimensions(reference);
  const constraints = getImageModelConstraints(model);
  if (!source) {
    return { valid: false, error: 'SOURCE_SIZE_MISSING', constraints };
  }

  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const sourcePixels = sourceWidth * sourceHeight;
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect < constraints.minAspect || sourceAspect > constraints.maxAspect) {
    return {
      valid: false,
      error: 'PROVIDER_SOURCE_SIZE_UNSUPPORTED',
      sourceWidth,
      sourceHeight,
      sourcePixels,
      sourceAspect,
      constraints
    };
  }

  const minScale = Math.max(
    constraints.minSide / sourceWidth,
    constraints.minSide / sourceHeight,
    Math.sqrt(constraints.minPixels / sourcePixels)
  );
  const maxScale = Math.min(
    constraints.maxSide / sourceWidth,
    constraints.maxSide / sourceHeight,
    Math.sqrt(constraints.maxPixels / sourcePixels)
  );
  if (!Number.isFinite(minScale) || !Number.isFinite(maxScale) || minScale > maxScale) {
    return {
      valid: false,
      error: 'PROVIDER_SOURCE_SIZE_UNSUPPORTED',
      sourceWidth,
      sourceHeight,
      sourcePixels,
      sourceAspect,
      constraints
    };
  }

  const preferredScale = Math.max(minScale, Math.min(maxScale, 1));
  const targetWidth = sourceWidth * preferredScale;
  const targetHeight = sourceHeight * preferredScale;
  const upwardWidth = alignedBoundary(targetWidth, 'up');
  const upwardHeight = alignedBoundary(targetHeight, 'up');
  const upwardSize = `${upwardWidth}x${upwardHeight}`;
  if (validateImageSizeForModel(upwardSize, model).valid) {
    return {
      valid: true,
      sourceWidth,
      sourceHeight,
      sourcePixels,
      sourceAspect,
      width: upwardWidth,
      height: upwardHeight,
      size: upwardSize,
      usedScaling: upwardWidth !== sourceWidth || upwardHeight !== sourceHeight,
      usedStepAlignment: sourceWidth % IMAGE_DIMENSION_STEP !== 0 || sourceHeight % IMAGE_DIMENSION_STEP !== 0,
      constraints
    };
  }

  const minDimension = alignedBoundary(constraints.minSide, 'up');
  const maxDimension = alignedBoundary(constraints.maxSide, 'down');
  const candidates = new Map();
  const remember = (width, height) => {
    if (width < minDimension || height < minDimension || width > maxDimension || height > maxDimension) return;
    const size = `${width}x${height}`;
    if (!validateImageSizeForModel(size, model).valid) return;
    candidates.set(size, { width, height, size });
  };

  for (let width = minDimension; width <= maxDimension; width += IMAGE_DIMENSION_STEP) {
    const idealHeight = width / sourceAspect;
    remember(width, alignedBoundary(idealHeight, 'down'));
    remember(width, alignedBoundary(idealHeight, 'up'));
  }
  for (let height = minDimension; height <= maxDimension; height += IMAGE_DIMENSION_STEP) {
    const idealWidth = height * sourceAspect;
    remember(alignedBoundary(idealWidth, 'down'), height);
    remember(alignedBoundary(idealWidth, 'up'), height);
  }

  const best = [...candidates.values()].sort((left, right) => {
    const score = (candidate) => {
      const ratioError = Math.abs(Math.log((candidate.width / candidate.height) / sourceAspect));
      const targetError = Math.abs(Math.log(candidate.width / targetWidth))
        + Math.abs(Math.log(candidate.height / targetHeight));
      const downwardPenalty = (candidate.width < targetWidth ? 0.002 : 0)
        + (candidate.height < targetHeight ? 0.002 : 0);
      return ratioError * 1_000_000 + targetError * 100 + downwardPenalty;
    };
    return score(left) - score(right);
  })[0];

  if (!best) {
    return {
      valid: false,
      error: 'PROVIDER_SOURCE_SIZE_UNSUPPORTED',
      sourceWidth,
      sourceHeight,
      sourcePixels,
      sourceAspect,
      constraints
    };
  }

  return {
    valid: true,
    sourceWidth,
    sourceHeight,
    sourcePixels,
    sourceAspect,
    ...best,
    usedScaling: best.width !== sourceWidth || best.height !== sourceHeight,
    usedStepAlignment: sourceWidth % IMAGE_DIMENSION_STEP !== 0 || sourceHeight % IMAGE_DIMENSION_STEP !== 0,
    constraints
  };
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
