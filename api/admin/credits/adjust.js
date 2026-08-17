import { authenticateRequest } from '../../_lib/local-auth.js';
import { adjustUserCredits } from '../../_lib/local-db.js';
import { readJsonBody } from '../../_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.status || 401, { ok: false, error: auth.error });
  }

  if (!auth.profile?.isSuperAdmin) {
    return json(res, 403, { ok: false, error: 'FORBIDDEN' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_CREDIT_ADJUSTMENT' });
  }

  const userId = String(body.userId || '').trim();
  const amount = Number(body.amount);
  const reason = String(body.reason || '').trim().slice(0, 240);
  const password = String(body.password || '');
  if (!userId || !Number.isInteger(amount) || (!amount && !password)) {
    return json(res, 400, { ok: false, error: 'INVALID_CREDIT_ADJUSTMENT' });
  }
  if (password && (password.length < 8 || password.length > 128)) {
    return json(res, 400, { ok: false, error: 'INVALID_PASSWORD' });
  }

  try {
    const user = adjustUserCredits({
      adminUserId: auth.user.id,
      userId,
      amount,
      reason,
      password
    });
    return json(res, 200, { ok: true, user });
  } catch (error) {
    if (['INVALID_CREDIT_ADJUSTMENT', 'INVALID_PASSWORD', 'CREDITS_INSUFFICIENT', 'USER_NOT_FOUND'].includes(error?.code)) {
      return json(res, error.code === 'USER_NOT_FOUND' ? 404 : 400, { ok: false, error: error.code });
    }
    if (error?.code === 'FORBIDDEN') {
      return json(res, 403, { ok: false, error: 'FORBIDDEN' });
    }

    console.warn('Failed to adjust credits', {
      adminUserId: auth.user.id,
      targetUserId: userId,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 500, { ok: false, error: 'CREDIT_ADJUSTMENT_FAILED' });
  }
}
