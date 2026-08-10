import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFallbackEcommerceBrief,
  countSellingPointWords,
  normalizeAiSellingPoints,
  normalizeEcommerceAiBrief
} from '../shared/ecommerce-brief.js';

test('AI selling points are limited to four concise phrases', () => {
  const normalized = normalizeAiSellingPoints([
    '简约稳重',
    '横竖双用',
    '多角度调节',
    '解放双手',
    '桌面整洁'
  ], 'zh');
  const points = normalized.split('\n');
  assert.deepEqual(points, ['简约稳重', '横竖双用', '多角度调节', '解放双手']);
  assert.ok(points.every((point) => countSellingPointWords(point, 'zh') <= 4));
  assert.equal(normalizeAiSellingPoints(['Premium materials', 'Compact dimensions'], 'en'), 'Premium materials\nCompact dimensions');
});

test('only explicit prompt constraints are routed from selling points into composition rules', () => {
  const brief = normalizeEcommerceAiBrief({
    coreUser: '注重桌面整洁的手机用户',
    coreScenario: '居家办公与视频观看',
    sellingPoints: [
      '简约稳重',
      '横竖双用',
      '多角度调节',
      '解放双手',
      '这是一句过长但没有事实约束的普通营销文案，只应丢弃而不应变成商品硬规则',
      '展示其帮助整理桌面、释放双手的使用场景，避免宣称适配所有手机',
      '拍摄前核验材质构成、承重能力、适配尺寸、底部防滑设计及包装内配件'
    ],
    identitySpec: { mustAvoid: '不要添加不存在的结构' }
  }, { language: 'zh' });

  assert.equal(brief.sellingPoints, '简约稳重\n横竖双用\n多角度调节\n解放双手');
  assert.match(brief.identitySpec.mustAvoid, /避免宣称适配所有手机/);
  assert.match(brief.identitySpec.mustAvoid, /不要添加不存在的结构/);
  assert.match(brief.identitySpec.mustKeep, /拍摄前核验材质构成/);
  assert.equal(brief.identitySpec.mustKeep.includes('普通营销文案'), false);
});

test('local fallback separates benefits from verification rules', () => {
  const brief = buildFallbackEcommerceBrief({
    language: 'zh',
    industryName: '手机与数码',
    productName: '金属手机支架',
    brandName: 'C01'
  });
  const points = brief.sellingPoints.split('\n');
  assert.equal(points.length, 4);
  assert.ok(points.every((point) => countSellingPointWords(point, 'zh') <= 4));
  assert.match(brief.identitySpec.structure, /拍摄前核验/);
  assert.match(brief.identitySpec.mustAvoid, /不得宣称未经核验/);
});

test('instructions are not accepted inside customer or scenario descriptions', () => {
  const brief = normalizeEcommerceAiBrief({
    coreUser: '注重桌面整洁的手机用户',
    coreScenario: '居家办公，拍摄前核验承重能力',
    sellingPoints: ['简约稳重'],
    identitySpec: { mustKeep: '核验承重能力' }
  }, { language: 'zh' });
  assert.equal(brief, null);
});
