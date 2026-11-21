import { calculateChatChargeCenti, normalizeChatPricing } from './chat-billing.js';

function amount(value) {
  const number = Number(value);
  if (value == null || value === '' || !Number.isFinite(number) || number < 0) {
    throw Object.assign(new Error('INVALID_MODEL_PRICE'), { code: 'INVALID_MODEL_PRICE' });
  }
  return number;
}

export function validateTextPrices(pricing) {
  const result = Object.fromEntries(['input', 'output', 'cacheRead', 'cacheWrite'].map((key) => [key, amount(pricing?.[key])]));
  if (pricing?.tiers?.length) {
    result.tiers = pricing.tiers.map((tier) => ({
      aboveTokens: amount(tier.aboveTokens),
      ...Object.fromEntries(['input', 'output', 'cacheRead', 'cacheWrite'].map((key) => [key, amount(tier[key])]))
    }));
  }
  return result;
}

function parseRateSum(source) {
  const match = source.trim().match(/^tier\("[^"]*",\s*([\s\S]+)\)$/);
  const rates = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const names = { p: 'input', c: 'output', cr: 'cacheRead', cc: 'cacheWrite' };
  const seen = new Set();
  for (const term of (match?.[1] || source).split('+')) {
    const part = term.trim().match(/^(p|c|cr|cc)\s*\*\s*(\d+(?:\.\d+)?)$/);
    if (!part || seen.has(part[1])) throw Object.assign(new Error('UNSUPPORTED_PRICE_FORMAT'), { code: 'UNSUPPORTED_PRICE_FORMAT' });
    seen.add(part[1]);
    rates[names[part[1]]] = amount(part[2]);
  }
  if (!seen.has('p') || !seen.has('c')) throw Object.assign(new Error('UNSUPPORTED_PRICE_FORMAT'), { code: 'UNSUPPORTED_PRICE_FORMAT' });
  return rates;
}

export function parseUpstreamModelPrice(row, exchangeRate) {
  const rate = amount(exchangeRate);
  if (!rate) throw Object.assign(new Error('INVALID_EXCHANGE_RATE'), { code: 'INVALID_EXCHANGE_RATE' });
  if (row.billing_mode === 'tiered_expr' || row.billing_expr) {
    const expression = String(row.billing_expr || '').trim();
    const conditional = expression.match(/^len\s*<=\s*(\d+)\s*\?\s*(.+?)\s*:\s*(.+)$/);
    const convert = (prices) => Object.fromEntries(Object.entries(prices).map(([key, price]) => [key, price * rate]));
    const pricing = convert(parseRateSum(conditional ? conditional[2] : expression));
    if (conditional) pricing.tiers = [{ aboveTokens: Number(conditional[1]), ...convert(parseRateSum(conditional[3])) }];
    return { unit: 'tokens', pricing };
  }
  if (Number(row.quota_type) === 1) {
    return { unit: 'image', fixedPriceRmb: amount(row.model_price) * rate };
  }
  if (row.quota_type == null || Number(row.quota_type) !== 0 || row.model_ratio == null || row.completion_ratio == null) {
    throw Object.assign(new Error('UNSUPPORTED_PRICE_FORMAT'), { code: 'UNSUPPORTED_PRICE_FORMAT' });
  }
  // New API's baseline ratio is USD 2 per million input tokens.
  const input = amount(row.model_ratio) * 2 * rate;
  return {
    unit: 'tokens',
    pricing: {
      input,
      output: input * amount(row.completion_ratio),
      cacheRead: input * amount(row.cache_ratio ?? 1),
      cacheWrite: input * amount(row.create_cache_ratio ?? 1)
    },
    imageInput: input * amount(row.image_ratio ?? 1)
  };
}

export function estimateMagicPrice(provider, { text = '', estimatedTextTokens, imageCount = 0, outputTokens, fixedPrice = false } = {}) {
  if (provider.billingSource) return {
    estimatedCredits: 0, minimumCredits: 0, capacityCenti: 0,
    externalWallet: true, billingSource: provider.billingSource, model: provider.model, providerId: provider.id
  };
  if (text && !(Number.isSafeInteger(estimatedTextTokens) && estimatedTextTokens > 0)) {
    throw Object.assign(new Error('TEXT_TOKEN_ESTIMATE_REQUIRED'), { code: 'TEXT_TOKEN_ESTIMATE_REQUIRED' });
  }
  const inputTokens = Math.max(1, estimatedTextTokens || 0);
  const images = Math.max(0, Math.min(9, Number(imageCount) || 0));
  const expectedOutput = Math.min(provider.maxOutputTokens, Math.max(128, Number(outputTokens) || Math.ceil((estimatedTextTokens || 0) * 0.75) + 256));
  if (fixedPrice) return {
    estimatedCredits: 1, minimumCredits: 1, capacityCenti: 100, fixedPrice: true,
    inputTokens, outputTokens: expectedOutput, model: provider.model, providerId: provider.id
  };
  const pricing = provider.pricing || normalizeChatPricing();
  const estimatedCenti = Math.max(100, calculateChatChargeCenti({
    usage: { inputTokens: inputTokens + images * 1500, outputTokens: expectedOutput },
    pricing
  }));
  const capacityCenti = Math.max(estimatedCenti, calculateChatChargeCenti({
    usage: { inputTokens: inputTokens + 600 + images * 50_000, outputTokens: provider.maxOutputTokens },
    pricing
  }));
  return { estimatedCredits: estimatedCenti / 100, minimumCredits: 1, capacityCenti, inputTokens, outputTokens: expectedOutput, model: provider.model, providerId: provider.id };
}
