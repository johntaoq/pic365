import { startNewAPILogin } from '../../_lib/newapi-account.js';
import { checkRateLimit, applyRateLimitHeaders } from '../../_lib/rate-limit.js';

export default function handler(req, res, sourceId = 'newapi16') {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  const limit = checkRateLimit(req, { key: `${sourceId}-login`, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, limit);
  if (!limit.allowed) return res.status(429).json({ ok: false, error: 'RATE_LIMITED' });
  try { return startNewAPILogin(req, res, sourceId); }
  catch { return res.status(503).json({ ok: false, error: 'NEWAPI_NOT_CONFIGURED' }); }
}
