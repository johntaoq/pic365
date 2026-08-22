import { authenticateRequest } from '../../_lib/local-auth.js';
import { adjustManagedUserCredits, requestAuditMetadata } from '../../_lib/governance.js';
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

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_CREDIT_ADJUSTMENT' });
  }

  const userId = String(body.userId || '').trim();
  const amount = Number(body.amount);
  const reasonCode = String(body.reasonCode || '').trim();
  const details = String(body.details || '').trim();
  const requestId = String(body.requestId || '').trim();
  if (!userId || !Number.isInteger(amount) || !amount || !requestId) {
    return json(res, 400, { ok: false, error: 'INVALID_CREDIT_ADJUSTMENT' });
  }

  try {
    const result = adjustManagedUserCredits({
      actorUserId: auth.user.id,
      targetUserId: userId,
      amount,
      reasonCode,
      details,
      requestId,
      auditMeta: requestAuditMetadata(req)
    });
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    if (['INVALID_CREDIT_ADJUSTMENT', 'CREDIT_REASON_REQUIRED', 'CREDITS_INSUFFICIENT', 'USER_NOT_FOUND', 'CANNOT_ADJUST_SELF', 'BALANCE_CHANGED'].includes(error?.code)) {
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
