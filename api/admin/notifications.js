import { authenticateRequest } from '../_lib/local-auth.js';
import {
  acknowledgeAdminAlert,
  getAdminNotificationConfig,
  listAdminAlerts,
  updateAdminNotificationConfig
} from '../_lib/local-db.js';
import { readJsonBody } from '../_lib/request.js';

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  if (!auth.profile?.isSuperAdmin) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  if (req.method === 'GET') return res.status(200).json({ ok: true, notifications: getAdminNotificationConfig(), alerts: listAdminAlerts(100, String(req.query?.status || 'open')) });
  try {
    const body = await readJsonBody(req);
    if (body.action === 'acknowledge-alert') {
      const acknowledged = acknowledgeAdminAlert(String(body.alertId || ''), auth.user.id);
      return acknowledged
        ? res.status(200).json({ ok: true, alerts: listAdminAlerts(100, 'open') })
        : res.status(404).json({ ok: false, error: 'ALERT_NOT_FOUND' });
    }
    return res.status(200).json({
      ok: true,
      notifications: updateAdminNotificationConfig(body, auth.user.id)
    });
  } catch {
    return res.status(400).json({ ok: false, error: 'NOTIFICATION_CONFIG_FAILED' });
  }
}
