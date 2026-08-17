import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEcommerceBriefRequestText,
  ECOMMERCE_BRIEF_SYSTEM_PROMPT
} from '../shared/ecommerce-brief-prompt.js';

test('brief magic treats product name and category as primary context', () => {
  const request = buildEcommerceBriefRequestText({
    language: 'zh',
    focus: 'brief',
    productName: 'Air-C 100',
    productCategory: '运动与户外',
    categoryExamples: '运动鞋 户外装备',
    brandName: 'Example Brand',
    currentBrief: { coreUser: '', coreScenario: '', sellingPoints: '' }
  });

  const payload = JSON.parse(request.slice(request.indexOf('{')));
  assert.deepEqual(payload.primaryProductContext, {
    productName: 'Air-C 100',
    productCategory: '运动与户外',
    categoryScopeExamples: '运动鞋 户外装备'
  });
  assert.equal(payload.supplementalContext.brandOrSeries, 'Example Brand');
  assert.match(ECOMMERCE_BRIEF_SYSTEM_PROMPT, /primary context/);
  assert.match(ECOMMERCE_BRIEF_SYSTEM_PROMPT, /generate only coreUser, coreScenario, and sellingPoints/);
  assert.match(ECOMMERCE_BRIEF_SYSTEM_PROMPT, /Do not invent gender, age/);
  assert.match(ECOMMERCE_BRIEF_SYSTEM_PROMPT, /do not repeat the product name/i);
});

test('identity magic keeps its separate task focus', () => {
  const request = buildEcommerceBriefRequestText({
    language: 'en',
    focus: 'identitySpec',
    productName: 'Desk stand',
    productCategory: 'Consumer electronics'
  });
  const payload = JSON.parse(request.slice(request.indexOf('{')));
  assert.equal(payload.taskFocus, 'identitySpec');
});
