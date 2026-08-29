import { authenticateRequest } from '../_lib/local-auth.js';
import { copyInfiniteCanvasProject, createInfiniteCanvasProject, listInfiniteCanvasProjects } from '../_lib/infinite-canvas-db.js';
import { readJsonBody } from '../_lib/request.js';

function json(res, status, payload) {
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      projects: listInfiniteCanvasProjects(auth.user.id, {
        includeArchived: req.query?.archived === '1' || req.query?.deleted === '1',
        includeDeleted: req.query?.deleted === '1'
      })
    });
  }
  try {
    const body = await readJsonBody(req, { maxBytes: 512 * 1024 });
    const project = body.sourceProjectId
      ? copyInfiniteCanvasProject(auth.user.id, String(body.sourceProjectId), body)
      : createInfiniteCanvasProject(auth.user.id, body);
    if (!project) return json(res, 404, { ok: false, error: 'CANVAS_PROJECT_NOT_FOUND' });
    return json(res, 201, { ok: true, project });
  } catch (error) {
    return json(res, 400, { ok: false, error: error?.code || 'CANVAS_PROJECT_CREATE_FAILED' });
  }
}
