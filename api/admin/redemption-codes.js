import { authenticateRequest } from '../_lib/local-auth.js';
import {
  createRedemptionCodeBatch,
  getFinancialGovernanceReport,
  listRedemptionBatches,
  listRedemptionCodes,
  requestAuditMetadata,
  REDEMPTION_OPTIONS,
  setRedemptionCodeStatus,
  voidRedemptionCode
} from '../_lib/governance.js';
import { readJsonBody } from '../_lib/request.js';
import { ADMIN_PERMISSIONS, roleHasPermission } from '../../shared/admin-permissions.js';

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    if (req.method === 'GET') {
      if (!roleHasPermission(auth.user.role, ADMIN_PERMISSIONS.CREATE_REDEMPTION_CODES)) throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' });
      const batchId = String(req.query?.batchId || '').trim();
      return res.status(200).json({
        ok: true,
        batches: listRedemptionBatches({ limit: req.query?.limit, offset: req.query?.offset }),
        codes: listRedemptionCodes(batchId, { limit: req.query?.codeLimit || 1000, offset: req.query?.codeOffset }),
        options: REDEMPTION_OPTIONS,
        report: getFinancialGovernanceReport()
      });
    }
    const body = await readJsonBody(req);
    if (req.method === 'POST') {
      const result = createRedemptionCodeBatch({ actorUserId: auth.user.id, ...body, auditMeta: requestAuditMetadata(req) });
      return res.status(201).json({ ok: true, ...result });
    }
    const action = String(body.action || 'void').trim().toLowerCase();
    const code = action === 'void'
      ? voidRedemptionCode({ actorUserId: auth.user.id, codeId: String(body.codeId || ''), reason: body.reason, auditMeta: requestAuditMetadata(req) })
      : setRedemptionCodeStatus({
          actorUserId: auth.user.id,
          codeId: String(body.codeId || ''),
          nextStatus: action === 'enable' ? 'available' : action === 'disable' ? 'disabled' : action,
          reason: body.reason,
          auditMeta: requestAuditMetadata(req)
        });
    return res.status(200).json({ ok: true, code });
  } catch (error) {
    const status = error?.code === 'FORBIDDEN' ? 403 : error?.code === 'REDEMPTION_CODE_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ ok: false, error: error?.code || 'REDEMPTION_CODE_FAILED' });
  }
}
