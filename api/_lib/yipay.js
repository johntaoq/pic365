import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { completeLocalPaymentOrder, getDb } from './local-db.js';
import { decryptProviderSecret, encryptProviderSecret, maskProviderSecret } from './provider-secrets.js';

const YIPAY_SETTING_KEY = 'yipay_config';
export const YIPAY_PAYMENT_METHODS = Object.freeze([
  { id: 'alipay', nameZh: '支付宝', nameEn: 'Alipay' },
  { id: 'wxpay', nameZh: '微信支付', nameEn: 'WeChat Pay' }
]);

function now() {
  return new Date().toISOString();
}

function clean(value, maximum = 240) {
  return String(value || '').trim().slice(0, maximum);
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function publicConfig(value = {}, updatedAt = null) {
  let apiKeyMasked = '';
  if (value.apiKeyEncrypted) {
    try {
      apiKeyMasked = maskProviderSecret(decryptProviderSecret(value.apiKeyEncrypted));
    } catch {
      apiKeyMasked = '';
    }
  }
  return {
    provider: 'yipay',
    enabled: Boolean(value.enabled),
    merchantId: clean(value.merchantId, 128),
    gatewayUrl: clean(value.gatewayUrl, 500),
    hasApiKey: Boolean(value.apiKeyEncrypted),
    apiKeyMasked,
    paymentMethods: YIPAY_PAYMENT_METHODS,
    updatedAt: updatedAt || null
  };
}

export function normalizeYipayGatewayUrl(value) {
  const raw = clean(value, 500);
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error('INVALID_YIPAY_GATEWAY'), { code: 'INVALID_YIPAY_GATEWAY' });
  }
  const localDevelopment = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && localDevelopment)) {
    throw Object.assign(new Error('INVALID_YIPAY_GATEWAY'), { code: 'INVALID_YIPAY_GATEWAY' });
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  const pathname = url.pathname
    .replace(/\/(?:submit|mapi)\.php\/?$/i, '')
    .replace(/\/+$/, '');
  return `${url.origin}${pathname === '/' ? '' : pathname}`;
}

export function getYipayConfig({ includeSecret = false } = {}) {
  const row = getDb().prepare('SELECT value_json, updated_at FROM app_settings WHERE setting_key = ?').get(YIPAY_SETTING_KEY);
  const stored = parseJson(row?.value_json);
  const safe = publicConfig(stored, row?.updated_at || null);
  if (!includeSecret) return safe;
  let apiKey = '';
  if (stored.apiKeyEncrypted) apiKey = decryptProviderSecret(stored.apiKeyEncrypted);
  return { ...safe, apiKey };
}

