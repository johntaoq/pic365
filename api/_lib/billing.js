import Stripe from 'stripe';

const STRIPE_API_VERSION = '2026-02-25.clover';
const DEFAULT_APP_URL = 'https://gpt-image2.canghe.ai';

let stripeClient;

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripeClient() {
  if (!isStripeConfigured()) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION
    });
  }
  return stripeClient;
}

export function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  const protocol = req?.headers?.['x-forwarded-proto'] || 'https';
  return host ? `${protocol}://${host}` : DEFAULT_APP_URL;
}

export async function readJsonBody(req) {
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function normalizeCurrency(value) {
  return String(value || 'usd').toLowerCase();
}

function moneyLabel(amountCents, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalizeCurrency(currency).toUpperCase()
  }).format(Number(amountCents || 0) / 100);
}

export function formatPack(row) {
  return {
    id: row.id,
    type: 'credit_pack',
    name: {
      en: row.name_en,
      zh: row.name_zh
    },
    description: {
      en: row.description_en,
      zh: row.description_zh
    },
    credits: Number(row.credits || 0),
    amountCents: Number(row.amount_cents || 0),
    currency: normalizeCurrency(row.currency),
    priceLabel: moneyLabel(row.amount_cents, row.currency),
    active: Boolean(row.active)
  };
}

export async function getBillingCatalog(client) {
  const packsResult = await client
    .from('credit_packs')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (packsResult.error) throw packsResult.error;

  return {
    packs: (packsResult.data || []).map(formatPack)
  };
}

export async function getBillingProduct(client, productId) {
  const { data, error } = await client
    .from('credit_packs')
    .select('*')
    .eq('id', productId)
    .eq('active', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return formatPack(data);
}

export async function getOrCreateStripeCustomer({ client, stripe, user, profile }) {
  if (profile?.stripeCustomerId) return profile.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: profile?.email || user.email || undefined,
    name: profile?.fullName || undefined,
    metadata: {
      userId: user.id
    }
  });

  const { error } = await client
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', user.id);

  if (error) throw error;
  return customer.id;
}

export function checkoutLineItem(product) {
  const priceData = {
    currency: product.currency,
    unit_amount: product.amountCents,
    product_data: {
      name: product.name.en,
      description: product.description.en,
      metadata: {
        productType: product.type,
        productId: product.id
      }
    }
  };

  return {
    quantity: 1,
    price_data: priceData
  };
}

export async function createPaymentOrder(client, { userId, product, customerId }) {
  const { data, error } = await client
    .from('payment_orders')
    .insert({
      user_id: userId,
      product_type: product.type,
      product_id: product.id,
      status: 'created',
      stripe_customer_id: customerId,
      amount_cents: product.amountCents,
      currency: product.currency,
      credits: product.credits
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
export async function markOrderCheckoutCreated(client, orderId, session) {
  const { data, error } = await client
    .from('payment_orders')
    .update({
      status: 'checkout_created',
      stripe_session_id: session.id,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
      metadata: {
        checkoutUrl: session.url || ''
      }
    })
    .eq('id', orderId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function grantCredits(client, { userId, amount, type, source, referenceId = null, metadata = {} }) {
  const { data, error } = await client.rpc('grant_user_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_source: source,
    p_reference_id: referenceId,
    p_metadata: metadata
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function completeCreditPackOrder(client, session) {
  const { data: order, error } = await client
    .from('payment_orders')
    .select('*')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  if (error) throw error;
  if (!order || order.status === 'completed') return order || null;
  if (order.product_type !== 'credit_pack') return order;

  await grantCredits(client, {
    userId: order.user_id,
    amount: Number(order.credits || 0),
    type: 'purchase',
    source: 'stripe_checkout',
    referenceId: order.id,
    metadata: {
      stripeSessionId: session.id,
      productId: order.product_id
    }
  });

  const { data, error: updateError } = await client
    .from('payment_orders')
    .update({
      status: 'completed',
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : order.stripe_customer_id,
      completed_at: new Date().toISOString()
    })
    .eq('id', order.id)
    .select('*')
    .single();

  if (updateError) throw updateError;
  return data;
}
