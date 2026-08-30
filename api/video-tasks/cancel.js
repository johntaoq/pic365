import { authenticateRequest } from '../_lib/local-auth.js';
import { requestVideoTaskCancellation } from '../_lib/video-generation-queue.js';
import { readJsonBody } from '../_lib/request.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  const body = await readJsonBody(req, { maxBytes: 16 * 1024 }).catch(() => ({}));
  const task = requestVideoTaskCancellation(auth.user.id, String(body.taskId || '').trim());
  return task
    ? res.status(200).json({ ok: true, task })
    : res.status(404).json({ ok: false, error: 'VIDEO_TASK_NOT_FOUND' });
}
