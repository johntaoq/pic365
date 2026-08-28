import { randomUUID } from 'node:crypto';
import {
  completeCreditReservation,
  createGeneration,
  getEcommerceProject,
  getEcommerceProjectAsset,
  getGeneration,
  getImagePromotionConfig,
  getImageProviderConfig,
  getUserProfile,
  listEcommerceProjectAssets,
  releaseCreditReservation,
  recordGenerationFailureAlert,
  reserveCredit,
  updateGeneration
} from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { buildEcommerceSlotPrompt, selectEcommerceAssetsForSlot } from '../_lib/ecommerce-prompt.js';
import { getEcommerceGenerationSystemPromptSettings } from '../_lib/ecommerce-generation-settings.js';
import {
  claimEcommerceGenerationTask,
  completeEcommerceGenerationTask,
  createEcommerceGenerationTasks,
  getActiveEcommerceGenerationTask,
  getEcommerceGenerationTask,
  getEcommerceProjectOutput,
  selectEcommerceOutputGeneration
} from '../_lib/ecommerce-p1-db.js';
import {
  isGenerationCancellation,
  registerGenerationTask,
  throwIfGenerationCancelled,
  unregisterGenerationTask
} from '../_lib/ecommerce-generation-runtime.js';
import { classifyImageProviderError, editImage } from '../_lib/provider.js';
import { readJsonBody } from '../_lib/request.js';
import { deleteStoredFile, persistImage, readStoredImage } from '../_lib/storage.js';
import { getEcommercePlatform } from '../../shared/ecommerce-catalog.js';
import { validateImageReferenceInputsForModel } from '../../shared/image-generation.js';
import {
  applyImagePromotion,
  getImageGenerationPricing,
  resolveEcommerceRefinementSize,
  resolveEcommerceSlotGenerationSize
} from '../../shared/image-pricing.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

