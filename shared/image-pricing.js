import {
  IMAGE_MAX_PIXELS,
  IMAGE_MIN_PIXELS,
  parseImageSize,
  validateImageSize
} from './image-generation.js';

export const IMAGE_CREDITS_PER_RMB = 100;
export const IMAGE_MIN_CHARGE_CREDITS = 20;
export const IMAGE_MAX_CHARGE_CREDITS = 500;
export const IMAGE_CREDIT_ROUNDING_STEP = 10;
export const IMAGE_PROMOTION_ROUNDING_STEP = 1;
export const IMAGE_PROMOTION_MIN_PAY_PERCENT = 10;
export const IMAGE_PROMOTION_MAX_PAY_PERCENT = 100;
export const IMAGE_PRICING_PIXEL_STEP = 256;

export const IMAGE_PRICING_STRATEGIES = Object.freeze({
  PIXEL_QUALITY_FORMULA: 'pixel-quality-formula',
  FIXED_QUALITY: 'fixed-quality',
  FIXED_IMAGE: 'fixed-image',
  PIXEL_QUALITY_MATRIX: 'pixel-quality-matrix'
});

// The supplied costs are actual RMB costs after the 0.3 discount.
export const IMAGE_OBSERVED_COST_RMB = {
  discountedMin: 0.010930,
  discountedMax: 1.494455,
  listMin: 0.010930 / 0.3,
  listMax: 1.494455 / 0.3
};

// Nine observations fit this discounted-cost model within about 1%.
export const IMAGE_COST_MODEL = {
  baseCostRmb: 0.008135501311342538,
  costPerMegapixelRmb: 0.004031318991091597,
  qualityFactors: {
    low: 1,
    medium: 9,
    high: 36,
    auto: 9
  }
};

// GPT-Image-2 is billed from the undiscounted cost curve. The customer price is
// calculated continuously from exact pixel area and rounded upward by RMB 0.1.
export const GPT_IMAGE_2_PRICING_CONFIG = Object.freeze({
  version: 2,
  strategy: IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_FORMULA,
  currency: 'CNY',
  priceStepRmb: 0.1,
  minimumChargeRmb: 0.2,
  maximumChargeRmb: 5,
  promotionEligible: true,
  autoSizePixels: 2048 * 2048,
  autoQuality: 'medium',
  formula: {
    baseCostRmb: IMAGE_COST_MODEL.baseCostRmb / 0.3,
    costPerMegapixelRmb: IMAGE_COST_MODEL.costPerMegapixelRmb / 0.3,
    qualityFactors: { low: 1, medium: 9, high: 36 },
    priceMultiplier: 1,
    fixedFeeRmb: 0,
    actualCostRatio: 0.3
  }
});

export const IMAGE_PRICING_BANDS = [
  { id: 'small', maxPixels: 816 * 816 },
  { id: 'standard', maxPixels: 1024 * 1536 },
  { id: 'large', maxPixels: 1024 * 3072 },
  { id: 'xlarge', maxPixels: 2048 * 2048 },
  { id: 'ultra', maxPixels: 2880 * 2880 }
];

// Auto size is billed at the 2048x2048 basis. Auto quality is billed as medium.
export const IMAGE_AUTO_SIZE_PRICING_PIXELS = 2048 * 2048;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

function roundMoney(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits));
}

function roundUpToStep(value, step) {
  const safeStep = finiteNumber(step, 0.1, 0.01, 1000);
  return Math.ceil((Number(value || 0) - 1e-9) / safeStep) * safeStep;
}

export function alignImagePricingPixelsUp(value, fallback = IMAGE_MIN_PIXELS) {
  const pixels = finiteNumber(value, fallback, IMAGE_MIN_PIXELS, IMAGE_MAX_PIXELS);
  return clamp(
    Math.ceil((pixels - 1e-9) / IMAGE_PRICING_PIXEL_STEP) * IMAGE_PRICING_PIXEL_STEP,
    IMAGE_MIN_PIXELS,
    IMAGE_MAX_PIXELS
  );
}

function qualityPrices(value = {}, fallback = {}) {
  return {
    low: roundMoney(finiteNumber(value.low, fallback.low ?? 0, 0, 100000), 2),
    medium: roundMoney(finiteNumber(value.medium, fallback.medium ?? value.low ?? 0, 0, 100000), 2),
    high: roundMoney(finiteNumber(value.high, fallback.high ?? value.medium ?? value.low ?? 0, 0, 100000), 2)
  };
}

