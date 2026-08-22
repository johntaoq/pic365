import { authenticateRequest } from '../_lib/local-auth.js';
import {
  getEcommerceGenerationSystemPromptSettings,
  updateEcommerceGenerationSystemPromptSettings
} from '../_lib/ecommerce-generation-settings.js';
import { requirePermission } from '../_lib/governance.js';
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
      ? updateEcommerceGenerationSystemPromptSettings(auth.user.id, await readJsonBody(req))
      : getEcommerceGenerationSystemPromptSettings();
    return res.status(200).json({ ok: true, settings });
  } catch (error) {
    return res.status(error?.code === 'FORBIDDEN' ? 403 : 400).json({
      ok: false,
      error: error?.code || 'ECOMMERCE_SYSTEM_PROMPT_SETTINGS_FAILED'
    });
  }
}
