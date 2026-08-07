import { createUser, getUserByEmail } from '../_lib/local-db.js';
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

  const rateLimit = checkRateLimit(req, { key: 'auth-register', limit: 5, windowMs: 15 * 60 * 1000 });
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
  const fullName = String(body.fullName || '').trim().slice(0, 80);
  if (!validEmail(email)) return json(res, 400, { ok: false, error: 'INVALID_EMAIL' });
  if (!validPassword(password)) return json(res, 400, { ok: false, error: 'INVALID_PASSWORD' });
  if (getUserByEmail(email)) return json(res, 409, { ok: false, error: 'EMAIL_ALREADY_REGISTERED' });

  try {
    const user = createUser({ email, password, fullName });
    createLoginSession(req, res, user.id);
    return json(res, 201, { ok: true, user: jsonUser(user) });
  } catch (error) {
    console.warn('Failed to register local user', { message: String(error?.message || 'unknown').slice(0, 240) });
    return json(res, 500, { ok: false, error: 'REGISTER_FAILED' });
  }
}
