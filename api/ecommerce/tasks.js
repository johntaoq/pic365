import { getEcommerceProject, getGeneration } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import {
  createEcommerceGenerationTasks,
  getActiveEcommerceGenerationTask,
  getEcommerceProjectOutput,
  listEcommerceGenerationTasks,
  retryEcommerceGenerationTask
} from '../_lib/ecommerce-p1-db.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';
import { readJsonBody } from '../_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'GET') {
    const projectId = cleanText(req.query?.projectId, 80);
    if (!projectId || !getEcommerceProject(auth.user.id, projectId)) {
      return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
    }
    return json(res, 200, { ok: true, tasks: listEcommerceGenerationTasks(auth.user.id, projectId) });
  }

  const rateLimit = checkRateLimit(req, { key: `ecommerce-tasks:${auth.user.id}`, limit: 40, windowMs: 60 * 1000 });
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_TASK_REQUEST' });
  }

  if (body.action === 'retry') {
    const task = retryEcommerceGenerationTask(auth.user.id, cleanText(body.taskId, 120));
    if (!task) return json(res, 409, { ok: false, error: 'TASK_NOT_RETRYABLE' });
    return json(res, 200, { ok: true, task });
  }

  const projectId = cleanText(body.projectId, 80);
  const project = getEcommerceProject(auth.user.id, projectId);
  if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  const requests = Array.isArray(body.requests)
    ? body.requests
    : (Array.isArray(body.slotIds) ? body.slotIds.map((slotId) => ({ slotId })) : []);
  if (!requests.length || requests.length > 30) {
    return json(res, 400, { ok: false, error: 'INVALID_TASK_REQUEST' });
  }

  const normalized = [];
  const seenSlots = new Set();
  for (const request of requests) {
    const slotId = cleanText(request.slotId, 80);
    if (!project.selectedSlots.includes(slotId) || seenSlots.has(slotId)) {
      return json(res, 400, { ok: false, error: 'INVALID_PROJECT_SLOT' });
    }
    seenSlots.add(slotId);
    if (getEcommerceProjectOutput(auth.user.id, projectId, slotId)?.locked) {
      return json(res, 409, { ok: false, error: 'SLOT_LOCKED', slotId });
    }
    if (getActiveEcommerceGenerationTask(auth.user.id, projectId, slotId)) {
      return json(res, 409, { ok: false, error: 'TASK_ALREADY_ACTIVE', slotId });
    }
    const baseGenerationId = cleanText(request.baseGenerationId, 80);
    if (baseGenerationId) {
      const generation = getGeneration(auth.user.id, baseGenerationId);
      if (!generation || generation.project_id !== projectId || generation.slot_id !== slotId || generation.status !== 'succeeded' || generation.archived_at) {
        return json(res, 400, { ok: false, error: 'INVALID_BASE_VERSION' });
      }
    }
    normalized.push({
      id: cleanText(request.id, 120),
      slotId,
      quality: request.quality === 'low' ? 'low' : 'medium',
      adjustment: cleanText(request.adjustment, 1200),
      baseGenerationId,
      projectUpdatedAt: project.updatedAt
    });
  }

  try {
    const tasks = createEcommerceGenerationTasks(auth.user.id, projectId, normalized);
    return json(res, 201, { ok: true, tasks });
  } catch (error) {
    if (error?.code === 'TASK_ALREADY_ACTIVE') {
      return json(res, 409, { ok: false, error: 'TASK_ALREADY_ACTIVE' });
    }
    throw error;
  }
}
