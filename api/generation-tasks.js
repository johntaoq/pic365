import { authenticateRequest } from './_lib/local-auth.js';
import {
  createFreeGenerationTask,
  deleteFreeGenerationTask,
  listFreeGenerationTasks,
  MAX_FREE_GENERATION_TASKS
} from './_lib/free-generation-queue.js';
import { readJsonBody } from './_lib/request.js';
import { startFreeGenerationWorker } from '../server/free-generation-worker.js';

function json(res, status, payload) {
  return res.status(status).json(payload);
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
    const task = createFreeGenerationTask(auth.user.id, body);
    return json(res, 201, { ok: true, task, limit: MAX_FREE_GENERATION_TASKS });
  } catch (error) {
    const status = error?.code === 'TASK_LIST_FULL' || error?.code === 'TASK_ALREADY_EXISTS' ? 409
      : error?.code === 'REQUEST_BODY_TOO_LARGE' ? 413
        : 400;
    return json(res, status, { ok: false, error: error?.code || 'TASK_CREATE_FAILED' });
  }
}
