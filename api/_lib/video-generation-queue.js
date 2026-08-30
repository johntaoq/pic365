import { randomUUID } from 'node:crypto';

import { getVideoGenerationPricing } from '../../shared/video-pricing.js';
import { normalizeVideoDuration, normalizeVideoSize } from '../../shared/video-generation.js';
import {
  getDb,
  releaseCreditReservation,
  reserveCreditCenti,
  settleCreditReservation
} from './local-db.js';
import { getAccessibleAsset } from './media-assets.js';
import { getVideoProviderConfig } from './video-provider-config.js';

export const MAX_VIDEO_TASKS = 30;
export const MAX_ACTIVE_VIDEO_TASKS = 3;
export const VIDEO_CONCURRENCY_PER_USER = 1;
const ACTIVE_STATUSES = new Set(['queued', 'running', 'cancelling', 'interrupted']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function now() {
  return new Date().toISOString();
}

function clean(value, length = 6000) {
  return String(value || '').trim().slice(0, length);
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function ensureOwnedSource(userId, { sourceAssetId = '', sourceGenerationId = '' } = {}) {
  const db = getDb();
  if (sourceAssetId && !getAccessibleAsset(userId, sourceAssetId, { includeDeleted: false })) {
    throw Object.assign(new Error('VIDEO_SOURCE_NOT_FOUND'), { code: 'VIDEO_SOURCE_NOT_FOUND' });
  }
  if (sourceGenerationId) {
    const generation = db.prepare(`
      SELECT id FROM generations
      WHERE id = ? AND user_id = ? AND status = 'succeeded' AND storage_path IS NOT NULL
    `).get(sourceGenerationId, userId);
    if (!generation) throw Object.assign(new Error('VIDEO_SOURCE_NOT_FOUND'), { code: 'VIDEO_SOURCE_NOT_FOUND' });
  }
}

function normalizeResult(row) {
  const result = parseJson(row.result_json, {});
  if (!result.assetId) return null;
  return {
    id: result.videoGenerationId || `video-${row.id}`,
    videoGenerationId: result.videoGenerationId || '',
    assetId: result.assetId,
    videoUrl: result.videoUrl || `/api/assets/file?id=${encodeURIComponent(result.assetId)}&variant=preview`,
    originalUrl: result.originalUrl || `/api/assets/file?id=${encodeURIComponent(result.assetId)}&variant=original`,
    downloadUrl: result.downloadUrl || `/api/assets/file?id=${encodeURIComponent(result.assetId)}&variant=original&download=1`,
    posterUrl: result.posterUrl || `/api/assets/file?id=${encodeURIComponent(result.assetId)}&variant=poster`,
    mimeType: result.mimeType || 'video/mp4',
    seconds: Number(result.seconds || row.seconds || 0),
    size: result.size || row.size,
    hasAudio: result.hasAudio == null ? null : Boolean(result.hasAudio),
    creditsCharged: Number(result.creditsCharged || Number(row.settled_credits_centi || 0) / 100),
    createdAt: row.completed_at || row.created_at
  };
}

export function normalizeVideoTask(row, { includeRequest = false } = {}) {
  if (!row) return null;
  const request = parseJson(row.request_json, {});
  const result = normalizeResult(row);
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id || '',
    canvasParentNodeId: row.canvas_parent_node_id || '',
    canvasTaskNodeId: row.canvas_task_node_id || '',
    providerId: row.provider_id || '',
    status: row.status,
    phase: row.phase || row.status,
    progress: Number(row.progress || 0),
    prompt: row.prompt || '',
    displayPrompt: clean(request.displayPrompt || row.prompt, 6000),
    seconds: Number(row.seconds || 4),
    size: row.size || '1280x720',
    sourceAssetId: row.source_asset_id || '',
    sourceGenerationId: row.source_generation_id || '',
    sourceWidth: Number(request.sourceWidth || 0),
    sourceHeight: Number(request.sourceHeight || 0),
    providerTaskCreated: Boolean(row.provider_task_id),
    quotedCredits: Number(row.quoted_credits_centi || 0) / 100,
    settledCredits: Number(row.settled_credits_centi || 0) / 100,
    result,
    error: row.error_code || '',
    cancelRequested: Boolean(row.cancel_requested),
    attempts: Number(row.attempts || 0),
    createdAt: row.created_at || '',
    startedAt: row.started_at || '',
    completedAt: row.completed_at || '',
    ...(includeRequest ? { request, providerTaskId: row.provider_task_id || '', reservationId: row.reservation_id || '' } : {})
  };
}

export function listVideoTasks(userId, limit = MAX_VIDEO_TASKS) {
  const rows = getDb().prepare(`
    SELECT * FROM video_generation_tasks
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).all(userId, Math.max(1, Math.min(Number(limit) || MAX_VIDEO_TASKS, MAX_VIDEO_TASKS)));
  return rows.map((row) => normalizeVideoTask(row));
}

export function getVideoTask(userId, taskId, options = {}) {
  return normalizeVideoTask(getDb().prepare(`
    SELECT * FROM video_generation_tasks
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).get(taskId, userId), options);
}

