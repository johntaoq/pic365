import { getUserByEmail, verifyPassword } from '../_lib/local-db.js';
import { createLoginSession, jsonUser, validEmail, validPassword } from '../_lib/local-auth.js';
import { readJsonBody } from '../_lib/request.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const rateLimit = checkRateLimit(req, { key: 'auth-login', limit: 12, windowMs: 15 * 60 * 1000 });
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_REQUEST' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!validEmail(email) || !validPassword(password)) return json(res, 401, { ok: false, error: 'INVALID_CREDENTIALS' });

  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return json(res, 401, { ok: false, error: 'INVALID_CREDENTIALS' });
  }

  createLoginSession(req, res, user.id);
  return json(res, 200, { ok: true, user: jsonUser(user) });
}
