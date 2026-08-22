import assert from 'node:assert/strict';
import test from 'node:test';

import {
  alignImageDimension,
  dimensionsForImageModelRatio,
  dimensionsForRatio,
  dimensionsFromLockedValue,
  GEMINI_IMAGE_COMMON_SIZES,
  GEMINI_IMAGE_RATIO_PRESETS,
  getImageModelConstraints,
  IMAGE_RATIO_PRESETS,
  isGeminiImageModel,
  normalizeImageCount,
  resolveReferenceImageSize,
  resolveSourceImageSizeForModel,
  resolveProviderImageQuality,
  validateImageReferenceInputsForModel,
  validateImageSize,
  validateImageSizeForModel
} from '../shared/image-generation.js';

test('accepts auto and documented custom GPT image dimensions', () => {
  for (const size of [
    'auto',
    '1024x1024',
    '1024x1536',
    '1536x1024',
    '2048x2048',
    '3840x2160',
    '2160x3840',
    '1024x3072'
  ]) {
    assert.equal(validateImageSize(size).valid, true, size);
  }
});

test('enforces the 655360 through 8294400 pixel range with 480 minimum sides', () => {
  assert.equal(validateImageSize('480x480').error, 'MIN_PIXELS');
  assert.equal(validateImageSize('640x1024').valid, true);
  assert.equal(validateImageSize('1025x1024').error, 'STEP');
  assert.equal(validateImageSize('464x1024').error, 'MIN_SIDE');
  assert.equal(validateImageSize('3856x1024').error, 'MAX_SIDE');
  assert.equal(validateImageSize('3840x3840').error, 'MAX_PIXELS');
  assert.equal(validateImageSize('480x1456').error, 'ASPECT');
});

test('MAI image models enforce 768 minimum sides and 1048576 maximum pixels', () => {
  for (const model of ['MAI-Image-2', 'MAI-Image-2.5']) {
    assert.equal(validateImageSizeForModel('768x768', model).valid, true, model);
    assert.equal(validateImageSizeForModel('768x1024', model).valid, true, model);
    assert.equal(validateImageSizeForModel('1024x768', model).valid, true, model);
    assert.equal(validateImageSizeForModel('1024x1024', model).valid, true, model);
    assert.equal(validateImageSizeForModel('auto', model).error, 'AUTO_SIZE_UNSUPPORTED', model);
    assert.equal(validateImageSizeForModel('752x1024', model).error, 'MAI_MIN_SIDE', model);
    assert.equal(validateImageSizeForModel('1024x1040', model).error, 'MAI_MAX_PIXELS', model);
  }
  assert.equal(validateImageSizeForModel('2048x2048', 'gpt-image-2').valid, true);
});

test('Gemini image models expose their own ratios, references, and formats', () => {
  for (const model of ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'nano-banana-2']) {
    assert.equal(isGeminiImageModel(model), true, model);
    const constraints = getImageModelConstraints(model);
    assert.equal(constraints.isGeminiImage, true, model);
    assert.equal(constraints.maxReferenceImages, 9, model);
    assert.deepEqual(constraints.referenceMimeTypes, ['image/jpeg', 'image/png', 'image/webp'], model);
  }
  assert.deepEqual(
    GEMINI_IMAGE_RATIO_PRESETS.map((preset) => preset.id),
    ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9']
  );
});

test('Gemini image canvas accepts supported ratios and rejects arbitrary ratios', () => {
  for (const size of GEMINI_IMAGE_COMMON_SIZES) {
    assert.equal(validateImageSizeForModel(size, 'gemini-3.1-flash-image').valid, true, size);
  }
  assert.equal(validateImageSizeForModel('auto', 'gemini-3.1-flash-image').valid, true);
  assert.equal(validateImageSizeForModel('512x512', 'gemini-3.1-flash-image').valid, true);
  assert.equal(validateImageSizeForModel('496x1024', 'gemini-3.1-flash-image').error, 'GEMINI_MIN_SIDE');
  assert.equal(validateImageSizeForModel('1024x2048', 'gemini-3.1-flash-image').error, 'GEMINI_ASPECT_RATIO');
  assert.equal(validateImageSizeForModel('4112x512', 'gemini-3.1-flash-image').error, 'GEMINI_MAX_SIDE');
});

test('Gemini reference capability accepts JPEG, PNG, and WebP only', () => {
  assert.equal(validateImageReferenceInputsForModel({
    model: 'gemini-3.1-flash-image', count: 9, mimeTypes: Array(9).fill('image/jpeg')
  }).valid, true);
  assert.equal(validateImageReferenceInputsForModel({
    model: 'gemini-3.1-flash-image', count: 10, mimeTypes: Array(10).fill('image/png')
  }).error, 'TOO_MANY_REFERENCE_IMAGES');
  assert.equal(validateImageReferenceInputsForModel({
    model: 'gemini-3.1-flash-image', count: 1, mimeTypes: ['image/gif']
  }).error, 'INVALID_REFERENCE_IMAGE_FORMAT');
});

test('first reference dimensions are preserved when supported and fall back when unsupported', () => {
  assert.deepEqual(resolveReferenceImageSize({ width: 1536, height: 1024 }, 'gpt-image-2'), {
    width: 1536,
    height: 1024,
    size: '1536x1024',
    usedFallback: false
  });
  assert.deepEqual(resolveReferenceImageSize({ size: '1024x768' }, 'MAI-Image-2.5'), {
    width: 1024,
    height: 768,
    size: '1024x768',
    usedFallback: false
  });
  assert.deepEqual(resolveReferenceImageSize({ width: 1536, height: 1024 }, 'MAI-Image-2.5'), {
    width: 1024,
    height: 1024,
    size: '1024x1024',
    usedFallback: true
  });
  assert.equal(resolveReferenceImageSize({}, 'gpt-image-2').size, '1024x1024');
});

