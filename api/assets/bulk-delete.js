import { authenticateRequest } from '../_lib/local-auth.js';
import { moveAssetsToTrash } from '../_lib/media-assets.js';
import { readJsonBody } from '../_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  try {
    const body = await readJsonBody(req);
    const result = moveAssetsToTrash(auth.user.id, body.assetIds);
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    const code = error?.code || 'BULK_DELETE_FAILED';
    const status = code === 'ASSET_NOT_FOUND' ? 404 : code === 'ASSET_NOT_OWNED' ? 403 : 400;
    return json(res, status, { ok: false, error: code });
  }
}
