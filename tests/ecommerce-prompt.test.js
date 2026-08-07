import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEcommerceSlotPrompt } from '../api/_lib/ecommerce-prompt.js';
import { getEcommercePlatform } from '../shared/ecommerce-catalog.js';

function project(overrides = {}) {
  return {
    id: 'project-1',
    platformId: 'amazon',
    industryId: 'general',
    productName: 'Travel bottle',
    brandName: 'Example',
    targetAudience: 'Commuters',
    sellingPoints: ['Lightweight'],
    specifications: '500 ml; bottle ×1; lid ×1',
    prohibitedContent: 'Do not add a straw',
    identitySpec: {},
    visualStyleId: 'clean-commercial',
    masterAssetId: '',
    ...overrides
  };
}

test('legacy specification and avoidance data is represented once inside identity constraints', () => {
  const platform = getEcommercePlatform('amazon');
  const slot = platform.slots.find((item) => item.id === 'feature');
  const prompt = buildEcommerceSlotPrompt({ project: project(), platform, slot, assets: [] });

  assert.equal(prompt.includes('规格与包装清单：'), false);
  assert.equal(prompt.includes('禁止出现或避免表达：'), false);
  assert.equal((prompt.match(/500 ml; bottle ×1; lid ×1/g) || []).length, 1);
  assert.equal((prompt.match(/Do not add a straw/g) || []).length, 1);
  assert.match(prompt, /必须保留：500 ml; bottle ×1; lid ×1/);
  assert.match(prompt, /必须避免：Do not add a straw/);
});

test('packaging and included accessories remain separate identity constraints', () => {
  const platform = getEcommercePlatform('amazon');
  const slot = platform.slots.find((item) => item.id === 'package-contents');
  const prompt = buildEcommerceSlotPrompt({
    project: project({
      identitySpec: {
        packaging: 'Matte carton with a blue seal and centered label.',
        includedItems: 'Bottle ×1; lid ×1; cleaning brush ×1.',
        mustAvoid: 'No extra gift items.'
      }
    }),
    platform,
    slot,
    assets: []
  });

  assert.match(prompt, /外包装与标签：Matte carton with a blue seal and centered label\./);
  assert.match(prompt, /随附配件与数量：Bottle ×1; lid ×1; cleaning brush ×1\./);
  assert.equal((prompt.match(/Matte carton/g) || []).length, 1);
  assert.equal((prompt.match(/cleaning brush/g) || []).length, 1);
});
