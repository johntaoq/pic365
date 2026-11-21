import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MAX_LAYOUT_IMAGES, MAX_LAYOUT_PRODUCT_IMAGES, layoutReferenceCount, promoteLayoutProduct,
  LAYOUT_GUIDE_REGIONS, LAYOUT_IMAGE_TYPES, LAYOUT_TEMPLATES, SELLING_LAYOUT_GROUPS,
  buildEcommerceLayoutPrompt, buildLayoutReferenceInputs, createDefaultLayoutSelections,
  layoutRequiresTemplateReference, layoutSlots, toggleSelectedLayout, validateEcommerceLayoutReferences
} from '../shared/ecommerce-layout-studio.js';
import { getImageGenerationPricing } from '../shared/image-pricing.js';
import { settleImageInputPricing } from '../shared/image-input-billing.js';
import { expandSharedTaskReferences } from '../shared/generation-task-references.js';
import { LAYOUT_WATERMARK_PROTOCOL_VERSION } from '../shared/ecommerce-layout-watermark.js';
import {
  latestLayoutBatchId, layoutBatchResults, layoutBatchRows, layoutResultFilename,
  layoutResultIdentity, layoutTaskFailureText, selectLayoutResult
} from '../src/ecommerce-layout-results.js';
import { submitLayoutGenerationTasks } from '../src/ecommerce-layout-requests.js';

test('thirty references map one-to-one to generated artwork without duplicate extras', () => {
  assert.equal(LAYOUT_TEMPLATES.length, 30);
  assert.deepEqual(LAYOUT_TEMPLATES.map((item) => item.reference), Array.from({ length: 30 }, (_, index) => index + 1));
  assert.equal(new Set(LAYOUT_TEMPLATES.map((item) => item.id)).size, 30);
  assert.equal(new Set(LAYOUT_TEMPLATES.map((item) => item.artwork)).size, 30);
  for (const layout of LAYOUT_TEMPLATES) {
    assert.ok(LAYOUT_IMAGE_TYPES.some((type) => type.id === layout.type));
    assert.ok(SELLING_LAYOUT_GROUPS.some((group) => group.id === layout.group));
    assert.ok(LAYOUT_GUIDE_REGIONS[layout.id]?.length);
    assert.ok(fs.existsSync(new URL(`../src/assets/ecommerce-layouts/generated/${layout.artwork}`, import.meta.url)));
  }
});

test('independent selection starts empty, crosses categories and caps at ten', () => {
  let selected = createDefaultLayoutSelections();
  assert.deepEqual(selected, []);
  assert.equal(toggleSelectedLayout(selected, 'unknown'), selected);
  const ids = ['single-frame', 'arch-cards', 'detail-ribbons'];
  for (const id of ids) selected = toggleSelectedLayout(selected, id);
  assert.deepEqual(layoutSlots(selected).map((slot) => slot.type), ['selling', 'scene', 'detail']);
  selected = toggleSelectedLayout(selected, 'arch-cards');
  assert.deepEqual(selected, ['single-frame', 'detail-ribbons']);
  selected = LAYOUT_TEMPLATES.slice(0, MAX_LAYOUT_IMAGES).map((item) => item.id);
  assert.equal(toggleSelectedLayout(selected, LAYOUT_TEMPLATES[MAX_LAYOUT_IMAGES].id), selected);
  assert.equal(layoutSlots(['unknown', ...selected, selected[0]]).length, 10);
});

test('legacy requests without a layout ID still count their compressed template', () => {
  for (const product of [{ assetId: 'product-asset' }, { imageDataUrl: 'data:image/png;base64,product' }]) {
    const refs = buildLayoutReferenceInputs(product, 'data:image/jpeg;base64,template', 'layout-1');
    assert.equal(refs.length, layoutReferenceCount(1));
    assert.equal(refs[0].assetId || refs[0].imageDataUrl, product.assetId || product.imageDataUrl);
    assert.equal(refs[1].imageDataUrl, 'data:image/jpeg;base64,template');
    assert.equal(refs[1].clientId, 'layout-1');
    const config = { strategy: 'fixed-quality', qualityPricesRmb: { low: .4, medium: .8, high: 1.6 }, referenceImagePriceRmb: .12 };
    const quote = getImageGenerationPricing({ quality: 'low', referenceCount: refs.length }, config);
    assert.equal(quote.referenceCount, 2);
    assert.equal(quote.referenceCredits, 24);
    assert.equal(quote.credits, 64);
  }
  assert.throws(() => buildLayoutReferenceInputs({}, 'data:image/jpeg;base64,template', 'layout'), /PRODUCT_REFERENCE_REQUIRED/);
  assert.throws(() => buildLayoutReferenceInputs({ assetId: 'product' }, '', 'layout'), /LAYOUT_REFERENCE_REQUIRED/);
});

test('legacy input token settlement includes the template in the reported image token total', () => {
  const config = {
    strategy: 'fixed-image', fixedPriceRmb: .4, chargeReferenceTokens: true,
    upstreamCost: { model: 'gpt-image-2', imageInput: 56, referenceTokenBudget: 4096 }
  };
  const quote = getImageGenerationPricing({ model: 'gpt-image-2', quality: 'low', referenceCount: layoutReferenceCount(1) }, config);
  assert.equal(quote.referenceTokens, 8192);
  assert.ok(quote.referenceTokenCredits > 0);
  const settled = settleImageInputPricing(quote, { textTokens: 0, referenceTokens: 700, outputTokens: 0 });
  assert.equal(settled.referenceTokens, 700);
  assert.equal(settled.referenceTokenCredits, 3.92);
  assert.equal(settled.credits, 43.92);
});

