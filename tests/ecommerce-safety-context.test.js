import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addEcommerceSafetyContext,
  ECOMMERCE_CONTEXT_SAFETY_PROMPT
} from '../shared/ecommerce-safety-context.js';
import { DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT } from '../shared/ecommerce-generation-system-prompt.js';
import { SANITIZE_SYSTEM_PROMPT } from '../api/sanitize-prompt.js';

test('ecommerce safety context uses intent and context instead of isolated keywords', () => {
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /以上下文场景为准，而非关键词联想/);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /泳衣.*内衣.*贴身衣物.*塑身衣/s);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /女模特.*身材火辣.*胸部丰满/s);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /体育器材.*Cosplay 道具.*户外装备/s);
});

test('ecommerce safety context retains explicit safety exceptions', () => {
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /不是审核绕过/);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /未成年人/);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /真实伤害/);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /仇恨、歧视/);
  assert.match(ECOMMERCE_CONTEXT_SAFETY_PROMPT, /暗语、编码、错别字/);
});

test('ecommerce image prompts receive the shared context before the concrete task', () => {
  const result = addEcommerceSafetyContext('生成一张成年女模特泳装商品展示图。');
  assert.ok(result.startsWith(DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT));
  assert.ok(result.indexOf(DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT) < result.indexOf(ECOMMERCE_CONTEXT_SAFETY_PROMPT));
  assert.ok(result.indexOf(ECOMMERCE_CONTEXT_SAFETY_PROMPT) < result.indexOf('【具体任务】'));
  assert.match(result, /【具体任务】\n生成一张成年女模特泳装商品展示图。$/);
});

test('custom ecommerce product-truth constraints replace the editable system section only', () => {
  const result = addEcommerceSafetyContext('生成商品主图。', '自定义商品真实性约束。');
  assert.ok(result.startsWith('自定义商品真实性约束。'));
  assert.match(result, /【系统级电商语境与安全判断约束】/);
  assert.match(result, /【具体任务】\n生成商品主图。$/);
  assert.doesNotMatch(result, /你是一个严格遵循商品真实资料的生图约束系统/);
});

test('prompt sanitization does not repeat the long ecommerce generation context', () => {
  assert.match(SANITIZE_SYSTEM_PROMPT, /safety-first prompt editor/);
  assert.doesNotMatch(SANITIZE_SYSTEM_PROMPT, /【系统级电商语境与安全判断约束】/);
  assert.doesNotMatch(SANITIZE_SYSTEM_PROMPT, /以上下文场景为准，而非关键词联想/);
});
