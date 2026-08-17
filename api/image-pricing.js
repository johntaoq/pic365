import { authenticateRequest } from './_lib/local-auth.js';
import { readJsonBody } from './_lib/billing.js';
import { getImagePromotionConfig, getImageProviderConfig, updateImagePromotionConfig } from './_lib/local-db.js';
import { normalizeImageQuality, validateImageSizeForModel } from '../shared/image-generation.js';
import {
  applyImagePromotion,
  IMAGE_CREDIT_ROUNDING_STEP,
  IMAGE_CREDITS_PER_RMB,
  IMAGE_MAX_CHARGE_CREDITS,
  IMAGE_MIN_CHARGE_CREDITS,
  IMAGE_PROMOTION_MAX_PAY_PERCENT,
  IMAGE_PROMOTION_MIN_PAY_PERCENT,
  IMAGE_PROMOTION_ROUNDING_STEP,
  getImageGenerationPricing,
  resolveImagePromotion
} from '../shared/image-pricing.js';

function json(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

function quoteImagePricing(input = {}, promotionConfig = getImagePromotionConfig()) {
  // Pricing only needs the provider model and pricing policy. Avoid decrypting
  // the API key here so a key-rotation/configuration issue cannot block quotes.
  const provider = getImageProviderConfig(String(input.providerId || '').trim(), { includeSecret: false });
  if (!provider) {
    const error = new Error('AI_PROVIDER_NOT_CONFIGURED');
    error.code = 'AI_PROVIDER_NOT_CONFIGURED';
    throw error;
  }
  const size = String(input.size || '1024x1024').trim().toLowerCase();
  const sizeCheck = validateImageSizeForModel(size, provider.model);
  if (!sizeCheck.valid) {
    const error = new Error('INVALID_SIZE');
    error.code = 'INVALID_SIZE';
    error.reason = sizeCheck.error;
    throw error;
  }
  const quality = normalizeImageQuality(input.quality, 'low');
  const count = Math.max(1, Math.min(50, Math.round(Number(input.count) || 1)));
  const pricing = applyImagePromotion(
    getImageGenerationPricing({ size, quality }, provider.pricingConfig),
    promotionConfig
  );
  return {
    ...pricing,
    size,
    quality,
    count,
    totalCredits: pricing.credits * count,
    totalOriginalCredits: pricing.originalCredits * count,
    providerId: provider.id,
    providerName: provider.name,
    model: provider.model,
    source: 'server'
  };
}

function publicPayload(extra = {}) {
  const serverNow = new Date().toISOString();
  const promotionConfig = getImagePromotionConfig();
  const promotion = resolveImagePromotion(promotionConfig, { now: Date.parse(serverNow) });
  const samplePricing = extra.pricing || extra.quotes?.[0]?.pricing || null;
  return {
    ok: true,
    serverNow,
    promotion,
    policy: {
      creditsPerRmb: IMAGE_CREDITS_PER_RMB,
      minimumCredits: samplePricing?.minimumCredits ?? IMAGE_MIN_CHARGE_CREDITS,
      maximumCredits: samplePricing?.maximumCredits ?? IMAGE_MAX_CHARGE_CREDITS,
      roundingStep: samplePricing?.priceStepCredits ?? IMAGE_CREDIT_ROUNDING_STEP,
      promotionRoundingStep: IMAGE_PROMOTION_ROUNDING_STEP,
      minimumPayPercent: IMAGE_PROMOTION_MIN_PAY_PERCENT,
      maximumPayPercent: IMAGE_PROMOTION_MAX_PAY_PERCENT,
      providerSpecific: true
    },
    ...extra
  };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const pricing = quoteImagePricing({
        size: req.query?.size,
        quality: req.query?.quality,
        count: req.query?.count,
        providerId: req.query?.providerId
      });
      return json(res, 200, publicPayload({ pricing }));
    } catch (error) {
      return json(res, 400, { ok: false, error: error?.code || 'INVALID_PRICING_REQUEST', reason: error?.reason || undefined });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [body];
      if (!items.length) return json(res, 400, { ok: false, error: 'INVALID_PRICING_REQUEST' });
      const promotionConfig = getImagePromotionConfig();
      const quotes = items.map((item, index) => ({
        key: String(item?.key || index).slice(0, 120),
        pricing: quoteImagePricing(item, promotionConfig)
      }));
      return json(res, 200, publicPayload({ quotes }));
    } catch (error) {
      return json(res, 400, { ok: false, error: error?.code || 'INVALID_PRICING_REQUEST', reason: error?.reason || undefined });
    }
  }

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  if (!auth.profile?.isSuperAdmin) return json(res, 403, { ok: false, error: 'FORBIDDEN' });

  try {
    const body = await readJsonBody(req);
    const payPercent = Number(body.payPercent);
    if (!Number.isInteger(payPercent) || payPercent < IMAGE_PROMOTION_MIN_PAY_PERCENT || payPercent > IMAGE_PROMOTION_MAX_PAY_PERCENT) {
      return json(res, 400, { ok: false, error: 'INVALID_PROMOTION_DISCOUNT' });
    }
    updateImagePromotionConfig({
      enabled: body.enabled,
      name: body.name,
      payPercent,
      startsAt: body.startsAt,
      endsAt: body.endsAt
    }, auth.user.id);
    return json(res, 200, publicPayload());
  } catch (error) {
    if (error?.code === 'INVALID_PROMOTION_RANGE') {
      return json(res, 400, { ok: false, error: error.code });
    }
    console.warn('Failed to update image promotion', {
      adminUserId: auth.user.id,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 500, { ok: false, error: 'PROMOTION_UPDATE_FAILED' });
  }
}
