import { authenticateRequest } from '../_lib/local-auth.js';
import { getAccessibleAsset, permanentlyDeleteAsset, repairAssetFileMetadata, updateAsset } from '../_lib/media-assets.js';
import { readJsonBody } from '../_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  const assetId = String(req.query?.id || '').trim();
  if (req.method === 'GET') {
    await repairAssetFileMetadata(auth.user.id, assetId);
    const asset = getAccessibleAsset(auth.user.id, assetId, { includeDeleted: true, isSuperAdmin: auth.user.isSuperAdmin });
    return asset ? json(res, 200, { ok: true, asset }) : json(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  }
  try {
    if (req.method === 'DELETE' && req.query?.permanent === '1') {
      const removed = await permanentlyDeleteAsset(auth.user.id, assetId);
      return removed ? json(res, 200, { ok: true }) : json(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
    }
    const body = req.method === 'DELETE' ? { deleted: true } : await readJsonBody(req);
    const asset = updateAsset(auth.user.id, assetId, body);
    return asset ? json(res, 200, { ok: true, asset }) : json(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  } catch (error) {
    return json(res, error?.code === 'ASSET_IN_USE' ? 409 : 400, { ok: false, error: error?.code || 'ASSET_UPDATE_FAILED' });
  }
}
