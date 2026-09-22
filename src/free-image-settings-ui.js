import { dimensionsForImageModelRatio, parseImageSize, validateImageSizeForModel } from '../shared/image-generation.js';

// Display-only options. Selection still goes through the workspace's existing
// selectSizeOption/setRatio handlers and model validator.
export function studioSizeChoices(model, ratio, commonSizes, ratioOptions) {
  const preset = ratioOptions.find(item => item.id === ratio);
  const generated = preset ? [1024, 1536, 2048, 3072, 3840].map(longSide => {
    const dimensions = dimensionsForImageModelRatio(model, preset.width, preset.height, longSide);
    return dimensions ? `${dimensions.width}x${dimensions.height}` : '';
  }) : [];
  const all = [...new Set([...commonSizes, ...generated])]
    .filter(value => validateImageSizeForModel(value, model).valid);
  const matching = preset ? all.filter(value => {
    const parsed = parseImageSize(value);
    return parsed && !parsed.auto && parsed.width * preset.height === parsed.height * preset.width;
  }).sort((a, b) => parseImageSize(a).width - parseImageSize(b).width) : all;
  return { matching, other: all.filter(value => !matching.includes(value)), all };
}