test('first layout uses only real product photos and a written art direction', () => {
  assert.equal(layoutRequiresTemplateReference('single-frame'), false);
  assert.equal(layoutRequiresTemplateReference('bottom-band'), false);
  assert.equal(layoutRequiresTemplateReference('full-bleed-detail'), false);
  assert.equal(layoutRequiresTemplateReference('detail-window'), false);
  assert.equal(layoutRequiresTemplateReference(''), true);
  for (let count = 1; count <= 3; count++) {
    const products = Array.from({ length: count }, (_, index) => ({ assetId: `product-${index}` }));
    const references = buildLayoutReferenceInputs(products, undefined, undefined, 'single-frame');
    assert.equal(layoutReferenceCount(count, 'single-frame'), count);
    assert.deepEqual(references.map((reference) => reference.assetId), products.map((product) => product.assetId));
    assert.equal(validateEcommerceLayoutReferences({
      batchId: 'layout-prompt-only', layoutId: 'single-frame',
      layoutProductReferenceCount: count, references
    }), count);
    assert.equal(validateEcommerceLayoutReferences({
      batchId: 'layout-prompt-only', layoutId: 'single-frame', references
    }), count);
    assert.throws(() => validateEcommerceLayoutReferences({
      batchId: 'layout-prompt-only', layoutId: 'single-frame',
      layoutProductReferenceCount: count, references: [...references, { imageDataUrl: 'data:image/jpeg;base64,extra' }]
    }), /LAYOUT_REFERENCES_INCOMPLETE/);
    if (count > 1) assert.throws(() => validateEcommerceLayoutReferences({
      batchId: 'layout-prompt-only', layoutId: 'single-frame',
      layoutProductReferenceCount: count, references: references.slice(1)
    }), /LAYOUT_REFERENCES_INCOMPLETE/);
    const prompt = buildEcommerceLayoutPrompt({
      slot: layoutSlots(['single-frame'])[0], productName: '黑色户外手电筒',
      sellingPoints: '握持舒适', productReferenceCount: count
    });
    assert.match(prompt, new RegExp(`请依据随请求提供的${count}张参考图`));
    assert.match(prompt, /本次只上传真实商品图，没有版式样板图/);
    assert.match(prompt, /深墨绿色、带细致墙线的实体墙面/);
    assert.match(prompt, /浅灰白石质地面/);
    assert.match(prompt, /斜向暖窗光/);
    assert.match(prompt, /顶部用浅暖色大字/);
    assert.match(prompt, /商品不适合直立时沿原图姿态陈列/);
    assert.doesNotMatch(prompt, /第\d张（最后一张）是低分辨率版式样板|Pic365标识|银白启程/);
  }
  assert.throws(() => buildLayoutReferenceInputs({}, '', '', 'single-frame'), /PRODUCT_REFERENCE_REQUIRED/);
  assert.throws(() => buildLayoutReferenceInputs([], '', '', 'single-frame'), /INVALID_PRODUCT_REFERENCE_COUNT/);
});

test('second and third layouts use prompt directions without a sample image', () => {
  for (const [id, expectedType, requiredPhrases] of [
    ['bottom-band', 'selling', ['完整商品保留主图原有视角', '左上方预留两行主标题', '暖灰石质墙面',
      '深胡桃木色竖向陈列面', '底部约22%', '两条细竖线等分为三栏', '不虚构部件、性能或认证']],
    ['full-bleed-detail', 'detail', ['一处清晰可见的表面与边缘细节', '斜向穿过画面上方约75%',
      '只能画0至2条极细深灰引线', '第三条绝对不要出现', '短标签须与线端所指部位一致',
      '若看不清第二处细节就少用引线', '下方约25%', '不新增未提供的文案、品牌或图案']]
  ]) {
    const slot = layoutSlots([id])[0];
    assert.equal(slot.type, expectedType);
    assert.equal(layoutRequiresTemplateReference(id), false);
    for (let count = 1; count <= 3; count++) {
      const products = Array.from({ length: count }, (_, index) => ({ assetId: `product-${index}` }));
      const references = buildLayoutReferenceInputs(products, undefined, undefined, id);
      const prompt = buildEcommerceLayoutPrompt({
        slot, productName: '户外手电筒', sellingPoints: '便于握持', productReferenceCount: count
      });
      assert.equal(layoutReferenceCount(count, id), count);
      assert.deepEqual(references.map((reference) => reference.assetId), products.map((product) => product.assetId));
      assert.equal(validateEcommerceLayoutReferences({
        batchId: 'layout-prompt-only', layoutId: id, layoutProductReferenceCount: count, references
      }), count);
      assert.match(prompt, new RegExp(`请依据随请求提供的${count}张参考图`));
      assert.match(prompt, /本次只上传真实商品图，没有版式样板图/);
      assert.doesNotMatch(prompt, /第\d张（最后一张）是低分辨率版式样板|Pic365标识/);
      assert.match(prompt, id === 'bottom-band' ? /选定版式：暖光三栏卖点图/ : /选定版式：真实商品细节微距图/);
      assert.doesNotMatch(prompt, /选定版式：(旅居光影|箱面微观)/);
      if (id === 'full-bleed-detail') assert.doesNotMatch(prompt, /行李箱|Pic365/);
      for (const phrase of requiredPhrases) assert.ok(prompt.includes(phrase), `${id}: ${phrase}`);
      if (id === 'full-bleed-detail') {
        assert.match(prompt, /下方主标题只能写“户外手电筒”/);
        assert.match(prompt, /标题下的短句只能写“便于握持”/);
        assert.match(prompt, /不写清单外的宣传短句、副标题或第三条标签/);
      }
      assert.throws(() => validateEcommerceLayoutReferences({
        batchId: 'layout-prompt-only', layoutId: id,
        layoutProductReferenceCount: count,
        references: [...references, { imageDataUrl: 'data:image/jpeg;base64,template' }]
      }), /LAYOUT_REFERENCES_INCOMPLETE/);
      if (count > 1) assert.throws(() => validateEcommerceLayoutReferences({
        batchId: 'layout-prompt-only', layoutId: id, layoutProductReferenceCount: count,
        references: references.slice(1)
      }), /LAYOUT_REFERENCES_INCOMPLETE/);
    }
  }
});

