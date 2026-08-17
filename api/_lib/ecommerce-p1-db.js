import { randomUUID } from 'node:crypto';
import { getDb } from './local-db.js';

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeOutput(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    slotId: row.slot_id,
    selectedGenerationId: row.generation_id || '',
    status: row.status || 'planned',
    versionNumber: Number(row.version_number || 0),
    locked: Number(row.locked || 0) === 1,
    lockedAt: row.locked_at || '',
    active: Number(row.active ?? 1) === 1,
    consistencyStatus: row.consistency_status || 'unchecked',
    consistencyScore: row.consistency_score == null ? null : Number(row.consistency_score),
    consistencyIssues: parseJson(row.consistency_issues, []),
    consistencySummary: row.consistency_summary || '',
    checkedAt: row.checked_at || '',
    metadata: parseJson(row.metadata, {}),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function normalizeTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    slotId: row.slot_id,
    generationId: row.generation_id || '',
    status: row.status || 'queued',
    quality: row.quality || 'medium',
    attempts: Number(row.attempts || 0),
    cancelRequested: Number(row.cancel_requested || 0) === 1,
    request: parseJson(row.request_json, {}),
    errorCode: row.error_code || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    startedAt: row.started_at || '',
    completedAt: row.completed_at || ''
  };
}

export function syncEcommerceProjectOutputs(userId, projectId, slotIds) {
  const db = getDb();
  const selected = [...new Set((slotIds || []).map(String).filter(Boolean))];
  const timestamp = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE ecommerce_project_outputs SET active = 0, updated_at = ? WHERE user_id = ? AND project_id = ?')
      .run(timestamp, userId, projectId);
    const insert = db.prepare(`
      INSERT INTO ecommerce_project_outputs
        (id, project_id, user_id, slot_id, status, version_number, active, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'planned', 0, 1, '{}', ?, ?)
      ON CONFLICT(project_id, slot_id) DO UPDATE SET active = 1, updated_at = excluded.updated_at
    `);
    for (const slotId of selected) insert.run(randomUUID(), projectId, userId, slotId, timestamp, timestamp);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return listEcommerceProjectOutputs(userId, projectId);
}

export function listEcommerceProjectOutputs(userId, projectId, { activeOnly = true } = {}) {
  const activeClause = activeOnly ? 'AND active = 1' : '';
  return getDb().prepare(`
    SELECT * FROM ecommerce_project_outputs
    WHERE user_id = ? AND project_id = ? ${activeClause}
    ORDER BY created_at ASC
  `).all(userId, projectId).map(normalizeOutput);
}

export function getEcommerceProjectOutput(userId, projectId, slotId) {
  return normalizeOutput(getDb().prepare(`
    SELECT * FROM ecommerce_project_outputs WHERE user_id = ? AND project_id = ? AND slot_id = ?
  `).get(userId, projectId, slotId));
}

export function selectEcommerceOutputGeneration(userId, projectId, slotId, generationId) {
  const db = getDb();
  const generation = db.prepare(`
    SELECT id, version_number, prompt FROM generations
    WHERE id = ? AND user_id = ? AND project_id = ? AND slot_id = ?
      AND status = 'succeeded' AND archived_at IS NULL
  `).get(generationId, userId, projectId, slotId);
  if (!generation) return null;
  const timestamp = now();
  db.prepare(`
    INSERT INTO ecommerce_project_outputs
      (id, project_id, user_id, slot_id, generation_id, status, prompt, version_number, active,
       consistency_status, consistency_score, consistency_issues, consistency_summary, checked_at,
       metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'selected', ?, ?, 1, 'unchecked', NULL, '[]', '', NULL, '{}', ?, ?)
    ON CONFLICT(project_id, slot_id) DO UPDATE SET
      generation_id = excluded.generation_id,
      status = CASE WHEN ecommerce_project_outputs.locked = 1 THEN 'locked' ELSE 'selected' END,
      prompt = excluded.prompt,
      version_number = excluded.version_number,
      active = 1,
      consistency_status = 'unchecked',
      consistency_score = NULL,
      consistency_issues = '[]',
      consistency_summary = '',
      checked_at = NULL,
      updated_at = excluded.updated_at
    WHERE ecommerce_project_outputs.locked = 0
  `).run(
    randomUUID(), projectId, userId, slotId, generation.id, generation.prompt || '',
    Number(generation.version_number || 1), timestamp, timestamp
  );
  const output = getEcommerceProjectOutput(userId, projectId, slotId);
  return output?.selectedGenerationId === generation.id ? output : null;
}

