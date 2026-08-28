import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addEcommerceSafetyContext,
  buildEcommerceSafetyContext,
  ECOMMERCE_APPAREL_SAFETY_PROMPT,
  ECOMMERCE_CONTEXT_SAFETY_PROMPT,
  ECOMMERCE_PROP_SAFETY_PROMPT
} from '../shared/ecommerce-safety-context.js';
import { DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT } from '../shared/ecommerce-generation-system-prompt.js';
import { SANITIZE_SYSTEM_PROMPT } from '../api/sanitize-prompt.js';

test('ecommerce safety context uses intent and context instead of isolated keywords', () => {
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /按整体商业意图判断/);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /不因单个关键词拒绝/);
  assert.doesNotMatch(buildEcommerceSafetyContext({ productName: '保温杯' }), /【服装与模特】/);
  assert.doesNotMatch(buildEcommerceSafetyContext({ productName: '保温杯' }), /【道具与器械】/);
});

test('ecommerce safety context retains explicit safety exceptions', () => {
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /未成年人/);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /真实伤害/);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /仇恨/);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /审核规避/);
});

test('ecommerce safety context adds only the specialized guidance required by the product', () => {
  const apparel = buildEcommerceSafetyContext({ productName: '婷美内衣', coreUser: '成年女模特' });
  assert.match(apparel, /【服装与模特】/);
  assert.match(apparel, /明确成年模特/);
  assert.equal(apparel.includes(ECOMMERCE_APPAREL_SAFETY_PROMPT), true);
  assert.doesNotMatch(apparel, /【道具与器械】/);

  const props = buildEcommerceSafetyContext({ productName: 'Cosplay 剑道具' });
  assert.match(props, /【道具与器械】/);
  assert.equal(props.includes(ECOMMERCE_PROP_SAFETY_PROMPT), true);
  assert.doesNotMatch(props, /【服装与模特】/);
});

test('ecommerce image prompts receive the shared context before the concrete task', () => {
  const result = addEcommerceSafetyContext(
    '生成一张成年女模特泳装商品展示图。',
    DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT,
    { productName: '成年女模特泳装' }
  );
  assert.ok(result.startsWith(DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT));
  assert.ok(result.indexOf(DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT) < result.indexOf(ECOMMERCE_CONTEXT_SAFETY_PROMPT));
  assert.ok(result.indexOf(ECOMMERCE_CONTEXT_SAFETY_PROMPT) < result.indexOf('【具体任务】'));
  assert.match(result, /【服装与模特】/);
  assert.match(result, /【具体任务】\n生成一张成年女模特泳装商品展示图。$/);
});

test('custom ecommerce product-truth constraints replace the editable system section only', () => {
  const result = addEcommerceSafetyContext('生成商品主图。', '自定义商品真实性约束。');
  assert.ok(result.startsWith('自定义商品真实性约束。'));
  assert.match(result, /【系统级电商语境与安全判断约束】/);
  assert.match(result, /【具体任务】\n生成商品主图。$/);
  assert.doesNotMatch(result, /你是电商商品图生成系统/);
});

test('prompt sanitization does not repeat the long ecommerce generation context', () => {
  assert.match(SANITIZE_SYSTEM_PROMPT, /safety-first prompt editor/);
  assert.doesNotMatch(SANITIZE_SYSTEM_PROMPT, /【系统级电商语境与安全判断约束】/);
  assert.doesNotMatch(SANITIZE_SYSTEM_PROMPT, /以上下文场景为准，而非关键词联想/);
});
