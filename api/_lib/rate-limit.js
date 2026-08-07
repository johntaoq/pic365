const WINDOWS_KEY = Symbol.for('awesome-gpt-image-2.rate-limit-windows');
const windows = globalThis[WINDOWS_KEY] || new Map();
globalThis[WINDOWS_KEY] = windows;
let checksSinceCleanup = 0;

function cleanupExpiredWindows(timestamp) {
  checksSinceCleanup += 1;
  if (checksSinceCleanup < 500 && windows.size < 5000) return;
  checksSinceCleanup = 0;
  for (const [key, value] of windows) {
    if (!value || value.resetAt <= timestamp) windows.delete(key);
  }
}

function clientAddress(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

export function checkRateLimit(req, {
  key = 'default',
  limit = 20,
  windowMs = 60 * 1000,
  identifier = clientAddress(req)
} = {}) {
  const timestamp = Date.now();
  cleanupExpiredWindows(timestamp);
  const bucketKey = `${key}:${identifier}`;
  const current = windows.get(bucketKey);
  if (!current || current.resetAt <= timestamp) {
    const next = { count: 1, resetAt: timestamp + windowMs };
    windows.set(bucketKey, next);
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }
  current.count += 1;
  windows.set(bucketKey, current);
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - timestamp) / 1000))
  };
}

export function applyRateLimitHeaders(res, result) {
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) res.setHeader('Retry-After', String(result.retryAfterSeconds));
}