test('second and third layout quotes remove exactly one image-input reference', () => {
  const flat = { strategy: 'fixed-image', fixedPriceRmb: .06, referenceImagePriceRmb: .015 };
  const tokenPriced = {
    ...flat, chargeReferenceTokens: true,
    upstreamCost: { model: 'gpt-image-2', imageInput: 56, referenceTokenBudget: 4096 }
  };
  for (const id of ['bottom-band', 'full-bleed-detail']) {
    const without = getImageGenerationPricing({ quality: 'low', referenceCount: layoutReferenceCount(1, id) }, flat);
    const withSample = getImageGenerationPricing({ quality: 'low', referenceCount: 2 }, flat);
    assert.equal(without.credits, 7.5);
    assert.equal(withSample.credits - without.credits, 1.5);
    const meteredWithout = getImageGenerationPricing({ model: 'gpt-image-2', referenceCount: 1 }, tokenPriced);
    const meteredWith = getImageGenerationPricing({ model: 'gpt-image-2', referenceCount: 2 }, tokenPriced);
    assert.equal(meteredWith.referenceTokens - meteredWithout.referenceTokens, 4096);
    assert.ok(meteredWithout.credits < meteredWith.credits);
  }
});

test('remaining seventeen directions match their preview geometry without sample uploads', () => {
  const zones = [
    ['detail-window', '暖窗商品与单圆细节窗', '左上约40%', '右上独立放一枚', '白边圆形放大窗'],
    ['stacked-split', '上部实景下部三联细节', '上方约65%', '下方约35%', '深墨绿色窄色带'],
    ['side-labels', '左三标签右主商品实景', '右侧约55%', '左侧中下部纵向堆三张', '浅白半透明'],
    ['triple-float', '冰蓝主商品与三圆特写', '右侧从上到下严格排列三枚', '细芥黄色水平引线'],
    ['benefit-cards', '石面商品与顶端三标签', '顶部约12%', '三枚轻量白色圆角胶囊', '下方靠中间'],
    ['mosaic-grid', '四宫格中央圆形标题', '细白缝等分为四个', '中心交点覆盖', '左下'],
    ['arch-cards', '上部主场景下部三拱窗', '上方约55%', '下方约45%', '三扇等宽、上圆下直'],
    ['rule-divisions', '浅紫三列商品细节对照', '两条极细竖线', '左中右三列'],
    ['floating-feature', '左主商品右三行信息卡', '右侧约28%', '卡内严格纵向三行'],
    ['detail-ribbons', '三条左右交错细节横幅', '第一条左半幅', '第二条左半幅', '第三条重新左图右文'],
    ['uneven-triptych', '不等幅四区实景编辑页', '左上约半宽', '左下', '右上', '右下'],
    ['orbit-icons', '中央商品四周圆形细节签', '四枚小圆形摄影放大窗', '第四枚可以只显示'],
    ['tone-mosaic', '错落三幅商品观察册', '中部三张无边摄影照片', '左侧较窄的完整商品', '三个白边圆形局部放大窗'],
    ['icon-rails', '陶土底带三场景商品图', '下方约24%', '右侧横向并排三张'],
    ['scene-ribbon', '左窄文案栏右明亮商品照', '左侧约30%', '右侧约70%'],
    ['editorial-blocks', '左紫色细节栏右商品编辑页', '左侧中下', '右侧约60%'],
    ['quad-cards', '顶端三细节窗下方主商品', '顶部约14%', '标题下方约28%', '下半部约52%']
  ];
  assert.deepEqual(zones.map(([id]) => id), LAYOUT_TEMPLATES.slice(3, 20).map((layout) => layout.id));
  for (const [id, promptName, ...phrases] of zones) {
    const layout = LAYOUT_TEMPLATES.find((item) => item.id === id);
    assert.equal(layout.promptName, promptName);
    assert.equal(layoutRequiresTemplateReference(id), false);
    for (const phrase of phrases) assert.ok(layout.direction.includes(phrase), `${id}: ${phrase}`);
    for (let count = 1; count <= MAX_LAYOUT_PRODUCT_IMAGES; count++) {
      const products = Array.from({ length: count }, (_, index) => ({ assetId: `product-${index}` }));
      const refs = buildLayoutReferenceInputs(products, 'data:image/jpeg;base64,ignored', 'unused', id);
      assert.deepEqual(refs.map((reference) => reference.assetId), products.map((product) => product.assetId));
      assert.equal(layoutReferenceCount(count, id), count);
      const request = {
        layoutId: id, layoutProductReferenceCount: count, layoutReferenceMode: 'prompt-only', references: refs
      };
      assert.equal(validateEcommerceLayoutReferences(request), count);
      assert.throws(() => validateEcommerceLayoutReferences({
        ...request, references: [...refs, { imageDataUrl: 'data:image/jpeg;base64,template' }]
      }), /LAYOUT_REFERENCES_INCOMPLETE/);
      const prompt = buildEcommerceLayoutPrompt({
        slot: layoutSlots([id])[0], productName: '便携音箱',
        sellingPoints: '顶部网孔\n侧边挂绳\n机身竖向纹理', productReferenceCount: count
      });
      assert.match(prompt, new RegExp(`请依据随请求提供的${count}张参考图`));
      assert.match(prompt, /本次只上传真实商品图，没有版式样板图/);
      assert.ok(prompt.includes(`选定版式：${promptName}`));
      assert.doesNotMatch(prompt, /行李箱|Pic365|第\d张（最后一张）是低分辨率版式样板/);
    }
  }
});

test('previously queued sampled layouts retain their original reference contract', () => {
  for (const layout of LAYOUT_TEMPLATES.slice(3)) {
    const references = [
      { assetId: 'primary' }, { assetId: 'supporting' },
      { imageDataUrl: 'data:image/jpeg;base64,previous-template' }
    ];
    assert.equal(validateEcommerceLayoutReferences({
      layoutId: layout.id, layoutProductReferenceCount: 2, references
    }), 2);
    assert.throws(() => validateEcommerceLayoutReferences({
      layoutId: layout.id, layoutProductReferenceCount: 2,
      layoutReferenceMode: 'prompt-only', references
    }), /LAYOUT_REFERENCES_INCOMPLETE/);
  }
});

