import { authenticateRequest } from '../_lib/local-auth.js';
import { listAdminUsers } from '../_lib/local-db.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.status || 401, { ok: false, error: auth.error });
  }

  if (!auth.profile?.isSuperAdmin) {
    return json(res, 403, { ok: false, error: 'FORBIDDEN' });
  }

  try {
    return json(res, 200, {
      ok: true,
      users: listAdminUsers(100)
    });
  } catch (error) {
    console.warn('Failed to list admin users', {
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 500, { ok: false, error: 'ADMIN_USERS_LOAD_FAILED' });
  }
}