export function setEcommerceOutputLocked(userId, projectId, slotId, locked) {
  const output = getEcommerceProjectOutput(userId, projectId, slotId);
  if (!output || (locked && !output.selectedGenerationId)) return null;
  const timestamp = now();
  getDb().prepare(`
    UPDATE ecommerce_project_outputs
    SET locked = ?, locked_at = ?, status = ?, updated_at = ?
    WHERE user_id = ? AND project_id = ? AND slot_id = ?
  `).run(
    locked ? 1 : 0,
    locked ? timestamp : null,
    locked ? 'locked' : output.selectedGenerationId ? 'selected' : 'planned',
    timestamp,
    userId,
    projectId,
    slotId
  );
  return getEcommerceProjectOutput(userId, projectId, slotId);
}

export function updateEcommerceOutputConsistency(userId, projectId, slotId, result) {
  const output = getEcommerceProjectOutput(userId, projectId, slotId);
  if (!output) return null;
  const timestamp = now();
  getDb().prepare(`
    UPDATE ecommerce_project_outputs
    SET consistency_status = ?, consistency_score = ?, consistency_issues = ?,
        consistency_summary = ?, checked_at = ?, updated_at = ?
    WHERE user_id = ? AND project_id = ? AND slot_id = ?
  `).run(
    result.status,
    result.score == null ? null : Number(result.score),
    JSON.stringify(result.issues || []),
    String(result.summary || ''),
    timestamp,
    timestamp,
    userId,
    projectId,
    slotId
  );
  return getEcommerceProjectOutput(userId, projectId, slotId);
}

export function archiveEcommerceGeneration(userId, projectId, slotId, generationId) {
  const output = getEcommerceProjectOutput(userId, projectId, slotId);
  if (output?.selectedGenerationId === generationId) return { error: 'SELECTED_VERSION' };
  const result = getDb().prepare(`
    UPDATE generations SET archived_at = ?
    WHERE id = ? AND user_id = ? AND project_id = ? AND slot_id = ? AND archived_at IS NULL
  `).run(now(), generationId, userId, projectId, slotId);
  return result.changes ? { ok: true } : { error: 'VERSION_NOT_FOUND' };
}

export function updateEcommerceAssetPurpose(userId, projectId, assetId, purpose) {
  const result = getDb().prepare(`
    UPDATE ecommerce_project_assets SET purpose = ?
    WHERE id = ? AND user_id = ? AND project_id = ?
  `).run(String(purpose || '').slice(0, 60), assetId, userId, projectId);
  return result.changes > 0;
}