export function quoteVideoTask({ providerId = '', seconds = 4 } = {}) {
  const provider = getVideoProviderConfig(providerId, { includeSecret: false });
  if (!provider) throw Object.assign(new Error('VIDEO_PROVIDER_NOT_CONFIGURED'), { code: 'VIDEO_PROVIDER_NOT_CONFIGURED' });
  return {
    ...getVideoGenerationPricing({ seconds }, provider.pricingConfig),
    providerId: provider.id,
    providerName: provider.name,
    model: provider.model,
    source: 'server'
  };
}

function normalizedRequest(request = {}) {
  const id = clean(request.clientTaskId, 160) || randomUUID();
  const prompt = clean(request.prompt, 6000);
  if (!prompt) throw Object.assign(new Error('INVALID_PROMPT'), { code: 'INVALID_PROMPT' });
  const projectId = clean(request.canvasProjectId, 160);
  const canvasParentNodeId = clean(request.canvasParentNodeId, 160);
  const canvasTaskNodeId = clean(request.canvasTaskNodeId, 160);
  const providerId = clean(request.providerId, 160);
  const sourceAssetId = clean(request.sourceAssetId, 160);
  const sourceGenerationId = clean(request.sourceGenerationId, 160);
  return {
    id,
    prompt,
    displayPrompt: clean(request.displayPrompt || prompt, 6000),
    projectId,
    canvasParentNodeId,
    canvasTaskNodeId,
    providerId,
    seconds: normalizeVideoDuration(request.seconds),
    size: normalizeVideoSize(request.size),
    sourceAssetId,
    sourceGenerationId,
    sourceWidth: Math.max(0, Math.round(Number(request.sourceWidth) || 0)),
    sourceHeight: Math.max(0, Math.round(Number(request.sourceHeight) || 0)),
    replaceTaskId: clean(request.replaceTaskId, 160)
  };
}

