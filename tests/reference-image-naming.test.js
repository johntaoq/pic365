import assert from 'node:assert/strict';
import test from 'node:test';

import {
  referenceImageAliases,
  referenceImageDisplayLabel,
  referenceImageInterpretationRule
} from '../shared/reference-image-naming.js';

test('reference image one owns the primary aliases while later references remain sequential', () => {
  assert.deepEqual(referenceImageAliases(1, 'zh'), ['参考图1', '图1', '主图', '母版']);
  assert.deepEqual(referenceImageAliases(2, 'zh'), ['参考图2', '图2']);
  assert.deepEqual(referenceImageAliases(9, 'en'), ['Reference 9', 'Image 9']);
  assert.equal(referenceImageDisplayLabel(1, 'zh'), '参考图1 · 主图 / 母版');
  assert.equal(referenceImageDisplayLabel(3, 'zh'), '参考图3');
  assert.match(referenceImageInterpretationRule('zh'), /主图.*母版.*参考图1/);
});
