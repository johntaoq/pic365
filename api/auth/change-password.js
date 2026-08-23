import { changeOwnPassword } from '../_lib/account-security.js';
import { authenticateRequest, getSessionToken, validPassword } from '../_lib/local-auth.js';
import { requestAuditMetadata } from '../_lib/governance.js';
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

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  const rateLimit = checkRateLimit(req, {
    key: 'auth-change-password',
    identifier: auth.user.id,
    limit: 8,
    windowMs: 15 * 60 * 1000
  });
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_REQUEST' });
  }

  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  const confirmPassword = String(body.confirmPassword || '');
  if (!validPassword(currentPassword) || !validPassword(newPassword)) {
    return json(res, 400, { ok: false, error: 'INVALID_PASSWORD' });
  }
  if (newPassword !== confirmPassword) {
    return json(res, 400, { ok: false, error: 'PASSWORD_MISMATCH' });
  }

  try {
    const result = changeOwnPassword({
      userId: auth.user.id,
      currentPassword,
      newPassword,
      currentSessionToken: getSessionToken(req),
      auditMeta: requestAuditMetadata(req)
    });
    return json(res, 200, {
      ok: true,
      user: result.user,
      otherSessionsRevoked: result.revokedSessions > 0
    });
  } catch (error) {
    const code = error?.code || 'PASSWORD_CHANGE_FAILED';
    if (code === 'INVALID_CURRENT_PASSWORD') return json(res, 403, { ok: false, error: code });
    if (code === 'PASSWORD_UNCHANGED') return json(res, 400, { ok: false, error: code });
    if (code === 'AUTH_REQUIRED') return json(res, 401, { ok: false, error: code });
    console.warn('Self-service password change failed', {
      userId: auth.user.id,
      code,
      message: String(error?.message || 'unknown').slice(0, 160)
    });
    return json(res, 500, { ok: false, error: 'PASSWORD_CHANGE_FAILED' });
  }
}
