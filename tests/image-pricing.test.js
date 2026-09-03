import assert from 'node:assert/strict';
import test from 'node:test';

import {
  alignImagePricingPixelsUp,
  applyImagePromotion,
  defaultImagePricingConfigForModel,
  estimateDiscountedImageCostRmb,
  GEMINI_IMAGE_MAX_PRICING_PIXELS,
  GEMINI_IMAGE_PRICING_TIERS,
  getImageGenerationPricing,
  IMAGE_OBSERVED_COST_RMB,
  IMAGE_PRICING_STRATEGIES,
  IMAGE_PRICING_BANDS,
  normalizeImagePricingConfig,
  resolveEcommerceRefinementSize
} from '../shared/image-pricing.js';

const observations = [
  [816 * 816, 'low', 0.010930],
  [816 * 816, 'medium', 0.096926],
  [816 * 816, 'high', 0.387167],
  [2048 * 2048, 'low', 0.025168],
  [2048 * 2048, 'medium', 0.224941],
  [2048 * 2048, 'high', 0.899293],
  [2880 * 2880, 'low', 0.041674],
  [2880 * 2880, 'medium', 0.373748],
  [2880 * 2880, 'high', 1.494455]
];

test('the shared pixel-quality model stays within 1.1 percent of all observations', () => {
  for (const [pixels, quality, observed] of observations) {
    const estimated = estimateDiscountedImageCostRmb({ pixels, quality });
    assert.ok(Math.abs(estimated / observed - 1) <= 0.011, `${pixels} ${quality}: ${estimated}`);
  }
});

test('observed actual and undiscounted RMB cost boundaries are explicit', () => {
  assert.equal(IMAGE_OBSERVED_COST_RMB.discountedMin, 0.010930);
  assert.equal(IMAGE_OBSERVED_COST_RMB.discountedMax, 1.494455);
  assert.equal(Number(IMAGE_OBSERVED_COST_RMB.listMin.toFixed(6)), 0.036433);
  assert.equal(Number(IMAGE_OBSERVED_COST_RMB.listMax.toFixed(6)), 4.981517);
});

test('GPT-Image-2 continuously prices exact pixels on RMB 0.1 steps', () => {
  assert.equal(IMAGE_PRICING_BANDS.length, 5);
  const expected = {
    low: [20, 20, 20, 20, 20],
    medium: [40, 50, 70, 80, 130],
    high: [150, 190, 270, 320, 500]
  };
  for (const [quality, credits] of Object.entries(expected)) {
    IMAGE_PRICING_BANDS.forEach((band, index) => {
      const pricing = getImageGenerationPricing({ size: `${band.maxPixels}x1`, quality });
      assert.equal(pricing.credits, credits[index]);
      assert.equal(pricing.priceStepCredits, 10);
      assert.equal(pricing.billedPixels, band.maxPixels);
    });
  }
});

test('auto quality is billed as medium and auto size uses the 2048x2048 basis', () => {
  const pricing = getImageGenerationPricing({ size: 'auto', quality: 'auto' });
  assert.equal(pricing.requestedPixels, 2048 * 2048);
  assert.equal(pricing.bandId, 'continuous');
  assert.equal(pricing.billedPixels, 2048 * 2048);
  assert.equal(pricing.billedQuality, 'medium');
  assert.equal(pricing.credits, 80);
});

