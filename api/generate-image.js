import { createHash } from 'node:crypto';
import {
  claimGuestGenerationUsage,
  completeCreditReservation,
  createGeneration,
  getGuestGenerationUsageCount,
  getImageProviderConfig,
  getImagePromotionConfig,
  getUserProfile,
  recordGenerationFailureAlert,
  recordPromptAuditLog,
  releaseGuestGenerationUsage,
  releaseCreditReservation,
  reserveCredit,
  updateGeneration
} from './_lib/local-db.js';
import { authenticateRequest } from './_lib/local-auth.js';
import { registerFreeGenerationTask, unregisterFreeGenerationTask } from './_lib/free-generation-tasks.js';
import { readJsonBody } from './_lib/request.js';
import {
  editImage,
  classifyImageProviderError,
  generateImage as generateProviderImage,
  isProviderConfigured
} from './_lib/provider.js';
import {
  buildReferencePrompt,
  loadReferenceImageInputs,
  normalizeReferenceRequests
} from './_lib/reference-images.js';
import { deleteStoredFile, persistImage } from './_lib/storage.js';
import { ensureFreeImageWatermark } from './_lib/free-image-watermark.js';
import {
  normalizeImageCount,
  normalizeImageQuality,
  resolveProviderImageQuality,
  validateImageSizeForModel
} from '../shared/image-generation.js';
import { applyImagePromotion, getImageGenerationPricing } from '../shared/image-pricing.js';
import { GUEST_FREE_GENERATION_LIMIT, guestGenerationRemaining } from '../shared/guest-generation.js';

const MAX_PROMPT_LENGTH = 6000;
const GUEST_GENERATION_COOKIE = 'gpt_image_guest_generation';
const GUEST_GENERATION_MAX_AGE = 60 * 60 * 24 * 365;

function json(res, status, payload) {
  res.status(status).json(payload);
}

function readCookies(req) {
  const header = req.headers?.cookie || req.headers?.Cookie || '';
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))])
  );
}

function guestCookieUsageCount(req) {
  return Math.max(0, Math.min(
    GUEST_FREE_GENERATION_LIMIT,
    Math.floor(Number(readCookies(req)[GUEST_GENERATION_COOKIE]) || 0)
  ));
}

function guestGenerationUsage(req) {
  return Math.max(guestCookieUsageCount(req), getGuestGenerationUsageCount(guestFingerprint(req)));
}

