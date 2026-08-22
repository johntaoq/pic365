import { authenticateRequest } from '../_lib/local-auth.js';
import { getRechargeConfig, updateRechargeConfig } from '../_lib/local-db.js';
import { readJsonBody } from '../_lib/request.js';
import { requirePermission } from '../_lib/governance.js';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_RECHARGE);
  } catch {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, recharge: getRechargeConfig() });
  }

  try {
    const body = await readJsonBody(req);
    return res.status(200).json({
      ok: true,
      recharge: updateRechargeConfig(body, auth.user.id)
    });
  } catch (error) {
    console.warn('Failed to update recharge configuration', {
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return res.status(400).json({ ok: false, error: 'RECHARGE_CONFIG_FAILED' });
  }
}
