import { authenticateRequest } from '../../_lib/local-auth.js';
import { requestAuditMetadata, revealRedemptionCode } from '../../_lib/governance.js';
import { readJsonBody } from '../../_lib/request.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  res.setHeader('Cache-Control', 'no-store, private');
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    const body = await readJsonBody(req);
    return res.status(200).json({ ok: true, code: revealRedemptionCode({ actorUserId: auth.user.id, codeId: String(body.codeId || ''), auditMeta: requestAuditMetadata(req) }) });
  } catch (error) {
    return res.status(error?.code === 'FORBIDDEN' ? 403 : 400).json({ ok: false, error: error?.code || 'REDEMPTION_REVEAL_FAILED' });
  }
}
