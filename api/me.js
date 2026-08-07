import { getUserProfile, getDb } from './_lib/local-db.js';
import { authenticateRequest } from './_lib/local-auth.js';
import { readJsonBody } from './_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function sanitizeDisplayName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'PATCH') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return json(res, 400, { ok: false, error: 'INVALID_PROFILE' });
    }
    const fullName = sanitizeDisplayName(body.fullName || body.full_name);
    if (!fullName) return json(res, 400, { ok: false, error: 'INVALID_PROFILE' });
    getDb().prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?').run(fullName, new Date().toISOString(), auth.user.id);
  }

  return json(res, 200, { ok: true, user: getUserProfile(auth.user.id) });
}
