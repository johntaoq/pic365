import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  dimensionsForImageSizeTemplateRatio,
  imageSizeTemplateFamily,
  imageSizeTemplateForModel,
  loadImageStudioSizeSelections,
  loadImageSizePreferences,
  preferredImageSize,
  preferredStudioImageSize,
  saveImageStudioSizeSelections,
  saveImageSizePreferences,
  validateImageSizeTemplateCatalog
} from '../shared/image-size-templates.js';
import { validateImageSizeForModel } from '../shared/image-generation.js';

test('shared size templates resolve GPT, Gemini, and MAI model families', () => {
  assert.equal(imageSizeTemplateFamily('gpt-image-1'), 'gpt');
  assert.equal(imageSizeTemplateFamily('gemini-2.5-flash-image'), 'gemini');
  assert.equal(imageSizeTemplateFamily('MAI-Image-2.5'), 'mai');
  assert.equal(imageSizeTemplateFamily('MAI-Image-2.6-Flash'), 'mai');
});

test('every configured size and ratio passes its provider runtime rules', () => {
  const validation = validateImageSizeTemplateCatalog();
  assert.deepEqual(validation, { valid: true, errors: [] });

  for (const model of ['gpt-image-1', 'gemini-2.5-flash-image', 'MAI-Image-2.5', 'MAI-Image-2.6-Flash', 'MAI-Image-2.7', 'MAI-Image-2.7-Flash']) {
    const template = imageSizeTemplateForModel(model);
    assert.ok(template.sizes.length >= 4);
    assert.ok(template.ratios.length >= 5);
    assert.ok(template.sizes.every((size) => validateImageSizeForModel(size, model).valid));
    assert.ok(template.ratios.every((ratio) => dimensionsForImageSizeTemplateRatio(model, ratio.id)));
  }
});

test('MAI 2.7 templates keep free dimensions and discard stale oversize defaults', () => {
  for (const model of ['MAI-Image-2.7', 'MAI-Image-2.7-Flash']) {
    const template = imageSizeTemplateForModel(model);
    assert.equal(template.allowFreeRatio, true);
    assert.ok(template.sizes.includes('1344x3072'));
    assert.ok(!template.sizes.includes('2048x2048'));
    assert.equal(preferredStudioImageSize({ mai: '2048x2048' }, { mai: 'auto' }, 'mai', model), '1024x1024');
    assert.equal(preferredStudioImageSize({ mai: '768x3072' }, {}, 'mai', model), '768x3072');
  }
});

test('MAI-Image-2.6 templates expose the expanded output range without changing older MAI models', () => {
  const legacyTemplate = imageSizeTemplateForModel('MAI-Image-2.5');
  const mai26Template = imageSizeTemplateForModel('MAI-Image-2.6-Flash');
  assert.equal(legacyTemplate.sizes.includes('1536x1536'), false);
  assert.equal(mai26Template.sizes.includes('1536x1536'), true);
  assert.deepEqual(dimensionsForImageSizeTemplateRatio('MAI-Image-2.6', '1:1'), { width: 1536, height: 1536 });
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

test('image studio defaults to a square and remembers explicit selections without replacing templates', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); }
  };
  const templates = { gpt: '1536x1024' };
  for (const [providerId, model] of [
    ['gpt', 'gpt-image-2'],
    ['gemini', 'gemini-3.1-flash-image'],
    ['mai', 'MAI-Image-2.6']
  ]) {
    assert.equal(preferredStudioImageSize({}, {}, providerId, model), '1024x1024');
  }
  assert.equal(preferredStudioImageSize({}, templates, 'gpt', 'gpt-image-2'), '1536x1024');
  assert.equal(saveImageStudioSizeSelections({ gpt: '1024x1536', gemini: 'auto' }, storage), true);
  const selections = loadImageStudioSizeSelections(storage);
  assert.deepEqual(selections, { gpt: '1024x1536', gemini: 'auto' });
  assert.equal(preferredStudioImageSize(selections, templates, 'gpt', 'gpt-image-2'), '1024x1536');
  assert.equal(preferredStudioImageSize(selections, templates, 'gemini', 'gemini-3.1-flash-image'), 'auto');
  assert.equal(preferredStudioImageSize(selections, templates, 'mai', 'MAI-Image-2.6'), '1024x1024');
  assert.equal(preferredStudioImageSize({ mai: 'auto' }, {}, 'mai', 'MAI-Image-2.5'), '1024x1024');
  assert.equal(preferredStudioImageSize({ gpt: '512x512' }, templates, 'gpt', 'gpt-image-2'), '1536x1024');
  assert.deepEqual(templates, { gpt: '1536x1024' });
  values.set('pic365.image-studio.size-selection.v1', '{"gpt":123,"gemini":"not-a-size"}');
  assert.deepEqual(loadImageStudioSizeSelections(storage), {});
});

test('single, batch and layout creation use the same square-default size settings', () => {
  const source = fs.readFileSync(new URL('../src/free-image-workspace.jsx', import.meta.url), 'utf8');
  assert.match(source, /const \[sizeMode, setSizeMode\] = useState\('custom'\)/);
  assert.match(source, /const \[width, setWidth\] = useState\(1024\)/);
  assert.match(source, /const \[height, setHeight\] = useState\(1024\)/);
  assert.match(source, /const \[ratioLock, setRatioLock\] = useState\('1:1'\)/);
  assert.match(source, /preferredStudioImageSize\(sizeSelectionsByProvider, sizeTemplatesByProvider/);
  assert.match(source, /imageSettings=\{\{[\s\S]*?\bsize, sizeMode, sizeTemplate,[\s\S]*?\}\}/);
  const standardSettings = source.slice(source.indexOf('<FreeImageSettings\n'));
  assert.match(standardSettings, /\bsize, sizeMode, sizeTemplate, commonSizeOptions/);
  assert.match(standardSettings, /batch=\{creationMode !== 'single'\}/);
});
