import { authenticateRequest } from '../_lib/local-auth.js';
import { redeemCode, requestAuditMetadata } from '../_lib/governance.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';
import { readJsonBody } from '../_lib/request.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  const rateLimit = checkRateLimit(req, { key: `redeem:${auth.user.id}`, limit: 10, windowMs: 15 * 60 * 1000 });
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) return res.status(429).json({ ok: false, error: 'RATE_LIMITED' });
  try {
    const body = await readJsonBody(req);
    const result = redeemCode({ userId: auth.user.id, code: body.code, requestId: body.requestId, auditMeta: requestAuditMetadata(req) });
    return res.status(200).json({ ok: true, ...result });
  } catch {
    return res.status(400).json({ ok: false, error: 'REDEMPTION_CODE_UNAVAILABLE' });
  }
}
