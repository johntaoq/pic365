import { randomUUID } from 'node:crypto';

import { getDb } from './local-db.js';
import { normalizeImageStylePresetId } from '../../shared/image-style-presets.js';

export const MAX_FREE_GENERATION_TASKS = 30;
export const MAX_ACTIVE_FREE_GENERATION_TASKS = 20;
export const FREE_GENERATION_CONCURRENCY_PER_USER = 3;
const ACTIVE_STATUSES = new Set(['queued', 'running', 'cancelling']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'interrupted']);

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function resultItems(row) {
  const payload = parseJson(row.result_json, {});
  const unitCredits = Number(payload.unitCredits || 0);
  const images = Array.isArray(payload.images) && payload.images.length ? payload.images : payload.image ? [payload] : [];
  return images.map((item, index) => ({
    id: item.generationId || `${row.id}-${index}`,
    generationId: item.generationId || '',
    imageUrl: item.image || '',
    thumbnailUrl: item.thumbnailUrl || (item.generationId ? `/api/generated?id=${encodeURIComponent(item.generationId)}&variant=thumbnail` : item.image || ''),
    mimeType: item.contentType || item.mimeType || 'image/png',
    prompt: row.prompt || '',
    size: item.size || row.size,
    quality: item.quality || row.quality,
    creditsCharged: Number(item.creditsCharged || unitCredits || 0),
    downloadAllowed: Boolean(item.downloadAllowed),
    cloudSaved: Boolean(item.cloudSaved),
    storageBackend: item.storageBackend || '',
    status: 'succeeded',
    createdAt: row.completed_at || row.created_at
  })).filter((item) => item.imageUrl);
}

export function normalizeFreeGenerationTask(row, { includeRequest = false } = {}) {
  if (!row) return null;
  const storedRequest = parseJson(row.request_json, {});
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    prompt: row.prompt || '',
    size: row.size || '1024x1024',
    quality: row.quality || 'medium',
    count: Number(row.image_count || 1),
    providerId: row.provider_id || '',
    taskMode: row.task_mode || 'single',
    batchId: row.batch_id || '',
    batchIndex: Number(row.batch_index || 0),
    sourceName: row.source_name || '',
    sourceWidth: Number(row.source_width || 0),
    sourceHeight: Number(row.source_height || 0),
    sourceThumbnail: row.source_thumbnail || '',
    canvasProjectId: cleanText(storedRequest.canvasProjectId, 160),
    canvasParentNodeId: cleanText(storedRequest.canvasParentNodeId, 160),
    canvasTaskNodeId: cleanText(storedRequest.canvasTaskNodeId, 160),
    canvasDisplayPrompt: cleanText(storedRequest.canvasDisplayPrompt, 6000),
    stylePresetId: normalizeImageStylePresetId(storedRequest.stylePresetId),
    canvasReferenceNodeIds: Array.isArray(storedRequest.canvasReferenceNodeIds)
      ? storedRequest.canvasReferenceNodeIds.map((value) => cleanText(value, 160)).filter(Boolean).slice(0, 9)
      : [],
    canvasX: storedRequest.canvasX != null && Number.isFinite(Number(storedRequest.canvasX)) ? Number(storedRequest.canvasX) : null,
    canvasY: storedRequest.canvasY != null && Number.isFinite(Number(storedRequest.canvasY)) ? Number(storedRequest.canvasY) : null,
    results: resultItems(row),
    error: row.error_code || '',
    cancelRequested: Boolean(row.cancel_requested),
    attempts: Number(row.attempts || 0),
    redoAvailable: Boolean(storedRequest.prompt),
    createdAt: row.created_at || '',
    startedAt: row.started_at || '',
    completedAt: row.completed_at || '',
    ...(includeRequest ? { request: storedRequest } : {})
  };
}

export function listFreeGenerationTasks(userId, limit = MAX_FREE_GENERATION_TASKS) {
  const rows = getDb().prepare(`
    SELECT * FROM free_generation_tasks
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).all(userId, Math.max(1, Math.min(Number(limit) || MAX_FREE_GENERATION_TASKS, MAX_FREE_GENERATION_TASKS)));
  return rows.map((row) => normalizeFreeGenerationTask(row));
}

export function getFreeGenerationTask(userId, taskId, options = {}) {
  const row = getDb().prepare(`
    SELECT * FROM free_generation_tasks
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).get(taskId, userId);
  return normalizeFreeGenerationTask(row, options);
}

