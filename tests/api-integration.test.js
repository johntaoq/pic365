import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import Stripe from 'stripe';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-api-integration-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
process.env.PROVIDER_CONFIG_SECRET = 'api-integration-provider-secret';
process.env.SESSION_SECRET = 'api-integration-session-secret';
process.env.AI_API_KEY = 'sk-fake-health-provider';
process.env.AI_BASE_URL = 'https://provider.example.invalid';
process.env.AI_IMAGE_MODEL = 'gpt-image-2';
process.env.STRIPE_SECRET_KEY = 'sk_test_pic365_local_only';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_pic365_local_only';
process.env.WATCHA_CLIENT_ID = 'watcha-client';
process.env.WATCHA_PUBLIC_CLIENT = 'true';
process.env.WATCHA_TOKEN_URL = 'https://watcha.example.invalid/token';
process.env.WATCHA_USERINFO_URL = 'https://watcha.example.invalid/userinfo';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const [
  db,
  { default: webhookHandler },
  { default: watchaCallbackHandler },
  { default: healthHandler },
  { default: assetsHandler },
  freeWorker,
  ecommerceWorker,
  mediaWorker
] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/billing/webhook.js'),
  import('../api/auth/watcha/callback.js'),
  import('../api/health.js'),
  import('../api/assets.js'),
  import('../server/free-generation-worker.js'),
  import('../server/ecommerce-generation-worker.js'),
  import('../server/media-processing-worker.js')
]);

after(async () => {
  await Promise.all([
    freeWorker.stopFreeGenerationWorker(),
    ecommerceWorker.stopEcommerceGenerationWorker(),
    mediaWorker.stopMediaProcessingWorker()
  ]);
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, req = {}) {
  let statusCode = 200;
  let payload;
  let ended = false;
  const headers = new Map();
  const res = {
    writableEnded: false,
    headersSent: false,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; ended = true; this.writableEnded = true; return value; },
    writeHead(code, values = {}) {
      statusCode = code;
      for (const [name, value] of Object.entries(values)) this.setHeader(name, value);
      this.headersSent = true;
      return this;
    },
    end(value = '') { payload = value; ended = true; this.writableEnded = true; return this; },
    once() {}
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, once() {}, ...req }, res))
    .then(() => ({ statusCode, payload, headers, ended }));
}

test('signed Stripe webhooks grant a local order exactly once', async () => {
  const user = db.createUser({ email: 'stripe-api@example.com', password: 'testing-1234', fullName: 'Stripe API' });
  const order = db.createLocalPaymentOrder(user.id, db.getCreditProduct('pack_100'), 'stripe');
  db.markLocalPaymentCheckoutCreated(order.id, { providerOrderId: 'cs_test_webhook' });
  const event = {
    id: 'evt_webhook_once',
    object: 'event',
    api_version: '2026-02-25.clover',
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'cs_test_webhook', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_test' } },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'checkout.session.completed'
  };
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = Stripe.webhooks.generateTestHeaderString({ payload: rawBody.toString('utf8'), secret: process.env.STRIPE_WEBHOOK_SECRET });
  const first = await invoke(webhookHandler, { method: 'POST', body: rawBody, headers: { 'stripe-signature': signature } });
  const second = await invoke(webhookHandler, { method: 'POST', body: rawBody, headers: { 'stripe-signature': signature } });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(db.getUserById(user.id).creditBalance, 100);
  assert.equal(db.listCreditLedger(user.id, 20).filter((entry) => entry.type === 'purchase').length, 1);
});

test('Watcha callback creates the normal local session and clears temporary OAuth cookies', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === process.env.WATCHA_TOKEN_URL) {
      return new Response(JSON.stringify({ access_token: 'watcha-access-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      statusCode: 200,
      data: { user_id: 'watcha-api-user', email: 'watcha-api@example.com', nickname: 'Watcha API User' }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await invoke(watchaCallbackHandler, {
      method: 'GET',
      headers: {
        host: 'localhost:5173',
        'x-forwarded-proto': 'http',
        cookie: 'watcha_oauth_state=state-one; watcha_oauth_verifier=verifier-one; watcha_oauth_return_to=http%3A%2F%2Flocalhost%3A5173%2F'
      },
      query: { code: 'authorization-code', state: 'state-one' }
    });
    assert.equal(result.statusCode, 302);
    assert.equal(result.headers.get('location'), 'http://localhost:5173/');
    const cookies = result.headers.get('set-cookie');
    assert.ok(Array.isArray(cookies));
    assert.ok(cookies.some((cookie) => cookie.startsWith('member_session=')));
    assert.ok(cookies.some((cookie) => cookie.startsWith('watcha_oauth_state=') && cookie.includes('Max-Age=0')));
    assert.equal(db.getUserByEmail('watcha-api@example.com').full_name, 'Watcha API User');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('health route verifies SQLite, storage, providers, and all durable workers', async () => {
  const result = await invoke(healthHandler, { query: {} });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.checks.database.quickCheck, 'ok');
  assert.equal(result.payload.checks.storage.backend, 'local-disk');
  assert.equal(result.payload.checks.providers.length, 1);
  assert.equal(result.payload.checks.providers[0].configured, true);
  assert.equal(result.payload.checks.workers.free.running, true);
  assert.equal(result.payload.checks.workers.ecommerce.running, true);
  assert.equal(result.payload.checks.workers.media.running, true);
});

test('protected asset routes reject anonymous access', async () => {
  const result = await invoke(assetsHandler, { method: 'GET' });
  assert.equal(result.statusCode, 401);
  assert.equal(result.payload.error, 'AUTH_REQUIRED');
});
