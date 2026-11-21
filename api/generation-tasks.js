import { authenticateRequest } from './_lib/local-auth.js';
import { getImageProviderConfig } from './_lib/local-db.js';
import {
  buildFreeGenerationRedoRequest,
  createFreeGenerationTask,
  createFreeGenerationTasks,
  deleteFreeGenerationTask,
  getFreeGenerationTask,
  listFreeGenerationTasks,
  MAX_ACTIVE_FREE_GENERATION_TASKS,
  MAX_FREE_GENERATION_TASKS
} from './_lib/free-generation-queue.js';
import { readJsonBody } from './_lib/request.js';
import { getInfiniteCanvasProject } from './_lib/infinite-canvas-db.js';
import { startFreeGenerationWorker } from '../server/free-generation-worker.js';
import { expandSharedTaskReferences, SHARED_REFERENCE_PROTOCOL_VERSION } from '../shared/generation-task-references.js';
import { LAYOUT_WATERMARK_PROTOCOL_VERSION } from '../shared/ecommerce-layout-watermark.js';
import { validateEcommerceLayoutReferences } from '../shared/ecommerce-layout-studio.js';
import { prepareEcommerceLayoutWatermark } from './_lib/ecommerce-layout-watermark.js';
import { clothingStudioPrompt, normalizeClothingStudioRequest, validateClothingStudioRequest } from '../shared/clothing-try-on.js';
import { validatePrivateTryOnReference } from './_lib/clothing-try-on-models.js';
import {
  IMAGE_GENERATION_REQUEST_MAX_BYTES,
  isMaiImage27Model,
  resolveSourceImageSizeForModel,
  validateImageReferenceInputsForModel,
  validateImageSizeForModel
} from '../shared/image-generation.js';

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function inlineReferenceMimeType(reference) {
  const match = String(reference?.imageDataUrl || '').match(/^data:([^;,]+)/i);
  const mimeType = String(match?.[1] || '').trim().toLowerCase();
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

function serverValidatedBatchRepairTask(task = {}, userId = '') {
  if (task.taskMode !== 'batch-repair') return task;
  const provider = getImageProviderConfig(String(task.providerId || '').trim(), { includeSecret: false, userId });
  if (!provider) return task;
  const references = Array.isArray(task.references) ? task.references.slice(0, 1) : [];
  if (!references.length && [
    'INVALID_REFERENCE_IMAGE_FORMAT',
    'PROVIDER_REFERENCE_UNSUPPORTED',
    'PROVIDER_SOURCE_SIZE_UNSUPPORTED',
    'PROVIDER_OUTPUT_SIZE_UNSUPPORTED'
  ].includes(task.preflightError)) {
    return { ...task, references: [], size: '1024x1024' };
  }
  const referenceCheck = validateImageReferenceInputsForModel({
    model: provider.model,
    count: references.length,
    mimeTypes: references.map(inlineReferenceMimeType)
  });
  if (!referenceCheck.valid) {
    return {
      ...task,
      references: [],
      size: '1024x1024',
      preflightError: referenceCheck.error === 'INVALID_REFERENCE_IMAGE_FORMAT'
        ? 'INVALID_REFERENCE_IMAGE_FORMAT'
        : 'PROVIDER_REFERENCE_UNSUPPORTED'
    };
  }
  const preserveSourceSize = task.preserveSourceSize !== false;
  const sizing = preserveSourceSize
    ? resolveSourceImageSizeForModel({
        width: task.sourceWidth,
        height: task.sourceHeight
      }, provider.model)
    : { ...validateImageSizeForModel(task.size, provider.model), size: task.size };
  return {
    ...task,
    references,
    size: sizing.valid ? sizing.size : '1024x1024',
    preserveSourceSize,
    preflightError: sizing.valid
      ? ''
      : preserveSourceSize ? 'PROVIDER_SOURCE_SIZE_UNSUPPORTED' : 'PROVIDER_OUTPUT_SIZE_UNSUPPORTED'
  };
}

function serverAuthorizedTask(userId, task = {}) {
  const provider = getImageProviderConfig(String(task.providerId || '').trim(), { includeSecret: false, userId });
  if (!provider) throw Object.assign(new Error('AI_PROVIDER_NOT_AVAILABLE'), { code: 'AI_PROVIDER_NOT_AVAILABLE' });
  task = normalizeClothingStudioRequest(task);
  const studioWorkflow = validateClothingStudioRequest(task, { model: provider.model });
  if (studioWorkflow) validatePrivateTryOnReference(userId, studioWorkflow, task.references);
  const authorized = serverValidatedBatchRepairTask({ ...task, providerId: provider.id, ...(studioWorkflow ? { studioWorkflow, prompt: clothingStudioPrompt(studioWorkflow) } : {}) }, userId);
  if (isMaiImage27Model(provider.model)) {
    const size = String(authorized.size || '1024x1024').trim().toLowerCase();
    const sizeCheck = validateImageSizeForModel(size, provider.model);
    if (!sizeCheck.valid) {
      throw Object.assign(new Error('INVALID_SIZE'), { code: 'INVALID_SIZE', reason: sizeCheck.error });
    }
    authorized.size = size;
  }
  return authorized;
}

async function validateLayoutWatermarks(tasks) {
  for (const task of tasks) {
    if (task.layoutWatermark == null) continue;
    validateEcommerceLayoutReferences(task);
    await prepareEcommerceLayoutWatermark(task.layoutWatermark);
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  startFreeGenerationWorker();

  if (req.method === 'GET') {
    const tasks = listFreeGenerationTasks(auth.user.id);
    return json(res, 200, {
      ok: true, tasks, count: tasks.length, limit: MAX_FREE_GENERATION_TASKS,
      activeLimit: MAX_ACTIVE_FREE_GENERATION_TASKS,
      capabilities: {
        sharedReferences: SHARED_REFERENCE_PROTOCOL_VERSION,
        layoutWatermark: LAYOUT_WATERMARK_PROTOCOL_VERSION
      }
    });
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: IMAGE_GENERATION_REQUEST_MAX_BYTES });
  } catch (error) {
    return json(res, error?.status || 400, { ok: false, error: error?.code || 'INVALID_TASK_REQUEST' });
  }

  if (req.method === 'DELETE') {
    const taskId = String(body.taskId || '').trim().slice(0, 160);
    if (!taskId) return json(res, 400, { ok: false, error: 'TASK_ID_REQUIRED' });
    try {
      const task = deleteFreeGenerationTask(auth.user.id, taskId);
      if (!task) return json(res, 404, { ok: false, error: 'TASK_NOT_FOUND' });
      return json(res, 200, { ok: true, taskId });
    } catch (error) {
      return json(res, error?.code === 'TASK_ACTIVE' ? 409 : 400, { ok: false, error: error?.code || 'TASK_DELETE_FAILED' });
    }
  }

  try {
    const canvasProjectIds = Array.isArray(body.tasks)
      ? body.tasks.map((task) => String(task?.canvasProjectId || '').trim()).filter(Boolean)
      : [String(body.canvasProjectId || '').trim()].filter(Boolean);
    if (canvasProjectIds.some((projectId) => !getInfiniteCanvasProject(auth.user.id, projectId))) {
      return json(res, 404, { ok: false, error: 'CANVAS_PROJECT_NOT_FOUND' });
    }
    if (body.action === 'redo') {
      const taskId = String(body.taskId || '').trim().slice(0, 160);
      if (!taskId) return json(res, 400, { ok: false, error: 'TASK_ID_REQUIRED' });
      const request = buildFreeGenerationRedoRequest(auth.user.id, taskId, {
        clientTaskId: body.clientTaskId,
        canvasTaskNodeId: body.canvasTaskNodeId,
        canvasX: body.canvasX,
        canvasY: body.canvasY,
        replaceTaskId: Boolean(body.replaceTaskId)
      });
      const authorized = serverAuthorizedTask(auth.user.id, request);
      await validateLayoutWatermarks([authorized]);
      const task = createFreeGenerationTask(auth.user.id, authorized);
      return json(res, 201, { ok: true, task, limit: MAX_FREE_GENERATION_TASKS, activeLimit: MAX_ACTIVE_FREE_GENERATION_TASKS });
    }
    if (Array.isArray(body.tasks)) {
      const requests = expandSharedTaskReferences(body.tasks, body.sharedReferences);
      const authorized = requests.map((task) => serverAuthorizedTask(auth.user.id, task));
      await validateLayoutWatermarks(authorized);
      const tasks = createFreeGenerationTasks(auth.user.id, authorized);
      return json(res, 201, { ok: true, tasks, count: tasks.length, limit: MAX_FREE_GENERATION_TASKS, activeLimit: MAX_ACTIVE_FREE_GENERATION_TASKS });
    }
    const authorized = serverAuthorizedTask(auth.user.id, body);
    await validateLayoutWatermarks([authorized]);
    const task = createFreeGenerationTask(auth.user.id, authorized);
    return json(res, 201, { ok: true, task, limit: MAX_FREE_GENERATION_TASKS, activeLimit: MAX_ACTIVE_FREE_GENERATION_TASKS });
  } catch (error) {
    if (error?.code === 'TASK_ALREADY_EXISTS' && !Array.isArray(body.tasks)) {
      const taskId = String(body.clientTaskId || '').trim().slice(0, 160);
      const task = taskId ? getFreeGenerationTask(auth.user.id, taskId) : null;
      if (task) return json(res, 200, { ok: true, task, limit: MAX_FREE_GENERATION_TASKS, duplicate: true });
    }
    const status = ['TASK_LIST_FULL', 'TASK_ACTIVE_LIMIT', 'TASK_ALREADY_EXISTS', 'TASK_ACTIVE'].includes(error?.code) ? 409
      : error?.code === 'TASK_NOT_FOUND' ? 404
      : error?.code === 'REQUEST_BODY_TOO_LARGE' ? 413
        : 400;
    return json(res, status, { ok: false, error: error?.code || 'TASK_CREATE_FAILED',
      ...(error?.code === 'INVALID_SIZE' && error.reason ? { reason: error.reason } : {}) });
  }
}
