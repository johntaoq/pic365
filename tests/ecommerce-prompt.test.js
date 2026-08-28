import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEcommerceSlotPrompt, selectEcommerceAssetsForSlot } from '../api/_lib/ecommerce-prompt.js';
import { getEcommercePlatform } from '../shared/ecommerce-catalog.js';

function project(overrides = {}) {
  return {
    id: 'project-1',
    platformId: 'amazon',
    industryId: 'general',
    productName: 'Travel bottle',
    brandName: 'Example',
    coreUser: 'Urban commuters',
    coreScenario: 'Daily subway travel and desk hydration',
    sellingPoints: ['Lightweight'],
    specifications: '500 ml; bottle ×1; lid ×1',
    prohibitedContent: 'Do not add a straw',
    identitySpec: {},
    visualStyleId: 'clean-commercial',
    masterAssetId: '',
    ...overrides
  };
}

test('core users and usage scenarios are represented as separate prompt facts', () => {
  const platform = getEcommercePlatform('amazon');
  const slot = platform.slots.find((item) => item.id === 'feature');
  const prompt = buildEcommerceSlotPrompt({ project: project(), platform, slot, assets: [] });

  assert.match(prompt, /核心用户：Urban commuters/);
  assert.match(prompt, /核心场景：Daily subway travel and desk hydration/);
  assert.equal((prompt.match(/Urban commuters/g) || []).length, 1);
  assert.equal((prompt.match(/Daily subway travel and desk hydration/g) || []).length, 1);
});

test('an intentionally empty core user is omitted instead of being fabricated', () => {
  const platform = getEcommercePlatform('amazon');
  const slot = platform.slots.find((item) => item.id === 'feature');
  const prompt = buildEcommerceSlotPrompt({
    project: project({ coreUser: '', coreScenario: 'Home office use', targetAudience: 'Home office use' }),
    platform,
    slot,
    assets: []
  });

  assert.doesNotMatch(prompt, /核心用户：/);
  assert.doesNotMatch(prompt, /潜在消费者/);
  assert.match(prompt, /核心场景：Home office use/);
  assert.equal((prompt.match(/Home office use/g) || []).length, 1);
});

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

test('revision prompts keep actual input numbering and evidence priority aligned', () => {
  const platform = getEcommercePlatform('amazon');
  const slot = platform.slots.find((item) => item.id === 'feature');
  const assets = [
    { id: 'master-1', assetType: 'product', purpose: 'identity', sortOrder: 1 },
    { id: 'reference-1', assetType: 'reference', purpose: 'lighting', sortOrder: 2 }
  ];
  const prompt = buildEcommerceSlotPrompt({
    project: project({ masterAssetId: 'master-1' }),
    platform,
    slot,
    assets,
    hasBaseImage: true,
    revisionRequest: '背景改为暖灰色，商品不变',
    consistencyIssues: ['恢复瓶盖的真实高度比例']
  });

  assert.match(prompt, /输入图片 1：本槽位当前待修改版本/);
  assert.match(prompt, /输入图片 2：真实商品图/);
  assert.match(prompt, /以输入图片 2 为最高优先级/);
  assert.match(prompt, /不得延续旧图中的错误结构/);
  assert.match(prompt, /恢复瓶盖的真实高度比例/);
});

test('single-image refinement scopes the change and labels supporting image roles', () => {
  const platform = getEcommercePlatform('amazon');
  const slot = platform.slots.find((item) => item.id === 'feature');
  const assets = [
    { id: 'master-1', assetType: 'product', purpose: 'identity', sortOrder: 1 },
    { id: 'detail-1', assetType: 'reference', purpose: 'detail', sortOrder: 2 }
  ];
  const prompt = buildEcommerceSlotPrompt({
    project: project({ masterAssetId: 'master-1' }),
    platform,
    slot,
    assets,
    hasBaseImage: true,
    revisionRequest: '只把右下角托盘换成白瓷碟，其余保持不变',
    targetArea: 'bottom-right',
    refinementInputs: [{ assetId: 'detail-1', role: 'detail' }]
  });

  assert.match(prompt, /修改范围：画面右下区域/);
  assert.match(prompt, /只改变完成该要求所必需的最小区域/);
  assert.match(prompt, /本次精修用途：局部内容素材/);
  assert.match(prompt, /所有未指定区域/);
  assert.match(prompt, /不得覆盖商品母版/);
});

