import { authenticateRequest } from './_lib/local-auth.js';
import { listUserNotifications, markAllUserNotificationsRead, markUserNotificationRead } from './_lib/local-db.js';
import { readJsonBody } from './_lib/request.js';

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, ...listUserNotifications(auth.user.id, req.query?.limit) });
    }
    const body = await readJsonBody(req, { maxBytes: 8192 });
    const result = body.all
      ? markAllUserNotificationsRead(auth.user.id)
      : markUserNotificationRead(auth.user.id, String(body.notificationId || ''));
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const code = error?.code || 'NOTIFICATION_OPERATION_FAILED';
    return res.status(code === 'NOTIFICATION_NOT_FOUND' ? 404 : 400).json({ ok: false, error: code });
  }
}
