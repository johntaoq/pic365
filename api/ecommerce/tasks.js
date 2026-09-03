import {
  getEcommerceProject,
  getEcommerceProjectAsset,
  getGeneration,
  getImageProviderConfig,
  setEcommerceProjectImageProvider
} from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import {
  createEcommerceGenerationTasks,
  getActiveEcommerceGenerationTask,
  getEcommerceGenerationTask,
  getEcommerceProjectOutput,
  listEcommerceGenerationTasks,
  retryEcommerceGenerationTask
} from '../_lib/ecommerce-p1-db.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';
import { readJsonBody } from '../_lib/request.js';
import { startEcommerceGenerationWorker } from '../../server/ecommerce-generation-worker.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

const REFINEMENT_AREAS = new Set(['auto', 'subject', 'background', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);
const REFINEMENT_ROLES = new Set(['detail', 'composition', 'lighting', 'scene']);
const IMAGE_QUALITIES = new Set(['low', 'medium', 'high']);

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  startEcommerceGenerationWorker();

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
    const taskId = cleanText(body.taskId, 120);
    const existingTask = getEcommerceGenerationTask(auth.user.id, taskId);
    const retryProject = existingTask ? getEcommerceProject(auth.user.id, existingTask.projectId) : null;
    const retryProvider = retryProject
      ? getImageProviderConfig(retryProject.imageProviderId, { includeSecret: false, userId: auth.user.id })
      : null;
    if (existingTask && !retryProvider) return json(res, 403, { ok: false, error: 'AI_PROVIDER_NOT_AVAILABLE' });
    const task = retryEcommerceGenerationTask(auth.user.id, taskId);
    if (!task) return json(res, 409, { ok: false, error: 'TASK_NOT_RETRYABLE' });
    return json(res, 200, { ok: true, task });
  }

  const projectId = cleanText(body.projectId, 80);
  let project = getEcommerceProject(auth.user.id, projectId);
  if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  const requestedProviderId = cleanText(body.providerId, 80);
  const providerConfig = getImageProviderConfig(requestedProviderId || project.imageProviderId, { includeSecret: false, userId: auth.user.id });
  if (!providerConfig) return json(res, 400, { ok: false, error: 'AI_PROVIDER_NOT_CONFIGURED' });
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
    if (request.referenceInputs != null && !Array.isArray(request.referenceInputs)) {
      return json(res, 400, { ok: false, error: 'INVALID_REFINEMENT_ASSETS' });
    }
    if ((request.referenceInputs || []).length > 4) {
      return json(res, 400, { ok: false, error: 'INVALID_REFINEMENT_ASSETS' });
    }
    const referenceInputs = [];
    const seenAssets = new Set();
    for (const input of request.referenceInputs || []) {
      const assetId = cleanText(input?.assetId, 80);
      if (!assetId || seenAssets.has(assetId)) continue;
      const asset = getEcommerceProjectAsset(auth.user.id, assetId);
      if (!asset || asset.projectId !== projectId) {
        return json(res, 400, { ok: false, error: 'INVALID_REFINEMENT_ASSET' });
      }
      seenAssets.add(assetId);
      referenceInputs.push({
        assetId,
        role: REFINEMENT_ROLES.has(input?.role) ? input.role : 'detail'
      });
    }
    const targetArea = REFINEMENT_AREAS.has(request.targetArea) ? request.targetArea : 'auto';
    normalized.push({
      id: cleanText(request.id, 120),
      slotId,
      quality: IMAGE_QUALITIES.has(request.quality) ? request.quality : 'low',
      adjustment: cleanText(request.adjustment, 1200),
      baseGenerationId,
      targetArea,
      referenceInputs
    });
  }

  if (project.imageProviderId !== providerConfig.id) {
    project = setEcommerceProjectImageProvider(auth.user.id, projectId, providerConfig.id);
    if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  }
  const taskRequests = normalized.map((request) => ({
    ...request,
    projectUpdatedAt: project.updatedAt
  }));

  try {
    const tasks = createEcommerceGenerationTasks(auth.user.id, projectId, taskRequests);
    return json(res, 201, { ok: true, tasks });
  } catch (error) {
    if (error?.code === 'TASK_ALREADY_ACTIVE') {
      return json(res, 409, { ok: false, error: 'TASK_ALREADY_ACTIVE' });
    }
    throw error;
  }
}