export function updateYipayConfig(values = {}, adminUserId = null) {
  const db = getDb();
  const row = db.prepare('SELECT value_json, updated_at FROM app_settings WHERE setting_key = ?').get(YIPAY_SETTING_KEY);
  const previousStored = parseJson(row?.value_json);
  const previous = publicConfig(previousStored, row?.updated_at || null);
  const merchantId = clean(values.merchantId, 128);
  const gatewayUrl = normalizeYipayGatewayUrl(values.gatewayUrl);
  const replacementApiKey = clean(values.apiKey, 2000);
  const apiKeyEncrypted = replacementApiKey
    ? encryptProviderSecret(replacementApiKey)
    : previousStored.apiKeyEncrypted || '';
  const enabled = Boolean(values.enabled);
  if (enabled && (!merchantId || !gatewayUrl || !apiKeyEncrypted)) {
    throw Object.assign(new Error('YIPAY_CONFIG_INCOMPLETE'), { code: 'YIPAY_CONFIG_INCOMPLETE' });
  }
  const stored = { enabled, merchantId, gatewayUrl, apiKeyEncrypted };
  const updatedAt = now();
  const next = publicConfig(stored, updatedAt);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(YIPAY_SETTING_KEY, JSON.stringify(stored), adminUserId, updatedAt);
    db.prepare(`
      INSERT INTO app_setting_audit
        (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      cryptoRandomId(),
      YIPAY_SETTING_KEY,
      JSON.stringify(previous),
      JSON.stringify(next),
      adminUserId,
      updatedAt
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getYipayConfig();
}

function cryptoRandomId() {
  return randomBytes(16).toString('hex');
}

export function isYipayConfigured(config = getYipayConfig()) {
  return Boolean(config?.enabled && config?.merchantId && config?.gatewayUrl && (config?.apiKey || config?.hasApiKey));
}

export function buildYipayEndpoint(gatewayUrl, endpoint = 'submit.php') {
  const base = normalizeYipayGatewayUrl(gatewayUrl);
  if (!base) throw Object.assign(new Error('YIPAY_CONFIG_INCOMPLETE'), { code: 'YIPAY_CONFIG_INCOMPLETE' });
  return `${base}/${String(endpoint || 'submit.php').replace(/^\/+/, '')}`;
}

export function createYipaySign(parameters = {}, apiKey = '') {
  const canonical = Object.entries(parameters)
    .filter(([key, value]) => !['sign', 'sign_type'].includes(key) && value !== '' && value !== null && value !== undefined)
    .map(([key, value]) => [String(key), String(value)])
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return createHash('md5').update(`${canonical}${String(apiKey || '')}`, 'utf8').digest('hex');
}

export function verifyYipaySign(parameters = {}, apiKey = '') {
  const received = clean(parameters.sign, 128).toLowerCase();
  const expected = createYipaySign(parameters, apiKey);
  if (!received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
}

export function parseYipayMoneyToCents(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [yuan, fraction = ''] = normalized.split('.');
  const cents = (Number(yuan) * 100) + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

export function formatYipayMoney(amountCents) {
  const cents = Number(amountCents);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw Object.assign(new Error('INVALID_PAYMENT_AMOUNT'), { code: 'INVALID_PAYMENT_AMOUNT' });
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function createYipayCheckoutUrl(parameters, config) {
  const signed = {
    ...parameters,
    sign: createYipaySign(parameters, config.apiKey),
    sign_type: 'MD5'
  };
  const url = new URL(buildYipayEndpoint(config.gatewayUrl, 'submit.php'));
  for (const [key, value] of Object.entries(signed)) {
    if (value !== '' && value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function readYipayParameters(req) {
  if (req.method === 'GET') return Object.fromEntries(Object.entries(req.query || {}).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else if (typeof req.body === 'string') raw = req.body;
  else if (req?.[Symbol.asyncIterator]) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    raw = Buffer.concat(chunks).toString('utf8');
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function merchantOrderId() {
  const suffix = Array.from(randomBytes(10), (value) => String(value % 10)).join('');
  return `${Date.now()}${suffix}`.slice(0, 32);
}

export function createYipayPaymentOrder({ userId, product, paymentType }) {
  const db = getDb();
  const orderId = merchantOrderId();
  const createdAt = now();
  const productId = clean(product.id, 120);
  if (!productId || !userId) throw Object.assign(new Error('INVALID_BILLING_PRODUCT'), { code: 'INVALID_BILLING_PRODUCT' });
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO credit_products
        (id, name_en, name_zh, description_en, description_zh, credits, amount_cents, currency, active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'cny', 1, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name_en = excluded.name_en,
        name_zh = excluded.name_zh,
        description_en = excluded.description_en,
        description_zh = excluded.description_zh,
        credits = excluded.credits,
        amount_cents = excluded.amount_cents,
        currency = 'cny',
        active = 1,
        updated_at = excluded.updated_at
    `).run(
      productId,
      clean(product.nameEn, 160),
      clean(product.nameZh, 160),
      clean(product.descriptionEn, 500),
      clean(product.descriptionZh, 500),
      Math.max(1, Math.round(Number(product.credits) || 0)),
      Math.max(1, Math.round(Number(product.amountCents) || 0)),
      createdAt,
      createdAt
    );
    db.prepare(`
      INSERT INTO payment_orders
        (id, user_id, product_id, status, amount_cents, currency, credits, provider, metadata, created_at)
      VALUES (?, ?, ?, 'created', ?, 'cny', ?, 'yipay', ?, ?)
    `).run(
      orderId,
      userId,
      productId,
      Math.max(1, Math.round(Number(product.amountCents) || 0)),
      Math.max(1, Math.round(Number(product.credits) || 0)),
      JSON.stringify({ paymentType }),
      createdAt
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId);
}

export async function processYipayCallback(req) {
  const parameters = await readYipayParameters(req);
  const config = getYipayConfig({ includeSecret: true });
  if (!isYipayConfigured(config)) throw Object.assign(new Error('BILLING_NOT_CONFIGURED'), { code: 'BILLING_NOT_CONFIGURED' });
  if (clean(parameters.sign_type, 20).toUpperCase() !== 'MD5' || !verifyYipaySign(parameters, config.apiKey)) {
    throw Object.assign(new Error('INVALID_WEBHOOK_SIGNATURE'), { code: 'INVALID_WEBHOOK_SIGNATURE' });
  }
  if (clean(parameters.pid, 128) !== config.merchantId) {
    throw Object.assign(new Error('PAYMENT_MERCHANT_MISMATCH'), { code: 'PAYMENT_MERCHANT_MISMATCH' });
  }
  if (clean(parameters.trade_status, 40) !== 'TRADE_SUCCESS') {
    return { acknowledged: true, paid: false, parameters };
  }
  const merchantOrderIdValue = clean(parameters.out_trade_no, 64);
  const gatewayTradeNo = clean(parameters.trade_no, 128);
  const amountCents = parseYipayMoneyToCents(parameters.money);
  if (!merchantOrderIdValue || amountCents === null) {
    throw Object.assign(new Error('INVALID_PAYMENT_CALLBACK'), { code: 'INVALID_PAYMENT_CALLBACK' });
  }
  const eventId = gatewayTradeNo || `${merchantOrderIdValue}:${clean(parameters.sign, 64)}`;
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(Object.entries(parameters).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)))
    .digest('hex');
  const result = completeLocalPaymentOrder({
    provider: 'yipay',
    providerOrderId: merchantOrderIdValue,
    eventId,
    payloadHash,
    amountCents,
    currency: 'cny',
    metadata: {
      gatewayTradeNo,
      paymentType: clean(parameters.type, 40),
      merchantId: config.merchantId
    }
  });
  return { ...result, acknowledged: true, paid: true, parameters };
}
