import {
  getEmailVerificationStatus,
  issuePasswordResetVerificationCode
} from '../_lib/email-verification.js';
import { validEmail } from '../_lib/local-auth.js';
import { readJsonBody } from '../_lib/request.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function genericSuccess(result = {}) {
  return {
    ok: true,
    accepted: true,
    expiresInSeconds: Number(result.expiresInSeconds || 600),
    resendAfterSeconds: Number(result.resendAfterSeconds || 60),
    ...(result.previewCode ? { previewCode: result.previewCode } : {})
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const ipLimit = checkRateLimit(req, { key: 'auth-password-reset-code-ip', limit: 10, windowMs: 15 * 60 * 1000 });
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

  const delivery = getEmailVerificationStatus().delivery;
  if (delivery === 'unavailable') return json(res, 503, { ok: false, error: 'EMAIL_NOT_CONFIGURED' });

  const emailLimit = checkRateLimit(req, {
    key: 'auth-password-reset-code-address',
    identifier: email,
    limit: 5,
    windowMs: 15 * 60 * 1000
  });
  if (!emailLimit.allowed) {
    res.setHeader('Retry-After', String(emailLimit.retryAfterSeconds));
    return json(res, 429, { ok: false, error: 'RATE_LIMITED' });
  }

  try {
    const result = await issuePasswordResetVerificationCode(email, { language });
    return json(res, 200, genericSuccess(result));
  } catch (error) {
    const code = error?.code || 'EMAIL_SEND_FAILED';
    if (code === 'VERIFICATION_CODE_COOLDOWN') {
      return json(res, 200, genericSuccess({
        expiresInSeconds: 600,
        resendAfterSeconds: error.retryAfterSeconds || 60
      }));
    }
    if (code === 'EMAIL_NOT_CONFIGURED' || code === 'EMAIL_VERIFICATION_NOT_CONFIGURED') {
      return json(res, 503, { ok: false, error: 'EMAIL_NOT_CONFIGURED' });
    }
    // Keep a uniform response so this endpoint cannot be used to discover registered accounts.
    return json(res, 200, genericSuccess());
  }
}
