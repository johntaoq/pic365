import { createHash } from 'node:crypto';

import { completeLocalPaymentOrder } from '../_lib/local-db.js';
import { getStripeClient, isStripeConfigured, readRawBody } from '../_lib/billing.js';

export const config = { api: { bodyParser: false } };

function json(res, status, payload) {
  res.status(status).json(payload);
}
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return json(res, 503, { ok: false, error: 'BILLING_NOT_CONFIGURED' });
  }
  const rawBody = await readRawBody(req);
  let event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_WEBHOOK_SIGNATURE' });
  }
  try {
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      const session = event.data.object;
      if (session.payment_status === 'paid' || event.type === 'checkout.session.async_payment_succeeded') {
        completeLocalPaymentOrder({
          provider: 'stripe',
          providerOrderId: session.id,
          eventId: event.id,
          payloadHash: createHash('sha256').update(rawBody).digest('hex'),
          amountCents: session.amount_total ?? null,
          currency: session.currency || '',
          metadata: { paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : '' }
        });
      }
    }
    return json(res, 200, { ok: true, received: true });
  } catch (error) {
    console.warn('Failed to process Stripe webhook', {
      eventType: event.type,
      eventId: event.id,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 500, { ok: false, error: 'WEBHOOK_PROCESSING_FAILED' });
  }
}
