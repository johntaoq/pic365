import { getUserProfile, getDb } from './_lib/local-db.js';
import { authenticateRequest } from './_lib/local-auth.js';
import { readJsonBody } from './_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function sanitizeDisplayName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

const PRESET_AVATAR_PATTERN = /^\/images\/avatars\/animals\/[a-z0-9-]+\.svg$/;
const DATA_AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i;
const MAX_AVATAR_DATA_BYTES = 700 * 1024;

export function sanitizeAvatarUrl(value) {
  if (value === undefined) return undefined;
  const avatarUrl = String(value || '').trim();
  if (!avatarUrl) return '';
  if (PRESET_AVATAR_PATTERN.test(avatarUrl)) return avatarUrl;
  if (/^https:\/\/[^\s]+$/i.test(avatarUrl) && avatarUrl.length <= 2048) return avatarUrl;

  const dataMatch = avatarUrl.match(DATA_AVATAR_PATTERN);
  if (dataMatch) {
    const encoded = dataMatch[2];
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    const byteLength = Math.floor((encoded.length * 3) / 4) - padding;
    if (byteLength <= MAX_AVATAR_DATA_BYTES) return avatarUrl;
  }
  throw new Error('INVALID_AVATAR');
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'PATCH') {
    let body;
    try {
      body = await readJsonBody(req, { maxBytes: 1024 * 1024 });
    } catch {
      return json(res, 400, { ok: false, error: 'INVALID_PROFILE' });
    }
    const fullName = sanitizeDisplayName(body.fullName || body.full_name);
    if (!fullName) return json(res, 400, { ok: false, error: 'INVALID_PROFILE' });
    let avatarUrl;
    try {
      avatarUrl = sanitizeAvatarUrl(body.avatarUrl ?? body.avatar_url);
    } catch {
      return json(res, 400, { ok: false, error: 'INVALID_AVATAR' });
    }
    if (avatarUrl === undefined) {
      getDb().prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?').run(fullName, new Date().toISOString(), auth.user.id);
    } else {
      getDb().prepare('UPDATE users SET full_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?').run(fullName, avatarUrl, new Date().toISOString(), auth.user.id);
    }
  }

  return json(res, 200, { ok: true, user: getUserProfile(auth.user.id) });
}
