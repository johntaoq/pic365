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
import { buildEcommerceSlotPrompt } from '../_lib/ecommerce-prompt.js';
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
    imageUrl: row.status === 'succeeded' && row.storage_path
      ? `/api/generated?id=${encodeURIComponent(row.id)}`
      : '',
    createdAt: row.created_at || '',
    completedAt: row.completed_at || ''
  };
}

function sortAssets(project, assets) {
  const priority = { product: 1, packaging: 2, logo: 3, reference: 4 };
  return [...assets].sort((left, right) => {
    if (left.id === project.masterAssetId) return -1;
    if (right.id === project.masterAssetId) return 1;
    return (priority[left.assetType] || 9) - (priority[right.assetType] || 9);
  }).slice(0, 6);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  if (!isProviderConfigured()) return json(res, 500, { ok: false, error: 'SERVER_NOT_CONFIGURED' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_GENERATION_REQUEST' });
  }

  const taskId = cleanText(body.taskId, 120) || randomUUID();
  const taskController = registerGenerationTask(auth.user.id, taskId);
  try {
  const projectId = cleanText(body.projectId, 80);
  const slotId = cleanText(body.slotId, 80);
  const project = getEcommerceProject(auth.user.id, projectId);
  if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  const platform = getEcommercePlatform(project.platformId);
  const slot = platform.slots.find((item) => item.id === slotId);
  if (!slot || !project.selectedSlots.includes(slotId)) {
    return json(res, 400, { ok: false, error: 'INVALID_PROJECT_SLOT' });
  }
  if (!project.masterAssetId) return json(res, 400, { ok: false, error: 'MASTER_ASSET_REQUIRED' });
  if (!getEcommerceProjectAsset(auth.user.id, project.masterAssetId)) {
    return json(res, 400, { ok: false, error: 'MASTER_ASSET_REQUIRED' });
  }

  const assets = sortAssets(project, listEcommerceProjectAssets(auth.user.id, projectId));
  const images = [];
  try {
    for (const asset of assets) {
      throwIfGenerationCancelled(taskController.signal);
      const stored = await readStoredImage(asset.storagePath);
      images.push(`data:${stored.contentType};base64,${stored.bytes.toString('base64')}`);
    }
  } catch (error) {
    if (isGenerationCancellation(error, taskController.signal)) {
      return json(res, 409, { ok: false, error: 'GENERATION_CANCELLED', taskId, user: getUserProfile(auth.user.id) });
    }
    return json(res, 400, { ok: false, error: 'PROJECT_ASSET_UNAVAILABLE' });
  }
  if (!images.length) return json(res, 400, { ok: false, error: 'MASTER_ASSET_REQUIRED' });

  const prompt = buildEcommerceSlotPrompt({ project, platform, slot, assets });
  const size = ['1024x1024', '1024x1536', '1536x1024'].includes(slot.recommendedSize)
    ? slot.recommendedSize
    : slot.aspectRatio === '1:1' ? '1024x1024' : slot.aspectRatio === '16:9' || slot.aspectRatio === '4:3' ? '1536x1024' : '1024x1536';
  const quality = body.quality === 'low' ? 'low' : 'medium';

  let reservation;
  try {
    throwIfGenerationCancelled(taskController.signal);
    reservation = reserveCredit(auth.user.id, { prompt });
  } catch (error) {
    if (isGenerationCancellation(error, taskController.signal)) {
      return json(res, 409, { ok: false, error: 'GENERATION_CANCELLED', taskId, user: getUserProfile(auth.user.id) });
    }
    if (error?.code === 'CREDITS_REQUIRED') return json(res, 402, { ok: false, error: 'CREDITS_REQUIRED' });
    return json(res, 500, { ok: false, error: 'GENERATION_FAILED' });
  }

  if (taskController.signal.aborted) {
    releaseCreditReservation(reservation.reservationId, 'GENERATION_CANCELLED');
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
    return json(res, 500, { ok: false, error: 'GENERATION_FAILED' });
  }

  try {
    throwIfGenerationCancelled(taskController.signal);
    const providerResult = await editImage({ prompt, images, size, quality, signal: taskController.signal });
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
    return json(res, 200, {
      ok: true,
      taskId,
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
    return json(res, cancelled ? 409 : moderationBlocked ? 422 : error?.status === 429 ? 503 : 502, {
      ok: false,
      error: errorCode,
      taskId,
      generation: generationPayload(getGeneration(auth.user.id, generationId)),
      user: getUserProfile(auth.user.id)
    });
  }
  } finally {
    unregisterGenerationTask(auth.user.id, taskId);
  }
}