export function defaultImagePricingConfigForModel(model = '') {
  if (/gpt[-_ ]?image[-_ ]?2/i.test(String(model))) return structuredClone(GPT_IMAGE_2_PRICING_CONFIG);
  return {
    version: 1,
    strategy: IMAGE_PRICING_STRATEGIES.FIXED_QUALITY,
    currency: 'CNY',
    priceStepRmb: 0.1,
    minimumChargeRmb: 0.2,
    maximumChargeRmb: 100,
    promotionEligible: true,
    autoSizePixels: 2048 * 2048,
    autoQuality: 'medium',
    qualityPricesRmb: { low: 0.2, medium: 0.2, high: 0.2 },
    actualCostRatio: 1
  };
}

export function normalizeImagePricingConfig(value = {}, { model = '', strategy = '' } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const fallback = defaultImagePricingConfigForModel(model);
  const allowedStrategies = Object.values(IMAGE_PRICING_STRATEGIES);
  const resolvedStrategy = allowedStrategies.includes(strategy || source.strategy)
    ? (strategy || source.strategy)
    : fallback.strategy;
  const common = {
    version: Math.max(1, Math.round(finiteNumber(source.version, fallback.version || 1, 1, 1000))),
    strategy: resolvedStrategy,
    currency: 'CNY',
    priceStepRmb: roundMoney(finiteNumber(source.priceStepRmb, fallback.priceStepRmb, 0.01, 1000), 2),
    minimumChargeRmb: roundMoney(finiteNumber(source.minimumChargeRmb, fallback.minimumChargeRmb, 0, 100000), 2),
    maximumChargeRmb: roundMoney(finiteNumber(source.maximumChargeRmb, fallback.maximumChargeRmb, 0.01, 100000), 2),
    promotionEligible: source.promotionEligible == null ? fallback.promotionEligible !== false : source.promotionEligible !== false,
    autoSizePixels: alignImagePricingPixelsUp(source.autoSizePixels, fallback.autoSizePixels),
    autoQuality: 'medium'
  };
  if (common.maximumChargeRmb < common.minimumChargeRmb) common.maximumChargeRmb = common.minimumChargeRmb;

  if (resolvedStrategy === IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_FORMULA) {
    const formulaSource = source.formula && typeof source.formula === 'object' ? source.formula : {};
    const formulaFallback = fallback.formula || GPT_IMAGE_2_PRICING_CONFIG.formula;
    return {
      ...common,
      formula: {
        baseCostRmb: roundMoney(finiteNumber(formulaSource.baseCostRmb, formulaFallback.baseCostRmb, 0, 100000), 2),
        costPerMegapixelRmb: roundMoney(finiteNumber(formulaSource.costPerMegapixelRmb, formulaFallback.costPerMegapixelRmb, 0, 100000), 6),
        qualityFactors: qualityPrices(formulaSource.qualityFactors, formulaFallback.qualityFactors),
        priceMultiplier: finiteNumber(formulaSource.priceMultiplier, formulaFallback.priceMultiplier ?? 1, 0, 10000),
        fixedFeeRmb: roundMoney(finiteNumber(formulaSource.fixedFeeRmb, formulaFallback.fixedFeeRmb ?? 0, 0, 100000), 2),
        actualCostRatio: finiteNumber(formulaSource.actualCostRatio, formulaFallback.actualCostRatio ?? 1, 0, 1000)
      }
    };
  }

  if (resolvedStrategy === IMAGE_PRICING_STRATEGIES.FIXED_IMAGE) {
    return {
      ...common,
      fixedPriceRmb: roundMoney(finiteNumber(source.fixedPriceRmb, fallback.fixedPriceRmb ?? common.minimumChargeRmb, 0, 100000), 2),
      actualCostRatio: finiteNumber(source.actualCostRatio, fallback.actualCostRatio ?? 1, 0, 1000)
    };
  }

  if (resolvedStrategy === IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_MATRIX) {
    const fallbackBands = Array.isArray(fallback.bands) ? fallback.bands : [];
    const bands = (Array.isArray(source.bands) ? source.bands : fallbackBands)
      .map((band, index) => ({
        id: String(band?.id || `band-${index + 1}`).slice(0, 60),
        maxPixels: alignImagePricingPixelsUp(band?.maxPixels, IMAGE_MAX_PIXELS),
        pricesRmb: qualityPrices(band?.pricesRmb, { low: common.minimumChargeRmb, medium: common.minimumChargeRmb, high: common.minimumChargeRmb })
      }))
      .sort((left, right) => left.maxPixels - right.maxPixels);
    if (!bands.length || bands.at(-1).maxPixels < IMAGE_MAX_PIXELS) {
      bands.push({
        id: 'maximum',
        maxPixels: IMAGE_MAX_PIXELS,
        pricesRmb: bands.at(-1)?.pricesRmb || { low: common.minimumChargeRmb, medium: common.minimumChargeRmb, high: common.minimumChargeRmb }
      });
    }
    return {
      ...common,
      bands,
      actualCostRatio: finiteNumber(source.actualCostRatio, fallback.actualCostRatio ?? 1, 0, 1000)
    };
  }

  return {
    ...common,
    qualityPricesRmb: qualityPrices(source.qualityPricesRmb, fallback.qualityPricesRmb || { low: common.minimumChargeRmb, medium: common.minimumChargeRmb, high: common.minimumChargeRmb }),
    actualCostRatio: finiteNumber(source.actualCostRatio, fallback.actualCostRatio ?? 1, 0, 1000)
  };
}

function normalizePromotionDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function normalizeImagePromotionConfig(value = {}) {
  const payPercent = clamp(
    Math.round(Number(value.payPercent) || IMAGE_PROMOTION_MAX_PAY_PERCENT),
    IMAGE_PROMOTION_MIN_PAY_PERCENT,
    IMAGE_PROMOTION_MAX_PAY_PERCENT
  );
  return {
    enabled: Boolean(value.enabled),
    name: String(value.name || '').trim().slice(0, 80),
    payPercent,
    startsAt: normalizePromotionDate(value.startsAt),
    endsAt: normalizePromotionDate(value.endsAt),
    updatedAt: normalizePromotionDate(value.updatedAt)
  };
}

export function resolveImagePromotion(value = {}, { now = Date.now() } = {}) {
  const promotion = normalizeImagePromotionConfig(value);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const startsAtMs = promotion.startsAt ? Date.parse(promotion.startsAt) : null;
  const endsAtMs = promotion.endsAt ? Date.parse(promotion.endsAt) : null;
  const scheduled = startsAtMs != null && nowMs < startsAtMs;
  const expired = endsAtMs != null && nowMs >= endsAtMs;
  const active = promotion.enabled && promotion.payPercent < 100 && !scheduled && !expired;
  return {
    ...promotion,
    active,
    scheduled,
    expired,
    discountPercent: 100 - promotion.payPercent
  };
}

export function applyImagePromotion(pricing, promotion = {}, options = {}) {
  const minimumCredits = Math.max(0, Math.round(Number(pricing?.minimumCredits ?? IMAGE_MIN_CHARGE_CREDITS)));
  const originalCredits = Math.max(minimumCredits, Math.round(Number(pricing?.credits) || 0));
  const resolvedPromotion = resolveImagePromotion(promotion, options);
  const promotionEligible = pricing?.promotionEligible !== false;
  const discountedCredits = resolvedPromotion.active && promotionEligible
    ? Math.round((originalCredits * resolvedPromotion.payPercent) / 100)
    : originalCredits;
  const credits = clamp(discountedCredits, minimumCredits, originalCredits);
  const discountApplied = resolvedPromotion.active && credits < originalCredits;
  return {
    ...pricing,
    credits,
    retailRmb: credits / IMAGE_CREDITS_PER_RMB,
    originalCredits,
    originalRetailRmb: originalCredits / IMAGE_CREDITS_PER_RMB,
    discountApplied,
    promotion: {
      ...resolvedPromotion,
      active: discountApplied
    }
  };
}

export function resolveImagePricingQuality(value) {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}

export function estimateDiscountedImageCostRmb({ pixels, quality }) {
  const safePixels = clamp(Number(pixels) || IMAGE_PRICING_BANDS[0].maxPixels, 1, IMAGE_PRICING_BANDS.at(-1).maxPixels);
  const factor = IMAGE_COST_MODEL.qualityFactors[resolveImagePricingQuality(quality)];
  return factor * (
    IMAGE_COST_MODEL.baseCostRmb +
    IMAGE_COST_MODEL.costPerMegapixelRmb * (safePixels / 1_000_000)
  );
}

