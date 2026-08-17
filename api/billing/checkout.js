import { authenticateRequest } from '../_lib/local-auth.js';
import {
  createLocalPaymentOrder,
  getCreditProduct,
  getUserProfile,
  markLocalPaymentCheckoutCreated,
  markLocalPaymentOrderFailed
} from '../_lib/local-db.js';
import {
  checkoutLineItem,
  getAppUrl,
  getStripeClient,
  isStripeConfigured,
  readJsonBody
} from '../_lib/billing.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function formatProduct(row) {
  return {
    id: row.id,
    type: 'credit_pack',
    name: { en: row.name_en, zh: row.name_zh },
    description: { en: row.description_en, zh: row.description_zh },
    credits: Number(row.credits || 0),
    amountCents: Number(row.amount_cents || 0),
    currency: String(row.currency || 'cny').toLowerCase()
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (!isStripeConfigured()) return json(res, 503, { ok: false, error: 'BILLING_NOT_CONFIGURED' });
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error, loginRequired: true });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_BILLING_PRODUCT' });
  }
  const productRow = getCreditProduct(String(body.productId || '').trim());
  if (!productRow) return json(res, 404, { ok: false, error: 'BILLING_PRODUCT_NOT_FOUND' });
  const product = formatProduct(productRow);
  const order = createLocalPaymentOrder(auth.user.id, productRow, 'stripe');

  try {
    const stripe = getStripeClient();
    const appUrl = getAppUrl(req);
    const metadata = {
      orderId: order.id,
      userId: auth.user.id,
      productType: product.type,
      productId: product.id
    };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: auth.user.email || undefined,
      client_reference_id: auth.user.id,
      line_items: [checkoutLineItem(product)],
      success_url: `${appUrl}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?billing=cancelled`,
      allow_promotion_codes: true,
      metadata,
      payment_intent_data: { metadata }
    });
    markLocalPaymentCheckoutCreated(order.id, {
      providerOrderId: session.id,
      metadata: { checkoutUrl: session.url || '' }
    });
    return json(res, 200, {
      ok: true,
      url: session.url,
      orderId: order.id,
      user: getUserProfile(auth.user.id)
    });
  } catch (error) {
    markLocalPaymentOrderFailed(order.id, error?.code || 'CHECKOUT_FAILED');
    console.warn('Failed to create Stripe checkout session', {
      orderId: order.id,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 502, { ok: false, error: 'CHECKOUT_FAILED' });
  }
}