function normalizedTaskRequest(request = {}) {
  const id = cleanText(request.clientTaskId, 160) || randomUUID();
  const prompt = cleanText(request.prompt, 6000);
  if (!prompt) {
    const error = new Error('INVALID_PROMPT');
    error.code = 'INVALID_PROMPT';
    throw error;
  }
  const taskMode = request.taskMode === 'batch-repair' ? 'batch-repair' : 'single';
  const stylePresetId = taskMode === 'single' ? normalizeImageStylePresetId(request.stylePresetId) : '';
  const imageCount = taskMode === 'batch-repair'
    ? 1
    : Math.max(1, Math.min(4, Math.round(Number(request.count) || 1)));
  const batchId = taskMode === 'batch-repair' ? cleanText(request.batchId, 160) : '';
  const batchIndex = taskMode === 'batch-repair' ? Math.max(0, Math.min(19, Math.round(Number(request.batchIndex) || 0))) : 0;
  const sourceName = taskMode === 'batch-repair' ? cleanText(request.sourceName, 240) : '';
  const sourceWidth = taskMode === 'batch-repair' ? Math.max(0, Math.round(Number(request.sourceWidth) || 0)) : 0;
  const sourceHeight = taskMode === 'batch-repair' ? Math.max(0, Math.round(Number(request.sourceHeight) || 0)) : 0;
  const sourceThumbnail = taskMode === 'batch-repair' ? cleanText(request.sourceThumbnail, 180_000) : '';
  const requestedPreflightError = cleanText(request.preflightError, 120);
  const preflightError = ['PROVIDER_SOURCE_SIZE_UNSUPPORTED', 'PROVIDER_OUTPUT_SIZE_UNSUPPORTED', 'INVALID_REFERENCE_IMAGE_FORMAT', 'PROVIDER_REFERENCE_UNSUPPORTED'].includes(requestedPreflightError)
    ? requestedPreflightError
    : '';
  const preserveSourceSize = taskMode === 'batch-repair' ? request.preserveSourceSize !== false : false;
  const requestedReferences = Array.isArray(request.references) ? request.references : [];
  if (requestedReferences.length > 9) {
    const error = new Error('TOO_MANY_REFERENCE_IMAGES');
    error.code = 'TOO_MANY_REFERENCE_IMAGES';
    throw error;
  }
  const references = requestedReferences;
  const canvasProjectId = cleanText(request.canvasProjectId, 160);
  const canvasParentNodeId = cleanText(request.canvasParentNodeId, 160);
  const canvasTaskNodeId = cleanText(request.canvasTaskNodeId, 160);
  const canvasDisplayPrompt = cleanText(request.canvasDisplayPrompt, 6000);
  const canvasReferenceNodeIds = Array.isArray(request.canvasReferenceNodeIds)
    ? request.canvasReferenceNodeIds.map((value) => cleanText(value, 160)).filter(Boolean).slice(0, 9)
    : [];
  const canvasX = Number.isFinite(Number(request.canvasX)) ? Number(request.canvasX) : null;
  const canvasY = Number.isFinite(Number(request.canvasY)) ? Number(request.canvasY) : null;
  const replaceTaskId = cleanText(request.replaceTaskId, 160);
  if (taskMode === 'batch-repair' && (!batchId || !sourceWidth || !sourceHeight || (!preflightError && references.length !== 1))) {
    const error = new Error('INVALID_BATCH_REPAIR_TASK');
    error.code = 'INVALID_BATCH_REPAIR_TASK';
    throw error;
  }
  const serialized = JSON.stringify({
    prompt,
    size: cleanText(request.size || '1024x1024', 40),
    quality: cleanText(request.quality || 'medium', 20),
    count: imageCount,
    providerId: cleanText(request.providerId, 160),
    references,
    clientTaskId: id,
    taskMode,
    canvasProjectId,
    canvasParentNodeId,
    canvasTaskNodeId,
    canvasDisplayPrompt,
    stylePresetId,
    canvasReferenceNodeIds,
    canvasX,
    canvasY,
    ...(taskMode === 'batch-repair' ? {
      batchId,
      batchIndex,
      sourceName,
      sourceWidth,
      sourceHeight,
      preserveSourceSize
    } : {})
  });
  if (Buffer.byteLength(serialized, 'utf8') > 96 * 1024 * 1024) {
    const error = new Error('REQUEST_BODY_TOO_LARGE');
    error.code = 'REQUEST_BODY_TOO_LARGE';
    throw error;
  }
  return {
    id,
    prompt,
    size: cleanText(request.size || '1024x1024', 40),
    quality: cleanText(request.quality || 'medium', 20),
    imageCount,
    providerId: cleanText(request.providerId, 160),
    serialized,
    taskMode,
    batchId,
    batchIndex,
    sourceName,
    sourceWidth,
    sourceHeight,
    sourceThumbnail,
    preflightError,
    preserveSourceSize,
    canvasProjectId,
    canvasParentNodeId,
    canvasTaskNodeId,
    canvasDisplayPrompt,
    stylePresetId,
    canvasReferenceNodeIds,
    canvasX,
    canvasY,
    replaceTaskId
  };
}

