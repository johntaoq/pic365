import test from 'node:test';
import assert from 'node:assert/strict';

import {
  batchPromptLayout,
  createBatchPromptAssignments,
  parseBatchPromptLines
} from '../shared/batch-image-prompts.js';

test('one image enables up to ten prompt rows', () => {
  assert.deepEqual(batchPromptLayout(1, 6), {
    activeCount: 6,
    visibleCount: 6,
    minimumCount: 1,
    canAdd: true
  });
  assert.equal(batchPromptLayout(1, 10).canAdd, false);
});

test('multiple images use one-to-one prompts while retaining overflow rows', () => {
  assert.deepEqual(batchPromptLayout(3, 7), {
    activeCount: 3,
    visibleCount: 7,
    minimumCount: 3,
    canAdd: false
  });
});

test('multiple images can share one prompt while still creating one job per image', () => {
  assert.deepEqual(batchPromptLayout(3, 7, 'shared'), {
    activeCount: 3,
    visibleCount: 1,
    minimumCount: 1,
    canAdd: false
  });
  const images = [{ id: 'image-1' }, { id: 'image-2' }, { id: 'image-3' }];
  const prompts = [{ id: 'shared-prompt' }, { id: 'retained-prompt' }];
  assert.deepEqual(
    createBatchPromptAssignments(images, prompts, 'shared').map(({ image, promptItem, promptIndex }) => [image.id, promptItem.id, promptIndex]),
    [
      ['image-1', 'shared-prompt', 0],
      ['image-2', 'shared-prompt', 0],
      ['image-3', 'shared-prompt', 0]
    ]
  );
});

test('multiline prompts keep the first ten non-empty lines', () => {
  const parsed = parseBatchPromptLines(Array.from({ length: 12 }, (_, index) => `提示词 ${index + 1}`).join('\n'));
  assert.equal(parsed.lines.length, 10);
  assert.equal(parsed.lines[9], '提示词 10');
  assert.equal(parsed.truncated, true);
});

test('one image creates one task per prompt while multiple images pair by index', () => {
  const prompts = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
  assert.deepEqual(
    createBatchPromptAssignments([{ id: 'image-1' }], prompts).map(({ image, promptItem }) => [image.id, promptItem.id]),
    [['image-1', 'p1'], ['image-1', 'p2'], ['image-1', 'p3']]
  );
  assert.deepEqual(
    createBatchPromptAssignments([{ id: 'image-1' }, { id: 'image-2' }], prompts).map(({ image, promptItem }) => [image.id, promptItem.id]),
    [['image-1', 'p1'], ['image-2', 'p2']]
  );
});
