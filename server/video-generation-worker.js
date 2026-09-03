import { randomUUID } from 'node:crypto';

import { createUploadedAsset, getVariantRecord } from '../api/_lib/media-assets.js';
import { getDb } from '../api/_lib/local-db.js';
import { readStoredFile } from '../api/_lib/storage.js';
import {
  cancelVideoProviderTask,
  classifyVideoProviderError,
  createVideoProviderTask,
  downloadVideoProviderResult,
  prepareVideoReference,
  retrieveVideoProviderTask
} from '../api/_lib/video-provider.js';
import { getVideoProviderConfig } from '../api/_lib/video-provider-config.js';
import {
  claimVideoTasks,
  completeVideoTask,
  failVideoTask,
  interruptVideoTask,
  isVideoTaskCancellationRequested,
  updateVideoTaskProgress
} from '../api/_lib/video-generation-queue.js';
import { startMediaProcessingWorker } from './media-processing-worker.js';
import { buildVideoGenerationPrompt } from '../shared/video-prompt.js';

const WORKER_KEY = Symbol.for('pic365.video-generation-worker');
const POLL_INTERVAL_MS = 1_000;
const PROVIDER_POLL_INTERVAL_MS = 5_000;
const DEFAULT_GLOBAL_CONCURRENCY = 2;
const MAX_PROVIDER_POLLS = 360;

function workerState() {
  if (!globalThis[WORKER_KEY]) {
    globalThis[WORKER_KEY] = { active: new Map(), timer: null, ticking: false, stopped: false };
  }
  return globalThis[WORKER_KEY];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sourceReference(task) {
  let stored = null;
  let mimeType = 'image/png';
  if (task.sourceAssetId) {
    const record = getVariantRecord(task.userId, task.sourceAssetId, 'original');
    if (!record?.variant?.storagePath || record.asset?.mediaType !== 'image') {
      throw Object.assign(new Error('VIDEO_SOURCE_NOT_FOUND'), { code: 'VIDEO_SOURCE_NOT_FOUND' });
    }
    stored = await readStoredFile(record.variant.storagePath);
    mimeType = record.variant.mimeType || record.asset.mimeType || stored.contentType;
  } else if (task.sourceGenerationId) {
    const generation = getDb().prepare(`
      SELECT storage_path, mime_type FROM generations
      WHERE id = ? AND user_id = ? AND status = 'succeeded'
    `).get(task.sourceGenerationId, task.userId);
    if (!generation?.storage_path) throw Object.assign(new Error('VIDEO_SOURCE_NOT_FOUND'), { code: 'VIDEO_SOURCE_NOT_FOUND' });
    stored = await readStoredFile(generation.storage_path);
    mimeType = generation.mime_type || stored.contentType;
  }
  if (!stored?.bytes?.length) return null;
  return prepareVideoReference(stored.bytes, mimeType, task.size);
}

function providerTerminalStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (['completed', 'succeeded', 'success'].includes(status)) return 'completed';
  if (['failed', 'error', 'rejected'].includes(status)) return 'failed';
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
  return 'running';
}

function validateVideoBytes(bytes) {
  if (!bytes?.length || bytes.length < 16) throw Object.assign(new Error('VIDEO_FILE_INVALID'), { code: 'VIDEO_FILE_INVALID' });
  const signature = bytes.subarray(4, 8).toString('ascii');
  if (signature !== 'ftyp') throw Object.assign(new Error('VIDEO_FILE_INVALID'), { code: 'VIDEO_FILE_INVALID' });
  return 'video/mp4';
}

async function saveCompletedVideo(task, provider, providerTaskId) {
  updateVideoTaskProgress(task.userId, task.id, { phase: 'saving', progress: 99 });
  const downloaded = await downloadVideoProviderResult({ provider, providerTaskId });
  const mimeType = validateVideoBytes(downloaded.bytes);
  const videoGenerationId = randomUUID();
  const asset = await createUploadedAsset(task.userId, {
    bytes: downloaded.bytes,
    mimeType,
    fileName: `Pic365-${videoGenerationId}.mp4`,
    sourceType: 'generated',
    metadata: {
      generatedBy: 'video',
      videoGenerationId,
      videoTaskId: task.id,
      providerId: provider.id,
      providerName: provider.name,
      providerModel: provider.model,
      providerTaskId,
      projectId: task.projectId,
      sourceAssetId: task.sourceAssetId || undefined,
      sourceGenerationId: task.sourceGenerationId || undefined,
      seconds: task.seconds,
      mode: task.mode,
      size: task.size,
      nativeAudio: 'unknown'
    }
  });
  startMediaProcessingWorker();
  return completeVideoTask(task.userId, task.id, {
    videoGenerationId,
    assetId: asset.id,
    videoUrl: `/api/assets/file?id=${encodeURIComponent(asset.id)}&variant=preview`,
    originalUrl: `/api/assets/file?id=${encodeURIComponent(asset.id)}&variant=original`,
    downloadUrl: `/api/assets/file?id=${encodeURIComponent(asset.id)}&variant=original&download=1`,
    posterUrl: `/api/assets/file?id=${encodeURIComponent(asset.id)}&variant=poster`,
    mimeType,
    providerName: provider.name,
    model: provider.model,
    providerTaskId,
    hasAudio: null
  });
}

