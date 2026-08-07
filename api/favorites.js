import { addFavorite, listFavorites, removeFavorite } from './_lib/local-db.js';
import { authenticateRequest } from './_lib/local-auth.js';
import { readJsonBody } from './_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function normalizeFavorite(row) {
  return row
    ? { caseId: Number(row.case_id), createdAt: row.created_at || '' }
    : null;
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.status || 401, {
      ok: false,
      error: auth.error,
      loginRequired: auth.error === 'AUTH_REQUIRED'
    });
  }

  if (req.method === 'GET') {
    return json(res, 200, { ok: true, favorites: listFavorites(auth.user.id).map(normalizeFavorite) });
  }

  let body = {};
  if (req.method === 'POST') {
    try {
      body = await readJsonBody(req);
    } catch {
      return json(res, 400, { ok: false, error: 'INVALID_FAVORITE' });
    }
  }

  const caseId = Number(req.query?.caseId || body.caseId);
  if (!Number.isInteger(caseId) || caseId <= 0) return json(res, 400, { ok: false, error: 'INVALID_CASE' });

  if (req.method === 'POST') {
    return json(res, 201, { ok: true, favorite: normalizeFavorite(addFavorite(auth.user.id, caseId)) });
  }

  removeFavorite(auth.user.id, caseId);
  return json(res, 200, { ok: true });
}