test('slot-aware asset selection prevents irrelevant reference and packaging contamination', () => {
  const platform = getEcommercePlatform('amazon');
  const masterProject = project({ masterAssetId: 'master-1' });
  const assets = [
    { id: 'master-1', assetType: 'product', purpose: 'identity', sortOrder: 1 },
    { id: 'angle-1', assetType: 'product', purpose: 'angle', sortOrder: 2 },
    { id: 'pack-1', assetType: 'packaging', purpose: 'packaging', sortOrder: 3 },
    { id: 'scene-1', assetType: 'reference', purpose: 'scene', sortOrder: 4 }
  ];
  const cleanAssets = selectEcommerceAssetsForSlot({
    project: masterProject,
    slot: platform.slots.find((item) => item.id === 'compliant-main'),
    assets
  });
  assert.deepEqual(cleanAssets.map((item) => item.id), ['master-1', 'angle-1']);

  const packageAssets = selectEcommerceAssetsForSlot({
    project: masterProject,
    slot: platform.slots.find((item) => item.id === 'package-contents'),
    assets
  });
  assert.ok(packageAssets.some((item) => item.id === 'pack-1'));
  assert.equal(packageAssets.some((item) => item.id === 'scene-1'), false);

  const lifestyleAssets = selectEcommerceAssetsForSlot({
    project: masterProject,
    slot: platform.slots.find((item) => item.id === 'lifestyle'),
    assets
  });
  assert.ok(lifestyleAssets.some((item) => item.id === 'scene-1'));
  assert.equal(lifestyleAssets.some((item) => item.id === 'pack-1'), false);
});

test('angle prompts explicitly forbid inventing unseen product surfaces', () => {
  const platform = getEcommercePlatform('amazon');
  const slot = platform.slots.find((item) => item.id === 'multi-angle');
  const prompt = buildEcommerceSlotPrompt({ project: project(), platform, slot, assets: [] });
  assert.match(prompt, /看不到的背面、接口、内部结构或标签不得自行补全/);
  assert.match(prompt, /宁可使用单一可信视角/);
});

test('broad industry guidance is conditional and never treated as a product feature list', () => {
  const platform = getEcommercePlatform('amazon');
  const slot = platform.slots.find((item) => item.id === 'feature');
  const prompt = buildEcommerceSlotPrompt({
    project: project({ industryId: 'consumer-electronics', productName: 'Metal phone stand' }),
    platform,
    slot,
    assets: []
  });
  assert.match(prompt, /品类拍摄重点（仅在素材可证实时采用）/);
  assert.match(prompt, /保持屏幕、镜头、接口、按键/);
});

test('comparison prompts enforce strict left and right image regions', () => {
  const platform = getEcommercePlatform('douyin');
  const slot = platform.slots.find((item) => item.id === 'comparison');
  const prompt = buildEcommerceSlotPrompt({ project: project({ platformId: 'douyin' }), platform, slot, assets: [] });
  assert.match(prompt, /严格的左右 50% 分区/);
  assert.match(prompt, /左半区只呈现本商品/);
  assert.match(prompt, /右半区只呈现对比对象或对比状态/);
  assert.match(prompt, /不得跨越中线/);
  assert.match(prompt, /不得拼成上下结构/);
});

