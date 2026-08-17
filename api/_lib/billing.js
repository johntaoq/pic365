import Stripe from 'stripe';

const STRIPE_API_VERSION = '2026-02-25.clover';
const DEFAULT_APP_URL = 'https://www.pic365.org';

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
