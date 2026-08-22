import { authenticateRequest } from '../_lib/local-auth.js';
import { getRegistrationEmailPolicy } from '../_lib/registration-policy.js';
import { requestAuditMetadata, requirePermission, updateRegistrationEmailPolicy } from '../_lib/governance.js';
import { readJsonBody } from '../_lib/request.js';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_GLOBAL_SETTINGS);
    const settings = req.method === 'PATCH'
      ? updateRegistrationEmailPolicy(auth.user.id, await readJsonBody(req), requestAuditMetadata(req))
      : getRegistrationEmailPolicy();
    return res.status(200).json({ ok: true, settings });
  } catch (error) {
    return res.status(error?.code === 'FORBIDDEN' ? 403 : 400).json({ ok: false, error: error?.code || 'REGISTRATION_SETTINGS_FAILED' });
  }
}
