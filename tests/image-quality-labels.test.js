import assert from 'node:assert/strict';
import test from 'node:test';

import { IMAGE_QUALITY_VALUES, imageQualityLabel } from '../src/image-quality-labels.js';

test('free workshop image quality labels follow the selected language', () => {
  assert.deepEqual(IMAGE_QUALITY_VALUES, ['auto', 'low', 'medium', 'high']);
  assert.deepEqual(
    IMAGE_QUALITY_VALUES.map((quality) => imageQualityLabel(quality, 'zh')),
    ['自动', '低', '中等', '高']
  );
  assert.deepEqual(
    IMAGE_QUALITY_VALUES.map((quality) => imageQualityLabel(quality, 'en')),
    ['Auto', 'Low', 'Medium', 'High']
  );
});
