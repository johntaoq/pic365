import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-reference-billing-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'generated');
process.env.PROVIDER_CONFIG_SECRET = 'reference-billing-test-secret';

const previousFetch = globalThis.fetch;
const [{ default: generateImageHandler }, db] = await Promise.all([
  import('../api/generate-image.js'),
  import('../api/_lib/local-db.js')
]);

after(() => {
  globalThis.fetch = previousFetch;
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

async function invoke(body, token) {
  let statusCode = 200;
  let payload;
  const res = {
    writableEnded: false,
    once() {},
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; this.writableEnded = true; return value; }
  };
  await generateImageHandler({
    method: 'POST',
    headers: { cookie: `member_session=${encodeURIComponent(token)}` },
    body,
    query: {},
    socket: { remoteAddress: '127.0.0.1' },
    once() {}
  }, res);
  return { statusCode, payload };
}

test('final image billing uses the normalized reference count times the configured unit price', async () => {
  const user = db.createUser({
    email: `reference-billing-${Date.now()}@example.com`,
    password: 'testing-1234',
    fullName: 'Reference Billing Test'
  });
  db.getDb().prepare('UPDATE users SET credit_balance = 1000 WHERE id = ?').run(user.id);
  const session = db.createSession(user.id);
  const provider = db.saveImageProviderConfig({
    name: 'Reference Billing Provider',
    providerType: 'openai-compatible',
    baseUrl: 'https://provider.example',
    apiKey: 'reference-billing-key',
    model: 'gpt-image-2',
    pricingStrategy: 'fixed-quality',
    pricingConfig: {
      strategy: 'fixed-quality',
      qualityPricesRmb: { low: 0.4, medium: 0.8, high: 1.6 },
      referenceImagePriceRmb: 0.12
    },
    enabled: true,
    isDefault: true
  });
  db.bindDefaultSystemGroupChannel('image', provider.id);
  const [red, blue, output] = await Promise.all([
    sharp({ create: { width: 2, height: 2, channels: 3, background: '#ef4444' } }).png().toBuffer(),
    sharp({ create: { width: 2, height: 2, channels: 3, background: '#3b82f6' } }).png().toBuffer(),
    sharp({ create: { width: 16, height: 16, channels: 3, background: '#22c55e' } }).png().toBuffer()
  ]);
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: 'reference-billing-provider-request',
    data: [{ b64_json: output.toString('base64') }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const result = await invoke({
    prompt: 'Create a product image from both references.',
    size: '1024x1024',
    quality: 'low',
    count: 1,
    providerId: provider.id,
    references: [red, blue].map((bytes) => ({ imageDataUrl: `data:image/png;base64,${bytes.toString('base64')}` }))
  }, session.token);

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.pricing.baseCredits, 40);
  assert.equal(result.payload.pricing.referenceCount, 2);
  assert.equal(result.payload.pricing.referenceUnitCredits, 12);
  assert.equal(result.payload.pricing.referenceCredits, 24);
  assert.equal(result.payload.creditsCharged, 64);
  assert.equal(db.getUserProfile(user.id).creditBalance, 936);
});
