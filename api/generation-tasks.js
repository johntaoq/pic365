import { authenticateRequest } from './_lib/local-auth.js';
import { getImageProviderConfig } from './_lib/local-db.js';
import {
  buildFreeGenerationRedoRequest,
  createFreeGenerationTask,
  createFreeGenerationTasks,
  deleteFreeGenerationTask,
  listFreeGenerationTasks,
  MAX_FREE_GENERATION_TASKS
} from './_lib/free-generation-queue.js';
import { readJsonBody } from './_lib/request.js';
import { startFreeGenerationWorker } from '../server/free-generation-worker.js';
import {
  resolveSourceImageSizeForModel,
  validateImageReferenceInputsForModel
} from '../shared/image-generation.js';

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function inlineReferenceMimeType(reference) {
  const match = String(reference?.imageDataUrl || '').match(/^data:([^;,]+)/i);
  const mimeType = String(match?.[1] || '').trim().toLowerCase();
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

function serverValidatedBatchRepairTask(task = {}) {
  if (task.taskMode !== 'batch-repair') return task;
  const provider = getImageProviderConfig(String(task.providerId || '').trim());
  if (!provider) return task;
  const references = Array.isArray(task.references) ? task.references.slice(0, 1) : [];
  if (!references.length && ['INVALID_REFERENCE_IMAGE_FORMAT', 'PROVIDER_REFERENCE_UNSUPPORTED'].includes(task.preflightError)) {
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
  const sizing = resolveSourceImageSizeForModel({
    width: task.sourceWidth,
    height: task.sourceHeight
  }, provider.model);
  return {
    ...task,
    references,
    size: sizing.valid ? sizing.size : '1024x1024',
    preflightError: sizing.valid ? '' : 'PROVIDER_SOURCE_SIZE_UNSUPPORTED'
  };
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
    return json(res, 200, { ok: true, tasks, count: tasks.length, limit: MAX_FREE_GENERATION_TASKS });
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 24 * 1024 * 1024 });
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
    if (body.action === 'redo') {
      const taskId = String(body.taskId || '').trim().slice(0, 160);
      if (!taskId) return json(res, 400, { ok: false, error: 'TASK_ID_REQUIRED' });
      const request = buildFreeGenerationRedoRequest(auth.user.id, taskId);
      const task = createFreeGenerationTask(auth.user.id, serverValidatedBatchRepairTask(request));
      return json(res, 201, { ok: true, task, limit: MAX_FREE_GENERATION_TASKS });
    }
    if (Array.isArray(body.tasks)) {
      const tasks = createFreeGenerationTasks(auth.user.id, body.tasks.map(serverValidatedBatchRepairTask));
      return json(res, 201, { ok: true, tasks, count: tasks.length, limit: MAX_FREE_GENERATION_TASKS });
    }
    const task = createFreeGenerationTask(auth.user.id, body);
    return json(res, 201, { ok: true, task, limit: MAX_FREE_GENERATION_TASKS });
  } catch (error) {
    const status = ['TASK_LIST_FULL', 'TASK_ALREADY_EXISTS', 'TASK_ACTIVE'].includes(error?.code) ? 409
      : error?.code === 'TASK_NOT_FOUND' ? 404
      : error?.code === 'REQUEST_BODY_TOO_LARGE' ? 413
        : 400;
    return json(res, status, { ok: false, error: error?.code || 'TASK_CREATE_FAILED' });
  }
}
