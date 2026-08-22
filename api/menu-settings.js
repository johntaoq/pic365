import { authenticateRequest } from './_lib/local-auth.js';
import { getEffectiveMenuSettings, updateUserMenuPreferences } from './_lib/governance.js';
import { readJsonBody } from './_lib/request.js';

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req, { allowAnonymous: req.method === 'GET' });
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    if (req.method === 'PATCH') {
      if (!auth.user) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
      const body = await readJsonBody(req);
      updateUserMenuPreferences(auth.user.id, body);
    }
    return res.status(200).json({ ok: true, menu: getEffectiveMenuSettings(auth.user?.id || null) });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.code || 'MENU_SETTINGS_FAILED' });
  }
}