export function createVideoTask(userId, request = {}) {
  const input = normalizedRequest(request);
  const db = getDb();
  const duplicate = getVideoTask(userId, input.id);
  if (duplicate) return { ...duplicate, duplicate: true };
  const project = db.prepare(`SELECT id FROM infinite_canvas_projects WHERE id = ? AND user_id = ? AND status != 'deleted'`).get(input.projectId, userId);
  if (!project) throw Object.assign(new Error('CANVAS_PROJECT_NOT_FOUND'), { code: 'CANVAS_PROJECT_NOT_FOUND' });
  ensureOwnedSource(userId, input);
  const provider = getVideoProviderConfig(input.providerId, { includeSecret: false });
  if (!provider?.enabled && provider?.enabled !== undefined) throw Object.assign(new Error('VIDEO_PROVIDER_NOT_CONFIGURED'), { code: 'VIDEO_PROVIDER_NOT_CONFIGURED' });
  if (!provider) throw Object.assign(new Error('VIDEO_PROVIDER_NOT_CONFIGURED'), { code: 'VIDEO_PROVIDER_NOT_CONFIGURED' });
  const quote = getVideoGenerationPricing({ seconds: input.seconds }, provider.pricingConfig);
  const counts = db.prepare(`
    SELECT COUNT(*) AS count,
      SUM(CASE WHEN status IN ('queued', 'running', 'cancelling', 'interrupted') THEN 1 ELSE 0 END) AS active_count
    FROM video_generation_tasks WHERE user_id = ? AND deleted_at IS NULL
  `).get(userId) || {};
  if (Number(counts.active_count || 0) >= MAX_ACTIVE_VIDEO_TASKS) throw Object.assign(new Error('VIDEO_TASK_ACTIVE_LIMIT'), { code: 'VIDEO_TASK_ACTIVE_LIMIT' });
  if (Number(counts.count || 0) >= MAX_VIDEO_TASKS) {
    const oldest = db.prepare(`
      SELECT id FROM video_generation_tasks
      WHERE user_id = ? AND deleted_at IS NULL AND status IN ('completed', 'failed', 'cancelled')
      ORDER BY COALESCE(completed_at, updated_at, created_at) ASC LIMIT 1
    `).get(userId);
    if (!oldest) throw Object.assign(new Error('VIDEO_TASK_LIST_FULL'), { code: 'VIDEO_TASK_LIST_FULL' });
    db.prepare('UPDATE video_generation_tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), oldest.id);
  }
  const reservation = reserveCreditCenti(userId, {
    amountCenti: quote.creditsCenti,
    prompt: input.prompt,
    source: 'video_generation',
    requestKey: `video:${input.id}`,
    metadata: {
      externalReferenceId: input.id,
      providerId: provider.id,
      providerName: provider.name,
      model: provider.model,
      seconds: input.seconds,
      size: input.size,
      projectId: input.projectId
    }
  });
  const createdAt = now();
  const serialized = JSON.stringify({
    displayPrompt: input.displayPrompt,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    pricing: quote
  });
  try {
    db.prepare(`
      INSERT INTO video_generation_tasks
        (id, user_id, project_id, canvas_parent_node_id, canvas_task_node_id, provider_id,
         reservation_id, status, phase, progress, prompt, seconds, size, source_asset_id,
         source_generation_id, quoted_credits_centi, request_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 'queued', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      userId,
      input.projectId,
      input.canvasParentNodeId,
      input.canvasTaskNodeId,
      provider.id,
      reservation.reservationId,
      input.prompt,
      input.seconds,
      input.size,
      input.sourceAssetId,
      input.sourceGenerationId,
      quote.creditsCenti,
      serialized,
      createdAt,
      createdAt
    );
  } catch (error) {
    if (!reservation.duplicate) releaseCreditReservation(reservation.reservationId, 'VIDEO_TASK_CREATE_FAILED');
    throw error;
  }
  if (input.replaceTaskId) {
    db.prepare(`
      UPDATE video_generation_tasks SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND status IN ('failed', 'cancelled')
    `).run(createdAt, createdAt, input.replaceTaskId, userId);
  }
  return getVideoTask(userId, input.id);
}

export function buildVideoRedoRequest(userId, taskId, overrides = {}) {
  const task = getVideoTask(userId, taskId, { includeRequest: true });
  if (!task) throw Object.assign(new Error('VIDEO_TASK_NOT_FOUND'), { code: 'VIDEO_TASK_NOT_FOUND' });
  if (!['failed', 'cancelled'].includes(task.status)) throw Object.assign(new Error('VIDEO_TASK_ACTIVE'), { code: 'VIDEO_TASK_ACTIVE' });
  return {
    clientTaskId: clean(overrides.clientTaskId, 160) || randomUUID(),
    prompt: task.prompt,
    displayPrompt: task.displayPrompt,
    canvasProjectId: task.projectId,
    canvasParentNodeId: task.canvasParentNodeId,
    canvasTaskNodeId: clean(overrides.canvasTaskNodeId, 160) || task.canvasTaskNodeId,
    providerId: task.providerId,
    seconds: task.seconds,
    size: task.size,
    sourceAssetId: task.sourceAssetId,
    sourceGenerationId: task.sourceGenerationId,
    sourceWidth: task.sourceWidth,
    sourceHeight: task.sourceHeight,
    replaceTaskId: overrides.replaceTaskId ? task.id : ''
  };
}

export function claimVideoTasks(limit = 2) {
  const db = getDb();
  const timestamp = now();
  const claimed = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    const rows = db.prepare(`
      SELECT * FROM video_generation_tasks
      WHERE status IN ('queued', 'interrupted') AND cancel_requested = 0 AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC LIMIT 100
    `).all();
    const runningByUser = new Map(db.prepare(`
      SELECT user_id, COUNT(*) AS count FROM video_generation_tasks
      WHERE status IN ('running', 'cancelling') AND deleted_at IS NULL GROUP BY user_id
    `).all().map((row) => [row.user_id, Number(row.count || 0)]));
    const claim = db.prepare(`
      UPDATE video_generation_tasks
      SET status = 'running', phase = CASE WHEN provider_task_id != '' THEN 'processing' ELSE 'submitting' END,
          attempts = attempts + 1, started_at = COALESCE(started_at, ?), updated_at = ?, error_code = NULL
      WHERE id = ? AND status IN ('queued', 'interrupted') AND cancel_requested = 0
    `);
    for (const row of rows) {
      if (claimed.length >= Math.max(1, Number(limit) || 1)) break;
      const running = runningByUser.get(row.user_id) || 0;
      if (running >= VIDEO_CONCURRENCY_PER_USER) continue;
      if (!claim.run(timestamp, timestamp, row.id).changes) continue;
      runningByUser.set(row.user_id, running + 1);
      claimed.push(getVideoTask(row.user_id, row.id, { includeRequest: true }));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return claimed;
}

export function updateVideoTaskProgress(userId, taskId, values = {}) {
  const db = getDb();
  const fields = [];
  const params = [];
  if (values.providerTaskId != null) { fields.push('provider_task_id = ?'); params.push(clean(values.providerTaskId, 240)); }
  if (values.phase != null) { fields.push('phase = ?'); params.push(clean(values.phase, 80)); }
  if (values.progress != null) { fields.push('progress = ?'); params.push(Math.max(0, Math.min(100, Math.round(Number(values.progress) || 0)))); }
  if (!fields.length) return getVideoTask(userId, taskId, { includeRequest: true });
  fields.push('updated_at = ?');
  params.push(now(), taskId, userId);
  db.prepare(`UPDATE video_generation_tasks SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).run(...params);
  return getVideoTask(userId, taskId, { includeRequest: true });
}

export function completeVideoTask(userId, taskId, result = {}) {
  const db = getDb();
  const task = getVideoTask(userId, taskId, { includeRequest: true });
  if (!task) throw Object.assign(new Error('VIDEO_TASK_NOT_FOUND'), { code: 'VIDEO_TASK_NOT_FOUND' });
  if (task.status === 'completed') return task;
  const quotedCenti = Math.max(1, Math.round(Number(task.quotedCredits || 0) * 100));
  const settledCenti = Math.max(1, Math.min(quotedCenti, Math.round(Number(result.creditsCenti ?? quotedCenti) || 0)));
  settleCreditReservation(task.reservationId, settledCenti);
  const completedAt = now();
  const generationId = clean(result.videoGenerationId, 160) || randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO video_generations
        (id, user_id, project_id, task_id, asset_id, source_asset_id, source_generation_id,
         prompt, model, size, seconds, provider, provider_request_id, has_audio, credits_centi,
         status, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET asset_id = excluded.asset_id, provider_request_id = excluded.provider_request_id,
        has_audio = excluded.has_audio, credits_centi = excluded.credits_centi, status = 'succeeded', completed_at = excluded.completed_at
    `).run(
      generationId,
      userId,
      task.projectId || null,
      task.id,
      result.assetId || null,
      task.sourceAssetId,
      task.sourceGenerationId,
      task.prompt,
      clean(result.model, 160),
      task.size,
      task.seconds,
      clean(result.providerName, 160),
      clean(result.providerTaskId || task.providerTaskId, 240),
      result.hasAudio ? 1 : 0,
      settledCenti,
      task.createdAt || completedAt,
      completedAt
    );
    const payload = JSON.stringify({
      videoGenerationId: generationId,
      assetId: result.assetId,
      videoUrl: result.videoUrl,
      originalUrl: result.originalUrl,
      downloadUrl: result.downloadUrl,
      posterUrl: result.posterUrl,
      mimeType: result.mimeType || 'video/mp4',
      seconds: task.seconds,
      size: task.size,
      hasAudio: result.hasAudio ?? null,
      creditsCharged: settledCenti / 100
    });
    db.prepare(`
      UPDATE video_generation_tasks
      SET status = 'completed', phase = 'completed', progress = 100, result_json = ?, settled_credits_centi = ?,
          error_code = NULL, updated_at = ?, completed_at = ?
      WHERE id = ? AND user_id = ?
    `).run(payload, settledCenti, completedAt, completedAt, task.id, userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getVideoTask(userId, task.id);
}

export function failVideoTask(userId, taskId, errorCode = 'VIDEO_GENERATION_FAILED') {
  const task = getVideoTask(userId, taskId, { includeRequest: true });
  if (!task) return null;
  if (TERMINAL_STATUSES.has(task.status)) return task;
  releaseCreditReservation(task.reservationId, errorCode);
  const completedAt = now();
  getDb().prepare(`
    UPDATE video_generation_tasks
    SET status = ?, phase = ?, error_code = ?, updated_at = ?, completed_at = ?
    WHERE id = ? AND user_id = ?
  `).run(errorCode === 'VIDEO_GENERATION_CANCELLED' ? 'cancelled' : 'failed', errorCode === 'VIDEO_GENERATION_CANCELLED' ? 'cancelled' : 'failed', clean(errorCode, 120), completedAt, completedAt, taskId, userId);
  return getVideoTask(userId, taskId);
}

export function interruptVideoTask(userId, taskId, errorCode = 'VIDEO_PROVIDER_TIMEOUT') {
  const task = getVideoTask(userId, taskId);
  if (!task || TERMINAL_STATUSES.has(task.status)) return task;
  const updatedAt = now();
  getDb().prepare(`
    UPDATE video_generation_tasks
    SET status = 'interrupted', phase = 'waiting', error_code = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(clean(errorCode, 120), updatedAt, taskId, userId);
  return getVideoTask(userId, taskId);
}

export function requestVideoTaskCancellation(userId, taskId) {
  const task = getVideoTask(userId, taskId, { includeRequest: true });
  if (!task) return null;
  if (TERMINAL_STATUSES.has(task.status)) return task;
  if (task.status === 'queued' || task.status === 'interrupted') return failVideoTask(userId, taskId, 'VIDEO_GENERATION_CANCELLED');
  getDb().prepare(`
    UPDATE video_generation_tasks SET status = 'cancelling', phase = 'cancelling', cancel_requested = 1, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(now(), taskId, userId);
  return getVideoTask(userId, taskId, { includeRequest: true });
}

export function isVideoTaskCancellationRequested(userId, taskId) {
  return Boolean(getDb().prepare('SELECT cancel_requested FROM video_generation_tasks WHERE id = ? AND user_id = ?').get(taskId, userId)?.cancel_requested);
}

export function deleteVideoTask(userId, taskId) {
  const task = getVideoTask(userId, taskId);
  if (!task) return null;
  if (ACTIVE_STATUSES.has(task.status)) throw Object.assign(new Error('VIDEO_TASK_ACTIVE'), { code: 'VIDEO_TASK_ACTIVE' });
  getDb().prepare('UPDATE video_generation_tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(now(), now(), taskId, userId);
  return task;
}
