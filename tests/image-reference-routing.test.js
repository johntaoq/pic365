import assert from 'node:assert/strict';
import test from 'node:test';
import {
  imageReferenceIdentity,
  moveImageReferenceToPrimary,
  resolveImagePreviewIdentity,
  splitImageReferences,
  resolveImageReferenceTarget
} from '../src/image-reference-routing.js';

test('image references default to single-image editing outside the visible batch editor', () => {
  assert.equal(resolveImageReferenceTarget('control', 'single'), 'single');
  assert.equal(resolveImageReferenceTarget('tasks', 'batch-repair'), 'single');
  assert.equal(resolveImageReferenceTarget('tasks', 'single'), 'single');
});

test('image references enter batch repair only while its editor is visible', () => {
  assert.equal(resolveImageReferenceTarget('control', 'batch-repair'), 'batch-repair');
});

test('generated image identity is stable across result and history shapes', () => {
  assert.equal(imageReferenceIdentity({ id: 'row-1', generationId: 'generation-1' }), 'generation-1');
  assert.equal(imageReferenceIdentity({ id: 'row-1' }), 'row-1');
  assert.equal(imageReferenceIdentity({ assetId: 'asset-1' }), 'asset-1');
});

test('image preview keeps a manual selection until that image is no longer available', () => {
  const results = [
    { id: 'latest' },
    { id: 'manual-selection' },
    { id: 'older' }
  ];
  assert.equal(resolveImagePreviewIdentity(results, 'manual-selection'), 'manual-selection');
  assert.equal(resolveImagePreviewIdentity(results, 'missing'), 'latest');
  assert.equal(resolveImagePreviewIdentity([], 'manual-selection'), '');
});

test('single-image references keep one primary image separate from supporting references', () => {
  const references = [{ id: 'primary' }, { id: 'style' }, { id: 'color' }];
  assert.deepEqual(splitImageReferences(references), {
    primary: references[0],
    supporting: references.slice(1)
  });
  assert.deepEqual(moveImageReferenceToPrimary(references, 'color').map((item) => item.id), ['color', 'style', 'primary']);
  assert.deepEqual(references.map((item) => item.id), ['primary', 'style', 'color']);
});