async function executeTask(task) {
  const provider = getVideoProviderConfig(task.providerId, { userId: task.userId });
  if (!provider?.apiKey || !provider?.baseUrl) return failVideoTask(task.userId, task.id, 'VIDEO_PROVIDER_NOT_CONFIGURED');
  let providerTaskId = task.providerTaskId || '';
  try {
    if (isVideoTaskCancellationRequested(task.userId, task.id)) return failVideoTask(task.userId, task.id, 'VIDEO_GENERATION_CANCELLED');
    if (!providerTaskId) {
      const reference = await sourceReference(task);
      const created = await createVideoProviderTask({
        provider,
        prompt: buildVideoGenerationPrompt(task.prompt, { hasReference: Boolean(reference) }),
        seconds: task.seconds,
        size: task.size,
        mode: task.mode,
        reference
      });
      providerTaskId = created.id;
      updateVideoTaskProgress(task.userId, task.id, {
        providerTaskId,
        phase: 'processing',
        progress: Math.max(1, created.progress || 1)
      });
      if (providerTerminalStatus(created.status) === 'completed') return saveCompletedVideo(task, provider, providerTaskId);
    }

    for (let poll = 0; poll < MAX_PROVIDER_POLLS; poll += 1) {
      if (isVideoTaskCancellationRequested(task.userId, task.id)) {
        try {
          const cancelled = await cancelVideoProviderTask({ provider, providerTaskId });
          if (cancelled) return failVideoTask(task.userId, task.id, 'VIDEO_GENERATION_CANCELLED');
          updateVideoTaskProgress(task.userId, task.id, { phase: 'cancelling' });
        } catch {
          updateVideoTaskProgress(task.userId, task.id, { phase: 'cancelling' });
        }
      }
      const state = await retrieveVideoProviderTask({ provider, providerTaskId });
      const terminal = providerTerminalStatus(state.status);
      updateVideoTaskProgress(task.userId, task.id, {
        phase: terminal === 'running' ? 'processing' : terminal,
        progress: terminal === 'completed' ? 98 : Math.max(1, Math.min(97, state.progress || 1))
      });
      if (terminal === 'completed') return saveCompletedVideo(task, provider, providerTaskId);
      if (terminal === 'cancelled') return failVideoTask(task.userId, task.id, 'VIDEO_GENERATION_CANCELLED');
      if (terminal === 'failed') {
        const providerFailure = new Error(state.error?.message || state.error || 'VIDEO_GENERATION_FAILED');
        providerFailure.providerCode = state.error?.code || '';
        return failVideoTask(task.userId, task.id, classifyVideoProviderError(providerFailure));
      }
      await wait(PROVIDER_POLL_INTERVAL_MS);
    }
    return interruptVideoTask(task.userId, task.id, 'VIDEO_PROVIDER_TIMEOUT');
  } catch (error) {
    const code = error?.code || classifyVideoProviderError(error);
    if (code === 'VIDEO_PROVIDER_TIMEOUT' && providerTaskId) return interruptVideoTask(task.userId, task.id, code);
    return failVideoTask(task.userId, task.id, code);
  }
}

async function tick() {
  const state = workerState();
  if (state.stopped || state.ticking) return;
  state.ticking = true;
  try {
    const configured = Math.max(1, Math.min(20, Number(process.env.VIDEO_GENERATION_WORKER_CONCURRENCY) || DEFAULT_GLOBAL_CONCURRENCY));
    const available = Math.max(0, configured - state.active.size);
    if (!available) return;
    const tasks = claimVideoTasks(available);
    for (const task of tasks) {
      const promise = executeTask(task)
        .catch((error) => console.error('[video-generation-worker] task failed', task.id, String(error?.message || error).slice(0, 240)))
        .finally(() => state.active.delete(task.id));
      state.active.set(task.id, promise);
    }
  } finally {
    state.ticking = false;
  }
}

export function startVideoGenerationWorker() {
  const state = workerState();
  state.stopped = false;
  if (!state.timer) {
    state.timer = setInterval(tick, POLL_INTERVAL_MS);
    state.timer.unref?.();
  }
  void tick();
  return state;
}

export async function stopVideoGenerationWorker() {
  const state = workerState();
  state.stopped = true;
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  await Promise.allSettled([...state.active.values()]);
  state.active.clear();
}

export function getVideoGenerationWorkerStatus() {
  const state = workerState();
  return { running: Boolean(state.timer && !state.stopped), active: state.active.size };
}
