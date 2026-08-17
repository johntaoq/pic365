import assert from 'node:assert/strict';
import test from 'node:test';

import {
  alignImageDimension,
  dimensionsForImageModelRatio,
  dimensionsForRatio,
  dimensionsFromLockedValue,
  getImageModelConstraints,
  IMAGE_RATIO_PRESETS,
  normalizeImageCount,
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
