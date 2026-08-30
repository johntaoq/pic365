import { authenticateRequest } from './_lib/local-auth.js';
import { readJsonBody } from './_lib/request.js';
import {
  buildVideoRedoRequest,
  createVideoTask,
  deleteVideoTask,
  getVideoTask,
  listVideoTasks,
  MAX_ACTIVE_VIDEO_TASKS,
  MAX_VIDEO_TASKS
} from './_lib/video-generation-queue.js';
import { startVideoGenerationWorker } from '../server/video-generation-worker.js';

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  startVideoGenerationWorker();
  if (req.method === 'GET') {
    const tasks = listVideoTasks(auth.user.id);
    return res.status(200).json({ ok: true, tasks, count: tasks.length, limit: MAX_VIDEO_TASKS, activeLimit: MAX_ACTIVE_VIDEO_TASKS });
  }
  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 64 * 1024 });
  } catch (error) {
    return res.status(error?.status || 400).json({ ok: false, error: error?.code || 'INVALID_VIDEO_TASK_REQUEST' });
  }
  if (req.method === 'DELETE') {
    try {
      const task = deleteVideoTask(auth.user.id, String(body.taskId || '').trim());
      return task
        ? res.status(200).json({ ok: true, taskId: task.id })
        : res.status(404).json({ ok: false, error: 'VIDEO_TASK_NOT_FOUND' });
    } catch (error) {
      return res.status(error?.code === 'VIDEO_TASK_ACTIVE' ? 409 : 400).json({ ok: false, error: error?.code || 'VIDEO_TASK_DELETE_FAILED' });
    }
  }
  try {
    const request = body.action === 'redo'
      ? buildVideoRedoRequest(auth.user.id, String(body.taskId || '').trim(), {
          clientTaskId: body.clientTaskId,
          canvasTaskNodeId: body.canvasTaskNodeId,
          replaceTaskId: true
        })
      : body;
    const task = createVideoTask(auth.user.id, request);
    return res.status(task.duplicate ? 200 : 201).json({ ok: true, task, duplicate: Boolean(task.duplicate) });
  } catch (error) {
    const code = error?.code || 'VIDEO_TASK_CREATE_FAILED';
    const status = ['VIDEO_TASK_ACTIVE_LIMIT', 'VIDEO_TASK_LIST_FULL', 'VIDEO_TASK_ACTIVE'].includes(code) ? 409
      : code === 'CANVAS_PROJECT_NOT_FOUND' || code === 'VIDEO_TASK_NOT_FOUND' || code === 'VIDEO_SOURCE_NOT_FOUND' ? 404
        : code === 'CREDITS_REQUIRED' || code === 'GROUP_BUDGET_REQUIRED' || code === 'GROUP_BALANCE_REQUIRED' ? 402
          : 400;
    const duplicate = String(body.clientTaskId || '').trim() ? getVideoTask(auth.user.id, String(body.clientTaskId).trim()) : null;
    if (duplicate) return res.status(200).json({ ok: true, task: duplicate, duplicate: true });
    return res.status(status).json({ ok: false, error: code });
  }
}
