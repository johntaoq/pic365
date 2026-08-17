import { authenticateRequest } from '../_lib/local-auth.js';
import { listEcommerceProjects } from '../_lib/local-db.js';
import { linkAssetToProject, listAssetProjectLinks } from '../_lib/media-assets.js';
import { readJsonBody } from '../_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  if (req.method === 'GET') {
    const assetId = String(req.query?.assetId || '').trim();
    if (assetId) {
      const links = listAssetProjectLinks(auth.user.id, assetId);
      return links
        ? json(res, 200, { ok: true, links })
        : json(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
    }
    return json(res, 200, { ok: true, projects: listEcommerceProjects(auth.user.id, 100) });
  }
  try {
    const body = await readJsonBody(req);
    const result = linkAssetToProject(auth.user.id, String(body.assetId || ''), String(body.projectId || ''), body);
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    const code = error?.code || 'ASSET_PROJECT_LINK_FAILED';
    return json(res, code.endsWith('NOT_FOUND') ? 404 : 400, { ok: false, error: code });
  }
}
