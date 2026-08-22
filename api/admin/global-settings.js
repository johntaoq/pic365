import { authenticateRequest } from '../_lib/local-auth.js';
import { getGlobalMenuSettings, requestAuditMetadata, updateGlobalMenuSettings } from '../_lib/governance.js';
import { readJsonBody } from '../_lib/request.js';

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    const settings = req.method === 'PATCH'
      ? updateGlobalMenuSettings(auth.user.id, await readJsonBody(req), requestAuditMetadata(req))
      : getGlobalMenuSettings();
    return res.status(200).json({ ok: true, settings });
  } catch (error) {
    return res.status(error?.code === 'FORBIDDEN' ? 403 : 400).json({ ok: false, error: error?.code || 'GLOBAL_SETTINGS_FAILED' });
  }
}
