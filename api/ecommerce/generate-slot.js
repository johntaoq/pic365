import { randomUUID } from 'node:crypto';
import {
  completeCreditReservation,
  createGeneration,
  getEcommerceProject,
  getEcommerceProjectAsset,
  getGeneration,
  getUserProfile,
  listEcommerceProjectAssets,
  releaseCreditReservation,
  reserveCredit,
  updateGeneration
} from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { buildEcommerceSlotPrompt, selectEcommerceAssetsForSlot } from '../_lib/ecommerce-prompt.js';
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
import { editImage, isContentModerationError, isProviderConfigured } from '../_lib/provider.js';
import { readJsonBody } from '../_lib/request.js';
import { deleteStoredFile, persistImage, readStoredImage } from '../_lib/storage.js';
import { getEcommercePlatform } from '../../shared/ecommerce-catalog.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function generationPayload(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    slotId: row.slot_id,
    versionNumber: Number(row.version_number || 1),
    status: row.status,
    size: row.size,
    quality: row.quality,
    errorCode: row.error_code || '',
    prompt: row.prompt || '',
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
      baseGenerationId: body.baseGenerationId
    }]);
  }
  if (task.projectId !== projectId || task.slotId !== slotId) {
    return json(res, 400, { ok: false, error: 'INVALID_TASK_REQUEST', taskId });
  }
  taskId = task.id;
  task = claimEcommerceGenerationTask(auth.user.id, taskId);
  if (!task) return json(res, 409, { ok: false, error: 'TASK_NOT_RUNNABLE', taskId });
  if (!isProviderConfigured()) {
    const failedTask = completeEcommerceGenerationTask(auth.user.id, taskId, {
      status: 'failed',
      errorCode: 'SERVER_NOT_CONFIGURED'
    });
    return json(res, 500, { ok: false, error: 'SERVER_NOT_CONFIGURED', taskId, task: failedTask });
  }

  const revisionRequest = cleanText(task.request?.adjustment || body.adjustment, 1200);
  const baseGenerationId = cleanText(task.request?.baseGenerationId || body.baseGenerationId, 80);
  const quality = task.quality === 'low' ? 'low' : 'medium';
  const taskController = registerGenerationTask(auth.user.id, taskId);

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

    const assets = selectEcommerceAssetsForSlot({
      project,
      platform,
      slot,
      assets: listEcommerceProjectAssets(auth.user.id, projectId),
      limit: 6
    });
    const images = [];
    try {
      if (baseGenerationId) {
        const baseGeneration = getGeneration(auth.user.id, baseGenerationId);
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

    const currentOutput = getEcommerceProjectOutput(auth.user.id, projectId, slotId);
    const consistencyIssues = baseGenerationId && currentOutput?.selectedGenerationId === baseGenerationId
      ? currentOutput.consistencyIssues || []
      : [];
    const prompt = buildEcommerceSlotPrompt({
      project,
      platform,
      slot,
      assets,
      revisionRequest,
      hasBaseImage: Boolean(baseGenerationId),
      consistencyIssues
    });
    const size = ['1024x1024', '1024x1536', '1536x1024'].includes(slot.recommendedSize)
      ? slot.recommendedSize
      : slot.aspectRatio === '1:1'
        ? '1024x1024'
        : slot.aspectRatio === '16:9' || slot.aspectRatio === '4:3'
          ? '1536x1024'
          : '1024x1536';

    let reservation;
    try {
      throwIfGenerationCancelled(taskController.signal);
      reservation = reserveCredit(auth.user.id, { prompt });
    } catch (error) {
      const cancelled = isGenerationCancellation(error, taskController.signal);
      const errorCode = cancelled ? 'GENERATION_CANCELLED' : error?.code === 'CREDITS_REQUIRED' ? 'CREDITS_REQUIRED' : 'GENERATION_FAILED';
      failTask(errorCode, cancelled ? 'cancelled' : 'failed');
      if (cancelled) return json(res, 409, { ok: false, error: errorCode, taskId, user: getUserProfile(auth.user.id) });
      if (errorCode === 'CREDITS_REQUIRED') return json(res, 402, { ok: false, error: errorCode, taskId });
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
        model: process.env.AI_IMAGE_MODEL || 'gpt-image-2',
        size,
        quality,
        provider: process.env.AI_PROVIDER || 'unikeyx'
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
        inputFidelity: 'high',
        signal: taskController.signal
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
        generation: generationPayload(getGeneration(auth.user.id, generationId)),
        user: getUserProfile(auth.user.id)
      });
    } catch (error) {
      const cancelled = isGenerationCancellation(error, taskController.signal);
      const moderationBlocked = isContentModerationError(error);
      const errorCode = cancelled
        ? 'GENERATION_CANCELLED'
        : moderationBlocked
          ? 'CONTENT_MODERATION_BLOCKED'
          : error?.status === 429
            ? 'UPSTREAM_BUSY'
            : 'GENERATION_FAILED';
      updateGeneration(generationId, {
        status: cancelled ? 'cancelled' : 'failed',
        provider_request_id: error?.providerRequestId || null,
        error_code: errorCode,
        completed_at: new Date().toISOString()
      });
      releaseCreditReservation(reservation.reservationId, errorCode);
      const completedTask = completeEcommerceGenerationTask(auth.user.id, taskId, {
        status: cancelled ? 'cancelled' : 'failed',
        generationId,
        errorCode
      });
      return json(res, cancelled ? 409 : moderationBlocked ? 422 : error?.status === 429 ? 503 : 502, {
        ok: false,
        error: errorCode,
        taskId,
        task: completedTask,
        generation: generationPayload(getGeneration(auth.user.id, generationId)),
        user: getUserProfile(auth.user.id)
      });
    }
  } finally {
    unregisterGenerationTask(auth.user.id, taskId);
  }
}
