import { authenticateRequest } from './_lib/local-auth.js';
import { requirePermission } from './_lib/governance.js';
import { ADMIN_PERMISSIONS } from '../shared/admin-permissions.js';
import { readJsonBody } from './_lib/billing.js';
import { getImagePromotionConfig, getImageProviderConfig, updateImagePromotionConfig } from './_lib/local-db.js';
import { getEcommerceProject, listEcommerceProjectAssets } from './_lib/local-db.js';
import { getEcommerceProjectOutput } from './_lib/ecommerce-p1-db.js';
import { buildEcommerceSlotPrompt, selectEcommerceAssetsForSlot } from './_lib/ecommerce-prompt.js';
import { getEcommerceGenerationSystemPromptSettings } from './_lib/ecommerce-generation-settings.js';
import { getEcommercePlatform } from '../shared/ecommerce-catalog.js';
import { validateImageInputPricing } from './_lib/image-input-billing.js';
import { estimateTextTokens } from './_lib/text-token-estimate.js';
import { normalizeImageQuality, validateImageReferenceInputsForModel, validateImageSizeForModel } from '../shared/image-generation.js';
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

function createQuoteContext(userId) {
  const promotionConfig = getImagePromotionConfig();
  const providers = new Map();
  const projects = new Map();
  let systemPrompt;
  return {
    userId, promotionConfig, now: Date.now(),
    provider(id) {
      if (!providers.has(id)) {
        const provider = getImageProviderConfig(id, { includeSecret: false, userId });
        if (!provider) throw Object.assign(new Error('AI_PROVIDER_NOT_CONFIGURED'), { code: 'AI_PROVIDER_NOT_CONFIGURED' });
        validateImageInputPricing(provider.pricingConfig, provider.model);
        providers.set(id, provider);
      }
      return providers.get(id);
    },
    project(id) {
      if (!projects.has(id)) {
        const project = getEcommerceProject(userId, id);
        if (!project) throw Object.assign(new Error('PROJECT_NOT_FOUND'), { code: 'PROJECT_NOT_FOUND' });
        projects.set(id, {
          project, platform: getEcommercePlatform(project.platformId)
        });
      }
      return projects.get(id);
    },
    systemPrompt() {
      return systemPrompt ??= getEcommerceGenerationSystemPromptSettings().prompt;
    }
  };
}

function quoteImagePricing(input, context) {
  const provider = context.provider(String(input.providerId || '').trim());
  const chargeTextTokens = Boolean(provider.pricingConfig?.chargeTextTokens);
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
  const referenceCount = Math.max(0, Math.min(9, Math.round(Number(input.referenceCount) || 0)));
  const referenceCheck = validateImageReferenceInputsForModel({ model: provider.model, count: referenceCount });
  if (!referenceCheck.valid) {
    const error = new Error(referenceCheck.error);
    error.code = referenceCheck.error;
    throw error;
  }
  let prompt = chargeTextTokens ? String(input.prompt || '').slice(0, 48000) : '';
  if (input.projectId && input.slotId && chargeTextTokens) {
    const entry = context.project(String(input.projectId));
    const { project, platform } = entry;
    const slot = platform.slots.find((item) => item.id === input.slotId);
    if (!slot || !project.selectedSlots.includes(slot.id)) throw Object.assign(new Error('INVALID_PROJECT_SLOT'), { code: 'INVALID_PROJECT_SLOT' });
    const referenceInputs = (Array.isArray(input.referenceInputs) ? input.referenceInputs : []).slice(0, 4);
    const allAssets = entry.assets ??= listEcommerceProjectAssets(context.userId, project.id);
    const refinementAssets = referenceInputs.map((ref) => allAssets.find((asset) => asset.id === ref.assetId)).filter(Boolean);
    const limit = Math.max(1, 8 - (input.baseGenerationId ? 1 : 0));
    const standard = selectEcommerceAssetsForSlot({ project, platform, slot, assets: allAssets, limit: Math.max(1, limit - refinementAssets.length) });
    const assets = [...standard, ...refinementAssets].filter((asset, index, all) => all.findIndex((item) => item.id === asset.id) === index).slice(0, limit);
    const output = input.baseGenerationId ? getEcommerceProjectOutput(context.userId, project.id, slot.id) : null;
    prompt = buildEcommerceSlotPrompt({
      project, platform, slot, assets,
      systemPrompt: context.systemPrompt(),
      revisionRequest: String(input.adjustment || '').slice(0, 1200),
      targetArea: input.targetArea || 'auto',
      refinementInputs: referenceInputs,
      hasBaseImage: Boolean(input.baseGenerationId),
      consistencyIssues: input.baseGenerationId && output?.selectedGenerationId === input.baseGenerationId ? output.consistencyIssues || [] : []
    });
  }
  const pricing = applyImagePromotion(
    getImageGenerationPricing({
      size, quality, model: provider.model, referenceCount, prompt,
      estimatedTextTokens: prompt ? estimateTextTokens(prompt) : undefined
    }, provider.pricingConfig),
    context.promotionConfig,
    { now: context.now }
  );
  return {
    ...pricing,
    size,
    quality,
    count,
    totalCredits: Number((pricing.credits * count).toFixed(2)),
    totalOriginalCredits: Number((pricing.originalCredits * count).toFixed(2)),
    providerId: provider.id,
    providerName: provider.name,
    model: provider.model,
    chargeTextTokens,
    source: 'server'
  };
}

function publicPayload(extra = {}, { promotionConfig = getImagePromotionConfig(), now = Date.now() } = {}) {
  const serverNow = new Date(now).toISOString();
  const promotion = resolveImagePromotion(promotionConfig, { now });
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
      promotionRoundingStep: samplePricing?.promotionRoundingStep ?? IMAGE_PROMOTION_ROUNDING_STEP,
      minimumPayPercent: IMAGE_PROMOTION_MIN_PAY_PERCENT,
      maximumPayPercent: IMAGE_PROMOTION_MAX_PAY_PERCENT,
      providerSpecific: true
    },
    ...extra
  };
}

export default async function handler(req, res) {
  const auth = authenticateRequest(req, { allowAnonymous: req.method !== 'PATCH' });
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  if (req.method === 'GET') {
    try {
      const context = createQuoteContext(auth.user?.id || '');
      const pricing = quoteImagePricing({
        size: req.query?.size,
        quality: req.query?.quality,
        count: req.query?.count,
        referenceCount: req.query?.referenceCount,
        providerId: req.query?.providerId
      }, context);
      return json(res, 200, publicPayload({ pricing }, context));
    } catch (error) {
      return json(res, 400, { ok: false, error: error?.code || 'INVALID_PRICING_REQUEST', reason: error?.reason || undefined });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [body];
      if (!items.length) return json(res, 400, { ok: false, error: 'INVALID_PRICING_REQUEST' });
      const context = createQuoteContext(auth.user?.id || '');
      const quotes = items.map((item, index) => ({
        key: String(item?.key || index).slice(0, 120),
        pricing: quoteImagePricing(item, context)
      }));
      return json(res, 200, publicPayload({ quotes }, context));
    } catch (error) {
      return json(res, 400, { ok: false, error: error?.code || 'INVALID_PRICING_REQUEST', reason: error?.reason || undefined });
    }
  }

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_PROMOTIONS);
  } catch {
    return json(res, 403, { ok: false, error: 'FORBIDDEN' });
  }

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
