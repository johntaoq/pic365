import { authenticateRequest, jsonUser } from '../_lib/local-auth.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req, { allowAnonymous: true });
  return json(res, 200, {
    ok: true,
    session: auth.user ? { user: jsonUser(auth.user) } : null,
    user: auth.user ? jsonUser(auth.user) : null
  });
}
