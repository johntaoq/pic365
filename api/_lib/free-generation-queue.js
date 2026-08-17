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
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    prompt: row.prompt || '',
    size: row.size || '1024x1024',
    quality: row.quality || 'medium',
    count: Number(row.image_count || 1),
    providerId: row.provider_id || '',
    results: resultItems(row),
    error: row.error_code || '',
    cancelRequested: Boolean(row.cancel_requested),
    attempts: Number(row.attempts || 0),
    createdAt: row.created_at || '',
    startedAt: row.started_at || '',
    completedAt: row.completed_at || '',
    ...(includeRequest ? { request: parseJson(row.request_json, {}) } : {})
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

export function createFreeGenerationTask(userId, request = {}) {
  const db = getDb();
  const createdAt = now();
  const id = cleanText(request.clientTaskId, 160) || randomUUID();
  const prompt = cleanText(request.prompt, 6000);
  if (!prompt) {
    const error = new Error('INVALID_PROMPT');
    error.code = 'INVALID_PROMPT';
    throw error;
  }
  const imageCount = Math.max(1, Math.min(4, Math.round(Number(request.count) || 1)));
  const serialized = JSON.stringify({
    prompt,
    size: cleanText(request.size || '1024x1024', 40),
    quality: cleanText(request.quality || 'medium', 20),
    count: imageCount,
    providerId: cleanText(request.providerId, 160),
    references: Array.isArray(request.references) ? request.references.slice(0, 9) : [],
    clientTaskId: id
  });
  if (Buffer.byteLength(serialized, 'utf8') > 24 * 1024 * 1024) {
    const error = new Error('REQUEST_BODY_TOO_LARGE');
    error.code = 'REQUEST_BODY_TOO_LARGE';
    throw error;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const count = Number(db.prepare(`
      SELECT COUNT(*) AS count FROM free_generation_tasks
      WHERE user_id = ? AND deleted_at IS NULL
    `).get(userId)?.count || 0);
    if (count >= MAX_FREE_GENERATION_TASKS) {
      const error = new Error('TASK_LIST_FULL');
      error.code = 'TASK_LIST_FULL';
      throw error;
    }
    if (db.prepare('SELECT 1 FROM free_generation_tasks WHERE id = ?').get(id)) {
      const error = new Error('TASK_ALREADY_EXISTS');
      error.code = 'TASK_ALREADY_EXISTS';
      throw error;
    }
    db.prepare(`
      INSERT INTO free_generation_tasks
        (id, user_id, status, prompt, size, quality, image_count, provider_id, request_json, created_at, updated_at)
      VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      prompt,
      cleanText(request.size || '1024x1024', 40),
      cleanText(request.quality || 'medium', 20),
      imageCount,
      cleanText(request.providerId, 160),
      serialized,
      createdAt,
      createdAt
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getFreeGenerationTask(userId, id);
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
    SET status = ?, result_json = ?, request_json = '{}', error_code = ?, cancel_requested = CASE WHEN ? = 'cancelled' THEN 1 ELSE cancel_requested END,
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
      SET status = 'cancelled', cancel_requested = 1, request_json = '{}', error_code = 'GENERATION_CANCELLED', updated_at = ?, completed_at = ?
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
    UPDATE free_generation_tasks SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).run(now(), now(), taskId, userId);
  return task;
}

export function isFreeGenerationTaskCancellationRequested(userId, taskId) {
  return Boolean(getDb().prepare(`
    SELECT cancel_requested FROM free_generation_tasks WHERE id = ? AND user_id = ?
  `).get(taskId, userId)?.cancel_requested);
}
