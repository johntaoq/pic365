import {
  IMAGE_MAX_PIXELS,
  IMAGE_MIN_PIXELS,
  getImageModelConstraints,
  isGeminiImageModel,
  isMaiImage27Model,
  parseImageSize,
  resolveSourceImageSizeForModel,
  validateImageSize,
  validateImageSizeForModel
} from './image-generation.js';
import { imageInputFees } from './image-input-billing.js';

export const IMAGE_CREDITS_PER_RMB = 100;
export const IMAGE_MIN_CHARGE_CREDITS = 20;
export const IMAGE_MAX_CHARGE_CREDITS = 500;
export const IMAGE_CREDIT_ROUNDING_STEP = 10;
export const IMAGE_PROMOTION_ROUNDING_STEP = 1;
export const IMAGE_PROMOTION_MIN_PAY_PERCENT = 10;
export const IMAGE_PROMOTION_MAX_PAY_PERCENT = 100;
export const IMAGE_PRICING_PIXEL_STEP = 256;

export const GEMINI_IMAGE_PRICING_TIERS = Object.freeze({
  low: Object.freeze({ resolution: '1K', pixels: 1024 * 1024 }),
  medium: Object.freeze({ resolution: '2K', pixels: 2048 * 2048 }),
  high: Object.freeze({ resolution: '4K', pixels: 4096 * 4096 })
});
export const GEMINI_IMAGE_MAX_PRICING_PIXELS = GEMINI_IMAGE_PRICING_TIERS.high.pixels;

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
  referenceImagePriceRmb: 0,
  promotionEligible: true,
  autoSizePixels: 2048 * 2048,
  maximumPixels: IMAGE_MAX_PIXELS,
  modelFamily: 'gpt-image-2',
  autoQuality: 'medium',
  formula: {
    // Preserve the historically effective default; administrators can now enter
    // their own three-decimal base cost without changing existing tariffs.
    baseCostRmb: Number((IMAGE_COST_MODEL.baseCostRmb / 0.3).toFixed(2)),
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
  const safeStep = finiteNumber(step, 0.1, 0.001, 1000);
  return Math.ceil((Number(value || 0) - 1e-9) / safeStep) * safeStep;
}

export function alignImagePricingPixelsUp(value, fallback = IMAGE_MIN_PIXELS, maximumPixels = IMAGE_MAX_PIXELS) {
  const safeMaximum = Math.max(IMAGE_MIN_PIXELS, Number(maximumPixels) || IMAGE_MAX_PIXELS);
  const pixels = finiteNumber(value, fallback, IMAGE_MIN_PIXELS, safeMaximum);
  return clamp(
    Math.ceil((pixels - 1e-9) / IMAGE_PRICING_PIXEL_STEP) * IMAGE_PRICING_PIXEL_STEP,
    IMAGE_MIN_PIXELS,
    safeMaximum
  );
}

function qualityPrices(value = {}, fallback = {}) {
  return {
    low: roundMoney(finiteNumber(value.low, fallback.low ?? 0, 0, 100000), 3),
    medium: roundMoney(finiteNumber(value.medium, fallback.medium ?? value.low ?? 0, 0, 100000), 3),
    high: roundMoney(finiteNumber(value.high, fallback.high ?? value.medium ?? value.low ?? 0, 0, 100000), 3)
  };
}

