import { authenticateRequest } from '../_lib/local-auth.js';
import {
  deleteInfiniteCanvasProject,
  getInfiniteCanvasProject,
  permanentlyDeleteInfiniteCanvasProject,
  updateInfiniteCanvasProject
} from '../_lib/infinite-canvas-db.js';
import { readJsonBody } from '../_lib/request.js';

function json(res, status, payload) {
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'GET') {
    const projectId = String(req.query?.id || '').trim();
    if (!projectId) return json(res, 400, { ok: false, error: 'CANVAS_PROJECT_ID_REQUIRED' });
    const project = getInfiniteCanvasProject(auth.user.id, projectId, { includeDeleted: req.query?.deleted === '1' });
    return project
      ? json(res, 200, { ok: true, project })
      : json(res, 404, { ok: false, error: 'CANVAS_PROJECT_NOT_FOUND' });
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 4 * 1024 * 1024 });
  } catch (error) {
    return json(res, error?.status || 400, { ok: false, error: error?.code || 'INVALID_CANVAS_PROJECT_REQUEST' });
  }
  const projectId = String(body.projectId || '').trim();
  if (!projectId) return json(res, 400, { ok: false, error: 'CANVAS_PROJECT_ID_REQUIRED' });
  try {
    const result = req.method === 'DELETE'
      ? body.permanent
        ? permanentlyDeleteInfiniteCanvasProject(auth.user.id, projectId, body.revision)
        : deleteInfiniteCanvasProject(auth.user.id, projectId, body.revision)
      : updateInfiniteCanvasProject(auth.user.id, projectId, body);
    if (!result) return json(res, 404, { ok: false, error: 'CANVAS_PROJECT_NOT_FOUND' });
    if (result.conflict) return json(res, 409, { ok: false, error: 'CANVAS_REVISION_CONFLICT', project: result.project });
    return result.permanent
      ? json(res, 200, { ok: true, permanent: true, projectId: result.projectId })
      : json(res, 200, { ok: true, project: result.project });
  } catch (error) {
    const status = error?.code === 'CANVAS_NODE_LIMIT_EXCEEDED' ? 413
      : error?.code === 'CANVAS_PROJECT_NOT_TRASHED' ? 409 : 400;
    return json(res, status, { ok: false, error: error?.code || 'CANVAS_PROJECT_UPDATE_FAILED' });
  }
}
