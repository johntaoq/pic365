export const VIDEO_CREDITS_PER_RMB = 100;
export const VIDEO_PRICING_MODES = Object.freeze({
  PER_SECOND: 'per-second',
  PER_GENERATION: 'per-generation'
});
export const VIDEO_OUTPUT_MODES = Object.freeze(['std', 'pro', '4k']);

function finite(value, fallback, min = 0, max = 1_000_000) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}
function money(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits));
}

export function defaultVideoPricingConfig() {
  return {
    version: 1,
    mode: VIDEO_PRICING_MODES.PER_SECOND,
    currency: 'CNY',
    creditsPerRmb: VIDEO_CREDITS_PER_RMB,
    upstreamCurrency: 'USD',
    upstreamPricePerSecond: 0.1,
    exchangeRate: 7,
    pricePerSecondRmb: 0.7,
    modeRatesRmb: {},
    pricePerGenerationRmb: 2.8,
    minimumChargeRmb: 0,
    pricingSource: 'manual',
    pricingVersion: '',
    priceSyncedAt: ''
  };
}

export function normalizeVideoPricingConfig(value = {}) {
  const fallback = defaultVideoPricingConfig();
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const mode = Object.values(VIDEO_PRICING_MODES).includes(source.mode) ? source.mode : fallback.mode;
  const exchangeRate = finite(source.exchangeRate, fallback.exchangeRate, 0.000001, 10000);
  const upstreamPricePerSecond = finite(source.upstreamPricePerSecond, fallback.upstreamPricePerSecond);
  const derivedPerSecondRmb = upstreamPricePerSecond * exchangeRate;
  const rawModeRates = source.modeRatesRmb && typeof source.modeRatesRmb === 'object' ? source.modeRatesRmb : {};
  const modeRatesRmb = Object.fromEntries(VIDEO_OUTPUT_MODES
    .filter((outputMode) => rawModeRates[outputMode] != null && rawModeRates[outputMode] !== '')
    .map((outputMode) => [outputMode, money(finite(rawModeRates[outputMode], 0))]));
  return {
    version: Math.max(1, Math.round(finite(source.version, fallback.version, 1, 1000))),
    mode,
    currency: 'CNY',
    creditsPerRmb: VIDEO_CREDITS_PER_RMB,
    upstreamCurrency: String(source.upstreamCurrency || fallback.upstreamCurrency).trim().toUpperCase().slice(0, 8),
    upstreamPricePerSecond: money(upstreamPricePerSecond),
    exchangeRate: money(exchangeRate),
    pricePerSecondRmb: money(finite(source.pricePerSecondRmb, derivedPerSecondRmb)),
    modeRatesRmb,
    pricePerGenerationRmb: money(finite(source.pricePerGenerationRmb, fallback.pricePerGenerationRmb)),
    minimumChargeRmb: money(finite(source.minimumChargeRmb, fallback.minimumChargeRmb)),
    pricingSource: source.pricingSource === 'synced' ? 'synced' : 'manual',
    pricingVersion: String(source.pricingVersion || '').trim().slice(0, 160),
    priceSyncedAt: String(source.priceSyncedAt || '').trim().slice(0, 80)
  };
}

export function getVideoGenerationPricing({ seconds = 4, mode = 'std' } = {}, pricingConfig = {}) {
  const config = normalizeVideoPricingConfig(pricingConfig);
  const billedSeconds = Math.max(1, Math.min(60, Math.round(Number(seconds) || 4)));
  const outputMode = VIDEO_OUTPUT_MODES.includes(String(mode || '').toLowerCase()) ? String(mode).toLowerCase() : 'std';
  const modeRate = Number(config.modeRatesRmb?.[outputMode]);
  const pricePerSecondRmb = Number.isFinite(modeRate) && modeRate > 0 ? modeRate : config.pricePerSecondRmb;
  const rawRmb = config.mode === VIDEO_PRICING_MODES.PER_GENERATION
    ? config.pricePerGenerationRmb
    : pricePerSecondRmb * billedSeconds;
  const retailRmb = Math.max(config.minimumChargeRmb, rawRmb);
  const creditsCenti = Math.max(1, Math.round(retailRmb * VIDEO_CREDITS_PER_RMB * 100));
  const credits = creditsCenti / 100;
  return {
    seconds: billedSeconds,
    outputMode,
    mode: config.mode,
    credits,
    creditsCenti,
    retailRmb: money(credits / VIDEO_CREDITS_PER_RMB, 4),
    pricePerSecondRmb,
    pricePerGenerationRmb: config.pricePerGenerationRmb,
    minimumChargeRmb: config.minimumChargeRmb,
    upstreamPricePerSecond: config.upstreamPricePerSecond,
    upstreamCurrency: config.upstreamCurrency,
    exchangeRate: config.exchangeRate,
    pricingSource: config.pricingSource,
    pricingVersion: config.pricingVersion,
    priceSyncedAt: config.priceSyncedAt
  };
}
