import { authenticateRequest } from '../_lib/local-auth.js';
import { cancelGenerationTask } from '../_lib/ecommerce-generation-runtime.js';
import {
  getEcommerceGenerationTask,
  requestEcommerceGenerationTaskCancellation
} from '../_lib/ecommerce-p1-db.js';
import { readJsonBody } from '../_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

const TERMINAL_TASK_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);

async function waitForCancellation(userId, taskId, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  let task = getEcommerceGenerationTask(userId, taskId);
  while (task && !TERMINAL_TASK_STATUSES.has(task.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    task = getEcommerceGenerationTask(userId, taskId);
  }
  return task;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_TASK' });
  }

  const taskId = String(body.taskId || '').trim().slice(0, 120);
  if (!taskId) return json(res, 400, { ok: false, error: 'INVALID_TASK' });
  const persistedTask = requestEcommerceGenerationTaskCancellation(auth.user.id, taskId);
  if (!persistedTask) return json(res, 404, { ok: false, error: 'TASK_NOT_FOUND' });
  const result = cancelGenerationTask(auth.user.id, taskId);
  const task = persistedTask.status === 'cancelled'
    ? persistedTask
    : await waitForCancellation(auth.user.id, taskId);
  return json(res, task?.status === 'cancelled' ? 200 : 202, {
    ok: true,
    accepted: result.accepted,
    active: result.active,
    task: task || persistedTask
  });
}