export function defaultImagePricingConfigForModel(model = '') {
  if (/gpt[-_ ]?image[-_ ]?2/i.test(String(model))) return structuredClone(GPT_IMAGE_2_PRICING_CONFIG);
  const geminiImage = isGeminiImageModel(model);
  const maximumPixels = geminiImage
    ? GEMINI_IMAGE_MAX_PRICING_PIXELS
    : getImageModelConstraints(model).maxPixels;
  return {
    version: 1,
    strategy: IMAGE_PRICING_STRATEGIES.FIXED_QUALITY,
    currency: 'CNY',
    priceStepRmb: 0.1,
    minimumChargeRmb: 0.2,
    maximumChargeRmb: 100,
    referenceImagePriceRmb: 0,
    promotionEligible: true,
    autoSizePixels: geminiImage ? GEMINI_IMAGE_PRICING_TIERS.medium.pixels : Math.min(2048 * 2048, maximumPixels),
    maximumPixels,
    modelFamily: geminiImage ? 'gemini-image' : getImageModelConstraints(model).modelFamily,
    autoQuality: 'medium',
    qualityPricesRmb: { low: 0.2, medium: 0.2, high: 0.2 },
    actualCostRatio: 1
  };
}

export function imageTokenBillingFlagsMatch(requested = {}, saved = {}) {
  return ['chargeTextTokens', 'chargeReferenceTokens'].every((key) =>
    !Object.hasOwn(requested, key)
    || (typeof saved?.[key] === 'boolean' && saved[key] === (requested[key] === true))
  );
}