test('first layout saves one reference charge and one input-image token budget in quotes', () => {
  const flat = { strategy: 'fixed-image', fixedPriceRmb: .06, referenceImagePriceRmb: .015 };
  const old = getImageGenerationPricing({ quality: 'low', referenceCount: layoutReferenceCount(1) }, flat);
  const cheaper = getImageGenerationPricing({ quality: 'low', referenceCount: layoutReferenceCount(1, 'single-frame') }, flat);
  assert.equal(old.credits, 9);
  assert.equal(cheaper.credits, 7.5);
  assert.equal(old.credits - cheaper.credits, 1.5);
  const metered = {
    ...flat, chargeReferenceTokens: true,
    upstreamCost: { model: 'gpt-image-2', imageInput: 56, referenceTokenBudget: 4096 }
  };
  const meteredOld = getImageGenerationPricing({ model: 'gpt-image-2', referenceCount: 2 }, metered);
  const meteredNew = getImageGenerationPricing({ model: 'gpt-image-2', referenceCount: 1 }, metered);
  assert.equal(meteredOld.referenceTokens - meteredNew.referenceTokens, 4096);
  assert.ok(meteredOld.credits > meteredNew.credits);
});

test('layout generation and quote preserve user-selected quality and shared dimensions', () => {
  const source = fs.readFileSync(new URL('../src/ecommerce-layout-studio.jsx', import.meta.url), 'utf8');
  assert.match(source, /providerId, size, quality, width, height, sizeMode, sizeCheck.*= imageSettings/);
  assert.match(source, /<FreeImageSettings\s+\{\.\.\.imageSettings\}/);
  assert.match(source, /referenceCount: layoutReferenceCount\(sources.length \|\| 1, slot.layoutId\)/);
  assert.match(source, /layoutReferenceMode: 'prompt-only'/);
  assert.match(source, /references: \[\]/);
  assert.doesNotMatch(source, /loadEcommerceLayoutReference|layoutRequiresTemplateReference\(slot.layoutId\)/);
  assert.doesNotMatch(source, /qualityLocked|LAYOUT_GENERATION_QUALITY/);
  assert.doesNotMatch(source, /imageSettings\.setQuality/);
  assert.doesNotMatch(source, /renderEcommerceLayoutGuide/);
  const config = { strategy: 'fixed-quality', qualityPricesRmb: { low: .4, medium: .8, high: 1.6 }, referenceImagePriceRmb: .12 };
  for (const [quality, expected] of [['low', 52], ['medium', 92], ['high', 172]]) {
    const quote = getImageGenerationPricing({ quality, referenceCount: layoutReferenceCount(1, 'detail-window') }, config);
    assert.equal(quote.credits, expected);
    assert.equal(quote.referenceCount, 1);
  }
});

test('one to three product references are the only inputs for every current layout', () => {
  assert.equal(MAX_LAYOUT_PRODUCT_IMAGES, 3);
  for (let count = 1; count <= 3; count++) {
    const products = Array.from({ length: count }, (_, i) => ({ assetId: `product-${i}` }));
    for (const layout of LAYOUT_TEMPLATES) {
      const refs = buildLayoutReferenceInputs(products, undefined, undefined, layout.id);
      assert.deepEqual(refs.map((r) => r.assetId), products.map((r) => r.assetId));
      assert.equal(refs.length, layoutReferenceCount(count, layout.id));
      const quote = getImageGenerationPricing({ quality: 'low', referenceCount: refs.length }, {
        strategy: 'fixed-image', fixedPriceRmb: .4, referenceImagePriceRmb: .12
      });
      assert.equal(quote.referenceCredits, count * 12);
      const prompt = buildEcommerceLayoutPrompt({ slot: layoutSlots([layout.id])[0], productReferenceCount: count });
      assert.match(prompt, /第1张是真实商品主图/);
      assert.doesNotMatch(prompt, /低分辨率版式样板|行李箱|Pic365/);
      if (count > 1) assert.match(prompt, /有冲突时以第1张主图为准/);
    }
  }
  for (const count of [0, 4, -1, 1.5, NaN]) assert.throws(() => layoutReferenceCount(count));
  assert.throws(() => buildLayoutReferenceInputs([], 'data:image/jpeg;base64,template'), /INVALID_PRODUCT_REFERENCE_COUNT/);
  assert.throws(() => buildLayoutReferenceInputs(Array(4).fill({ assetId: 'p' }), ''), /INVALID_PRODUCT_REFERENCE_COUNT/);
});

test('promoting and removing a product preserves a single primary image and reference order', () => {
  const sources = [{ id: 'front' }, { id: 'side' }, { id: 'detail' }];
  const promoted = promoteLayoutProduct(sources, 'detail');
  assert.deepEqual(promoted.map((s) => s.id), ['detail', 'front', 'side']);
  assert.equal(promoteLayoutProduct(sources, 'missing'), sources);
  assert.equal(promoteLayoutProduct(sources, 'front'), sources);
  assert.deepEqual(promoted.filter((s) => s.id !== 'detail').map((s) => s.id), ['front', 'side']);
});

test('shared product uploads expand into independent queued requests without mutating inputs', () => {
  const shared = [{ assetId: 'primary' }, { assetId: 'side' }, { assetId: 'detail' }];
  const tasks = [{ clientTaskId: 'a', quality: 'high', references: [{ clientId: 'sample-a' }] },
    { clientTaskId: 'b', quality: 'medium', references: [{ clientId: 'sample-b' }] }];
  const expanded = expandSharedTaskReferences(tasks, shared);
  assert.equal(expanded.length, 2);
  for (const task of expanded) {
    assert.equal(task.references.length, 4);
    assert.deepEqual(task.references.slice(0, 3), shared);
  }
  assert.equal(expanded[0].references[3].clientId, 'sample-a');
  assert.equal(expanded[1].references[3].clientId, 'sample-b');
  assert.equal(expanded[0].quality, 'high');
  assert.equal(tasks[0].references.length, 1);
  assert.equal(expandSharedTaskReferences(tasks, undefined), tasks);
  assert.throws(() => expandSharedTaskReferences(tasks, {}), /INVALID_REFERENCE_IMAGES/);
  assert.throws(() => expandSharedTaskReferences(tasks, Array(9).fill({})), /TOO_MANY_REFERENCE_IMAGES/);
  assert.throws(() => expandSharedTaskReferences([{ references: {} }], shared), /INVALID_REFERENCE_IMAGES/);
});

