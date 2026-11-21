import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  LAYOUT_TEMPLATES, LAYOUT_GUIDE_REGIONS, MAX_LAYOUT_IMAGES,
  buildEcommerceLayoutPrompt, buildLayoutReferenceInputs, layoutSlots,
  layoutRequiresTemplateReference, toggleSelectedLayout, validateEcommerceLayoutReferences
} from '../shared/ecommerce-layout-studio.js';
import { NEW_LAYOUTS_20261108 } from '../shared/ecommerce-layout-additions-20261108.js';

const sha = (input) => createHash('sha256').update(input).digest('hex');
const digest = (input) => sha(JSON.stringify(input));

test('original twenty layouts, guide regions, prompts and artwork stay unchanged', () => {
  const originals = LAYOUT_TEMPLATES.slice(0, 20);
  assert.equal(digest(originals), 'b3c1280f447ce854a9d6050badd32dcbd6d2812f8b0b976118e621fecdc8fb87');
  const guides = Object.fromEntries(originals.map((layout) => [layout.id, LAYOUT_GUIDE_REGIONS[layout.id]]));
  assert.equal(digest(guides), '92ee7a50c269f8157f72a6e29689f282ca7958706cd95c60cecd1c4cb9a6bf67');
  const prompts = originals.map((layout) => buildEcommerceLayoutPrompt({
    slot: { type: layout.type, layoutId: layout.id, index: 0 },
    productName: '保真测试商品', sellingPoints: '可见纹理\n金色连接件\n弧形手柄'
  }));
  assert.equal(digest(prompts), '1de6cc3b116942e455424e9e702572ee7e1589393c2d4cc154699db321e03494');
  const assets = originals.map((layout) => ({
    artwork: layout.artwork,
    sha256: sha(fs.readFileSync(new URL(`../src/assets/ecommerce-layouts/generated/${layout.artwork}`, import.meta.url)))
  }));
  assert.equal(digest(assets), 'e154f946f7e3a14c0cbd8084e95167619663f29083617b2db65d4c3255ae7681');
});

test('ten additions append stable IDs and remain selectable together under the ten-image cap', () => {
  assert.equal(NEW_LAYOUTS_20261108.length, 10);
  assert.deepEqual(LAYOUT_TEMPLATES.slice(20).map((layout) => layout.id), NEW_LAYOUTS_20261108.map((layout) => layout.id));
  assert.deepEqual(NEW_LAYOUTS_20261108.map((layout) => layout.reference), Array.from({ length: 10 }, (_, index) => index + 21));
  let selection = [];
  for (const layout of NEW_LAYOUTS_20261108) selection = toggleSelectedLayout(selection, layout.id);
  assert.equal(selection.length, MAX_LAYOUT_IMAGES);
  assert.equal(toggleSelectedLayout(selection, LAYOUT_TEMPLATES[0].id), selection);
  assert.deepEqual(layoutSlots(selection).map((slot) => slot.layoutId), selection);
  assert.deepEqual(new Set(layoutSlots(selection).map((slot) => slot.type)), new Set(['selling', 'detail', 'scene']));
});

test('new layouts use customer product photos only and never upload sample handbags', () => {
  for (const layout of NEW_LAYOUTS_20261108) {
    assert.equal(layoutRequiresTemplateReference(layout.id), false);
    for (let count = 1; count <= 3; count++) {
      const products = Array.from({ length: count }, (_, index) => ({ assetId: `customer-${index}` }));
      const references = buildLayoutReferenceInputs(products, undefined, undefined, layout.id);
      assert.deepEqual(references, products.map((product) => ({ ...product, annotations: [] })));
      assert.equal(validateEcommerceLayoutReferences({
        layoutId: layout.id, layoutReferenceMode: 'prompt-only', layoutProductReferenceCount: count, references
      }), count);
      const prompt = buildEcommerceLayoutPrompt({ slot: { layoutId: layout.id, type: layout.type }, productReferenceCount: count });
      assert.match(prompt, /最高优先级是商品保真/);
      assert.match(prompt, /不换角度重画/);
      assert.ok(prompt.includes(layout.direction));
      assert.doesNotMatch(prompt, /浅蓝手提包|弧形手柄|金色扣件|编结细节/);
    }
  }
});

test('original-inset previews have no copy and on-person layout changes context without inventing accessories', () => {
  for (const id of ['scene-original-inset', 'person-original-inset']) {
    const prompt = buildEcommerceLayoutPrompt({ slot: { layoutId: id, type: 'scene' }, productName: '真实商品' });
    assert.match(prompt, /不在画面中渲染任何标题、标签、卖点、价格或占位文字/);
    assert.match(prompt, /白色圆角/);
  }
  const person = buildEcommerceLayoutPrompt({ slot: { layoutId: 'person-original-inset', type: 'scene' } });
  assert.match(person, /自然互动/);
  assert.match(person, /不能添加原图没有的肩带或绑带/);
  assert.match(person, /改为人物旁边的完整实景陈列/);
  assert.doesNotMatch(person, /不得把一个视角推演成新的背面、内部、拆解或使用姿态/);
  const comic = NEW_LAYOUTS_20261108.find((layout) => layout.id === 'comic-daily-styling');
  assert.match(comic.direction, /不能使用Before\/After/);
});

test('each new guide zone is normalized and stays inside the image', () => {
  for (const layout of NEW_LAYOUTS_20261108) {
    const zones = LAYOUT_GUIDE_REGIONS[layout.id];
    assert.ok(zones?.some((zone) => zone.kind === 'product'));
    for (const zone of zones) {
      assert.ok(zone.x >= 0 && zone.y >= 0 && zone.w > 0 && zone.h > 0);
      assert.ok(zone.x + zone.w <= 1.000001 && zone.y + zone.h <= 1.000001);
    }
  }
});

test('all ten previews are genuine GPT Image 2.5 outputs with product and composition provenance', async () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../src/assets/ecommerce-layouts/generated/manifest-20261108.json', import.meta.url), 'utf8'));
  assert.equal(manifest.model, 'gpt-image-2.5-sunburst');
  assert.equal(manifest.quality, 'low');
  assert.equal(manifest.size, '1024x1024');
  assert.equal(manifest.operation, 'images.edits');
  assert.equal(Object.keys(manifest.layouts).length, 10);
  for (const layout of NEW_LAYOUTS_20261108) {
    const record = manifest.layouts[layout.id];
    const full = LAYOUT_TEMPLATES.find((item) => item.id === layout.id);
    assert.ok(record);
    assert.equal(record.model, manifest.model);
    assert.match(record.productReferenceSha256, /^[a-f0-9]{64}$/);
    assert.match(record.compositionReferenceSha256, /^[a-f0-9]{64}$/);
    assert.match(record.prompt, /ONLY product identity reference/);
    const image = fs.readFileSync(new URL(`../src/assets/ecommerce-layouts/generated/${full.artwork}`, import.meta.url));
    assert.equal(sha(image), record.artworkSha256);
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.width, 1024);
    assert.equal(metadata.height, 1024);
    assert.equal(metadata.format, 'webp');
    const stats = await sharp(image).stats();
    assert.ok(stats.channels.some((channel) => channel.stdev > 10), `${layout.id} cannot be a blank placeholder`);
  }
});
