import { authenticateRequest } from '../../_lib/local-auth.js';
import { editManagedUser, requestAuditMetadata } from '../../_lib/governance.js';
import { readJsonBody } from '../../_lib/request.js';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    const body = await readJsonBody(req);
    const password = Object.prototype.hasOwnProperty.call(body, 'password') ? body.password : undefined;
    const result = editManagedUser({
      actorUserId: auth.user.id,
      targetUserId: String(body.userId || ''),
      adminNote: body.adminNote,
      password,
      role: body.role,
      auditMeta: requestAuditMetadata(req)
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const status = error?.code === 'FORBIDDEN' ? 403 : error?.code === 'USER_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ ok: false, error: error?.code || 'USER_UPDATE_FAILED' });
  }
}
