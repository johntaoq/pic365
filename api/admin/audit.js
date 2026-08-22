import { authenticateRequest } from '../_lib/local-auth.js';
import { listAuditEventsForUser } from '../_lib/governance.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    return res.status(200).json({ ok: true, events: listAuditEventsForUser(auth.user.id, req.query || {}) });
  } catch (error) {
    return res.status(error?.code === 'FORBIDDEN' ? 403 : 400).json({ ok: false, error: error?.code || 'AUDIT_LOAD_FAILED' });
  }
}