test('batch repair keeps each source ratio while aligning upward to the 16px GPT grid', () => {
  const portrait = resolveSourceImageSizeForModel({ width: 1279, height: 2275 }, 'gpt-image-2');
  assert.equal(portrait.valid, true);
  assert.equal(portrait.sourceWidth, 1279);
  assert.equal(portrait.sourceHeight, 2275);
  assert.equal(portrait.width, 1280);
  assert.equal(portrait.height, 2288);
  assert.equal(portrait.size, '1280x2288');
  assert.equal(portrait.usedStepAlignment, true);

  const smallSquare = resolveSourceImageSizeForModel({ width: 500, height: 500 }, 'gpt-image-2');
  assert.equal(smallSquare.valid, true);
  assert.equal(smallSquare.size, '816x816');

  const oversizedLandscape = resolveSourceImageSizeForModel({ width: 5000, height: 2000 }, 'gpt-image-2');
  assert.equal(oversizedLandscape.valid, true);
  assert.equal(oversizedLandscape.size, '3840x1536');
});

test('batch repair reports a provider source-size error when the original ratio cannot fit', () => {
  const gptUnsupported = resolveSourceImageSizeForModel({ width: 5000, height: 1000 }, 'gpt-image-2');
  assert.equal(gptUnsupported.valid, false);
  assert.equal(gptUnsupported.error, 'PROVIDER_SOURCE_SIZE_UNSUPPORTED');
  assert.equal(gptUnsupported.sourceWidth, 5000);
  assert.equal(gptUnsupported.sourceHeight, 1000);

  const maiUnsupported = resolveSourceImageSizeForModel({ width: 2000, height: 500 }, 'MAI-Image-2.5');
  assert.equal(maiUnsupported.valid, false);
  assert.equal(maiUnsupported.error, 'PROVIDER_SOURCE_SIZE_UNSUPPORTED');
});

test('MAI ratio helpers only expose ratios that fit the model canvas limits', () => {
  assert.deepEqual(dimensionsForImageModelRatio('MAI-Image-2.5', 1, 1, 1024), { width: 1024, height: 1024 });
  assert.deepEqual(dimensionsForImageModelRatio('MAI-Image-2.5', 2, 3, 1024), { width: 768, height: 1152 });
  assert.equal(dimensionsForImageModelRatio('MAI-Image-2.5', 1, 2, 1024), null);
  assert.equal(getImageModelConstraints('MAI-Image-2').maxReferenceImages, 0);
  assert.equal(getImageModelConstraints('MAI-Image-2.5').maxReferenceImages, 1);
});

test('MAI reference capability is enforced independently from other providers', () => {
  assert.equal(validateImageReferenceInputsForModel({
    model: 'MAI-Image-2.5', count: 1, mimeTypes: ['image/png']
  }).valid, true);
  assert.equal(validateImageReferenceInputsForModel({
    model: 'MAI-Image-2.5', count: 2, mimeTypes: ['image/png', 'image/jpeg']
  }).error, 'TOO_MANY_REFERENCE_IMAGES');
  assert.equal(validateImageReferenceInputsForModel({
    model: 'MAI-Image-2.5', count: 1, mimeTypes: ['image/webp']
  }).error, 'INVALID_REFERENCE_IMAGE_FORMAT');
  assert.equal(validateImageReferenceInputsForModel({
    model: 'MAI-Image-2', count: 1, mimeTypes: ['image/png']
  }).error, 'REFERENCE_IMAGES_UNSUPPORTED');
  assert.equal(validateImageReferenceInputsForModel({
    model: 'gpt-image-2', count: 3, mimeTypes: ['image/png', 'image/jpeg', 'image/webp']
  }).valid, true);
});

test('ratio presets contain the requested portrait ratios and their transposes', () => {
  assert.deepEqual(
    IMAGE_RATIO_PRESETS.map((preset) => preset.id),
    ['1:1', '1:2', '2:1', '1:3', '3:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9']
  );
});

test('ratio helpers keep both dimensions on the 16 pixel grid', () => {
  assert.deepEqual(dimensionsForRatio(16, 9), { width: 1536, height: 864 });
  assert.deepEqual(dimensionsForRatio(3, 4), { width: 1152, height: 1536 });
  assert.deepEqual(
    dimensionsFromLockedValue({ changed: 'width', value: 1040, ratioWidth: 3, ratioHeight: 4 }),
    { width: 1056, height: 1408 }
  );
});

test('manual dimension input rounds to the nearest 16 pixel step on commit', () => {
  assert.equal(alignImageDimension(2241), 2240);
  assert.equal(alignImageDimension(2249), 2256);
  assert.equal(alignImageDimension(3999), 3840);
  assert.equal(alignImageDimension(321), 480);
});

test('locked ratios never reduce either side below 480 pixels', () => {
  assert.deepEqual(
    dimensionsFromLockedValue({ changed: 'width', value: 480, ratioWidth: 1, ratioHeight: 3 }),
    { width: 480, height: 1440 }
  );
  assert.deepEqual(
    dimensionsFromLockedValue({ changed: 'height', value: 480, ratioWidth: 16, ratioHeight: 9 }),
    { width: 1024, height: 576 }
  );
});

test('batch count is limited to one through four', () => {
  assert.equal(normalizeImageCount(0), 1);
  assert.equal(normalizeImageCount(3), 3);
  assert.equal(normalizeImageCount(12), 4);
});

test('provider quality converts auto to medium', () => {
  assert.equal(resolveProviderImageQuality('auto'), 'medium');
  assert.equal(resolveProviderImageQuality('low'), 'low');
  assert.equal(resolveProviderImageQuality('high'), 'high');
});
