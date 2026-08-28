import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-yipay-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.PROVIDER_CONFIG_SECRET = 'yipay-test-provider-secret';
process.env.SUPER_ADMIN_EMAILS = 'yipay-admin@example.com';

const [
  localDb,
  yipay,
  { default: adminRechargeHandler },
  { default: catalogHandler },
  { default: checkoutHandler },
  { default: webhookHandler },
  { default: returnHandler }
] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/yipay.js'),
  import('../api/admin/recharge.js'),
  import('../api/billing/catalog.js'),
  import('../api/billing/checkout.js'),
  import('../api/billing/webhook.js'),
  import('../api/billing/return.js')
]);

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, req = {}) {
  let statusCode = 200;
  let payload;
  let ended = '';
  let redirect = null;
  const headers = {};
  const res = {
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; },
    end(value = '') { ended = String(value); return value; },
    redirect(code, location) { statusCode = code; redirect = location; return this; }
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, ...req }, res))
    .then(() => ({ statusCode, payload, ended, redirect, headers }));
}

function callbackFromCheckout(checkoutUrl, overrides = {}) {
  const checkout = new URL(checkoutUrl);
  const parameters = {
    pid: checkout.searchParams.get('pid'),
    name: checkout.searchParams.get('name'),
    money: checkout.searchParams.get('money'),
    out_trade_no: checkout.searchParams.get('out_trade_no'),
    trade_no: 'ZPAY-TRADE-001',
    param: checkout.searchParams.get('param'),
    trade_status: 'TRADE_SUCCESS',
    type: checkout.searchParams.get('type'),
    ...overrides,
    sign_type: 'MD5'
  };
  parameters.sign = yipay.createYipaySign(parameters, 'test-yipay-api-key');
  return parameters;
}

test('admin can save a masked Yipay configuration without exposing the API key', async () => {
  const admin = localDb.createUser({ email: 'yipay-admin@example.com', password: 'testing-1234' });
  const session = localDb.createSession(admin.id);
  const response = await invoke(adminRechargeHandler, {
    method: 'PATCH',
    headers: { cookie: `member_session=${encodeURIComponent(session.token)}` },
    body: {
      payment: {
        enabled: true,
        merchantId: 'merchant-2026',
        gatewayUrl: 'https://pay.example.test/submit.php',
        apiKey: 'test-yipay-api-key'
      }
    }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.payment.enabled, true);
  assert.equal(response.payload.payment.gatewayUrl, 'https://pay.example.test');
  assert.equal(response.payload.payment.hasApiKey, true);
  assert.equal(Object.hasOwn(response.payload.payment, 'apiKey'), false);
  assert.equal(JSON.stringify(response.payload).includes('test-yipay-api-key'), false);
  const stored = localDb.getDb().prepare("SELECT value_json FROM app_settings WHERE setting_key = 'yipay_config'").get();
  assert.equal(stored.value_json.includes('test-yipay-api-key'), false);

  const preserve = await invoke(adminRechargeHandler, {
    method: 'PATCH',
    headers: { cookie: `member_session=${encodeURIComponent(session.token)}` },
    body: {
      payment: {
        enabled: true,
        merchantId: 'merchant-2026',
        gatewayUrl: 'https://pay.example.test',
        apiKey: ''
      }
    }
  });
  assert.equal(preserve.statusCode, 200);
  assert.equal(yipay.getYipayConfig({ includeSecret: true }).apiKey, 'test-yipay-api-key');
});

test('checkout signs a Pic365 order and a valid callback credits it exactly once', async () => {
  const buyer = localDb.createUser({ email: 'yipay-buyer@example.com', password: 'testing-1234' });
  const session = localDb.createSession(buyer.id);
  const headers = {
    cookie: `member_session=${encodeURIComponent(session.token)}`,
    host: 'www.pic365.test',
    'x-forwarded-proto': 'https'
  };

  const catalog = await invoke(catalogHandler, { headers });
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.payload.checkoutAvailable, true);
  assert.deepEqual(catalog.payload.paymentMethods.map((method) => method.id), ['alipay', 'wxpay']);

  const checkout = await invoke(checkoutHandler, {
    method: 'POST',
    headers,
    body: { productId: 'recharge-20', paymentType: 'alipay' }
  });
  assert.equal(checkout.statusCode, 200);
  const url = new URL(checkout.payload.url);
  assert.equal(url.origin, 'https://pay.example.test');
  assert.equal(url.pathname, '/submit.php');
  assert.equal(url.searchParams.get('pid'), 'merchant-2026');
  assert.equal(url.searchParams.get('type'), 'alipay');
  assert.equal(url.searchParams.get('money'), '20.00');
  assert.match(url.searchParams.get('out_trade_no'), /^\d{20,32}$/);
  assert.equal(yipay.verifyYipaySign(Object.fromEntries(url.searchParams.entries()), 'test-yipay-api-key'), true);

  const callback = callbackFromCheckout(checkout.payload.url);
  const first = await invoke(webhookHandler, { method: 'GET', query: callback });
  const repeated = await invoke(webhookHandler, { method: 'GET', query: callback });
  assert.equal(first.statusCode, 200);
  assert.equal(first.ended, 'success');
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.ended, 'success');
  assert.equal(localDb.getUserById(buyer.id).creditBalance, 2020);
  assert.equal(localDb.listCreditLedger(buyer.id, 20).filter((entry) => entry.type === 'purchase').length, 1);
});

