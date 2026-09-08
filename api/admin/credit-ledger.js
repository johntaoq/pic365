import { authenticateRequest } from '../_lib/local-auth.js';
import { listCreditLedgerPage } from '../_lib/local-db.js';
import { requirePermission } from '../_lib/governance.js';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';

function value(query, key, fallback = '') {
  const raw = query?.[key];
  return Array.isArray(raw) ? raw[0] : raw ?? fallback;
}
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  res.setHeader('Cache-Control', 'no-store, private');
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.VIEW_CREDIT_REPORTS);
    const ledger = listCreditLedgerPage({
      includeAllUsers: true,
      includePrompt: true,
      search: value(req.query, 'search'),
      category: value(req.query, 'category', 'all'),
      direction: value(req.query, 'direction', 'all'),
      startAt: value(req.query, 'startAt'),
      endAt: value(req.query, 'endAt'),
      page: value(req.query, 'page', 1),
      pageSize: value(req.query, 'pageSize', 30)
    });
    return res.status(200).json({ ok: true, ledger });
  } catch (error) {
    const code = error?.code || 'CREDIT_LEDGER_FAILED';
    return res.status(code === 'FORBIDDEN' ? 403 : 400).json({ ok: false, error: code });
  }
}
