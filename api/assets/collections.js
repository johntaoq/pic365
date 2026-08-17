import { authenticateRequest } from '../_lib/local-auth.js';
import { createCollection, deleteCollection, listCollections } from '../_lib/media-assets.js';
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
  if (req.method === 'GET') return json(res, 200, { ok: true, collections: listCollections(auth.user.id) });
  if (req.method === 'DELETE') {
    const removed = deleteCollection(auth.user.id, String(req.query?.id || ''));
    return removed ? json(res, 200, { ok: true }) : json(res, 404, { ok: false, error: 'COLLECTION_NOT_FOUND' });
  }
  const body = await readJsonBody(req).catch(() => ({}));
  const collection = createCollection(auth.user.id, body);
  return json(res, 201, { ok: true, collection });
}
