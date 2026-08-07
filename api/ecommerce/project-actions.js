import { getEcommerceProject } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { duplicateEcommerceProject } from '../_lib/ecommerce-project-copy.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';
import { readJsonBody } from '../_lib/request.js';
import { ECOMMERCE_PLATFORMS } from '../../shared/ecommerce-catalog.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  const rateLimit = checkRateLimit(req, { key: `project-actions:${auth.user.id}`, limit: 20, windowMs: 60 * 60 * 1000 });
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_PROJECT_ACTION' });
  }
  const projectId = cleanText(body.projectId, 80);
  const source = getEcommerceProject(auth.user.id, projectId);
  if (!source) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  const action = cleanText(body.action, 30);
  const targetPlatformId = action === 'adapt' ? cleanText(body.targetPlatformId, 40) : source.platformId;
  if (!['duplicate', 'adapt'].includes(action) || !ECOMMERCE_PLATFORMS.some((platform) => platform.id === targetPlatformId)) {
    return json(res, 400, { ok: false, error: 'INVALID_PROJECT_ACTION' });
  }
  try {
    const project = await duplicateEcommerceProject(auth.user.id, projectId, {
      targetPlatformId,
      projectName: cleanText(body.projectName, 120),
      copyAssets: body.copyAssets !== false,
      copyDelivery: action === 'duplicate'
    });
    return json(res, 201, { ok: true, project });
  } catch (error) {
    console.warn('Project duplication failed', { message: String(error?.message || 'unknown').slice(0, 240) });
    return json(res, 500, { ok: false, error: 'PROJECT_COPY_FAILED' });
  }
}

