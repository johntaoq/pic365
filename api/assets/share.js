import { authenticateRequest } from '../_lib/local-auth.js';
import { listAssetPermissions, revokeAssetPermission, shareAsset } from '../_lib/media-assets.js';
import { readJsonBody } from '../_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  if (req.method === 'GET') {
    const permissions = listAssetPermissions(auth.user.id, String(req.query?.assetId || ''));
    return permissions ? json(res, 200, { ok: true, permissions }) : json(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  }
  const body = await readJsonBody(req).catch(() => ({}));
  try {
    if (req.method === 'DELETE') {
      const removed = revokeAssetPermission(auth.user.id, String(body.assetId || ''), body.principalType, body.principalId);
      return removed ? json(res, 200, { ok: true }) : json(res, 404, { ok: false, error: 'ASSET_PERMISSION_NOT_FOUND' });
    }
    const share = shareAsset(auth.user.id, String(body.assetId || ''), body);
    return json(res, 200, { ok: true, share });
  } catch (error) {
    const code = error?.code || 'ASSET_SHARE_FAILED';
    return json(res, code.endsWith('NOT_FOUND') ? 404 : 400, { ok: false, error: code });
  }
}