test('Gemini maps low, medium and high pricing to 1K, 2K and 4K', () => {
  const config = {
    ...defaultImagePricingConfigForModel('gemini-3.1-flash-image'),
    qualityPricesRmb: { low: 0.1, medium: 0.15, high: 0.2 }
  };
  assert.equal(config.maximumPixels, 4096 * 4096);
  assert.equal(config.maximumPixels, GEMINI_IMAGE_MAX_PRICING_PIXELS);
  assert.equal(config.autoSizePixels, 2048 * 2048);

  const cases = [
    ['low', '1K', GEMINI_IMAGE_PRICING_TIERS.low.pixels, 10],
    ['medium', '2K', GEMINI_IMAGE_PRICING_TIERS.medium.pixels, 15],
    ['high', '4K', GEMINI_IMAGE_PRICING_TIERS.high.pixels, 20],
    ['auto', '2K', GEMINI_IMAGE_PRICING_TIERS.medium.pixels, 15]
  ];
  for (const [quality, resolutionTier, billedPixels, credits] of cases) {
    const pricing = getImageGenerationPricing(
      { size: '1024x1024', quality, model: 'gemini-3.1-flash-image' },
      config
    );
    assert.equal(pricing.resolutionTier, resolutionTier);
    assert.equal(pricing.billedPixels, billedPixels);
    assert.equal(pricing.credits, credits);
  }
});

test('missing size and quality use the public fallback quote', () => {
  const pricing = getImageGenerationPricing();
  assert.equal(pricing.requestedPixels, 1024 * 1024);
  assert.equal(pricing.billedQuality, 'low');
  assert.equal(pricing.credits, 20);
});

test('ecommerce refinement preserves the adopted source generation size', () => {
  const slot = { recommendedSize: '1024x1024', aspectRatio: '1:1' };
  assert.equal(resolveEcommerceRefinementSize({ size: '2048x2048' }, slot), '2048x2048');
  assert.equal(resolveEcommerceRefinementSize({ size: 'invalid' }, slot), '1024x1024');
});

test('active promotions multiply the list price and round to the nearest single credit', () => {
  const base = getImageGenerationPricing({ size: '1024x1024', quality: 'medium' });
  const pricing = applyImagePromotion(base, {
    enabled: true,
    name: 'Launch sale',
    payPercent: 80
  });
  assert.equal(pricing.originalCredits, 40);
  assert.equal(pricing.credits, 32);
  assert.equal(pricing.discountApplied, true);
  assert.equal(pricing.promotion.name, 'Launch sale');

  const singleCreditPrecision = applyImagePromotion(
    { credits: 30, retailRmb: 0.3 },
    { enabled: true, payPercent: 85 }
  );
  assert.equal(singleCreditPrecision.originalCredits, 30);
  assert.equal(singleCreditPrecision.credits, 26);
});

test('each provider can use an independent fixed or matrix pricing rule', () => {
  const fixed = getImageGenerationPricing({ size: '2048x2048', quality: 'high' }, {
    ...defaultImagePricingConfigForModel('banana-2'),
    strategy: IMAGE_PRICING_STRATEGIES.FIXED_QUALITY,
    qualityPricesRmb: { low: 0.4, medium: 0.8, high: 1.6 }
  });
  assert.equal(fixed.credits, 160);
  assert.equal(fixed.pricingStrategy, IMAGE_PRICING_STRATEGIES.FIXED_QUALITY);

  const matrix = getImageGenerationPricing({ size: '2048x2048', quality: 'medium' }, {
    strategy: IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_MATRIX,
    priceStepRmb: 0.1,
    minimumChargeRmb: 0.2,
    maximumChargeRmb: 10,
    autoSizePixels: 2048 * 2048,
    autoQuality: 'medium',
    promotionEligible: true,
    bands: [
      { id: 'small', maxPixels: 2_000_000, pricesRmb: { low: 0.3, medium: 0.6, high: 1.2 } },
      { id: 'large', maxPixels: 8_294_400, pricesRmb: { low: 0.5, medium: 1.1, high: 2.2 } }
    ]
  });
  assert.equal(matrix.credits, 110);
  assert.equal(matrix.bandId, 'large');
});

