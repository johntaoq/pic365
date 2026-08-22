import { issueRegistrationVerificationCode } from '../_lib/email-verification.js';
import { getUserByEmail } from '../_lib/local-db.js';
import { validEmail } from '../_lib/local-auth.js';
import { readJsonBody } from '../_lib/request.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';
import { assertRegistrationEmailDomain } from '../_lib/registration-policy.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const ipLimit = checkRateLimit(req, { key: 'auth-email-code-ip', limit: 10, windowMs: 15 * 60 * 1000 });
  applyRateLimitHeaders(res, ipLimit);
  if (!ipLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_REQUEST' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const language = body.language === 'en' ? 'en' : 'zh';
  if (!validEmail(email)) return json(res, 400, { ok: false, error: 'INVALID_EMAIL' });
  if (getUserByEmail(email)) return json(res, 409, { ok: false, error: 'EMAIL_ALREADY_REGISTERED' });
  try {
    assertRegistrationEmailDomain(email);
  } catch (error) {
    return json(res, 403, { ok: false, error: error?.code || 'EMAIL_DOMAIN_BLOCKED' });
  }

  const emailLimit = checkRateLimit(req, {
    key: 'auth-email-code-address',
    identifier: email,
    limit: 5,
    windowMs: 15 * 60 * 1000
  });
  if (!emailLimit.allowed) {
    res.setHeader('Retry-After', String(emailLimit.retryAfterSeconds));
    return json(res, 429, { ok: false, error: 'RATE_LIMITED' });
  }

  try {
    const result = await issueRegistrationVerificationCode(email, { language });
    return json(res, 200, {
      ok: true,
      expiresInSeconds: result.expiresInSeconds,
      resendAfterSeconds: result.resendAfterSeconds,
      ...(result.previewCode ? { previewCode: result.previewCode } : {})
    });
  } catch (error) {
    const code = error?.code || 'EMAIL_SEND_FAILED';
    if (code === 'EMAIL_ALREADY_REGISTERED') return json(res, 409, { ok: false, error: code });
    if (code === 'VERIFICATION_CODE_COOLDOWN') {
      res.setHeader('Retry-After', String(error.retryAfterSeconds || 60));
      return json(res, 429, { ok: false, error: code, retryAfterSeconds: error.retryAfterSeconds || 60 });
    }
    if (code === 'EMAIL_NOT_CONFIGURED' || code === 'EMAIL_VERIFICATION_NOT_CONFIGURED') {
      return json(res, 503, { ok: false, error: 'EMAIL_NOT_CONFIGURED' });
    }
    return json(res, 502, { ok: false, error: 'EMAIL_SEND_FAILED' });
  }
}
