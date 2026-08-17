import { cancelFreeGenerationTask } from '../_lib/free-generation-tasks.js';
import { getFreeGenerationTask, requestFreeGenerationTaskCancellation } from '../_lib/free-generation-queue.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { readJsonBody } from '../_lib/request.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: 'INVALID_TASK_REQUEST' });
  }
  const taskId = String(body.taskId || '').trim().slice(0, 160);
  if (!taskId) return res.status(400).json({ ok: false, error: 'TASK_ID_REQUIRED' });
  const existing = getFreeGenerationTask(auth.user.id, taskId);
  if (!existing) {
    return res.status(404).json({ ok: false, error: 'TASK_NOT_FOUND' });
  }
  const task = requestFreeGenerationTaskCancellation(auth.user.id, taskId);
  cancelFreeGenerationTask(auth.user.id, taskId);
  return res.status(200).json({ ok: true, taskId, status: task?.status || 'cancelling', task });
}
