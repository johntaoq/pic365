import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildStyledImagePrompt,
  getImageStylePreset,
  IMAGE_STYLE_CATEGORIES,
  IMAGE_STYLE_PRESETS,
  normalizeImageStylePresetId
} from '../shared/image-style-presets.js';

test('image style presets use unique ids and valid categories', () => {
  const ids = IMAGE_STYLE_PRESETS.map((item) => item.id);
  const previewAssets = IMAGE_STYLE_PRESETS.map((item) => item.previewAsset);
  const previewHashes = [];
  const categories = new Set(IMAGE_STYLE_CATEGORIES.map((item) => item.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(previewAssets).size, previewAssets.length, 'each style must use its own preview image');
  assert.ok(IMAGE_STYLE_PRESETS.length >= 90);
  for (const category of IMAGE_STYLE_CATEGORIES.filter((item) => item.id !== 'recommended')) {
    assert.ok(IMAGE_STYLE_PRESETS.filter((item) => item.category === category.id).length >= 6);
  }
  for (const preset of IMAGE_STYLE_PRESETS) {
    assert.ok(categories.has(preset.category));
    assert.ok(Number(preset.previewCaseId) > 0);
    if (preset.previewAsset) {
      assert.equal(preset.previewAsset, `/images/style-presets/generated/${preset.id}.webp`);
      const assetPath = path.resolve('data', preset.previewAsset.replace(/^\//, ''));
      assert.ok(existsSync(assetPath), `missing style preview asset: ${preset.previewAsset}`);
      assert.ok(statSync(assetPath).size < 100 * 1024, `style preview asset is too large: ${preset.previewAsset}`);
      previewHashes.push(createHash('sha256').update(readFileSync(assetPath)).digest('hex'));
    }
    assert.ok(preset.label.zh);
    assert.ok(preset.label.en);
    assert.ok(preset.prompt.length > 40);
  }
  assert.equal(new Set(previewHashes).size, previewHashes.length, 'style preview images must not reuse identical image content');
});

test('festival category contains twenty localized presets with independent thumbnails', () => {
  const festivalPresets = IMAGE_STYLE_PRESETS.filter((item) => item.category === 'festival');
  assert.equal(festivalPresets.length, 20);
  assert.ok(IMAGE_STYLE_CATEGORIES.some((item) => item.id === 'festival' && item.label.zh === '节日庆典'));
  assert.ok(festivalPresets.some((item) => item.id === 'festival-spring-new-year'));
  assert.ok(festivalPresets.some((item) => item.id === 'festival-christmas'));
  assert.ok(festivalPresets.some((item) => item.id === 'festival-wedding'));
});

test('the public reference style catalog is covered without duplicate synonym cards', () => {
  const referenceStyles = [
    '真实摄影', '复古旧漫', '国产3D', '卡通C4D', '吉卜力', '实景插画', '3D拍立得', 'CG渲染', '3D卡通', '复古胶片',
    '敦煌壁画', '芭比风', '仙侠', '羊毛毡', '口袋盒子', '理光', '城市胶囊', '微缩景观', '油画厚涂', '工笔画',
    '超扁平风', '日漫', '青橙色调', '治愈日漫', '方块世界', '复古美漫', '像素', '恶搞美漫', '二次元', 'Jellycat风格',
    '废土科幻风', '马卡龙色系', '梦核', 'LOGO设计', '国产经典', '液态金属质感', '美式动画', '吴冠中', '玻璃', '积木',
    '未来科幻', '日漫侦探', '彩虹小马', '小女警', 'Q版二次元', '纸雕', '手办', '毛绒材质', '针织材质', '单线绘图',
    '冰淇淋材质', '棉花娃娃', '水彩插画', '贴纸', '超现实摄影', 'Q版3D', '水墨画', '莫奈', '童真插画', '多彩梦幻',
    '石膏', '彩铅插画', '虹彩PVC', '素描', '游戏CG', '红包封面', '涂鸦', '蒸汽朋克', '设计草稿'
  ];
  const coveredNames = new Set(IMAGE_STYLE_PRESETS.flatMap((preset) => [preset.label.zh, ...(preset.aliases || [])]));
  assert.deepEqual(referenceStyles.filter((name) => !coveredNames.has(name)), []);
});

test('style presets are normalized and unknown values are ignored', () => {
  assert.equal(normalizeImageStylePresetId(' Natural-Photo '), 'natural-photo');
  assert.equal(getImageStylePreset('natural-photo')?.category, 'photography');
  assert.equal(normalizeImageStylePresetId('not-a-style'), '');
  assert.equal(getImageStylePreset('not-a-style'), null);
});

test('style guidance is injected without changing the visible user prompt', () => {
  const userPrompt = '一只猫坐在窗边';
  const styled = buildStyledImagePrompt(userPrompt, 'natural-photo');
  assert.ok(styled.startsWith(userPrompt));
  assert.match(styled, /Natural editorial photography/);
  assert.match(styled, /Do not override the user request/);
  assert.equal(buildStyledImagePrompt(userPrompt, ''), userPrompt);
  assert.equal(buildStyledImagePrompt(userPrompt, 'unknown'), userPrompt);
});
