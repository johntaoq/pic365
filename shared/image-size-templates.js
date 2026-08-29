import {
  COMMON_IMAGE_SIZES,
  dimensionsForImageModelRatio,
  GEMINI_IMAGE_COMMON_SIZES,
  GEMINI_IMAGE_RATIO_PRESETS,
  getImageModelConstraints,
  IMAGE_RATIO_PRESETS,
  parseImageSize,
  validateImageSizeForModel
} from './image-generation.js';

export const IMAGE_SIZE_TEMPLATE_STORAGE_KEY = 'pic365.image-size-preferences.v1';
const LEGACY_STORAGE_KEY = 'pic365.free-image.size-templates.v1';

const MAI_RATIOS = IMAGE_RATIO_PRESETS.filter((preset) => (
  ['1:1', '2:3', '3:2', '3:4', '4:3'].includes(preset.id)
));

// Product-facing size presets live here so both creation workspaces use one
// editable catalog. Runtime validation below remains the source of truth.
export const IMAGE_SIZE_TEMPLATE_CATALOG = Object.freeze({
  gpt: Object.freeze({
    id: 'gpt',
    model: 'gpt-image-1',
    defaultSize: '1024x1024',
    targetLongSide: 1536,
    allowFreeRatio: true,
    ratios: Object.freeze([...IMAGE_RATIO_PRESETS]),
    sizes: Object.freeze([...COMMON_IMAGE_SIZES])
  }),
  gemini: Object.freeze({
    id: 'gemini',
    model: 'gemini-2.5-flash-image',
    defaultSize: '1024x1024',
    targetLongSide: 1536,
    allowFreeRatio: false,
    ratios: Object.freeze([...GEMINI_IMAGE_RATIO_PRESETS]),
    sizes: Object.freeze([...GEMINI_IMAGE_COMMON_SIZES])
  }),
  mai: Object.freeze({
    id: 'mai',
    model: 'MAI-Image-2.5',
    defaultSize: '1024x1024',
    targetLongSide: 1024,
    allowFreeRatio: true,
    ratios: Object.freeze([...MAI_RATIOS]),
    sizes: Object.freeze(['768x768', '768x1024', '1024x768', '1024x1024'])
  })
});

export function imageSizeTemplateFamily(model) {
  const constraints = getImageModelConstraints(model);
  if (constraints.isGeminiImage) return 'gemini';
  if (constraints.isMai) return 'mai';
  return 'gpt';
}

export function imageSizeTemplateForModel(model) {
  const family = imageSizeTemplateFamily(model);
  const configured = IMAGE_SIZE_TEMPLATE_CATALOG[family];
  const sizes = configured.sizes.filter((size) => validateImageSizeForModel(size, model || configured.model).valid);
  const ratios = configured.ratios.filter((preset) => Boolean(dimensionsForImageModelRatio(
    model || configured.model,
    preset.width,
    preset.height,
    configured.targetLongSide
  )));
  const defaultSize = sizes.includes(configured.defaultSize) ? configured.defaultSize : sizes[0] || '1024x1024';
  return { ...configured, family, sizes, ratios, defaultSize };
}

export function ratioIdForImageSize(value, ratios = IMAGE_RATIO_PRESETS) {
  const parsed = parseImageSize(value);
  if (!parsed || parsed.auto) return 'free';
  return ratios.find((preset) => parsed.width * preset.height === parsed.height * preset.width)?.id || 'free';
}

export function dimensionsForImageSizeTemplateRatio(model, ratioId) {
  const template = imageSizeTemplateForModel(model);
  const preset = template.ratios.find((item) => item.id === ratioId);
  if (!preset) return null;
  return dimensionsForImageModelRatio(model || template.model, preset.width, preset.height, template.targetLongSide);
}

export function loadImageSizePreferences(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(IMAGE_SIZE_TEMPLATE_STORAGE_KEY) || storage?.getItem(LEGACY_STORAGE_KEY) || '{}';
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .filter(([providerId, size]) => providerId && parseImageSize(size) && size !== 'auto')
      .map(([providerId, size]) => [providerId, String(size).toLowerCase()]));
  } catch {
    return {};
  }
}

export function saveImageSizePreferences(preferences, storage = globalThis.localStorage) {
  try {
    storage?.setItem(IMAGE_SIZE_TEMPLATE_STORAGE_KEY, JSON.stringify(preferences || {}));
    return true;
  } catch {
    return false;
  }
}

export function preferredImageSize(preferences, providerId, model) {
  const preferred = String(preferences?.[providerId] || '').toLowerCase();
  if (preferred && validateImageSizeForModel(preferred, model).valid) return preferred;
  return imageSizeTemplateForModel(model).defaultSize;
}

export function validateImageSizeTemplateCatalog(catalog = IMAGE_SIZE_TEMPLATE_CATALOG) {
  const errors = [];
  for (const [family, template] of Object.entries(catalog || {})) {
    const model = template?.model || '';
    const seenSizes = new Set();
    const seenRatios = new Set();
    for (const size of template?.sizes || []) {
      if (seenSizes.has(size)) errors.push(`${family}:duplicate-size:${size}`);
      seenSizes.add(size);
      if (!validateImageSizeForModel(size, model).valid) errors.push(`${family}:invalid-size:${size}`);
    }
    if (!seenSizes.has(template?.defaultSize)) errors.push(`${family}:missing-default:${template?.defaultSize || ''}`);
    for (const ratio of template?.ratios || []) {
      if (seenRatios.has(ratio.id)) errors.push(`${family}:duplicate-ratio:${ratio.id}`);
      seenRatios.add(ratio.id);
      if (!dimensionsForImageModelRatio(model, ratio.width, ratio.height, template.targetLongSide)) {
        errors.push(`${family}:invalid-ratio:${ratio.id}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
