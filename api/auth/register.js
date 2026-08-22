import { createUser, getRechargeConfig, getUserByEmail } from '../_lib/local-db.js';
import { createLoginSession, jsonUser, validEmail, validPassword } from '../_lib/local-auth.js';
import { consumeRegistrationVerificationCode } from '../_lib/email-verification.js';
import { assertRegistrationEmailDomain } from '../_lib/registration-policy.js';
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
  const verificationCode = String(body.verificationCode || '').trim();
  if (!validEmail(email)) return json(res, 400, { ok: false, error: 'INVALID_EMAIL' });
  if (!validPassword(password)) return json(res, 400, { ok: false, error: 'INVALID_PASSWORD' });
  if (getUserByEmail(email)) return json(res, 409, { ok: false, error: 'EMAIL_ALREADY_REGISTERED' });
  try {
    assertRegistrationEmailDomain(email);
  } catch (error) {
    return json(res, 403, { ok: false, error: error?.code || 'EMAIL_DOMAIN_BLOCKED' });
  }

  try {
    consumeRegistrationVerificationCode(email, verificationCode);
  } catch (error) {
    const code = error?.code || 'INVALID_VERIFICATION_CODE';
    if (code === 'EMAIL_VERIFICATION_NOT_CONFIGURED') return json(res, 503, { ok: false, error: 'EMAIL_NOT_CONFIGURED' });
    if (['VERIFICATION_CODE_REQUIRED', 'INVALID_VERIFICATION_CODE', 'VERIFICATION_CODE_EXPIRED', 'VERIFICATION_CODE_ATTEMPTS_EXCEEDED'].includes(code)) {
      return json(res, 400, { ok: false, error: code });
    }
    return json(res, 400, { ok: false, error: 'INVALID_VERIFICATION_CODE' });
  }

  try {
    const user = createUser({
      email,
      password,
      fullName,
      initialCredits: getRechargeConfig().signupBonusCredits,
      initialCreditSource: 'email_signup_bonus'
    });
    createLoginSession(req, res, user.id);
    return json(res, 201, { ok: true, user: jsonUser(user) });
  } catch (error) {
    console.warn('Failed to register local user', { message: String(error?.message || 'unknown').slice(0, 240) });
    return json(res, 500, { ok: false, error: 'REGISTER_FAILED' });
  }
}