export function createFreeGenerationTasks(userId, requests = []) {
  const items = Array.isArray(requests) ? requests : [];
  if (!items.length || items.length > MAX_FREE_GENERATION_TASKS) {
    const error = new Error('INVALID_TASK_BATCH');
    error.code = 'INVALID_TASK_BATCH';
    throw error;
  }
  const normalized = items.map(normalizedTaskRequest);
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) {
    const error = new Error('TASK_ALREADY_EXISTS');
    error.code = 'TASK_ALREADY_EXISTS';
    throw error;
  }

  const db = getDb();
  const createdAt = now();

  db.exec('BEGIN IMMEDIATE');
  try {
    const replacementIds = [...new Set(normalized.map((item) => item.replaceTaskId).filter(Boolean))];
    const replacement = db.prepare(`
      SELECT id, status FROM free_generation_tasks
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `);
    for (const taskId of replacementIds) {
      const row = replacement.get(taskId, userId);
      if (!row) {
        const error = new Error('TASK_NOT_FOUND');
        error.code = 'TASK_NOT_FOUND';
        throw error;
      }
      if (ACTIVE_STATUSES.has(row.status)) {
        const error = new Error('TASK_ACTIVE');
        error.code = 'TASK_ACTIVE';
        throw error;
      }
    }
    const counts = db.prepare(`
      SELECT COUNT(*) AS count,
        SUM(CASE WHEN status IN ('queued', 'running', 'cancelling') THEN 1 ELSE 0 END) AS active_count
      FROM free_generation_tasks
      WHERE user_id = ? AND deleted_at IS NULL
    `).get(userId) || {};
    const activeCount = Number(counts.active_count || 0);
    const newActiveCount = normalized.filter((item) => !item.preflightError).length;
    if (activeCount + newActiveCount > MAX_ACTIVE_FREE_GENERATION_TASKS) {
      const error = new Error('TASK_ACTIVE_LIMIT');
      error.code = 'TASK_ACTIVE_LIMIT';
      throw error;
    }
    const projectedCount = Number(counts.count || 0) - replacementIds.length + normalized.length;
    const overflow = Math.max(0, projectedCount - MAX_FREE_GENERATION_TASKS);
    if (overflow) {
      const replacementSet = new Set(replacementIds);
      const removable = db.prepare(`
        SELECT id FROM free_generation_tasks
        WHERE user_id = ? AND deleted_at IS NULL
          AND status IN ('completed', 'failed', 'cancelled', 'interrupted')
        ORDER BY COALESCE(completed_at, updated_at, created_at) ASC, created_at ASC, id ASC
      `).all(userId).filter((row) => !replacementSet.has(row.id)).slice(0, overflow);
      if (removable.length < overflow) {
        const error = new Error('TASK_LIST_FULL');
        error.code = 'TASK_LIST_FULL';
        throw error;
      }
      const evict = db.prepare(`
        UPDATE free_generation_tasks SET deleted_at = ?, request_json = '{}', updated_at = ?
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      `);
      for (const row of removable) evict.run(createdAt, createdAt, row.id, userId);
    }
    const exists = db.prepare('SELECT 1 FROM free_generation_tasks WHERE id = ?');
    const insert = db.prepare(`
      INSERT INTO free_generation_tasks
        (id, user_id, status, prompt, size, quality, image_count, provider_id, request_json,
         error_code, task_mode, batch_id, batch_index, source_name, source_width, source_height,
         source_thumbnail, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of normalized) {
      if (exists.get(item.id)) {
        const error = new Error('TASK_ALREADY_EXISTS');
        error.code = 'TASK_ALREADY_EXISTS';
        throw error;
      }
      const blocked = Boolean(item.preflightError);
      insert.run(
        item.id,
        userId,
        blocked ? 'failed' : 'queued',
        item.prompt,
        item.size,
        item.quality,
        item.imageCount,
        item.providerId,
        item.serialized,
        blocked ? item.preflightError : null,
        item.taskMode,
        item.batchId,
        item.batchIndex,
        item.sourceName,
        item.sourceWidth,
        item.sourceHeight,
        item.sourceThumbnail,
        createdAt,
        createdAt,
        blocked ? createdAt : null
      );
    }
    const releaseReplaced = db.prepare(`
      UPDATE free_generation_tasks SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `);
    for (const taskId of replacementIds) releaseReplaced.run(createdAt, createdAt, taskId, userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return normalized.map((item) => getFreeGenerationTask(userId, item.id));
}

export function createFreeGenerationTask(userId, request = {}) {
  return createFreeGenerationTasks(userId, [request])[0];
}

export function buildFreeGenerationRedoRequest(userId, taskId, overrides = {}) {
  const task = getFreeGenerationTask(userId, taskId, { includeRequest: true });
  if (!task) {
    const error = new Error('TASK_NOT_FOUND');
    error.code = 'TASK_NOT_FOUND';
    throw error;
  }
  if (ACTIVE_STATUSES.has(task.status)) {
    const error = new Error('TASK_ACTIVE');
    error.code = 'TASK_ACTIVE';
    throw error;
  }

  const storedRequest = task.request && typeof task.request === 'object' ? task.request : {};
  if (!storedRequest.prompt) {
    const error = new Error('TASK_REDO_DATA_UNAVAILABLE');
    error.code = 'TASK_REDO_DATA_UNAVAILABLE';
    throw error;
  }
  const references = Array.isArray(storedRequest.references) ? storedRequest.references : [];
  if (task.taskMode === 'batch-repair' && !references.length) {
    const error = new Error('TASK_REDO_DATA_UNAVAILABLE');
    error.code = 'TASK_REDO_DATA_UNAVAILABLE';
    throw error;
  }

  return {
    prompt: task.prompt,
    size: task.size,
    quality: task.quality,
    count: task.count,
    providerId: task.providerId,
    references,
    taskMode: task.taskMode,
    canvasProjectId: task.canvasProjectId,
    canvasParentNodeId: task.canvasParentNodeId,
    canvasTaskNodeId: cleanText(overrides.canvasTaskNodeId, 160),
    canvasDisplayPrompt: task.canvasDisplayPrompt,
    stylePresetId: task.stylePresetId,
    canvasReferenceNodeIds: task.canvasReferenceNodeIds,
    canvasX: Number.isFinite(Number(overrides.canvasX)) ? Number(overrides.canvasX) : task.canvasX,
    canvasY: Number.isFinite(Number(overrides.canvasY)) ? Number(overrides.canvasY) : task.canvasY,
    clientTaskId: cleanText(overrides.clientTaskId, 160) || randomUUID(),
    replaceTaskId: overrides.replaceTaskId ? task.id : '',
    ...(task.taskMode === 'batch-repair' ? {
      batchId: `redo-${randomUUID()}`,
      batchIndex: 0,
      sourceName: task.sourceName,
      sourceWidth: task.sourceWidth,
      sourceHeight: task.sourceHeight,
      sourceThumbnail: task.sourceThumbnail,
      preserveSourceSize: storedRequest.preserveSourceSize !== false
    } : {})
  };
}

export function claimFreeGenerationTasks(limit = 12) {
  const db = getDb();
  const claimed = [];
  const timestamp = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    const candidates = db.prepare(`
      SELECT * FROM free_generation_tasks
      WHERE status = 'queued' AND cancel_requested = 0 AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT 100
    `).all();
    const runningByUser = new Map(db.prepare(`
      SELECT user_id, COUNT(*) AS count FROM free_generation_tasks
      WHERE status IN ('running', 'cancelling') AND deleted_at IS NULL
      GROUP BY user_id
    `).all().map((row) => [row.user_id, Number(row.count || 0)]));
    const claim = db.prepare(`
      UPDATE free_generation_tasks
      SET status = 'running', attempts = attempts + 1, started_at = COALESCE(started_at, ?), updated_at = ?
      WHERE id = ? AND status = 'queued' AND cancel_requested = 0
    `);
    for (const row of candidates) {
      if (claimed.length >= Math.max(1, Number(limit) || 1)) break;
      const running = runningByUser.get(row.user_id) || 0;
      if (running >= FREE_GENERATION_CONCURRENCY_PER_USER) continue;
      if (!claim.run(timestamp, timestamp, row.id).changes) continue;
      runningByUser.set(row.user_id, running + 1);
      claimed.push(normalizeFreeGenerationTask({ ...row, status: 'running', attempts: Number(row.attempts || 0) + 1, started_at: row.started_at || timestamp, updated_at: timestamp }, { includeRequest: true }));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return claimed;
}

export function completeFreeGenerationTask(userId, taskId, { status, result = {}, errorCode = '' } = {}) {
  if (!TERMINAL_STATUSES.has(status)) throw new Error('INVALID_TASK_STATUS');
  const timestamp = now();
  const resultJson = status === 'completed' ? JSON.stringify(result && typeof result === 'object' ? result : {}) : '{}';
  getDb().prepare(`
    UPDATE free_generation_tasks
    SET status = ?, result_json = ?, error_code = ?, cancel_requested = CASE WHEN ? = 'cancelled' THEN 1 ELSE cancel_requested END,
      updated_at = ?, completed_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).run(status, resultJson, cleanText(errorCode, 120) || null, status, timestamp, timestamp, taskId, userId);
  return getFreeGenerationTask(userId, taskId);
}

