import { authenticateRequest } from '../_lib/local-auth.js';
import { getAdminChatSettings, saveAdminChatSettings } from '../_lib/chat-assistant-settings.js';
import { readJsonBody } from '../_lib/request.js';
import { recordAdminAuditEvent, requestAuditMetadata, requirePermission } from '../_lib/governance.js';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_GLOBAL_SETTINGS);
    const before = getAdminChatSettings();
    if (req.method === 'GET') return res.status(200).json({ ok: true, settings: before });
    const settings = saveAdminChatSettings(auth.user.id, await readJsonBody(req, { maxBytes: 64 * 1024 }));
    const auditValues = ({ systemPrompt, allowedModels, defaultProviderId }) => ({ systemPrompt, allowedModels, defaultProviderId });
    recordAdminAuditEvent({
      actorUserId: auth.user.id, permission: ADMIN_PERMISSIONS.MANAGE_GLOBAL_SETTINGS,
      category: 'settings', action: 'chat_assistant_settings_updated', entityType: 'app_setting', entityId: 'chat_assistant_settings',
      before: auditValues(before), after: auditValues(settings), auditMeta: requestAuditMetadata(req)
    });
    return res.status(200).json({ ok: true, settings });
  } catch (error) {
    return res.status(error.code === 'FORBIDDEN' ? 403 : error.status || 400).json({ ok: false, error: error.code || 'CHAT_SETTINGS_FAILED' });
  }
}
