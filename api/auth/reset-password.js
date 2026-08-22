import { resetPasswordWithVerificationCode } from '../_lib/email-verification.js';
import { validEmail, validPassword } from '../_lib/local-auth.js';
import { readJsonBody } from '../_lib/request.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function auditMetadata(req) {
  return {
    ipAddress: String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(),
    userAgent: String(req.headers?.['user-agent'] || '')
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const ipLimit = checkRateLimit(req, { key: 'auth-password-reset-ip', limit: 10, windowMs: 15 * 60 * 1000 });
  applyRateLimitHeaders(res, ipLimit);
  if (!ipLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_REQUEST' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const verificationCode = String(body.verificationCode || '').trim();
  const password = String(body.password || '');
  if (!validEmail(email)) return json(res, 400, { ok: false, error: 'INVALID_EMAIL' });
  if (!validPassword(password)) return json(res, 400, { ok: false, error: 'INVALID_PASSWORD' });

  const emailLimit = checkRateLimit(req, {
    key: 'auth-password-reset-address',
    identifier: email,
    limit: 8,
    windowMs: 15 * 60 * 1000
  });
  if (!emailLimit.allowed) {
    res.setHeader('Retry-After', String(emailLimit.retryAfterSeconds));
    return json(res, 429, { ok: false, error: 'RATE_LIMITED' });
  }

  try {
    resetPasswordWithVerificationCode(email, verificationCode, password, auditMetadata(req));
    return json(res, 200, { ok: true });
  } catch (error) {
    const code = error?.code || 'INVALID_VERIFICATION_CODE';
    if (['VERIFICATION_CODE_REQUIRED', 'INVALID_VERIFICATION_CODE', 'VERIFICATION_CODE_EXPIRED', 'VERIFICATION_CODE_ATTEMPTS_EXCEEDED', 'INVALID_PASSWORD'].includes(code)) {
      return json(res, 400, { ok: false, error: code });
    }
    return json(res, 400, { ok: false, error: 'INVALID_VERIFICATION_CODE' });
  }
}
