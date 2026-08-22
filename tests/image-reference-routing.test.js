import assert from 'node:assert/strict';
import test from 'node:test';
import {
  imageReferenceIdentity,
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
