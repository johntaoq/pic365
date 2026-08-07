import { listCreditProducts, getUserProfile } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req, { allowAnonymous: true });
  if (auth.error) {
    return json(res, auth.status || 401, { ok: false, error: auth.error });
  }

  try {
    const packs = listCreditProducts().map((row) => ({
      id: row.id,
      type: 'credit_pack',
      name: { en: row.name_en, zh: row.name_zh },
      description: { en: row.description_en, zh: row.description_zh },
      credits: Number(row.credits),
      amountCents: Number(row.amount_cents),
      currency: row.currency,
      priceLabel: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: String(row.currency).toUpperCase() }).format(Number(row.amount_cents) / 100),
      active: Boolean(row.active)
    }));
    return json(res, 200, {
      ok: true,
      checkoutAvailable: false,
      packs,
      user: auth.user ? getUserProfile(auth.user.id) : null
    });
  } catch (error) {
    console.warn('Failed to load credit catalog', {
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 500, { ok: false, error: 'SERVER_NOT_CONFIGURED' });
  }
}
