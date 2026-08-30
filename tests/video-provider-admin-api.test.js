import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-video-provider-admin-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.PROVIDER_CONFIG_SECRET = 'video-provider-admin-test-secret';
process.env.SESSION_SECRET = 'video-provider-admin-session-secret';
process.env.SUPER_ADMIN_EMAILS = 'video-admin@example.com';
process.env.AI_API_KEY = 'video-provider-admin-key';
process.env.AI_BASE_URL = 'https://provider.example';
process.env.AI_IMAGE_MODEL = 'gpt-image-2';

const previousFetch = globalThis.fetch;
const localDb = await import('../api/_lib/local-db.js');
const { default: videoProviderAdminHandler } = await import('../api/admin/video-providers.js');

after(() => {
  globalThis.fetch = previousFetch;
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

async function invoke(token, method, body = {}) {
  let statusCode = 200;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  await videoProviderAdminHandler({
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    query: {},
    body
  }, res);
  return { statusCode, payload };
}

test('video provider administration is permissioned, redacted, synchronized, and audited', async () => {
  const admin = localDb.createUser({ email: 'video-admin@example.com', password: 'testing-1234', fullName: 'Video Admin' });
  const member = localDb.createUser({ email: 'video-member@example.com', password: 'testing-1234', fullName: 'Video Member' });
  const adminSession = localDb.createSession(admin.id);
  const memberSession = localDb.createSession(member.id);

  const forbidden = await invoke(memberSession.token, 'GET');
  assert.equal(forbidden.statusCode, 403);

  const listed = await invoke(adminSession.token, 'GET');
  assert.equal(listed.statusCode, 200);
  const provider = listed.payload.providers[0];
  assert.equal(provider.model, 'sora-2');
  assert.equal(Object.hasOwn(provider, 'apiKey'), false);
  assert.ok(provider.apiKeyMasked);
  assert.equal(provider.apiKeyMasked.includes('video-provider-admin-key'), false);

  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/api/pricing')) {
      return new Response(JSON.stringify({ data: [{ model_name: 'sora-2', model_price: 0.12, pricing_version: 'test-v1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (String(url).endsWith('/api/status')) {
      return new Response(JSON.stringify({ data: { usd_exchange_rate: 7.1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const synced = await invoke(adminSession.token, 'POST', { action: 'sync-pricing', id: provider.id });
  assert.equal(synced.statusCode, 200);
  assert.equal(synced.payload.provider.pricingConfig.pricingSource, 'synced');
  assert.equal(synced.payload.provider.pricingConfig.pricePerSecondRmb, 0.852);
  assert.equal(Object.hasOwn(synced.payload.provider, 'apiKey'), false);

  const audit = localDb.getDb().prepare(`
    SELECT category, action, entity_id FROM audit_events
    WHERE action = 'video_pricing_synced'
    ORDER BY created_at DESC LIMIT 1
  `).get();
  assert.equal(audit.category, 'pricing');
  assert.equal(audit.action, 'video_pricing_synced');
  assert.equal(audit.entity_id, provider.id);
});