export function normalizeImagePricingConfig(value = {}, { model = '', strategy = '' } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const fallback = defaultImagePricingConfigForModel(model);
  const allowedStrategies = Object.values(IMAGE_PRICING_STRATEGIES);
  const resolvedStrategy = allowedStrategies.includes(strategy || source.strategy)
    ? (strategy || source.strategy)
    : fallback.strategy;
  const maximumPixels = model
    ? fallback.maximumPixels
    : alignImagePricingPixelsUp(source.maximumPixels, fallback.maximumPixels, GEMINI_IMAGE_MAX_PRICING_PIXELS);
  const modelFamily = model
    ? fallback.modelFamily
    : String(source.modelFamily || fallback.modelFamily || 'default');
  const common = {
    version: Math.max(1, Math.round(finiteNumber(source.version, fallback.version || 1, 1, 1000))),
    strategy: resolvedStrategy,
    currency: 'CNY',
    priceStepRmb: roundMoney(finiteNumber(source.priceStepRmb, fallback.priceStepRmb, 0.001, 1000), 3),
    minimumChargeRmb: roundMoney(finiteNumber(source.minimumChargeRmb, fallback.minimumChargeRmb, 0, 100000), 3),
    maximumChargeRmb: roundMoney(finiteNumber(source.maximumChargeRmb, fallback.maximumChargeRmb, 0.001, 100000), 3),
    referenceImagePriceRmb: roundMoney(finiteNumber(source.referenceImagePriceRmb, fallback.referenceImagePriceRmb ?? 0, 0, 100000), 3),
    chargeTextTokens: source.chargeTextTokens === true,
    chargeReferenceTokens: source.chargeReferenceTokens === true,
    promotionEligible: source.promotionEligible == null ? fallback.promotionEligible !== false : source.promotionEligible !== false,
    autoSizePixels: alignImagePricingPixelsUp(source.autoSizePixels, fallback.autoSizePixels, maximumPixels),
    maximumPixels,
    modelFamily,
    autoQuality: 'medium'
  };
  if (common.maximumChargeRmb < common.minimumChargeRmb) common.maximumChargeRmb = common.minimumChargeRmb;

  if (resolvedStrategy === IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_FORMULA) {
    const formulaSource = source.formula && typeof source.formula === 'object' ? source.formula : {};
    const formulaFallback = fallback.formula || GPT_IMAGE_2_PRICING_CONFIG.formula;
    return {
      ...common,
      formula: {
        baseCostRmb: roundMoney(finiteNumber(formulaSource.baseCostRmb, formulaFallback.baseCostRmb, 0, 100000), 3),
        costPerMegapixelRmb: roundMoney(finiteNumber(formulaSource.costPerMegapixelRmb, formulaFallback.costPerMegapixelRmb, 0, 100000), 6),
        qualityFactors: qualityPrices(formulaSource.qualityFactors, formulaFallback.qualityFactors),
        priceMultiplier: finiteNumber(formulaSource.priceMultiplier, formulaFallback.priceMultiplier ?? 1, 0, 10000),
        fixedFeeRmb: roundMoney(finiteNumber(formulaSource.fixedFeeRmb, formulaFallback.fixedFeeRmb ?? 0, 0, 100000), 3),
        actualCostRatio: finiteNumber(formulaSource.actualCostRatio, formulaFallback.actualCostRatio ?? 1, 0, 1000)
      }
    };
  }

  if (resolvedStrategy === IMAGE_PRICING_STRATEGIES.FIXED_IMAGE) {
    return {
      ...common,
      fixedPriceRmb: roundMoney(finiteNumber(source.fixedPriceRmb, fallback.fixedPriceRmb ?? common.minimumChargeRmb, 0, 100000), 3),
      actualCostRatio: finiteNumber(source.actualCostRatio, fallback.actualCostRatio ?? 1, 0, 1000)
    };
  }

  if (resolvedStrategy === IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_MATRIX) {
    const fallbackBands = Array.isArray(fallback.bands) ? fallback.bands : [];
    const bands = (Array.isArray(source.bands) ? source.bands : fallbackBands)
      .map((band, index) => ({
        id: String(band?.id || `band-${index + 1}`).slice(0, 60),
        maxPixels: alignImagePricingPixelsUp(band?.maxPixels, maximumPixels, maximumPixels),
        pricesRmb: qualityPrices(band?.pricesRmb, { low: common.minimumChargeRmb, medium: common.minimumChargeRmb, high: common.minimumChargeRmb })
      }))
      .sort((left, right) => left.maxPixels - right.maxPixels);
    if (!bands.length || bands.at(-1).maxPixels < maximumPixels) {
      bands.push({
        id: 'maximum',
        maxPixels: maximumPixels,
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
  if (pricing?.externalWallet) return { ...pricing, minimumCredits: 0, credits: 0, originalCredits: 0, retailRmb: 0, discountApplied: false };
  const minimumCredits = Math.max(0, roundMoney(Number(pricing?.minimumCredits ?? IMAGE_MIN_CHARGE_CREDITS), 2));
  const textCredits = Number(pricing?.imageTextCredits || 0) + Number(pricing?.referenceTokenCredits || 0);
  const originalImageCredits = Math.max(minimumCredits, roundMoney((Number(pricing?.credits) || 0) - textCredits, 2));
  const originalCredits = roundMoney(originalImageCredits + textCredits, 2);
  const resolvedPromotion = resolveImagePromotion(promotion, options);
  const promotionEligible = pricing?.promotionEligible !== false;
  const roundingStep = pricing?.promotionRoundingStep || IMAGE_PROMOTION_ROUNDING_STEP;
  const discountedCredits = resolvedPromotion.active && promotionEligible
    ? roundMoney(Math.round((originalImageCredits * resolvedPromotion.payPercent) / 100 / roundingStep) * roundingStep, 2)
    : originalImageCredits;
  const promotionFloor = roundingStep < 1 && originalImageCredits > 0 ? Math.max(minimumCredits, roundingStep) : minimumCredits;
  const imageCredits = clamp(discountedCredits, promotionFloor, originalImageCredits);
  const credits = roundMoney(imageCredits + textCredits, 2);
  const discountApplied = resolvedPromotion.active && credits < originalCredits;
  return {
    ...pricing,
    credits,
    imageCredits,
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

// Upstream costs need sub-cent precision; retail normalization intentionally
// rounds fixed selling prices to milli-yuan and must not truncate these cost rates.
export function normalizeUpstreamImageCost(value, model = '') {
  const config = normalizeImagePricingConfig(value, { model });
  if (value?.fixedPriceRmb != null) config.fixedPriceRmb = roundMoney(Number(value.fixedPriceRmb));
  if (value?.qualityPricesRmb) {
    config.qualityPricesRmb = Object.fromEntries(['low', 'medium', 'high'].map((key) => [key,
      roundMoney(Number(value.qualityPricesRmb[key] ?? config.qualityPricesRmb?.[key] ?? 0))
    ]));
  }
  return config;
}

export function getImageGenerationPricing({ size = '1024x1024', quality = 'low', model = '', referenceCount = 0, prompt = '', estimatedTextTokens } = {}, pricingConfig = GPT_IMAGE_2_PRICING_CONFIG) {
  if (pricingConfig?.externalWallet) {
    return {
      size, quality, model, referenceCount, credits: 0, baseCredits: 0, originalCredits: 0,
      referenceCredits: 0, referenceUnitCredits: 0, referenceTokenCredits: 0, imageTextCredits: 0,
      retailRmb: 0, discountApplied: false, promotionEligible: false,
      pricingStrategy: 'external-wallet', pricingVersion: 1, billedQuality: quality,
      billingSource: pricingConfig.billingSource, externalWallet: true
    };
  }
  const config = normalizeImagePricingConfig(pricingConfig, { model, strategy: pricingConfig?.strategy });
  const parsed = parseImageSize(size);
  const requestedPixels = parsed && !parsed.auto
    ? parsed.width * parsed.height
    : config.autoSizePixels;
  const billedQuality = quality === 'auto' ? 'medium' : resolveImagePricingQuality(quality);
  const geminiImage = isGeminiImageModel(model) || config.modelFamily === 'gemini-image';
  const resolutionTier = geminiImage ? GEMINI_IMAGE_PRICING_TIERS[billedQuality] : null;
  const billedPixels = resolutionTier
    ? resolutionTier.pixels
    : clamp(requestedPixels, IMAGE_MIN_PIXELS, config.maximumPixels || IMAGE_MAX_PIXELS);
  const base = pricingBaseRmb(config, billedPixels, billedQuality);
  const upstreamRule = pricingConfig?.upstreamCost;
  const upstreamConfig = upstreamRule?.imagePricingConfig
    ? normalizeUpstreamImageCost(upstreamRule.imagePricingConfig, model)
    : null;
  const upstreamBase = upstreamConfig ? pricingBaseRmb(upstreamConfig, billedPixels, billedQuality) : base;
  const upstreamCost = upstreamRule?.unit === 'image'
    ? Number(upstreamRule.fixedPriceRmb)
    : upstreamBase.actualCostRmb;
  const upstreamCostUnknown = upstreamRule?.pricingSchemaVersion === 2 && upstreamRule.unit === 'tokens';
  const isFixedPrice = config.strategy === IMAGE_PRICING_STRATEGIES.FIXED_QUALITY
    || config.strategy === IMAGE_PRICING_STRATEGIES.FIXED_IMAGE;
  const roundedChargeRmb = isFixedPrice
    ? roundMoney(base.rawChargeRmb, 3)
    : clamp(
        roundUpToStep(base.rawChargeRmb, config.priceStepRmb),
        config.minimumChargeRmb,
        config.maximumChargeRmb
      );
  const baseCredits = roundMoney(roundedChargeRmb * IMAGE_CREDITS_PER_RMB, 1);
  const billedReferenceCount = Math.max(0, Math.min(9, Math.round(Number(referenceCount) || 0)));
  const referenceUnitCredits = roundMoney(config.referenceImagePriceRmb * IMAGE_CREDITS_PER_RMB, 1);
  const referenceCredits = config.chargeReferenceTokens ? 0 : roundMoney(billedReferenceCount * referenceUnitCredits, 1);
  const hasSubcentRate = [roundedChargeRmb, config.referenceImagePriceRmb, config.priceStepRmb,
    config.minimumChargeRmb, config.maximumChargeRmb].some((value) => Math.abs(value * 100 - Math.round(value * 100)) > 1e-8);
  const inputFees = imageInputFees({ prompt, estimatedTextTokens, referenceCount: billedReferenceCount }, { ...config, upstreamCost: upstreamRule });
  const { imageTextCredits, imageTextCostRmb, referenceTokenCredits, referenceTokenCostRmb } = inputFees;
  const credits = roundMoney(baseCredits + referenceCredits + imageTextCredits + referenceTokenCredits, 2);
  return {
    credits,
    imageCredits: roundMoney(baseCredits + referenceCredits, 1),
    ...inputFees,
    retailRmb: roundMoney(credits / IMAGE_CREDITS_PER_RMB, 4),
    estimatedCostRmb: upstreamCostUnknown ? null : roundMoney(upstreamCost + imageTextCostRmb + referenceTokenCostRmb),
    estimatedActualCostRmb: upstreamCostUnknown ? null : roundMoney(upstreamCost + imageTextCostRmb + referenceTokenCostRmb),
    upstreamCostPendingUsage: upstreamCostUnknown,
    upstreamOutputRmbPerMillion: Number(upstreamRule?.pricing?.output || 0),
    upstreamFixedPriceRmb: upstreamRule?.unit === 'image' ? Number(upstreamRule.fixedPriceRmb || 0) : null,
    estimatedListCostRmb: roundMoney(upstreamConfig ? upstreamBase.listCostRmb : base.listCostRmb),
    upstreamModel: upstreamRule?.model || '',
    upstreamPriceSource: upstreamRule?.pricingSource || 'legacy-estimate',
    upstreamEstimateSource: upstreamRule?.estimateSource || 'pixel-quality-calibration',
    rawChargeRmb: roundMoney(base.rawChargeRmb),
    baseCredits,
    baseRetailRmb: roundMoney(baseCredits / IMAGE_CREDITS_PER_RMB, 3),
    referenceCount: billedReferenceCount,
    referenceImagePriceRmb: config.referenceImagePriceRmb,
    referenceUnitCredits,
    referenceCredits,
    referenceChargeRmb: roundMoney(referenceCredits / IMAGE_CREDITS_PER_RMB, 3),
    totalRawChargeRmb: roundMoney(credits / IMAGE_CREDITS_PER_RMB, 4),
    requestedPixels,
    billedPixels,
    maximumPixels: config.maximumPixels,
    resolutionTier: resolutionTier?.resolution || '',
    bandId: base.bandId,
    requestedQuality: quality,
    billedQuality,
    autoSize: !parsed || parsed.auto,
    autoQuality: quality === 'auto',
    minimumCredits: isFixedPrice ? 0 : roundMoney(config.minimumChargeRmb * IMAGE_CREDITS_PER_RMB, 1),
    maximumCredits: roundMoney((isFixedPrice ? baseCredits : roundMoney(config.maximumChargeRmb * IMAGE_CREDITS_PER_RMB, 1)) + referenceCredits + imageTextCredits + referenceTokenCredits, 2),
    priceStepCredits: isFixedPrice ? hasSubcentRate ? 0.1 : 1 : roundMoney(config.priceStepRmb * IMAGE_CREDITS_PER_RMB, 1),
    promotionRoundingStep: hasSubcentRate ? 0.1 : IMAGE_PROMOTION_ROUNDING_STEP,
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

export function resolveEcommerceRefinementSize(generation, slot, model) {
  const sourceSize = String(generation?.size || '').trim().toLowerCase();
  if (isMaiImage27Model(model) && sourceSize) {
    if (validateImageSizeForModel(sourceSize, model).valid) return sourceSize;
    // Historical results may predate the cap. Fit the output canvas without
    // changing the requested orientation; the reference file stays unchanged.
    const fitted = resolveSourceImageSizeForModel({ size: sourceSize }, model);
    return fitted.valid ? fitted.size : resolveEcommerceSlotGenerationSize(slot);
  }
  return validateImageSize(sourceSize).valid ? sourceSize : resolveEcommerceSlotGenerationSize(slot);
}
