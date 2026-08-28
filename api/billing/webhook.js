import { createHash } from 'node:crypto';

import { completeLocalPaymentOrder } from '../_lib/local-db.js';
import { getStripeClient, isStripeConfigured, readRawBody } from '../_lib/billing.js';
import { processYipayCallback } from '../_lib/yipay.js';

export const config = { api: { bodyParser: false } };

function json(res, status, payload) {
  res.status(status).json(payload);
}

function text(res, status, payload) {
  res.status(status);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.end(payload);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return text(res, 405, 'fail');
  }

  if (req.headers?.['stripe-signature']) {
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

  try {
    await processYipayCallback(req);
    return text(res, 200, 'success');
  } catch (error) {
    console.warn('Failed to process Yipay callback', {
      code: error?.code || 'YIPAY_CALLBACK_FAILED',
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    const clientError = ['INVALID_WEBHOOK_SIGNATURE', 'PAYMENT_MERCHANT_MISMATCH', 'INVALID_PAYMENT_CALLBACK', 'PAYMENT_AMOUNT_MISMATCH'].includes(error?.code);
    return text(res, clientError ? 400 : 500, 'fail');
  }
}