test('layout preview scopes results to one batch, including while the next batch is still empty', () => {
  const old = { id: 'old', imageUrl: '/old.png', status: 'succeeded' };
  const first = { id: 'first', generationId: 'first', imageUrl: '/first.png', status: 'succeeded', downloadAllowed: false };
  const second = { id: 'second', imageUrl: '/second.png', status: 'succeeded' };
  const tasks = [
    { id: 'old-task', batchId: 'layout-old', batchIndex: 0, createdAt: '2026-09-01T00:00:00Z', status: 'completed', results: [old] },
    { id: 'second-task', batchId: 'layout-new', batchIndex: 1, layoutId: 'bottom-band', createdAt: '2026-09-02T00:00:00Z', status: 'completed', results: [second] },
    { id: 'other-task', batchId: 'ordinary', createdAt: '2026-09-03T00:00:00Z', results: [{ id: 'ignored', imageUrl: '/ignored' }] },
    { id: 'first-task', batchId: 'layout-new', batchIndex: 0, layoutId: 'single-frame', createdAt: '2026-09-02T00:00:00Z', status: 'completed', results: [first, { id: 'bad', imageUrl: '/bad', status: 'failed' }] }
  ];
  assert.equal(latestLayoutBatchId(tasks), 'layout-new');
  assert.equal(latestLayoutBatchId(tasks.slice(0, 1)), 'layout-old');
  assert.equal(latestLayoutBatchId(tasks.slice(2, 3)), '');
  const rows = layoutBatchRows(tasks, 'layout-new', ['single-frame', 'bottom-band', 'arch-cards']);
  assert.deepEqual(rows.map((row) => row.batchIndex), [0, 1, 2]);
  assert.equal(rows[2].status, 'preparing');
  assert.equal(rows[2].layoutId, 'arch-cards');
  assert.equal(tasks.length, 4);
  const items = layoutBatchResults(rows);
  assert.deepEqual(items.map(layoutResultIdentity), ['first', 'second']);
  assert.equal(items[0].batchId, 'layout-new');
  assert.equal(items[0].taskId, 'first-task');
  assert.equal(items[0].downloadAllowed, false);
  assert.equal(selectLayoutResult(items, 'old', 'layout-new').id, 'first');
  assert.equal(selectLayoutResult(items, 'second', 'layout-new').id, 'second');
  assert.equal(selectLayoutResult(items, 'second', 'layout-next'), null);
  assert.equal(selectLayoutResult(items, 'second'), null);
  assert.deepEqual(layoutBatchRows(tasks, 'layout-next', ['quad-cards']).map((row) => row.status), ['preparing']);
  assert.equal(selectLayoutResult(layoutBatchResults(layoutBatchRows(tasks, 'layout-next')), 'old', 'layout-next'), null);
  assert.equal(layoutResultFilename({ id: 'a', mimeType: 'image/jpeg' }), 'pic365-a.jpg');
});

