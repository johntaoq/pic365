import { getSupabaseAdminClient, isSupabaseServerConfigured } from '../_lib/supabase.js';
import {
  completeCreditPackOrder,
  getStripeClient,
  isStripeConfigured,
  readRawBody
} from '../_lib/billing.js';

export const config = {
  api: {
    bodyParser: false
  }
};

function json(res, status, payload) {
  res.status(status).json(payload);
}

async function handleCheckoutCompleted(client, session) {
  const productType = session.metadata?.productType;
  if (productType === 'credit_pack') {
    await completeCreditPackOrder(client, session);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  if (!isSupabaseServerConfigured() || !isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return json(res, 500, { ok: false, error: 'BILLING_NOT_CONFIGURED' });
  }

  const stripe = getStripeClient();
  const client = getSupabaseAdminClient();
  const signature = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return json(res, 400, {
      ok: false,
      error: 'INVALID_WEBHOOK_SIGNATURE'
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(client, event.data.object);
        break;
      default:
        break;
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