test('ecommerce generation prompts include the shared commerce safety context', () => {
  const platform = getEcommercePlatform('taobao-tmall');
  const slot = platform.slots.find((item) => item.id === 'main-square');
  const prompt = buildEcommerceSlotPrompt({ project: project(), platform, slot, assets: [] });
  assert.match(prompt, /你是电商商品图生成系统/);
  assert.match(prompt, /不得新增不存在的结构、文字、Logo、标签、包装、配件/);
  assert.match(prompt, /【系统级电商语境与安全判断约束】/);
  assert.match(prompt, /不因单个关键词拒绝/);
  assert.doesNotMatch(prompt, /【服装与模特】/);
  assert.ok(prompt.indexOf('【系统级电商语境与安全判断约束】') < prompt.indexOf('【具体任务】'));
  assert.doesNotMatch(prompt, /锁定商品构图规则/);
  assert.doesNotMatch(prompt, /\n必须遵守\n/);
});

test('product wording triggers apparel guidance even when the selected category is generic', () => {
  const platform = getEcommercePlatform('taobao-tmall');
  const slot = platform.slots.find((item) => item.id === 'main-square');
  const prompt = buildEcommerceSlotPrompt({
    project: project({ productName: '婷美内衣', industryId: 'general', subcategoryId: 'daily-goods' }),
    platform,
    slot,
    assets: []
  });
  assert.match(prompt, /【服装与模特】/);
  assert.match(prompt, /项目分类（用于视觉规范）：其他 \/ 日用百货/);
});

test('identical supporting asset roles are grouped into compact input ranges', () => {
  const platform = getEcommercePlatform('amazon');
  const slot = platform.slots.find((item) => item.id === 'feature');
  const prompt = buildEcommerceSlotPrompt({
    project: project({ masterAssetId: 'master-1' }),
    platform,
    slot,
    assets: [
      { id: 'master-1', assetType: 'product', purpose: 'identity', sortOrder: 1 },
      { id: 'angle-1', assetType: 'product', purpose: '', sortOrder: 2 },
      { id: 'angle-2', assetType: 'product', purpose: '', sortOrder: 3 }
    ]
  });
  assert.match(prompt, /输入图片 1：真实商品图.*权威母版/);
  assert.match(prompt, /输入图片 2–3：真实商品图/);
});

test('ecommerce generation accepts the configured system prompt before all generated task details', () => {
  const platform = getEcommercePlatform('taobao-tmall');
  const slot = platform.slots.find((item) => item.id === 'main-square');
  const prompt = buildEcommerceSlotPrompt({
    project: project(),
    platform,
    slot,
    assets: [],
    systemPrompt: '后台自定义电商真实性约束。'
  });
  assert.ok(prompt.startsWith('后台自定义电商真实性约束。'));
  assert.ok(prompt.indexOf('后台自定义电商真实性约束。') < prompt.indexOf('【系统级电商语境与安全判断约束】'));
  assert.doesNotMatch(prompt, /你是一个严格遵循商品真实资料的生图约束系统/);
});

test('blank optional product fields are omitted without inventing generic facts', () => {
  const platform = getEcommercePlatform('taobao-tmall');
  const slot = platform.slots.find((item) => item.id === 'main-square');
  const prompt = buildEcommerceSlotPrompt({
    project: project({
      brandName: '',
      coreUser: '',
      coreScenario: '',
      sellingPoints: [],
      specifications: '',
      prohibitedContent: '',
      identitySpec: {}
    }),
    platform,
    slot,
    assets: []
  });

  assert.doesNotMatch(prompt, /品牌或系列：/);
  assert.doesNotMatch(prompt, /核心用户：/);
  assert.doesNotMatch(prompt, /核心场景：/);
  assert.doesNotMatch(prompt, /核心卖点：/);
  assert.doesNotMatch(prompt, /便捷使用|场景适配|潜在消费者/);
  assert.match(prompt, /必须保持商品的外形、比例、结构、颜色、材质/);
  assert.ok(prompt.length < 2600);
});