test('pricing editor values use stable precision and pixel bands align upward', () => {
  const formula = normalizeImagePricingConfig({
    strategy: IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_FORMULA,
    autoSizePixels: 655_361,
    formula: {
      baseCostRmb: 0.02711833770447513,
      costPerMegapixelRmb: 0.013437729970305323,
      qualityFactors: { low: 1, medium: 9, high: 36 }
    }
  }, { model: 'gpt-image-2' });
  assert.equal(formula.formula.baseCostRmb, 0.03);
  assert.equal(formula.formula.costPerMegapixelRmb, 0.013438);
  assert.equal(formula.autoSizePixels, 655_616);
  assert.equal(formula.autoQuality, 'medium');
  assert.equal(alignImagePricingPixelsUp(655_361), 655_616);

  const matrix = normalizeImagePricingConfig({
    strategy: IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_MATRIX,
    bands: [
      { id: 'custom', maxPixels: 1_000_001, pricesRmb: { low: 0.234, medium: 0.567, high: 1.239 } }
    ]
  }, { model: 'custom-image' });
  assert.equal(matrix.bands[0].maxPixels, 1_000_192);
  assert.deepEqual(matrix.bands[0].pricesRmb, { low: 0.23, medium: 0.57, high: 1.24 });
});

test('fixed quality and fixed image strategies charge their configured unit price exactly', () => {
  const fixedQuality = getImageGenerationPricing({ size: '2048x2048', quality: 'medium' }, {
    ...defaultImagePricingConfigForModel('banana-2'),
    strategy: IMAGE_PRICING_STRATEGIES.FIXED_QUALITY,
    qualityPricesRmb: { low: 0.21, medium: 0.37, high: 0.43 }
  });
  assert.equal(fixedQuality.credits, 37);

  const fixedImage = getImageGenerationPricing({ size: '2048x2048', quality: 'high' }, {
    ...defaultImagePricingConfigForModel('banana-2'),
    strategy: IMAGE_PRICING_STRATEGIES.FIXED_IMAGE,
    fixedPriceRmb: 0.43
  });
  assert.equal(fixedImage.credits, 43);
  assert.equal(fixedImage.priceStepCredits, 1);
  assert.equal(applyImagePromotion(fixedImage, { enabled: true, payPercent: 80 }).credits, 34);
});

test('reference image pricing is added by actual reference count before promotion', () => {
  const pricing = getImageGenerationPricing({
    size: '1024x1024',
    quality: 'medium',
    model: 'banana-2',
    referenceCount: 3
  }, {
    ...defaultImagePricingConfigForModel('banana-2'),
    strategy: IMAGE_PRICING_STRATEGIES.FIXED_QUALITY,
    qualityPricesRmb: { low: 0.2, medium: 0.4, high: 0.8 },
    referenceImagePriceRmb: 0.12
  });
  assert.equal(pricing.baseCredits, 40);
  assert.equal(pricing.referenceCount, 3);
  assert.equal(pricing.referenceUnitCredits, 12);
  assert.equal(pricing.referenceCredits, 36);
  assert.equal(pricing.credits, 76);
  assert.equal(pricing.retailRmb, 0.76);

  const promoted = applyImagePromotion(pricing, { enabled: true, payPercent: 80 });
  assert.equal(promoted.originalCredits, 76);
  assert.equal(promoted.credits, 61);
});

test('promotions respect the minimum charge and scheduled time window', () => {
  const minimum = applyImagePromotion(
    getImageGenerationPricing({ size: '816x816', quality: 'low' }),
    { enabled: true, payPercent: 50 }
  );
  assert.equal(minimum.originalCredits, 20);
  assert.equal(minimum.credits, 20);
  assert.equal(minimum.discountApplied, false);

  const scheduled = applyImagePromotion(
    getImageGenerationPricing({ size: '2048x2048', quality: 'high' }),
    { enabled: true, payPercent: 80, startsAt: '2030-01-02T00:00:00.000Z' },
    { now: Date.parse('2030-01-01T00:00:00.000Z') }
  );
  assert.equal(scheduled.credits, scheduled.originalCredits);
  assert.equal(scheduled.promotion.scheduled, true);
});
