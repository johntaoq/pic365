import { authenticateRequest } from './_lib/local-auth.js';
import { getNewAPIAccountProfile } from './_lib/newapi-account.js';
import { getStorageBillingConfig } from './_lib/storage-billing.js';
import { getDb } from './_lib/local-db.js';
import { readJsonBody } from './_lib/request.js';
import { storageBillingDateParts } from '../shared/storage-billing.js';
import { ensureAutomaticNewAPIStorage, retryNewAPIStorageInvoices, getNewAPIStorageSummary, getNewAPIStorageCapabilities } from './_lib/newapi-storage-billing.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ ok:false,error:'METHOD_NOT_ALLOWED' });
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status).json({ ok:false,error:auth.error });
  if (!getNewAPIAccountProfile(auth.user.id)) return res.status(404).json({ ok:false,error:'NEWAPI_NOT_CONNECTED' });
  if (req.method !== 'GET' && req.headers?.origin !== String(process.env.APP_URL || '').replace(/\/$/,'')) {
    return res.status(403).json({ ok:false,error:'ORIGIN_REQUIRED' });
  }
  try {
    const monthPrice = getDb().prepare('SELECT unit_price_cents_per_gb FROM storage_billing_months WHERE user_id=? AND billing_month=?').get(auth.user.id,storageBillingDateParts().month);
    const price = Number(monthPrice?.unit_price_cents_per_gb || getStorageBillingConfig().unitPriceCentsPerGb);
    if (req.method === 'POST') {
      await readJsonBody(req,{maxBytes:8192});
      await retryNewAPIStorageInvoices({userId:auth.user.id});
      await ensureAutomaticNewAPIStorage(auth.user.id);
    }
    let available = true;
    try { await getNewAPIStorageCapabilities(auth.user.id); } catch { available = false; }
    return res.status(200).json({ ok:true,storage:{ ...getNewAPIStorageSummary(auth.user.id), available,
      configuredUnitPriceCentsPerGib:price } });
  } catch (cause) {
    const status = cause.code === 'REQUEST_BODY_TOO_LARGE' ? 413 : cause.code === 'NEWAPI_REAUTH_REQUIRED' ? 401 : cause instanceof SyntaxError ? 400 : 503;
    return res.status(status).json({ ok:false,error:cause instanceof SyntaxError ? 'INVALID_JSON' : cause.code || 'PIC365_STORAGE_UNAVAILABLE' });
  }
}
