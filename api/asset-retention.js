import { authenticateRequest } from './_lib/local-auth.js';
import { getAssetRetentionSettings, saveAssetRetentionSettings } from './_lib/asset-retention-settings.js';
import { readJsonBody } from './_lib/request.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  if (req.method === 'GET') return res.status(200).json({ ok: true, settings: getAssetRetentionSettings(auth.user.id) });
  try {
    const body = await readJsonBody(req, { maxBytes: 2048 });
    if (!body || !Object.hasOwn(body, 'retentionDays')) throw new Error('INVALID_ASSET_RETENTION_DAYS');
    if (body.userId != null && body.userId !== auth.user.id) {
      return res.status(403).json({ ok: false, error: 'ACCOUNT_MISMATCH' });
    }
    const settings = saveAssetRetentionSettings(auth.user.id, body.retentionDays);
    return res.status(200).json({ ok: true, settings });
  } catch (error) {
    if (error.status === 413) return res.status(413).json({ ok: false, error: 'REQUEST_BODY_TOO_LARGE' });
    if (error instanceof SyntaxError || error.message === 'INVALID_ASSET_RETENTION_DAYS') {
      return res.status(400).json({ ok: false, error: 'INVALID_ASSET_RETENTION_DAYS' });
    }
    return res.status(500).json({ ok: false, error: 'ASSET_RETENTION_SETTINGS_FAILED' });
  }
}