function pricingBaseRmb(config, pixels, quality) {
  if (config.strategy === IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_FORMULA) {
    const factor = config.formula.qualityFactors[quality];
    const listCostRmb = factor * (
      config.formula.baseCostRmb +
      config.formula.costPerMegapixelRmb * (pixels / 1_000_000)
    );
    return {
      listCostRmb,
      rawChargeRmb: listCostRmb * config.formula.priceMultiplier + config.formula.fixedFeeRmb,
      actualCostRmb: listCostRmb * config.formula.actualCostRatio,
      bandId: 'continuous'
    };
  }
  if (config.strategy === IMAGE_PRICING_STRATEGIES.FIXED_IMAGE) {
    return {
      listCostRmb: config.fixedPriceRmb,
      rawChargeRmb: config.fixedPriceRmb,
      actualCostRmb: config.fixedPriceRmb * config.actualCostRatio,
      bandId: 'fixed'
    };
  }
  if (config.strategy === IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_MATRIX) {
    const band = config.bands.find((item) => pixels <= item.maxPixels) || config.bands.at(-1);
    const price = band.pricesRmb[quality];
    return {
      listCostRmb: price,
      rawChargeRmb: price,
      actualCostRmb: price * config.actualCostRatio,
      bandId: band.id
    };
  }
  const price = config.qualityPricesRmb[quality];
  return {
    listCostRmb: price,
    rawChargeRmb: price,
    actualCostRmb: price * config.actualCostRatio,
    bandId: 'quality-fixed'
  };
}

export function getImageGenerationPricing({ size = '1024x1024', quality = 'low' } = {}, pricingConfig = GPT_IMAGE_2_PRICING_CONFIG) {
  const config = normalizeImagePricingConfig(pricingConfig, { strategy: pricingConfig?.strategy });
  const parsed = parseImageSize(size);
  const requestedPixels = parsed && !parsed.auto
    ? parsed.width * parsed.height
    : config.autoSizePixels;
  const billedPixels = clamp(requestedPixels, IMAGE_MIN_PIXELS, IMAGE_MAX_PIXELS);
  const billedQuality = quality === 'auto' ? 'medium' : resolveImagePricingQuality(quality);
  const base = pricingBaseRmb(config, billedPixels, billedQuality);
  const isFixedPrice = config.strategy === IMAGE_PRICING_STRATEGIES.FIXED_QUALITY
    || config.strategy === IMAGE_PRICING_STRATEGIES.FIXED_IMAGE;
  const roundedChargeRmb = isFixedPrice
    ? roundMoney(base.rawChargeRmb, 2)
    : clamp(
        roundUpToStep(base.rawChargeRmb, config.priceStepRmb),
        config.minimumChargeRmb,
        config.maximumChargeRmb
      );
  const credits = Math.round(roundedChargeRmb * IMAGE_CREDITS_PER_RMB);
  return {
    credits,
    retailRmb: roundMoney(credits / IMAGE_CREDITS_PER_RMB, 2),
    estimatedCostRmb: roundMoney(base.actualCostRmb),
    estimatedActualCostRmb: roundMoney(base.actualCostRmb),
    estimatedListCostRmb: roundMoney(base.listCostRmb),
    rawChargeRmb: roundMoney(base.rawChargeRmb),
    requestedPixels,
    billedPixels,
    bandId: base.bandId,
    requestedQuality: quality,
    billedQuality,
    autoSize: !parsed || parsed.auto,
    autoQuality: quality === 'auto',
    minimumCredits: isFixedPrice ? 0 : Math.round(config.minimumChargeRmb * IMAGE_CREDITS_PER_RMB),
    maximumCredits: isFixedPrice ? credits : Math.round(config.maximumChargeRmb * IMAGE_CREDITS_PER_RMB),
    priceStepCredits: isFixedPrice ? 1 : Math.round(config.priceStepRmb * IMAGE_CREDITS_PER_RMB),
    promotionEligible: config.promotionEligible,
    pricingStrategy: config.strategy,
    pricingVersion: config.version
  };
}

export function resolveEcommerceSlotGenerationSize(slot) {
  if (['1024x1024', '1024x1536', '1536x1024'].includes(slot?.recommendedSize)) return slot.recommendedSize;
  if (slot?.aspectRatio === '1:1') return '1024x1024';
  if (slot?.aspectRatio === '16:9' || slot?.aspectRatio === '4:3') return '1536x1024';
  return '1024x1536';
}

export function resolveEcommerceRefinementSize(generation, slot) {
  const sourceSize = String(generation?.size || '').trim().toLowerCase();
  return validateImageSize(sourceSize).valid ? sourceSize : resolveEcommerceSlotGenerationSize(slot);
}
