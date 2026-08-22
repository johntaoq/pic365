export const CHAT_CREDITS_PER_YUAN = 100;
export const CHAT_PRICE_SCALE = 1_000_000;

export const DEFAULT_CHAT_PRICING_RMB_PER_MILLION = Object.freeze({
  input: 7,
  output: 42,
  cacheRead: 0.7,
  cacheWrite: 8.75
});

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function priceRmbToMicros(value) {
  return Math.round(finiteNonNegative(value) * CHAT_PRICE_SCALE);
}

export function priceMicrosToRmb(value) {
  return finiteNonNegative(value) / CHAT_PRICE_SCALE;
}

export function normalizeChatPricing(value = {}) {
  return {
    input: finiteNonNegative(value.input, DEFAULT_CHAT_PRICING_RMB_PER_MILLION.input),
    output: finiteNonNegative(value.output, DEFAULT_CHAT_PRICING_RMB_PER_MILLION.output),
    cacheRead: finiteNonNegative(value.cacheRead, DEFAULT_CHAT_PRICING_RMB_PER_MILLION.cacheRead),
    cacheWrite: finiteNonNegative(value.cacheWrite, DEFAULT_CHAT_PRICING_RMB_PER_MILLION.cacheWrite)
  };
}

function integerTokenCount(value) {
  return Math.max(0, Math.round(finiteNonNegative(value)));
}

function firstTokenCount(...values) {
  for (const value of values) {
    if (Number.isFinite(Number(value))) return integerTokenCount(value);
  }
  return 0;
}

export function normalizeChatUsage(rawUsage = {}) {
  const promptDetails = rawUsage.prompt_tokens_details || rawUsage.input_tokens_details || {};
  const inputTokens = firstTokenCount(rawUsage.inputTokens, rawUsage.prompt_tokens, rawUsage.input_tokens);
  const outputTokens = firstTokenCount(rawUsage.outputTokens, rawUsage.completion_tokens, rawUsage.output_tokens);
  const cacheReadTokens = firstTokenCount(
    promptDetails.cached_tokens,
    promptDetails.cache_read_tokens,
    rawUsage.cache_read_input_tokens,
    rawUsage.cached_tokens,
    rawUsage.cacheReadTokens
  );
  const cacheWriteTokens = firstTokenCount(
    promptDetails.cache_creation_tokens,
    promptDetails.cache_write_tokens,
    rawUsage.cache_creation_input_tokens,
    rawUsage.cache_write_input_tokens,
    rawUsage.cacheWriteTokens
  );
  const detailsIncludeCache = Boolean(rawUsage.prompt_tokens_details || rawUsage.input_tokens_details);
  const billableInputTokens = detailsIncludeCache
    ? Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens)
    : inputTokens;

  return {
    inputTokens: billableInputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: firstTokenCount(
      rawUsage.total_tokens,
      rawUsage.totalTokens,
      billableInputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
    )
  };
}

export function calculateChatChargeCenti({ usage, pricing }) {
  const normalizedUsage = normalizeChatUsage(usage);
  const normalizedPricing = normalizeChatPricing(pricing);
  const weightedMicroYuan = (
    normalizedUsage.inputTokens * priceRmbToMicros(normalizedPricing.input)
    + normalizedUsage.outputTokens * priceRmbToMicros(normalizedPricing.output)
    + normalizedUsage.cacheReadTokens * priceRmbToMicros(normalizedPricing.cacheRead)
    + normalizedUsage.cacheWriteTokens * priceRmbToMicros(normalizedPricing.cacheWrite)
  );
  const centiCredits = Math.round(weightedMicroYuan / 100_000_000);
  const hasUsage = normalizedUsage.inputTokens + normalizedUsage.outputTokens
    + normalizedUsage.cacheReadTokens + normalizedUsage.cacheWriteTokens > 0;
  return hasUsage ? Math.max(1, centiCredits) : 0;
}

function expressionRate(expression, variable) {
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\b${escaped}\\s*\\*\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i'),
    new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s*\\*\\s*\\b${escaped}\\b`, 'i')
  ];
  for (const pattern of patterns) {
    const match = String(expression || '').match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

export function parseTieredPricingExpression(expression) {
  const source = String(expression || '');
  const shortTier = source.includes('?') ? source.slice(source.indexOf('?') + 1, source.indexOf(':')) : source;
  const rates = {
    input: expressionRate(shortTier, 'p'),
    output: expressionRate(shortTier, 'c'),
    cacheRead: expressionRate(shortTier, 'cr'),
    cacheWrite: expressionRate(shortTier, 'cc')
  };
  return Object.values(rates).every((value) => Number.isFinite(value) && value >= 0) ? rates : null;
}

export function pricingCreditsPerMillion(pricing) {
  const value = normalizeChatPricing(pricing);
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => [key, Math.round(amount * CHAT_CREDITS_PER_YUAN * 100) / 100]));
}
