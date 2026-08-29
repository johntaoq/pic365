import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dimensionsForImageSizeTemplateRatio,
  imageSizeTemplateFamily,
  imageSizeTemplateForModel,
  loadImageSizePreferences,
  preferredImageSize,
  saveImageSizePreferences,
  validateImageSizeTemplateCatalog
} from '../shared/image-size-templates.js';
import { validateImageSizeForModel } from '../shared/image-generation.js';

test('shared size templates resolve GPT, Gemini, and MAI model families', () => {
  assert.equal(imageSizeTemplateFamily('gpt-image-1'), 'gpt');
  assert.equal(imageSizeTemplateFamily('gemini-2.5-flash-image'), 'gemini');
  assert.equal(imageSizeTemplateFamily('MAI-Image-2.5'), 'mai');
});

test('every configured size and ratio passes its provider runtime rules', () => {
  const validation = validateImageSizeTemplateCatalog();
  assert.deepEqual(validation, { valid: true, errors: [] });

  for (const model of ['gpt-image-1', 'gemini-2.5-flash-image', 'MAI-Image-2.5']) {
    const template = imageSizeTemplateForModel(model);
    assert.ok(template.sizes.length >= 4);
    assert.ok(template.ratios.length >= 5);
    assert.ok(template.sizes.every((size) => validateImageSizeForModel(size, model).valid));
    assert.ok(template.ratios.every((ratio) => dimensionsForImageSizeTemplateRatio(model, ratio.id)));
  }
});

test('both workspaces can persist and reload the same provider size preference', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); }
  };
  assert.equal(saveImageSizePreferences({ gpt: '1536x1024', banana: '1024x1536' }, storage), true);
  const loaded = loadImageSizePreferences(storage);
  assert.deepEqual(loaded, { gpt: '1536x1024', banana: '1024x1536' });
  assert.equal(preferredImageSize(loaded, 'gpt', 'gpt-image-1'), '1536x1024');
  assert.equal(preferredImageSize({ mai: '512x512' }, 'mai', 'MAI-Image-2.5'), '1024x1024');
});