function guestFingerprint(req) {
  const realIp = String(req.headers?.['x-real-ip'] || '').trim();
  const forwarded = String(req.headers?.['x-forwarded-for'] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  const address = realIp || forwarded || req.socket?.remoteAddress || 'unknown';
  const userAgent = String(req.headers?.['user-agent'] || '').slice(0, 300);
  const secret = String(process.env.GUEST_USAGE_SECRET || process.env.SESSION_SECRET || 'pic365-guest-usage');
  return createHash('sha256').update(`${secret}\n${address}\n${userAgent}`).digest('hex');
}

function setGuestGenerationCookie(req, res, usageCount) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const secureFlag = forwardedProto === 'https' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${GUEST_GENERATION_COOKIE}=${Math.max(0, Math.min(GUEST_FREE_GENERATION_LIMIT, Number(usageCount) || 0))}; Path=/; Max-Age=${GUEST_GENERATION_MAX_AGE}; HttpOnly; SameSite=Lax${secureFlag}`
  );
}

function guestUsagePayload(used) {
  const normalizedUsed = Math.max(0, Math.min(GUEST_FREE_GENERATION_LIMIT, Number(used) || 0));
  const remaining = guestGenerationRemaining(normalizedUsed);
  return {
    guestAllowed: remaining > 0,
    guestFreeUsed: remaining === 0,
    guestGenerationsUsed: normalizedUsed,
    guestGenerationsLimit: GUEST_FREE_GENERATION_LIMIT,
    guestGenerationsRemaining: remaining
  };
}

function hasFullWorkspaceAccess(profile) {
  return Boolean(profile?.isSuperAdmin || Number(profile?.creditBalance || 0) > 0);
}

function generationErrorCode(error) {
  return classifyImageProviderError(error);
}

function generationErrorStatus(errorCode) {
  if (errorCode === 'GENERATION_CANCELLED') return 409;
  if (errorCode === 'CONTENT_MODERATION_BLOCKED') return 422;
  if (['UPSTREAM_BUSY', 'IMAGE_PROVIDER_UNAVAILABLE', 'IMAGE_PROVIDER_TIMEOUT'].includes(errorCode)) return 503;
  if (errorCode === 'IMAGE_PROVIDER_AUTH_FAILED') return 502;
  if (errorCode === 'IMAGE_PROVIDER_BALANCE_ERROR') return 402;
  return 502;
}

function throwIfGenerationCancelled(signal) {
  if (!signal?.aborted) return;
  const error = new Error('GENERATION_CANCELLED');
  error.name = 'AbortError';
  error.code = 'GENERATION_CANCELLED';
  throw error;
}

function batchRepairProviderPrompt(prompt) {
  return [
    'This is one independent image-repair task. Use only the single supplied source image for this task.',
    'Apply the user request conservatively. Preserve every composition, subject, background, lighting, color, material, text, logo, shadow, edge, and fine detail that the user did not explicitly ask to change.',
    'Do not combine this source with any other batch item and do not create a collage.',
    'User repair request:',
    prompt
  ].join('\n');
}

async function runGenerationJob({
  job,
  userId,
  prompt,
  providerPrompt,
  referenceImages,
  size,
  quality,
  providerConfig,
  signal
}) {
  try {
    throwIfGenerationCancelled(signal);
    const providerResult = referenceImages.length
      ? await editImage({
          prompt: providerPrompt,
          images: referenceImages,
          size,
          quality,
          providerConfig,
          signal
        })
      : await generateProviderImage({ prompt: providerPrompt, size, quality, providerConfig, signal });
    throwIfGenerationCancelled(signal);
    const storedImage = await persistImage({ userId, generationId: job.generationId, image: providerResult.image });
    if (signal?.aborted) {
      await deleteStoredFile(storedImage.storagePath).catch(() => undefined);
      throwIfGenerationCancelled(signal);
    }
    updateGeneration(job.generationId, {
      status: 'succeeded',
      provider_request_id: providerResult.providerRequestId,
      storage_path: storedImage.storagePath,
      output_url: storedImage.url,
      file_size: storedImage.byteLength,
      mime_type: storedImage.contentType,
      completed_at: new Date().toISOString()
    });
    completeCreditReservation(job.reservationId);
    return {
      ok: true,
      generationId: job.generationId,
      image: storedImage.url,
      contentType: storedImage.contentType,
      size,
      quality,
      cloudSaved: storedImage.backend === 'azure-blob',
      storageBackend: storedImage.backend,
      downloadAllowed: true,
      creditsCharged: job.creditAmount,
      prompt
    };
  } catch (error) {
    const errorCode = signal?.aborted || error?.code === 'GENERATION_CANCELLED'
      ? 'GENERATION_CANCELLED'
      : generationErrorCode(error);
    console.warn('Image generation job failed', {
      generationId: job.generationId,
      status: error?.status || null,
      code: error?.code || null,
      moderationBlocked: errorCode === 'CONTENT_MODERATION_BLOCKED',
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    updateGeneration(job.generationId, {
      status: errorCode === 'GENERATION_CANCELLED' ? 'cancelled' : 'failed',
      provider_request_id: error?.providerRequestId || null,
      error_code: errorCode,
      completed_at: new Date().toISOString()
    });
    releaseCreditReservation(job.reservationId, errorCode);
    recordGenerationFailureAlert({
      userId,
      generationId: job.generationId,
      providerName: providerConfig?.name || '',
      providerModel: providerConfig?.model || '',
      errorCode
    });
    return {
      ok: false,
      generationId: job.generationId,
      error: errorCode,
      providerName: providerConfig?.name || '',
      providerModel: providerConfig?.model || '',
      cause: error
    };
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req, { allowAnonymous: true });
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  req.once?.('aborted', abortRequest);
  res.once?.('close', () => {
    if (!res.writableEnded) abortRequest();
  });

  if (req.method === 'GET') {
    const guestUsed = guestGenerationUsage(req);
    return json(res, 200, {
      ok: true,
      authRequired: false,
      ...guestUsagePayload(guestUsed),
      fullWorkspace: hasFullWorkspaceAccess(auth.profile),
      user: auth.profile || null
    });
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 24 * 1024 * 1024 });
  } catch (error) {
    return json(res, error?.status || 400, { ok: false, error: error?.code || 'INVALID_PROMPT' });
  }

  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) return json(res, 400, { ok: false, error: 'INVALID_PROMPT' });

  if (!auth.user || !auth.profile) {
    const guestProviderConfig = getImageProviderConfig();
    if (!guestProviderConfig || !isProviderConfigured(guestProviderConfig)) {
      return json(res, 500, { ok: false, error: 'SERVER_NOT_CONFIGURED' });
    }
    const fingerprint = guestFingerprint(req);
    const previousUsage = guestGenerationUsage(req);
    if (previousUsage >= GUEST_FREE_GENERATION_LIMIT) {
      return json(res, 402, {
        ok: false,
        error: 'GUEST_FREE_LIMIT_REACHED',
        guest: true,
        downloadAllowed: false,
        ...guestUsagePayload(previousUsage)
      });
    }
    const claim = claimGuestGenerationUsage(fingerprint, {
      limit: GUEST_FREE_GENERATION_LIMIT,
      minimumUsed: previousUsage
    });
    if (!claim.claimed) {
      return json(res, 402, {
        ok: false,
        error: 'GUEST_FREE_LIMIT_REACHED',
        guest: true,
        downloadAllowed: false,
        ...guestUsagePayload(claim.count)
      });
    }
    try {
      const providerResult = await generateProviderImage({ prompt, size: '1024x1024', quality: 'low', providerConfig: guestProviderConfig, signal: requestController.signal });
      const watermarkedResult = await ensureFreeImageWatermark(providerResult);
      setGuestGenerationCookie(req, res, claim.count);
      const guestImage = {
        generationId: null,
        image: watermarkedResult.image,
        contentType: watermarkedResult.contentType,
        size: '1024x1024',
        quality: 'low',
        cloudSaved: false,
        downloadAllowed: false,
        creditsCharged: 0,
        watermarked: true,
        watermark: watermarkedResult.watermark,
        prompt
      };
      return json(res, 200, {
        ok: true,
        guest: true,
        ...guestUsagePayload(claim.count),
        ...guestImage,
        images: [guestImage]
      });
    } catch (error) {
      releaseGuestGenerationUsage(fingerprint);
      const errorCode = generationErrorCode(error);
      console.warn('Guest image generation failed', {
        status: error?.status || null,
        moderationBlocked: errorCode === 'CONTENT_MODERATION_BLOCKED',
        message: String(error?.message || 'unknown').slice(0, 240)
      });
      return json(res, generationErrorStatus(errorCode), {
        ok: false,
        error: errorCode,
        guest: true,
        downloadAllowed: false
      });
    }
  }

  if (!hasFullWorkspaceAccess(auth.profile)) return json(res, 402, { ok: false, error: 'CREDITS_REQUIRED' });

  const providerConfig = getImageProviderConfig(String(body.providerId || '').trim());
  if (!providerConfig || !isProviderConfigured(providerConfig)) {
    return json(res, 400, { ok: false, error: 'AI_PROVIDER_NOT_CONFIGURED' });
  }
  const size = String(body.size || '1024x1024').toLowerCase();
  const sizeCheck = validateImageSizeForModel(size, providerConfig.model);
  if (!sizeCheck.valid) return json(res, 400, { ok: false, error: 'INVALID_SIZE', reason: sizeCheck.error });
  const requestedQuality = normalizeImageQuality(body.quality, 'low');
  const quality = resolveProviderImageQuality(requestedQuality, 'low');
  const count = normalizeImageCount(body.count);
  const clientTaskId = String(body.clientTaskId || '').trim().slice(0, 160);
  if (clientTaskId) {
    if (!registerFreeGenerationTask(auth.user.id, clientTaskId, requestController)) {
      return json(res, 409, { ok: false, error: 'TASK_ALREADY_ACTIVE' });
    }
    const unregisterTask = () => unregisterFreeGenerationTask(auth.user.id, clientTaskId, requestController);
    res.once?.('finish', unregisterTask);
    res.once?.('close', unregisterTask);
  }
  const pricing = applyImagePromotion(
    getImageGenerationPricing({ size, quality: requestedQuality, model: providerConfig.model }, providerConfig.pricingConfig),
    getImagePromotionConfig()
  );
  let references;
  try {
    references = normalizeReferenceRequests(body.references);
  } catch (error) {
    return json(res, 400, { ok: false, error: error?.code || 'INVALID_REFERENCE_IMAGES' });
  }

  let referenceImages = [];
  try {
    referenceImages = await loadReferenceImageInputs(auth.user.id, references, { model: providerConfig.model });
  } catch (error) {
    return json(res, error?.code === 'REFERENCE_IMAGE_NOT_FOUND' ? 404 : 400, {
      ok: false,
      error: error?.code || 'INVALID_REFERENCE_IMAGES'
    });
  }
  const taskMode = body.taskMode === 'batch-repair' ? 'batch-repair' : 'single';
  const providerPrompt = buildReferencePrompt(
    taskMode === 'batch-repair' ? batchRepairProviderPrompt(prompt) : prompt,
    references
  );
  const parsedCaseId = Number(body.caseId);
  const caseId = Number.isFinite(parsedCaseId) ? parsedCaseId : null;

  const reservations = [];
  try {
    for (let index = 0; index < count; index += 1) {
      reservations.push(reserveCredit(auth.user.id, {
        caseId,
        prompt,
        amount: pricing.credits,
        requestKey: clientTaskId ? `free-image:${clientTaskId}:${index}` : '',
        metadata: {
          size,
          quality,
          requestedQuality,
          pricingBand: pricing.bandId,
          pricingStrategy: pricing.pricingStrategy,
          pricingVersion: pricing.pricingVersion,
          providerId: providerConfig.id,
          providerName: providerConfig.name,
          model: providerConfig.model,
          billedQuality: pricing.billedQuality,
          estimatedCostRmb: pricing.estimatedCostRmb,
          estimatedListCostRmb: pricing.estimatedListCostRmb,
          retailRmb: pricing.retailRmb,
          originalCredits: pricing.originalCredits,
          chargedCredits: pricing.credits,
          promotionName: pricing.promotion?.active ? pricing.promotion.name : '',
          promotionPayPercent: pricing.promotion?.active ? pricing.promotion.payPercent : 100,
          promotionUpdatedAt: pricing.promotion?.active ? pricing.promotion.updatedAt : null
        }
      }));
    }
  } catch (error) {
    reservations.forEach((reservation) => releaseCreditReservation(reservation.reservationId, 'BATCH_RESERVATION_FAILED'));
    if (['CREDITS_REQUIRED', 'GROUP_BUDGET_REQUIRED', 'GROUP_BALANCE_REQUIRED'].includes(error?.code)) {
      return json(res, 402, { ok: false, error: error.code, user: getUserProfile(auth.user.id) });
    }
    if (error?.code === 'GROUP_ACCESS_SUSPENDED') {
      return json(res, 403, { ok: false, error: error.code, user: getUserProfile(auth.user.id) });
    }
    if (error?.code === 'BILLING_REQUEST_DUPLICATE') {
      return json(res, 409, { ok: false, error: error.code, user: getUserProfile(auth.user.id) });
    }
    console.warn('Failed to reserve batch credits', {
      userId: auth.user.id,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 500, { ok: false, error: 'GENERATION_FAILED', user: getUserProfile(auth.user.id) });
  }

  const jobs = [];
  try {
    for (const reservation of reservations) {
      const generationId = createGeneration({
        userId: auth.user.id,
        reservationId: reservation.reservationId,
        caseId,
        prompt,
        model: providerConfig.model,
        size,
        quality,
        provider: providerConfig.name
      });
      try {
        recordPromptAuditLog({
          userId: auth.user.id,
          userEmail: auth.user.email || auth.profile?.email || '',
          generationId,
          clientTaskId,
          taskMode,
          sourceName: taskMode === 'batch-repair' ? String(body.sourceName || '') : '',
          userPrompt: prompt,
          effectivePrompt: providerPrompt,
          providerId: providerConfig.id,
          providerName: providerConfig.name,
          model: providerConfig.model,
          size,
          quality,
          referenceCount: references.length
        });
      } catch (auditError) {
        console.warn('Failed to record prompt audit log', {
          userId: auth.user.id,
          generationId,
          message: String(auditError?.message || 'unknown').slice(0, 200)
        });
      }
      jobs.push({ reservationId: reservation.reservationId, generationId, creditAmount: reservation.creditAmount });
    }
  } catch (error) {
    jobs.forEach((job) => updateGeneration(job.generationId, {
      status: 'failed',
      error_code: 'GENERATION_RECORD_FAILED',
      completed_at: new Date().toISOString()
    }));
    reservations.forEach((reservation) => releaseCreditReservation(reservation.reservationId, 'GENERATION_RECORD_FAILED'));
    console.warn('Failed to create batch generation records', {
      userId: auth.user.id,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 500, { ok: false, error: 'GENERATION_FAILED', user: getUserProfile(auth.user.id) });
  }

  const results = await Promise.all(jobs.map((job) => runGenerationJob({
    job,
    userId: auth.user.id,
    prompt,
    providerPrompt,
    referenceImages,
    size,
    quality,
    providerConfig,
    signal: requestController.signal
  })));
  const images = results.filter((result) => result.ok).map(({ cause, ok, ...result }) => result);
  const failures = results.filter((result) => !result.ok);
  const user = getUserProfile(auth.user.id);

  if (!images.length) {
    const firstFailure = failures[0];
    const errorCode = firstFailure?.error || 'GENERATION_FAILED';
    return json(res, generationErrorStatus(errorCode), {
      ok: false,
      error: errorCode,
      providerName: firstFailure?.providerName || providerConfig.name,
      providerModel: firstFailure?.providerModel || providerConfig.model,
      user
    });
  }

  const first = images[0];
  const creditsCharged = images.reduce((total, image) => total + Number(image.creditsCharged || 0), 0);
  return json(res, 200, {
    ok: true,
    ...first,
    images,
    requestedCount: count,
    completedCount: images.length,
    failedCount: failures.length,
    partial: failures.length > 0,
    errors: [...new Set(failures.map((failure) => failure.error))],
    referencesUsed: references.length,
    unitCredits: pricing.credits,
    creditsCharged,
    pricing: {
      bandId: pricing.bandId,
      pricingStrategy: pricing.pricingStrategy,
      pricingVersion: pricing.pricingVersion,
      providerId: providerConfig.id,
      providerName: providerConfig.name,
      model: providerConfig.model,
      billedQuality: pricing.billedQuality,
      retailRmb: pricing.retailRmb,
      estimatedActualCostRmb: pricing.estimatedActualCostRmb,
      estimatedListCostRmb: pricing.estimatedListCostRmb,
      originalCredits: pricing.originalCredits,
      credits: pricing.credits,
      discountApplied: pricing.discountApplied,
      promotion: pricing.promotion
    },
    user
  });
}