const REFINEMENT_AREAS = new Set(['auto', 'subject', 'background', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);
const REFINEMENT_ROLES = new Set(['detail', 'composition', 'lighting', 'scene']);

function generationPayload(row, { includePrompt = false } = {}) {
  return {
    id: row.id,
    projectId: row.project_id,
    slotId: row.slot_id,
    versionNumber: Number(row.version_number || 1),
    status: row.status,
    size: row.size,
    quality: row.quality,
    errorCode: row.error_code || '',
    prompt: includePrompt ? row.prompt || '' : '',
    promptHidden: !includePrompt,
    imageUrl: row.status === 'succeeded' && row.storage_path
      ? `/api/generated?id=${encodeURIComponent(row.id)}`
      : '',
    createdAt: row.created_at || '',
    completedAt: row.completed_at || ''
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_GENERATION_REQUEST' });
  }

  const projectId = cleanText(body.projectId, 80);
  const slotId = cleanText(body.slotId, 80);
  const projectForTask = getEcommerceProject(auth.user.id, projectId);
  if (!projectForTask) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  const platformForTask = getEcommercePlatform(projectForTask.platformId);
  if (!platformForTask.slots.some((item) => item.id === slotId) || !projectForTask.selectedSlots.includes(slotId)) {
    return json(res, 400, { ok: false, error: 'INVALID_PROJECT_SLOT' });
  }
  if (getEcommerceProjectOutput(auth.user.id, projectId, slotId)?.locked) {
    return json(res, 409, { ok: false, error: 'SLOT_LOCKED' });
  }
  let taskId = cleanText(body.taskId, 120) || randomUUID();
  let task = getEcommerceGenerationTask(auth.user.id, taskId);
  if (!task) {
    if (getActiveEcommerceGenerationTask(auth.user.id, projectId, slotId)) {
      return json(res, 409, { ok: false, error: 'TASK_ALREADY_ACTIVE' });
    }
    [task] = createEcommerceGenerationTasks(auth.user.id, projectId, [{
      id: taskId,
      slotId,
      quality: body.quality,
      adjustment: body.adjustment,
      baseGenerationId: body.baseGenerationId,
      targetArea: body.targetArea,
      referenceInputs: body.referenceInputs
    }]);
  }
  if (task.projectId !== projectId || task.slotId !== slotId) {
    return json(res, 400, { ok: false, error: 'INVALID_TASK_REQUEST', taskId });
  }
  taskId = task.id;
  task = auth.internal && body.workerClaimed === true && task.status === 'running'
    ? task
    : claimEcommerceGenerationTask(auth.user.id, taskId);
  if (!task) return json(res, 409, { ok: false, error: 'TASK_NOT_RUNNABLE', taskId });
  const revisionRequest = cleanText(task.request?.adjustment || body.adjustment, 1200);
  const baseGenerationId = cleanText(task.request?.baseGenerationId || body.baseGenerationId, 80);
  const targetArea = REFINEMENT_AREAS.has(task.request?.targetArea || body.targetArea) ? (task.request?.targetArea || body.targetArea) : 'auto';
  const referenceInputs = (Array.isArray(task.request?.referenceInputs) ? task.request.referenceInputs : Array.isArray(body.referenceInputs) ? body.referenceInputs : [])
    .slice(0, 4)
    .map((input) => ({
      assetId: cleanText(input?.assetId, 80),
      role: REFINEMENT_ROLES.has(input?.role) ? input.role : 'detail'
    }))
    .filter((input, index, items) => input.assetId && items.findIndex((item) => item.assetId === input.assetId) === index);
  const quality = ['low', 'medium', 'high'].includes(task.quality) ? task.quality : 'low';
  const taskController = registerGenerationTask(auth.user.id, taskId);
  const cancellationWatcher = setInterval(() => {
    try {
      if (getEcommerceGenerationTask(auth.user.id, taskId)?.cancelRequested) {
        taskController.abort();
      }
    } catch {
      // The in-memory abort registry remains the primary path. The database
      // watcher is a cross-module/process fallback and can retry next tick.
    }
  }, 100);
  cancellationWatcher.unref?.();

  function failTask(errorCode, status = 'failed', generationId = null) {
    return completeEcommerceGenerationTask(auth.user.id, taskId, { status, generationId, errorCode });
  }

  try {
    const project = projectForTask;
    if (task.request?.projectUpdatedAt && task.request.projectUpdatedAt !== project.updatedAt) {
      const changedTask = failTask('PROJECT_CHANGED');
      return json(res, 409, { ok: false, error: 'PROJECT_CHANGED', taskId, task: changedTask });
    }
    const platform = getEcommercePlatform(project.platformId);
    const slot = platform.slots.find((item) => item.id === slotId);
    if (!slot || !project.selectedSlots.includes(slotId)) {
      failTask('INVALID_PROJECT_SLOT');
      return json(res, 400, { ok: false, error: 'INVALID_PROJECT_SLOT', taskId });
    }
    if (getEcommerceProjectOutput(auth.user.id, projectId, slotId)?.locked) {
      failTask('SLOT_LOCKED');
      return json(res, 409, { ok: false, error: 'SLOT_LOCKED', taskId });
    }
    const masterAsset = project.masterAssetId ? getEcommerceProjectAsset(auth.user.id, project.masterAssetId) : null;
    if (!masterAsset || masterAsset.assetType !== 'product') {
      failTask('MASTER_ASSET_REQUIRED');
      return json(res, 400, { ok: false, error: 'MASTER_ASSET_REQUIRED', taskId });
    }
    const providerConfig = getImageProviderConfig(project.imageProviderId);
    if (!providerConfig) {
      failTask('AI_PROVIDER_NOT_CONFIGURED');
      return json(res, 400, { ok: false, error: 'AI_PROVIDER_NOT_CONFIGURED', taskId });
    }

    const projectAssets = listEcommerceProjectAssets(auth.user.id, projectId);
    const uploadedReferenceCheck = validateImageReferenceInputsForModel({
      model: providerConfig.model,
      count: projectAssets.length,
      mimeTypes: projectAssets.map((asset) => asset.mimeType)
    });
    if (!uploadedReferenceCheck.valid) {
      failTask(uploadedReferenceCheck.error);
      return json(res, 400, { ok: false, error: uploadedReferenceCheck.error, taskId });
    }
    const assetById = new Map(projectAssets.map((asset) => [asset.id, asset]));
    const refinementAssets = referenceInputs.map((input) => assetById.get(input.assetId));
    if (refinementAssets.some((asset) => !asset)) {
      failTask('INVALID_REFINEMENT_ASSET');
      return json(res, 400, { ok: false, error: 'INVALID_REFINEMENT_ASSET', taskId });
    }
    const maximumAssetInputs = Math.max(1, 8 - (baseGenerationId ? 1 : 0));
    const standardAssets = selectEcommerceAssetsForSlot({
      project,
      platform,
      slot,
      assets: projectAssets,
      limit: Math.max(1, maximumAssetInputs - refinementAssets.length)
    });
    const assets = [...standardAssets, ...refinementAssets]
      .filter((asset, index, items) => items.findIndex((item) => item.id === asset.id) === index)
      .slice(0, maximumAssetInputs);
    const images = [];
    let baseGeneration = null;
    try {
      if (baseGenerationId) {
        baseGeneration = getGeneration(auth.user.id, baseGenerationId);
        if (
          !baseGeneration || baseGeneration.project_id !== projectId || baseGeneration.slot_id !== slotId ||
          baseGeneration.status !== 'succeeded' || baseGeneration.archived_at || !baseGeneration.storage_path
        ) {
          failTask('INVALID_BASE_VERSION');
          return json(res, 400, { ok: false, error: 'INVALID_BASE_VERSION', taskId });
        }
        const storedBase = await readStoredImage(baseGeneration.storage_path);
        images.push(`data:${storedBase.contentType};base64,${storedBase.bytes.toString('base64')}`);
      }
      for (const asset of assets) {
        throwIfGenerationCancelled(taskController.signal);
        const stored = await readStoredImage(asset.storagePath);
        images.push(`data:${stored.contentType};base64,${stored.bytes.toString('base64')}`);
      }
    } catch (error) {
      if (isGenerationCancellation(error, taskController.signal)) {
        failTask('GENERATION_CANCELLED', 'cancelled');
        return json(res, 409, { ok: false, error: 'GENERATION_CANCELLED', taskId, user: getUserProfile(auth.user.id) });
      }
      failTask('PROJECT_ASSET_UNAVAILABLE');
      return json(res, 400, { ok: false, error: 'PROJECT_ASSET_UNAVAILABLE', taskId });
    }
    if (!images.length) {
      failTask('MASTER_ASSET_REQUIRED');
      return json(res, 400, { ok: false, error: 'MASTER_ASSET_REQUIRED', taskId });
    }
    const actualReferenceCheck = validateImageReferenceInputsForModel({
      model: providerConfig.model,
      count: images.length,
      mimeTypes: images.map((image) => String(image).match(/^data:([^;,]+)/i)?.[1] || '')
    });
    if (!actualReferenceCheck.valid) {
      failTask(actualReferenceCheck.error);
      return json(res, 400, { ok: false, error: actualReferenceCheck.error, taskId });
    }

    const currentOutput = getEcommerceProjectOutput(auth.user.id, projectId, slotId);
    const consistencyIssues = baseGenerationId && currentOutput?.selectedGenerationId === baseGenerationId
      ? currentOutput.consistencyIssues || []
      : [];
    const prompt = buildEcommerceSlotPrompt({
      project,
      platform,
      slot,
      assets,
      systemPrompt: getEcommerceGenerationSystemPromptSettings().prompt,
      revisionRequest,
      targetArea,
      refinementInputs: referenceInputs,
      hasBaseImage: Boolean(baseGenerationId),
      consistencyIssues
    });
    const size = baseGenerationId
      ? resolveEcommerceRefinementSize(baseGeneration, slot)
      : resolveEcommerceSlotGenerationSize(slot);
    const pricing = applyImagePromotion(
      getImageGenerationPricing({ size, quality, model: providerConfig.model }, providerConfig.pricingConfig),
      getImagePromotionConfig()
    );

    let reservation;
    try {
      throwIfGenerationCancelled(taskController.signal);
      reservation = reserveCredit(auth.user.id, {
        prompt,
        amount: pricing.credits,
        requestKey: `ecommerce:${taskId}`,
        metadata: {
          projectId,
          slotId,
          size,
          quality,
          pricingBand: pricing.bandId,
          pricingStrategy: pricing.pricingStrategy,
          pricingVersion: pricing.pricingVersion,
          providerId: providerConfig.id,
          providerName: providerConfig.name,
          model: providerConfig.model,
          estimatedCostRmb: pricing.estimatedCostRmb,
          estimatedListCostRmb: pricing.estimatedListCostRmb,
          retailRmb: pricing.retailRmb,
          originalCredits: pricing.originalCredits,
          chargedCredits: pricing.credits,
          promotionName: pricing.promotion?.active ? pricing.promotion.name : '',
          promotionPayPercent: pricing.promotion?.active ? pricing.promotion.payPercent : 100,
          promotionUpdatedAt: pricing.promotion?.active ? pricing.promotion.updatedAt : null
        }
      });
    } catch (error) {
      const cancelled = isGenerationCancellation(error, taskController.signal);
      const billingErrors = new Set(['CREDITS_REQUIRED', 'GROUP_BUDGET_REQUIRED', 'GROUP_BALANCE_REQUIRED']);
      const errorCode = cancelled ? 'GENERATION_CANCELLED' : billingErrors.has(error?.code) ? error.code : error?.code === 'GROUP_ACCESS_SUSPENDED' ? error.code : 'GENERATION_FAILED';
      failTask(errorCode, cancelled ? 'cancelled' : 'failed');
      if (cancelled) return json(res, 409, { ok: false, error: errorCode, taskId, user: getUserProfile(auth.user.id) });
      if (billingErrors.has(errorCode)) return json(res, 402, { ok: false, error: errorCode, taskId, user: getUserProfile(auth.user.id) });
      if (errorCode === 'GROUP_ACCESS_SUSPENDED') return json(res, 403, { ok: false, error: errorCode, taskId, user: getUserProfile(auth.user.id) });
      if (error?.code === 'BILLING_REQUEST_DUPLICATE') return json(res, 409, { ok: false, error: error.code, taskId, user: getUserProfile(auth.user.id) });
      return json(res, 500, { ok: false, error: errorCode, taskId });
    }

    if (taskController.signal.aborted) {
      releaseCreditReservation(reservation.reservationId, 'GENERATION_CANCELLED');
      failTask('GENERATION_CANCELLED', 'cancelled');
      return json(res, 409, { ok: false, error: 'GENERATION_CANCELLED', taskId, user: getUserProfile(auth.user.id) });
    }

    let generationId;
    try {
      generationId = createGeneration({
        userId: auth.user.id,
        reservationId: reservation.reservationId,
        caseId: null,
        projectId,
        slotId,
        prompt,
        model: providerConfig.model,
        size,
        quality,
        provider: providerConfig.name
      });
    } catch {
      releaseCreditReservation(reservation.reservationId, 'GENERATION_RECORD_FAILED');
      failTask('GENERATION_RECORD_FAILED');
      return json(res, 500, { ok: false, error: 'GENERATION_FAILED', taskId });
    }

    try {
      throwIfGenerationCancelled(taskController.signal);
      const providerResult = await editImage({
        prompt,
        images,
        size,
        quality,
        signal: taskController.signal,
        providerConfig
      });
      throwIfGenerationCancelled(taskController.signal);
      const storedImage = await persistImage({ userId: auth.user.id, generationId, image: providerResult.image });
      if (taskController.signal.aborted) {
        await deleteStoredFile(storedImage.storagePath).catch(() => undefined);
        throwIfGenerationCancelled(taskController.signal);
      }
      updateGeneration(generationId, {
        status: 'succeeded',
        provider_request_id: providerResult.providerRequestId,
        storage_path: storedImage.storagePath,
        output_url: storedImage.url,
        file_size: storedImage.byteLength,
        mime_type: storedImage.contentType,
        completed_at: new Date().toISOString()
      });
      completeCreditReservation(reservation.reservationId);
      const output = selectEcommerceOutputGeneration(auth.user.id, projectId, slotId, generationId);
      const completedTask = completeEcommerceGenerationTask(auth.user.id, taskId, {
        status: 'succeeded',
        generationId
      });
      return json(res, 200, {
        ok: true,
        taskId,
        task: completedTask,
        output,
        generation: generationPayload(getGeneration(auth.user.id, generationId), { includePrompt: Boolean(auth.user.isSuperAdmin) }),
        creditsCharged: reservation.creditAmount,
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
        user: getUserProfile(auth.user.id)
      });
    } catch (error) {
      const cancelled = isGenerationCancellation(error, taskController.signal);
      const errorCode = cancelled ? 'GENERATION_CANCELLED' : classifyImageProviderError(error);
      const moderationBlocked = errorCode === 'CONTENT_MODERATION_BLOCKED';
      updateGeneration(generationId, {
        status: cancelled ? 'cancelled' : 'failed',
        provider_request_id: error?.providerRequestId || null,
        error_code: errorCode,
        completed_at: new Date().toISOString()
      });
      releaseCreditReservation(reservation.reservationId, errorCode);
      recordGenerationFailureAlert({
        userId: auth.user.id,
        generationId,
        providerName: providerConfig.name,
        providerModel: providerConfig.model,
        errorCode
      });
      const completedTask = completeEcommerceGenerationTask(auth.user.id, taskId, {
        status: cancelled ? 'cancelled' : 'failed',
        generationId,
        errorCode
      });
      return json(res, cancelled ? 409 : moderationBlocked ? 422 : ['UPSTREAM_BUSY', 'IMAGE_PROVIDER_UNAVAILABLE', 'IMAGE_PROVIDER_TIMEOUT'].includes(errorCode) ? 503 : errorCode === 'IMAGE_PROVIDER_BALANCE_ERROR' ? 402 : 502, {
        ok: false,
        error: errorCode,
        providerName: providerConfig.name,
        providerModel: providerConfig.model,
        taskId,
        task: completedTask,
        generation: generationPayload(getGeneration(auth.user.id, generationId), { includePrompt: Boolean(auth.user.isSuperAdmin) }),
        user: getUserProfile(auth.user.id)
      });
    }
  } finally {
    clearInterval(cancellationWatcher);
    unregisterGenerationTask(auth.user.id, taskId);
  }
}