test('layout UI keeps queue submission and isolates the current batch from general image history', () => {
  const source = fs.readFileSync(new URL('../src/ecommerce-layout-studio.jsx', import.meta.url), 'utf8');
  const results = fs.readFileSync(new URL('../src/ecommerce-layout-results.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/ecommerce-layout-studio.css', import.meta.url), 'utf8');
  const requests = fs.readFileSync(new URL('../src/ecommerce-layout-requests.js', import.meta.url), 'utf8');
  const workspace = fs.readFileSync(new URL('../src/free-image-workspace.jsx', import.meta.url), 'utf8');
  const mountStart = workspace.indexOf('<EcommerceLayoutStudio');
  const mount = workspace.slice(mountStart, workspace.indexOf('\n        />', mountStart));
  assert.match(source, /submitLayoutGenerationTasks\(tasks, productReferences\)/);
  assert.match(requests, /request\('\/api\/generation-tasks'/);
  assert.doesNotMatch(source, /fetch\('\/api\/generate-image/);
  assert.match(requests, /sharedReferences: productReferences/);
  assert.match(source, /layoutProductReferenceCount: productReferences.length/);
  assert.match(source, /layoutReferenceMode: 'prompt-only'/);
  assert.doesNotMatch(source, /loadEcommerceLayoutReference/);
  assert.doesNotMatch(source, /报价含商品原图与版式样板|guideHint/);
  assert.doesNotMatch(source, /生图服务版本未就绪|LAYOUT_REFERENCE_SERVICE_OUTDATED/);
  assert.match(mount, /tasks=\{queueTasks\}/);
  assert.doesNotMatch(mount, /history=\{|historyLoading=|historyHasMore=|onLoadMoreHistory=/);
  assert.doesNotMatch(results, /history|History|mergeLayoutResults/i);
  assert.match(results, /layoutBatchRows\(tasks, batchId/);
  assert.match(results, /setSelection\(\{ id: layoutResultIdentity\(item\), batchId \}\)/);
  assert.match(results, /className="layoutStudioTaskGrid"/);
  assert.match(results, /className="layoutStudioTileState"/);
  assert.match(results, /running: \['生成中', 'Generating'\]/);
  assert.doesNotMatch(results, /layoutStudioTaskRow|layoutStudioTaskScroll/);
  assert.ok(source.indexOf('setSubmittedBatchId(batchId)') < source.indexOf('requestImagePricingBatch(quoteItems)'));
  assert.ok(source.indexOf('className="layoutStudioSelected"') < source.indexOf('className="layoutStudioGallery"'));
  assert.match(source, /setSelections\(\[\]\)/);
  assert.doesNotMatch(source, /layoutStudioIntro/);
  assert.match(css, /grid-template-columns: minmax\(0,3fr\) minmax\(0,3fr\) minmax\(0,4fr\)/);
  assert.match(css, /height: clamp\(650px,calc\(100dvh - 190px\),1000px\)/);
  assert.match(css, /grid-template-columns: repeat\(auto-fill,minmax\(90px,1fr\)\)/);
  assert.match(css, /scrollbar-color: var\(--studio-muted\) var\(--studio-bg\)/);
  const queuedCallback = mount.slice(mount.indexOf('onTasksQueued='));
  assert.doesNotMatch(queuedCallback, /setWorkspaceTab\('tasks'\)/);
});

test('layout input scroll contains absolute upload controls without enlarging the document', () => {
  const css = fs.readFileSync(new URL('../src/ecommerce-layout-studio.css', import.meta.url), 'utf8');
  const inputScrollRule = css.match(/^\.layoutStudioInputScroll\s*\{([^}]+)\}/m)?.[1];
  assert.ok(inputScrollRule);
  assert.match(inputScrollRule, /position:\s*relative/);
  assert.match(inputScrollRule, /min-height:\s*0/);
  assert.match(inputScrollRule, /overflow:\s*auto/);
  assert.match(css, /@media\s*\(max-width:660px\)[\s\S]*\.layoutStudioInputScroll\s*\{[^}]*overflow:\s*visible/);
});

test('layout generate button overrides inherited control typography at its own compact scale', () => {
  const css = fs.readFileSync(new URL('../src/ecommerce-layout-studio.css', import.meta.url), 'utf8');
  const rule = css.match(/^\.ecommerceLayoutStudio button\.layoutStudioGenerate\s*\{([^}]+)\}/m)?.[1];
  assert.ok(rule);
  assert.match(rule, /font-size:\s*12px/);
  assert.match(rule, /font-weight:\s*700/);
  assert.match(rule, /line-height:\s*1\.25/);
  assert.match(rule, /letter-spacing:\s*0/);
  assert.ok(css.indexOf('.ecommerceLayoutStudio button.layoutStudioGenerate') > css.indexOf('font: inherit'));
});

test('layout reference validation blocks missing products and count mismatches without affecting ordinary tasks', () => {
  assert.equal(validateEcommerceLayoutReferences({ references: [] }), undefined);
  const sample = { imageDataUrl: 'data:image/jpeg;base64,sample' };
  for (let count = 1; count <= 3; count++) {
    const references = [...Array.from({ length: count }, (_, i) => ({ assetId: `p-${i}` })), sample];
    assert.equal(validateEcommerceLayoutReferences({ batchId: 'layout-check', layoutProductReferenceCount: count, references }), count);
    assert.equal(validateEcommerceLayoutReferences({ batchId: 'layout-legacy', references }), count);
    assert.throws(() => validateEcommerceLayoutReferences({
      batchId: 'layout-check', layoutProductReferenceCount: count, references: references.slice(1)
    }), /LAYOUT_REFERENCES_INCOMPLETE/);
  }
  for (const references of [[], [sample], [{}, sample], [null, sample]]) {
    assert.throws(() => validateEcommerceLayoutReferences({ batchId: 'layout-legacy', references }), /LAYOUT_REFERENCES_INCOMPLETE/);
  }
  for (const count of [0, 4, '1', 1.5]) {
    assert.throws(() => validateEcommerceLayoutReferences({
      layoutProductReferenceCount: count, references: [{ assetId: 'p' }, sample]
    }), /LAYOUT_REFERENCES_INCOMPLETE/);
  }
});

test('unversioned services receive complete product and sample references in every task', async () => {
  const products = [{ assetId: 'primary' }, { imageDataUrl: 'data:image/png;base64,side' }, { assetId: 'detail' }];
  const tasks = ['low', 'medium', 'high'].map((quality, index) => ({
    batchId: 'layout-legacy-service', layoutProductReferenceCount: 3, quality,
    references: [{ imageDataUrl: `data:image/jpeg;base64,sample${index}` }]
  }));
  for (const capabilities of [undefined, {}, { sharedReferences: true }, { sharedReferences: 0 }, { sharedReferences: 2 }]) {
    const methods = [];
    const { response } = await submitLayoutGenerationTasks(tasks, products, async (_url, init) => {
      methods.push(init.method || 'GET');
      if (!init.method) return Response.json({ ok: true, capabilities });
      const sent = JSON.parse(init.body);
      assert.equal(sent.sharedReferences, undefined);
      for (const [index, task] of sent.tasks.entries()) {
        assert.equal(validateEcommerceLayoutReferences(task), 3);
        assert.deepEqual(task.references, [...products, ...tasks[index].references]);
        assert.equal(task.quality, tasks[index].quality);
      }
      return Response.json({ ok: true, tasks: sent.tasks }, { status: 201 });
    });
    assert.equal(response.status, 201);
    assert.deepEqual(methods, ['GET', 'POST']);
  }
  await assert.rejects(submitLayoutGenerationTasks(tasks, [], async () => {
    assert.fail('Incomplete references must not reach the server');
  }), /LAYOUT_REFERENCES_INCOMPLETE/);
});

test('failed service checks never post tasks or misreport authentication as an outdated service', async () => {
  const products = [{ assetId: 'primary' }];
  const tasks = [{ batchId: 'layout-check', layoutProductReferenceCount: 1, references: [{ imageDataUrl: 'data:image/jpeg;base64,sample' }] }];
  for (const [response, error] of [
    [Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 }), 'AUTH_REQUIRED'],
    [Response.json({ ok: false }, { status: 403 }), 'LAYOUT_REFERENCE_CHECK_FAILED'],
    [Response.json({ ok: false }, { status: 500 }), 'LAYOUT_REFERENCE_CHECK_FAILED'],
    [Response.json({ ok: false }), 'LAYOUT_REFERENCE_CHECK_FAILED'],
    [new Response('<html>Unavailable</html>'), 'LAYOUT_REFERENCE_CHECK_FAILED']
  ]) {
    const methods = [];
    await assert.rejects(submitLayoutGenerationTasks(tasks, products, async (_url, init) => {
      methods.push(init.method || 'GET');
      return response;
    }), new RegExp(error));
    assert.deepEqual(methods, ['GET']);
  }
});
test('compatible service receives shared products once, with independent queued layouts and unchanged qualities', async () => {
  for (let count = 1; count <= 3; count++) {
    const products = Array.from({ length: count }, (_, i) => ({ assetId: `product-${i}` }));
    const tasks = ['low', 'medium', 'high'].map((quality, i) => ({
      batchId: 'layout-submit', quality, layoutProductReferenceCount: count,
      references: [{ imageDataUrl: `data:image/jpeg;base64,sample${i}` }]
    }));
    const methods = [];
    const result = await submitLayoutGenerationTasks(tasks, products, async (_url, init) => {
      methods.push(init.method || 'GET');
      if (!init.method) return Response.json({ ok: true, capabilities: { sharedReferences: 1 } });
      const sent = JSON.parse(init.body);
      assert.deepEqual(sent.sharedReferences, products);
      assert.deepEqual(sent.tasks, tasks);
      for (const task of expandSharedTaskReferences(sent.tasks, sent.sharedReferences)) {
        assert.equal(validateEcommerceLayoutReferences(task), count);
        assert.deepEqual(task.references.slice(0, count), products);
      }
      return Response.json({ ok: true, tasks }, { status: 201 });
    });
    assert.deepEqual(methods, ['GET', 'POST']);
    assert.equal(result.response.status, 201);
    assert.equal(result.payload.tasks.length, 3);
  }
});

test('mixed current layouts submit only product photos on both service versions', async () => {
  const products = [{ assetId: 'primary' }, { assetId: 'detail' }];
  const tasks = [
    { batchId: 'layout-mixed', layoutId: 'single-frame', layoutReferenceMode: 'prompt-only',
      layoutProductReferenceCount: 2, quality: 'low', references: [] },
    { batchId: 'layout-mixed', layoutId: 'detail-window', layoutReferenceMode: 'prompt-only',
      layoutProductReferenceCount: 2, quality: 'high', references: [] }
  ];
  for (const capabilities of [{ sharedReferences: 1 }, undefined]) {
    const { response } = await submitLayoutGenerationTasks(tasks, products, async (_url, init) => {
      if (!init.method) return Response.json({ ok: true, capabilities });
      const sent = JSON.parse(init.body);
      const expanded = sent.sharedReferences ? expandSharedTaskReferences(sent.tasks, sent.sharedReferences) : sent.tasks;
      assert.deepEqual(expanded.map((task) => task.references.length), [2, 2]);
      assert.deepEqual(expanded.map((task) => validateEcommerceLayoutReferences(task)), [2, 2]);
      assert.equal(expanded[0].layoutId, 'single-frame');
      assert.equal(expanded[1].layoutId, 'detail-window');
      assert.deepEqual(expanded[1].references, products);
      return Response.json({ ok: true, tasks: sent.tasks }, { status: 201 });
    });
    assert.equal(response.status, 201);
  }
});

test('watermarked layouts require a capable service and do not add model references', async () => {
  const products = [{ assetId: 'primary' }, { assetId: 'detail' }];
  const watermark = { angle: -45, columns: 3, imageDataUrl: 'data:image/png;base64,YWJj' };
  const tasks = ['single-frame', 'bottom-band'].map((layoutId) => ({
    batchId: 'layout-watermark', layoutId, layoutReferenceMode: 'prompt-only',
    layoutProductReferenceCount: 2, references: [], layoutWatermark: watermark
  }));
  const calls = [];
  await assert.rejects(submitLayoutGenerationTasks(tasks, products, async (_url, init) => {
    calls.push(init.method || 'GET');
    return Response.json({ ok: true, capabilities: { sharedReferences: 1 } });
  }), /LAYOUT_WATERMARK_UNSUPPORTED/);
  assert.deepEqual(calls, ['GET']);
  await assert.rejects(submitLayoutGenerationTasks(tasks, products, async (_url, init) => {
    calls.push(init.method || 'GET');
    return Response.json({ ok: true, capabilities: { sharedReferences: 1, layoutWatermark: 2 } });
  }), /LAYOUT_WATERMARK_UNSUPPORTED/);
  assert.deepEqual(calls, ['GET', 'GET']);

  const { response } = await submitLayoutGenerationTasks(tasks, products, async (_url, init) => {
    if (!init.method) return Response.json({
      ok: true, capabilities: { sharedReferences: 1, layoutWatermark: LAYOUT_WATERMARK_PROTOCOL_VERSION }
    });
    const body = JSON.parse(init.body);
    assert.deepEqual(body.sharedReferences, products);
    assert.deepEqual(body.tasks, tasks);
    for (const task of expandSharedTaskReferences(body.tasks, body.sharedReferences)) {
      assert.equal(validateEcommerceLayoutReferences(task), 2);
      assert.deepEqual(task.references, products);
      assert.deepEqual(task.layoutWatermark, watermark);
    }
    return Response.json({ ok: true, tasks }, { status: 201 });
  });
  assert.equal(response.status, 201);
});

test('second and third prompt-only layouts submit just shared product photos on both service versions', async () => {
  const products = [{ assetId: 'primary' }, { assetId: 'detail' }];
  const tasks = ['bottom-band', 'full-bleed-detail'].map((layoutId, index) => ({
    batchId: 'layout-prompt-only-next', layoutId,
    layoutProductReferenceCount: products.length,
    quality: index ? 'medium' : 'low',
    references: []
  }));
  for (const capabilities of [{ sharedReferences: 1 }, undefined]) {
    const { response } = await submitLayoutGenerationTasks(tasks, products, async (_url, init) => {
      if (!init.method) return Response.json({ ok: true, capabilities });
      const sent = JSON.parse(init.body);
      const expanded = sent.sharedReferences ? expandSharedTaskReferences(sent.tasks, sent.sharedReferences) : sent.tasks;
      assert.deepEqual(expanded.map((task) => task.layoutId), ['bottom-band', 'full-bleed-detail']);
      assert.deepEqual(expanded.map((task) => task.references), [products, products]);
      assert.deepEqual(expanded.map((task) => validateEcommerceLayoutReferences(task)), [2, 2]);
      assert.deepEqual(expanded.map((task) => task.quality), ['low', 'medium']);
      return Response.json({ ok: true, tasks: expanded }, { status: 201 });
    });
    assert.equal(response.status, 201);
  }
});

test('prompts use product identity and written layout direction at every output proportion', () => {
  const prompt = buildEcommerceLayoutPrompt({
    slot: { type: 'selling', index: 1, layoutId: 'detail-window' },
    productName: '旅行包', sellingPoints: '拉链顺滑\n肩带可调\n外部口袋', copyLanguage: 'en'
  });
  assert.match(prompt, /本次只上传真实商品图，没有版式样板图/);
  assert.match(prompt, /左上约40%/);
  assert.match(prompt, /本张重点：肩带可调/);
  assert.match(prompt, /语言为英语/);
  assert.match(prompt, /不虚构尺寸、认证、参数、功能或品牌/);
  assert.match(prompt, /不拉伸、压扁或裁切/);
  for (const layout of LAYOUT_TEMPLATES) {
    const current = buildEcommerceLayoutPrompt({ slot: { type: layout.type, layoutId: layout.id, index: 0 } });
    assert.match(current, new RegExp(layout.promptName || layout.name));
    assert.match(current, /最高优先级是商品保真/);
    assert.match(current, /不换角度重画/);
    assert.match(current, /素材不足时减少小图、合并区域或留白/);
    assert.doesNotMatch(current, /版式硬约束/);
    assert.doesNotMatch(current, /行李箱|Pic365标识|低分辨率版式样板/);
  }
  assert.match(prompt, /第1张的同一商品视角或原图可见局部裁切/);
  const multi = buildEcommerceLayoutPrompt({ slot: layoutSlots(['icon-rails'])[0], productReferenceCount: 2 });
  assert.match(multi, /前2张中已确认属于同一商品/);
  assert.doesNotMatch(multi, /第2至2张/);
});

test('AI fills missing benefits up to three while preserving supplied benefits and distinct focuses', () => {
  const sellingSlot = { type: 'selling', layoutId: 'side-labels' };
  for (const [sellingPoints, supplied] of [
    ['', []],
    ['续航久', ['续航久']],
    ['续航久\n易于握持', ['续航久', '易于握持']]
  ]) {
    for (let index = 0; index < 3; index++) {
      const prompt = buildEcommerceLayoutPrompt({
        slot: { ...sellingSlot, index }, productName: '户外手电筒', sellingPoints
      });
      assert.match(prompt, /卖点文案须补足为恰好3条/);
      assert.ok(prompt.includes(`自由拟写${3 - supplied.length}条`));
      assert.match(prompt, /依据真实商品图、商品名称和用途自由拟写/);
      assert.match(prompt, /不得把未经核实的功能、性能、材质、参数、认证或品牌写成事实/);
      assert.match(prompt, /卖点图优先呈现这3条/);
      assert.doesNotMatch(prompt, /仅使用上面明确提供的名称与卖点作为可见文案/);
      for (const point of supplied) assert.ok(prompt.includes(point));
      assert.ok(prompt.includes(index < supplied.length
        ? `本张重点：${supplied[index]}。`
        : `本张重点：AI补写的第${index + 1}条卖点，不重复已有卖点。`));
    }
  }
  const scenePrompt = buildEcommerceLayoutPrompt({
    slot: { type: 'scene', layoutId: 'scene-ribbon', index: 0 }, sellingPoints: ''
  });
  assert.match(scenePrompt, /用户未填写卖点/);
  assert.match(scenePrompt, /自由拟写3条/);
  assert.doesNotMatch(scenePrompt, /^本张重点：/m);

  const completePrompt = buildEcommerceLayoutPrompt({
    slot: { ...sellingSlot, index: 2 }, sellingPoints: '续航久\n易于握持\n光线明亮', copyLanguage: 'en'
  });
  assert.match(completePrompt, /本张重点：光线明亮/);
  assert.match(completePrompt, /仅使用上面明确提供的名称与卖点作为可见文案，语言为英语/);
  assert.doesNotMatch(completePrompt, /卖点文案须补足|AI补写/);
});

test('layout studio allows zero user-entered benefits and explains AI completion', () => {
  const source = fs.readFileSync(new URL('../src/ecommerce-layout-studio.jsx', import.meta.url), 'utf8');
  assert.match(source, /生成时由 AI 补足不足的卖点/);
  assert.match(source, /AI drafts missing benefits when generating/);
  assert.doesNotMatch(source, /missingPoints|verifiedPoints/);
  assert.match(source, /enteredPoints\.length > 3/);
});

test('layout UI keeps watermark options scoped to all selected layouts and requires an uploaded image', () => {
  const source = fs.readFileSync(new URL('../src/ecommerce-layout-studio.jsx', import.meta.url), 'utf8');
  const controls = fs.readFileSync(new URL('../src/ecommerce-watermark-settings.jsx', import.meta.url), 'utf8');
  assert.match(source, /watermarkScope: '应用于本轮全部版式'/);
  assert.match(source, /useEcommerceWatermarkSettings\(watermarkUserId\)/);
  assert.match(source, /watermarkEnabled\).*watermarkSettings\.ready/s);
  assert.match(source, /settings\.imageEnabled && !settings\.imageDataUrl/);
  assert.match(source, /activeEcommerceWatermarkSettings\(await watermarkSettings\.flush\(\)\)/);
  assert.match(controls, /if \(event\.target\.checked && !settings\.imageDataUrl\) inputRef\.current\?\.click\(\)/);
  assert.match(controls, /MAX_LAYOUT_WATERMARK_TEXT_CHARACTERS/);
  assert.match(controls, /diagonal: '斜角'/);
  assert.match(controls, /angle: -45, label: t\.diagonal/);
  assert.match(controls, /MAX_LAYOUT_WATERMARK_COLUMNS/);
  assert.match(controls, /renderEcommerceWatermarkText\(next\.text\.trim\(\)\)/);
  assert.match(controls, /entry\.listeners\.forEach/);
  assert.match(source, /\.\.\.\(layoutWatermark \? \{ layoutWatermark \} : \{\}\)/);
  assert.doesNotMatch(source, /imageSettings\.setQuality/);
});

test('layout task tiles distinguish watermark and missing product-reference failures', () => {
  assert.equal(layoutTaskFailureText('LAYOUT_WATERMARK_INVALID'), '水印图无效');
  assert.equal(layoutTaskFailureText('LAYOUT_REFERENCES_INCOMPLETE'), '商品图不完整');
  assert.equal(layoutTaskFailureText('LAYOUT_WATERMARK_INVALID', 'en'), 'Invalid watermark');
  assert.equal(layoutTaskFailureText('UNKNOWN'), '生成失败');
  const source = fs.readFileSync(new URL('../src/ecommerce-layout-results.jsx', import.meta.url), 'utf8');
  assert.match(source, /task\.status === 'failed' \? layoutTaskFailureText\(task\.error, language\)/);
});
