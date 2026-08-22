import { randomUUID } from 'node:crypto';

import { getDb } from './local-db.js';

export const MAX_FREE_GENERATION_TASKS = 20;
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
  const preflightError = ['PROVIDER_SOURCE_SIZE_UNSUPPORTED', 'INVALID_REFERENCE_IMAGE_FORMAT', 'PROVIDER_REFERENCE_UNSUPPORTED'].includes(requestedPreflightError)
    ? requestedPreflightError
    : '';
  const references = Array.isArray(request.references) ? request.references.slice(0, 9) : [];
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
    ...(taskMode === 'batch-repair' ? {
      batchId,
      batchIndex,
      sourceName,
      sourceWidth,
      sourceHeight
    } : {})
  });
  if (Buffer.byteLength(serialized, 'utf8') > 24 * 1024 * 1024) {
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
    preflightError
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
    const count = Number(db.prepare(`
      SELECT COUNT(*) AS count FROM free_generation_tasks
      WHERE user_id = ? AND deleted_at IS NULL
    `).get(userId)?.count || 0);
    if (count + normalized.length > MAX_FREE_GENERATION_TASKS) {
      const error = new Error('TASK_LIST_FULL');
      error.code = 'TASK_LIST_FULL';
      throw error;
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

export function buildFreeGenerationRedoRequest(userId, taskId) {
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
    ...(task.taskMode === 'batch-repair' ? {
      batchId: `redo-${randomUUID()}`,
      batchIndex: 0,
      sourceName: task.sourceName,
      sourceWidth: task.sourceWidth,
      sourceHeight: task.sourceHeight,
      sourceThumbnail: task.sourceThumbnail
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