export function reorderEcommerceProjectAssets(userId, projectId, assetIds) {
  const db = getDb();
  const current = db.prepare(`
    SELECT id FROM ecommerce_project_assets WHERE user_id = ? AND project_id = ?
  `).all(userId, projectId).map((row) => row.id);
  const requested = [...new Set((assetIds || []).map(String))];
  if (current.length !== requested.length || current.some((id) => !requested.includes(id))) return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare(`
      UPDATE ecommerce_project_assets SET sort_order = ? WHERE id = ? AND user_id = ? AND project_id = ?
    `);
    requested.forEach((id, index) => update.run(index + 1, id, userId, projectId));
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function createEcommerceGenerationTasks(userId, projectId, requests) {
  const db = getDb();
  const timestamp = now();
  const tasks = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    const insert = db.prepare(`
      INSERT INTO ecommerce_generation_tasks
        (id, user_id, project_id, slot_id, status, quality, attempts, cancel_requested,
         request_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'queued', ?, 0, 0, ?, ?, ?)
    `);
    const findActive = db.prepare(`
      SELECT id FROM ecommerce_generation_tasks
      WHERE user_id = ? AND project_id = ? AND slot_id = ? AND status IN ('queued', 'running', 'cancelling')
      LIMIT 1
    `);
    for (const request of requests || []) {
      const id = request.id || randomUUID();
      if (findActive.get(userId, projectId, String(request.slotId || ''))) {
        const error = new Error('TASK_ALREADY_ACTIVE');
        error.code = 'TASK_ALREADY_ACTIVE';
        throw error;
      }
      const requestJson = {
        adjustment: String(request.adjustment || '').slice(0, 1200),
        baseGenerationId: String(request.baseGenerationId || '').slice(0, 80),
        targetArea: String(request.targetArea || 'auto').slice(0, 40),
        referenceInputs: (Array.isArray(request.referenceInputs) ? request.referenceInputs : []).slice(0, 4).map((input) => ({
          assetId: String(input?.assetId || '').slice(0, 80),
          role: String(input?.role || 'detail').slice(0, 40)
        })).filter((input) => input.assetId),
        projectUpdatedAt: String(request.projectUpdatedAt || '').slice(0, 80)
      };
      insert.run(
        id,
        userId,
        projectId,
        String(request.slotId || ''),
        request.quality === 'low' ? 'low' : 'medium',
        JSON.stringify(requestJson),
        timestamp,
        timestamp
      );
      tasks.push(id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return tasks.map((taskId) => getEcommerceGenerationTask(userId, taskId));
}

export function listEcommerceGenerationTasks(userId, projectId, limit = 100) {
  return getDb().prepare(`
    SELECT * FROM ecommerce_generation_tasks
    WHERE user_id = ? AND project_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, projectId, Math.max(1, Math.min(Number(limit) || 100, 300))).map(normalizeTask);
}

export function getEcommerceGenerationTask(userId, taskId) {
  return normalizeTask(getDb().prepare(`
    SELECT * FROM ecommerce_generation_tasks WHERE id = ? AND user_id = ?
  `).get(taskId, userId));
}

export function getActiveEcommerceGenerationTask(userId, projectId, slotId) {
  return normalizeTask(getDb().prepare(`
    SELECT * FROM ecommerce_generation_tasks
    WHERE user_id = ? AND project_id = ? AND slot_id = ? AND status IN ('queued', 'running', 'cancelling')
    ORDER BY created_at DESC LIMIT 1
  `).get(userId, projectId, slotId));
}

export function claimEcommerceGenerationTask(userId, taskId) {
  const timestamp = now();
  const result = getDb().prepare(`
    UPDATE ecommerce_generation_tasks
    SET status = 'running', attempts = attempts + 1, error_code = NULL,
        started_at = ?, completed_at = NULL, updated_at = ?
    WHERE id = ? AND user_id = ? AND cancel_requested = 0
      AND status IN ('queued', 'interrupted', 'failed')
  `).run(timestamp, timestamp, taskId, userId);
  return result.changes ? getEcommerceGenerationTask(userId, taskId) : null;
}

export function claimQueuedEcommerceGenerationTasks(limit = 12, perUserLimit = 3) {
  const db = getDb();
  const claimed = [];
  const timestamp = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    const candidates = db.prepare(`
      SELECT * FROM ecommerce_generation_tasks
      WHERE status = 'queued' AND cancel_requested = 0
      ORDER BY created_at ASC, id ASC
      LIMIT 200
    `).all();
    const runningByUser = new Map(db.prepare(`
      SELECT user_id, COUNT(*) AS count FROM ecommerce_generation_tasks
      WHERE status IN ('running', 'cancelling')
      GROUP BY user_id
    `).all().map((row) => [row.user_id, Number(row.count || 0)]));
    const claim = db.prepare(`
      UPDATE ecommerce_generation_tasks
      SET status = 'running', attempts = attempts + 1, error_code = NULL,
        started_at = COALESCE(started_at, ?), completed_at = NULL, updated_at = ?
      WHERE id = ? AND status = 'queued' AND cancel_requested = 0
    `);
    const maximum = Math.max(1, Number(limit) || 1);
    const maximumPerUser = Math.max(1, Number(perUserLimit) || 1);
    for (const row of candidates) {
      if (claimed.length >= maximum) break;
      const running = runningByUser.get(row.user_id) || 0;
      if (running >= maximumPerUser) continue;
      if (!claim.run(timestamp, timestamp, row.id).changes) continue;
      runningByUser.set(row.user_id, running + 1);
      claimed.push({
        ...normalizeTask({
          ...row,
          status: 'running',
          attempts: Number(row.attempts || 0) + 1,
          started_at: row.started_at || timestamp,
          updated_at: timestamp
        }),
        userId: row.user_id
      });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return claimed;
}

export function completeEcommerceGenerationTask(userId, taskId, { status, generationId = null, errorCode = null } = {}) {
  const timestamp = now();
  const result = getDb().prepare(`
    UPDATE ecommerce_generation_tasks
    SET status = ?, generation_id = ?, error_code = ?, completed_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(status, generationId, errorCode, timestamp, timestamp, taskId, userId);
  return result.changes ? getEcommerceGenerationTask(userId, taskId) : null;
}

export function requestEcommerceGenerationTaskCancellation(userId, taskId) {
  const timestamp = now();
  const result = getDb().prepare(`
    UPDATE ecommerce_generation_tasks
    SET cancel_requested = 1,
        status = CASE
          WHEN status IN ('queued', 'interrupted') THEN 'cancelled'
          WHEN status = 'running' THEN 'cancelling'
          ELSE status
        END,
        error_code = CASE WHEN status IN ('queued', 'interrupted') THEN 'GENERATION_CANCELLED' ELSE error_code END,
        completed_at = CASE WHEN status IN ('queued', 'interrupted') THEN ? ELSE completed_at END,
        updated_at = ?
    WHERE id = ? AND user_id = ? AND status NOT IN ('succeeded', 'failed', 'cancelled', 'cancelling')
  `).run(timestamp, timestamp, taskId, userId);
  if (result.changes) return getEcommerceGenerationTask(userId, taskId);
  const current = getEcommerceGenerationTask(userId, taskId);
  return current?.status === 'cancelling' ? current : null;
}

export function retryEcommerceGenerationTask(userId, taskId) {
  const task = getEcommerceGenerationTask(userId, taskId);
  if (!task || !['failed', 'cancelled', 'interrupted'].includes(task.status)) return null;
  const active = getActiveEcommerceGenerationTask(userId, task.projectId, task.slotId);
  if (active && active.id !== taskId) return null;
  const timestamp = now();
  const project = getDb().prepare('SELECT updated_at FROM ecommerce_projects WHERE id = ? AND user_id = ?').get(task.projectId, userId);
  const requestJson = JSON.stringify({ ...task.request, projectUpdatedAt: project?.updated_at || task.request.projectUpdatedAt || '' });
  const result = getDb().prepare(`
    UPDATE ecommerce_generation_tasks
    SET status = 'queued', generation_id = NULL, cancel_requested = 0, error_code = NULL,
        request_json = ?, started_at = NULL, completed_at = NULL, updated_at = ?
    WHERE id = ? AND user_id = ? AND status IN ('failed', 'cancelled', 'interrupted')
  `).run(requestJson, timestamp, taskId, userId);
  return result.changes ? getEcommerceGenerationTask(userId, taskId) : null;
}
