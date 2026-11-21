import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateTextTokens } from '../api/_lib/text-token-estimate.js';
import { getImageGenerationPricing } from '../shared/image-pricing.js';
import { estimateMagicPrice } from '../shared/upstream-pricing.js';

test('text estimate uses ceil((English words + Chinese characters) × 0.75), never bytes or a tokenizer', () => {
  assert.equal(estimateTextTokens(''), 0);
  assert.equal(estimateTextTokens('  '), 0);
  assert.equal(estimateTextTokens('bottle'), 1);
  assert.equal(estimateTextTokens('包'.repeat(300)), 225);
  assert.equal(estimateTextTokens('黑色双肩包，保留品牌标志和缝线细节。'), 12);
  assert.equal(estimateTextTokens('bottle '.repeat(1000)), 750);
  assert.equal(estimateTextTokens('hello world 图片'), 3);
  assert.equal(estimateTextTokens("don't stop 继续"), 3);
  assert.equal(estimateTextTokens('123456'), 1);
  assert.equal(estimateTextTokens('literal <|endoftext|> input'), 3);
});

test('image quotes use the server heuristic without a fixed text-token padding', () => {
  const prompt = '黑色双肩包，保留品牌标志和缝线细节。';
  const config = {
    strategy: 'fixed-image', fixedPriceRmb: 0.4, chargeTextTokens: true,
    upstreamCost: { model: 'gpt-image-2', imageTextInputRmb: 35 }
  };
  assert.throws(() => getImageGenerationPricing({ model: 'gpt-image-2', prompt }, config), /TEXT_TOKEN_ESTIMATE_REQUIRED/);
  const quote = getImageGenerationPricing({
    model: 'gpt-image-2', prompt, estimatedTextTokens: estimateTextTokens(prompt)
  }, config);
  assert.equal(quote.imageTextTokens, 12);
  assert.equal(quote.imageTextCredits, 0);
});

test('magic input estimate uses the same heuristic, with capacity allowance kept separate', () => {
  const provider = { id: 'test', model: 'gpt-6-luna', maxOutputTokens: 2048,
    pricing: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 } };
  const text = 'bottle '.repeat(1000);
  assert.throws(() => estimateMagicPrice(provider, { text }), /TEXT_TOKEN_ESTIMATE_REQUIRED/);
  const quote = estimateMagicPrice(provider, { text, estimatedTextTokens: estimateTextTokens(text) });
  assert.equal(quote.inputTokens, 750);
  assert.ok(quote.capacityCenti >= quote.estimatedCredits * 100);
});
