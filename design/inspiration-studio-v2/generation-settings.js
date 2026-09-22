import {
  alignImageDimension, dimensionsForImageModelRatio, dimensionsFromLockedValue,
  getImageModelConstraints, parseImageSize, validateImageSizeForModel,
} from '../../shared/image-generation.js';
import { imageSizeTemplateForModel, ratioIdForImageSize } from '../../shared/image-size-templates.js';

// These are preview services, not a replacement for the administrator's provider list.
export const PREVIEW_SERVICES = [
  { id: 'gpt-fast', name: 'GPT-Image-2.5 · 快速', model: 'gpt-image-2.5-flare' },
  { id: 'gpt-fine', name: 'GPT-Image-2.5 · 精修', model: 'gpt-image-2.5-sunburst' },
  { id: 'gpt', name: '低价 GPT', model: 'gpt-image-2' },
  { id: 'gemini', name: 'Gemini · 快速', model: 'gemini-3.1-flash-image' },
  { id: 'mai', name: '微软生图 · 2.6', model: 'MAI-Image-2.6' },
];
export const INITIAL_GENERATION_SETTINGS = {
  providerId: 'gpt-fast', width: 1024, height: 1536, ratio: '2:3', quality: 'low', auto: false,
};
export function settingsContext(value) {
  const service = PREVIEW_SERVICES.find(item => item.id === value.providerId) || PREVIEW_SERVICES[0];
  return { service, constraints: getImageModelConstraints(service.model), template: imageSizeTemplateForModel(service.model) };
}
export function selectRatio(value, ratio) {
  if (ratio === 'free') return settingsContext(value).template.allowFreeRatio ? { ...value, ratio, auto: false } : value;
  const { service, template } = settingsContext(value);
  const preset = template.ratios.find(item => item.id === ratio);
  if (!preset) return value;
  const next = dimensionsForImageModelRatio(service.model, preset.width, preset.height, Math.max(value.width, value.height));
  return next ? { ...value, ...next, ratio, auto: false } : value;
}
export function selectPixelSize(value, size) {
  const { service, template, constraints } = settingsContext(value);
  if (size === 'auto') return constraints.allowAutoSize ? { ...value, auto: true } : value;
  if (!validateImageSizeForModel(size, service.model).valid) return value;
  const parsed = parseImageSize(size);
  return { ...value, width: parsed.width, height: parsed.height, ratio: ratioIdForImageSize(size, template.ratios), auto: false };
}
export function changeService(value, providerId) {
  const next = { ...value, providerId };
  const { service, constraints, template } = settingsContext(next);
  if (next.auto && constraints.allowAutoSize) return next;
  const size = `${value.width}x${value.height}`;
  if (validateImageSizeForModel(size, service.model).valid) {
    const ratio = value.ratio === 'free' && template.allowFreeRatio ? 'free' : ratioIdForImageSize(size, template.ratios);
    return { ...next, ratio, auto: false };
  }
  const adjusted = selectRatio(next, value.ratio);
  if (validateImageSizeForModel(`${adjusted.width}x${adjusted.height}`, service.model).valid) return { ...adjusted, auto: false };
  return selectPixelSize(next, template.defaultSize);
}
export function editDimension(value, changed, raw) {
  const numeric = Number(raw);
  if (!String(raw).trim() || !Number.isFinite(numeric)) return value;
  const { constraints, template } = settingsContext(value);
  const ratio = template.ratios.find(item => item.id === value.ratio);
  if (ratio) {
    const next = dimensionsFromLockedValue({ changed, value: numeric, ratioWidth: ratio.width, ratioHeight: ratio.height, constraints });
    return next ? { ...value, ...next, auto: false } : value;
  }
  const other = changed === 'width' ? value.height : value.width;
  const maxByPixels = Math.floor(constraints.maxPixels / Math.max(constraints.minSide, other) / 16) * 16;
  return { ...value, [changed]: alignImageDimension(numeric, {
    min: constraints.minSide, max: Math.max(constraints.minSide, Math.min(constraints.maxSide, maxByPixels)),
  }), auto: false };
}
export function matchingPixelSizes(value) {
  const { service, template } = settingsContext(value);
  const ratio = template.ratios.find(item => item.id === value.ratio);
  if (!ratio) return template.sizes;
  const generated = [1024, 1536, 2048, 3072, 3840].map(side => {
    const next = dimensionsForImageModelRatio(service.model, ratio.width, ratio.height, side);
    return next ? `${next.width}x${next.height}` : '';
  });
  return [...new Set([...template.sizes, ...generated])]
    .filter(size => validateImageSizeForModel(size, service.model).valid && ratioIdForImageSize(size, template.ratios) === ratio.id)
    .sort((a, b) => parseImageSize(a).width - parseImageSize(b).width);
}