export function requestFreeGenerationTaskCancellation(userId, taskId) {
  const db = getDb();
  const task = getFreeGenerationTask(userId, taskId);
  if (!task) return null;
  if (!ACTIVE_STATUSES.has(task.status)) return task;
  const timestamp = now();
  if (task.status === 'queued') {
    db.prepare(`
      UPDATE free_generation_tasks
      SET status = 'cancelled', cancel_requested = 1, error_code = 'GENERATION_CANCELLED', updated_at = ?, completed_at = ?
      WHERE id = ? AND user_id = ? AND status = 'queued'
    `).run(timestamp, timestamp, taskId, userId);
  } else {
    db.prepare(`
      UPDATE free_generation_tasks
      SET status = 'cancelling', cancel_requested = 1, updated_at = ?
      WHERE id = ? AND user_id = ? AND status IN ('running', 'cancelling')
    `).run(timestamp, taskId, userId);
  }
  return getFreeGenerationTask(userId, taskId);
}

export function deleteFreeGenerationTask(userId, taskId) {
  const task = getFreeGenerationTask(userId, taskId);
  if (!task) return null;
  if (ACTIVE_STATUSES.has(task.status)) {
    const error = new Error('TASK_ACTIVE');
    error.code = 'TASK_ACTIVE';
    throw error;
  }
  getDb().prepare(`
    UPDATE free_generation_tasks SET deleted_at = ?, request_json = '{}', updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).run(now(), now(), taskId, userId);
  return task;
}

export function isFreeGenerationTaskCancellationRequested(userId, taskId) {
  return Boolean(getDb().prepare(`
    SELECT cancel_requested FROM free_generation_tasks WHERE id = ? AND user_id = ?
  `).get(taskId, userId)?.cancel_requested);
}
