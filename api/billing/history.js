import { listCreditLedgerPage } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function value(query, key, fallback = '') {
  const raw = query?.[key];
  return Array.isArray(raw) ? raw[0] : raw ?? fallback;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  res.setHeader('Cache-Control', 'no-store, private');
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error, loginRequired: true });
  const ledger = listCreditLedgerPage({
    userId: auth.user.id,
    search: value(req.query, 'search'),
    category: value(req.query, 'category', 'all'),
    direction: value(req.query, 'direction', 'all'),
    startAt: value(req.query, 'startAt'),
    endAt: value(req.query, 'endAt'),
    page: value(req.query, 'page', 1),
    pageSize: value(req.query, 'pageSize', 30)
  });
  const transactions = ledger.items.map((item) => ({
    ...item,
    caseId: item.detail?.caseId || null,
    metadata: item.detail || {}
  }));
  return json(res, 200, { ok: true, transactions, ledger: { ...ledger, items: transactions } });
}
