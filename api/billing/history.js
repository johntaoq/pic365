import { listCreditLedger } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error, loginRequired: true });
  const transactions = listCreditLedger(auth.user.id, 30).map((row) => ({
    id: row.id,
    amount: Number(row.amount || 0),
    type: row.type || '',
    source: row.source || '',
    metadata: JSON.parse(row.metadata || '{}'),
    createdAt: row.created_at || ''
  }));
  return json(res, 200, { ok: true, transactions });
}