test('callback amount mismatches and invalid signatures never grant credits', async () => {
  const buyer = localDb.createUser({ email: 'yipay-rejected@example.com', password: 'testing-1234' });
  const session = localDb.createSession(buyer.id);
  const headers = {
    cookie: `member_session=${encodeURIComponent(session.token)}`,
    host: 'www.pic365.test',
    'x-forwarded-proto': 'https'
  };
  const checkout = await invoke(checkoutHandler, {
    method: 'POST',
    headers,
    body: { productId: 'custom', amountCents: 3000, paymentType: 'wxpay' }
  });
  assert.equal(checkout.statusCode, 200);

  const invalidSignature = callbackFromCheckout(checkout.payload.url);
  invalidSignature.sign = '0'.repeat(32);
  const rejectedSignature = await invoke(webhookHandler, { method: 'GET', query: invalidSignature });
  assert.equal(rejectedSignature.statusCode, 400);
  assert.equal(rejectedSignature.ended, 'fail');

  const wrongAmount = callbackFromCheckout(checkout.payload.url, { money: '0.01', trade_no: 'ZPAY-TRADE-002' });
  const rejectedAmount = await invoke(webhookHandler, { method: 'GET', query: wrongAmount });
  assert.equal(rejectedAmount.statusCode, 400);
  assert.equal(rejectedAmount.ended, 'fail');
  assert.equal(localDb.getUserById(buyer.id).creditBalance, 0);
});

test('the signed browser return completes the order and redirects back to Pic365', async () => {
  const buyer = localDb.createUser({ email: 'yipay-return@example.com', password: 'testing-1234' });
  const session = localDb.createSession(buyer.id);
  const headers = {
    cookie: `member_session=${encodeURIComponent(session.token)}`,
    host: 'www.pic365.test',
    'x-forwarded-proto': 'https'
  };
  const checkout = await invoke(checkoutHandler, {
    method: 'POST',
    headers,
    body: { productId: 'recharge-10', paymentType: 'alipay' }
  });
  const callback = callbackFromCheckout(checkout.payload.url, { trade_no: 'ZPAY-TRADE-003' });
  const result = await invoke(returnHandler, { method: 'GET', headers, query: callback });
  assert.equal(result.statusCode, 302);
  assert.equal(result.redirect, 'https://www.pic365.test/?billing=success');
  assert.equal(localDb.getUserById(buyer.id).creditBalance, 1000);
});
