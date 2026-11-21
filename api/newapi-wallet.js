import { authenticateRequest } from './_lib/local-auth.js';
import { getNewAPIAccountProfile, getNewAPIWallet } from './_lib/newapi-account.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  res.setHeader('Cache-Control', 'no-store');
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status).json({ ok: false, error: auth.error });
  if (!getNewAPIAccountProfile(auth.user.id)) return res.status(404).json({ ok: false, error: 'NEWAPI_NOT_CONNECTED' });
  try { return res.status(200).json({ ok: true, wallet: await getNewAPIWallet(auth.user.id) }); }
  catch (error) { return res.status(error?.code === 'NEWAPI_REAUTH_REQUIRED' ? 401 : 503).json({ ok: false, error: error?.code || 'NEWAPI_BALANCE_UNAVAILABLE' }); }
}
