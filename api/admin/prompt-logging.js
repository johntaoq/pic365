import { authenticateRequest } from '../_lib/local-auth.js';
import {
  getPromptLoggingConfig,
  listPromptAuditLogs,
  updatePromptLoggingConfig
} from '../_lib/local-db.js';
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
    requirePermission(auth.user, ADMIN_PERMISSIONS.VIEW_ALL_AUDIT);
  } catch {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  if (req.method === 'PATCH') {
    try {
      const body = await readJsonBody(req);
      const config = updatePromptLoggingConfig({ enabled: Boolean(body.enabled) }, auth.user.id);
      return res.status(200).json({ ok: true, config, logs: listPromptAuditLogs({ limit: 100 }) });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error?.code || 'PROMPT_LOGGING_UPDATE_FAILED' });
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    config: getPromptLoggingConfig(),
    logs: listPromptAuditLogs({
      limit: req.query?.limit,
      offset: req.query?.offset
    })
  });
}
