import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import sharp from 'sharp';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-newapi-sso-'));
Object.assign(process.env, {
  APP_DB_PATH: path.join(directory, 'app.sqlite'), LOCAL_STORAGE_ROOT: path.join(directory, 'images'),
  PROVIDER_CONFIG_SECRET: 'local-pic365-storage-test-secret', NEWAPI16_CLIENT_SECRET: 'local-newapi16-bridge-secret-at-least-32-chars',
  NEWAPI16_ORIGIN: 'https://api.99off.net', APP_URL: 'https://www.pic365.org',
  NEWAPI40_ORIGIN: 'https://www.unikeyx.com', NEWAPI40_CLIENT_SECRET: 'local-newapi40-bridge-secret-at-least-32-chars',
  AI_API_KEY: 'local-test-default-key', AI_BASE_URL: 'https://ordinary-provider.invalid', AZURE_STORAGE_CONNECTION_STRING: ''
});
const db = await import('../api/_lib/local-db.js');
const external = await import('../api/_lib/newapi-account.js');
const { default: callback } = await import('../api/auth/newapi16/callback.js');
const { default: callback40 } = await import('../api/auth/newapi40/callback.js');
const { default: start16 } = await import('../api/auth/newapi16/start.js');
const { default: start40 } = await import('../api/auth/newapi40/start.js');
const { default: images } = await import('../api/generate-image.js');
const { default: quotes } = await import('../api/image-pricing.js');
const { default: menuSettings } = await import('../api/menu-settings.js');
const chatEngine = await import('../api/_lib/chat-engine.js');
const assistantSettings = await import('../api/_lib/chat-assistant-settings.js');
const { default: assistant } = await import('../api/chat.js');
const { default: magic } = await import('../api/optimize-image-prompt.js');
const { default: textQuotes } = await import('../api/text-models.js');
const { default: sanitize } = await import('../api/sanitize-prompt.js');
const originalFetch = globalThis.fetch;
const credential = (overrides = {}) => ({ issuer: process.env.NEWAPI16_ORIGIN, subject: randomUUID(), user_id: 2, username: 'alice',
  token_id: 41, access_token: `sk-${'a'.repeat(48)}`, expires_at: Math.floor(Date.now() / 1000) + 3600,
  models: ['gpt-image-2', 'gemini-3.1-flash-image-preview', 'grok-imagine-image-2.0'], billing_source: 'wallet',
  group: 'default', grant_binding: 'b'.repeat(43), ...overrides });
const source = credential();
const userId = external.saveNewAPIAccount(source);
const session = db.createSession(userId);
const systemImageProviders = new Map();
for (const sourceId of ['newapi16', 'newapi40']) {
  for (const [index, model] of source.models.entries()) {
    const provider = db.saveImageProviderConfig({ name: `Configured ${sourceId} engine ${index + 1}`, model,
      baseUrl: `${external.getNewAPIConfig(sourceId).origin}/v1/`, apiKey: 'system-image-key', isDefault: sourceId === 'newapi16' && index === 0 });
    db.bindDefaultSystemGroupChannel('image', provider.id);
    systemImageProviders.set(`${sourceId}:${model}`, provider);
  }
}
after(() => { globalThis.fetch = originalFetch; db.getDb().close(); fs.rmSync(directory, { recursive: true, force: true }); });

test('source image engines intersect enabled system models with Key capabilities and group access, retaining system labels', async () => {
  external.saveNewAPIAccount({ ...source, models: [...source.models, 'gpt-image-unconfigured', 'gpt-image-disabled', 'gpt-image-other-url', 'gpt-image-restricted'] });
  const disabled = db.saveImageProviderConfig({ name: 'Disabled engine', model: 'gpt-image-disabled', baseUrl: source.issuer, apiKey: 'system-key', enabled: false });
  const otherUrl = db.saveImageProviderConfig({ name: 'Other URL engine', model: 'gpt-image-other-url', baseUrl: 'https://other.invalid', apiKey: 'system-key' });
  const ungranted = db.saveImageProviderConfig({ name: 'Ungranted model', model: 'gpt-image-2-extra', baseUrl: source.issuer, apiKey: 'system-key' });
  const restricted = db.saveImageProviderConfig({ name: 'Restricted engine', model: 'gpt-image-restricted', baseUrl: source.issuer, apiKey: 'system-key' });
  const temporary = [disabled, otherUrl, ungranted, restricted];
  for (const provider of [disabled, otherUrl, ungranted]) db.bindDefaultSystemGroupChannel('image', provider.id);
  const target = systemImageProviders.get('newapi16:gpt-image-2');
  try {
    const providers = db.listImageProviderConfigs({ userId });
    const expected = [...systemImageProviders.values(), otherUrl];
    assert.deepEqual(providers.map((item) => item.systemProviderId).sort(), expected.map((item) => item.id).sort());
    for (const item of providers) {
      const configured = expected.find((provider) => provider.id === item.systemProviderId);
      assert.equal(item.name, configured.name);
      assert.equal(item.id, `newapi16:${configured.id}`);
      assert.equal(item.isDefault, configured.isDefault);
      const resolved = external.getNewAPIProvider(userId, item.id);
      assert.equal(resolved.baseUrl, source.issuer);
      assert.equal(resolved.apiKey, source.access_token);
      assert.equal(resolved.pricingStrategy, 'external-wallet');
      assert.equal(resolved.billingSource, 'azure16');
    }
    assert.equal(JSON.stringify(providers).includes('system-key'), false);
    assert.equal(external.getNewAPIProvider(userId, 'newapi16:gpt-image-other-url').name, otherUrl.name);
    for (const id of ['newapi16:gpt-image-unconfigured', `newapi16:${disabled.id}`, `newapi16:${ungranted.id}`, `newapi16:${restricted.id}`]) {
      assert.throws(() => external.getNewAPIProvider(userId, id), /NEWAPI_MODEL_NOT_ALLOWED/);
      const quote = await invoke(quotes, { providerId: id, prompt: 'A quote test', quality: 'low', size: '1024x1024' });
      assert.equal(quote.status, 400);
    }
    db.saveImageProviderConfig({ ...target, baseUrl: 'https://other.invalid/different-path/v1' });
    assert.equal(external.getNewAPIProvider(userId, `newapi16:${target.id}`).baseUrl, source.issuer);
    db.saveImageProviderConfig({ ...target, model: ungranted.model });
    assert.throws(() => external.getNewAPIProvider(userId, `newapi16:${target.id}`), /NEWAPI_MODEL_NOT_ALLOWED/);
    db.saveImageProviderConfig(target);
    db.getDb().prepare('UPDATE image_provider_configs SET enabled = 0 WHERE id = ?').run(target.id);
    assert.throws(() => external.getNewAPIProvider(userId, `newapi16:${target.id}`), /NEWAPI_MODEL_NOT_ALLOWED/);
  } finally {
    db.saveImageProviderConfig(target);
    for (const provider of temporary) {
      db.getDb().prepare("DELETE FROM system_user_group_channels WHERE channel_type = 'image' AND channel_id = ?").run(provider.id);
      db.getDb().prepare('DELETE FROM image_provider_configs WHERE id = ?').run(provider.id);
    }
    external.saveNewAPIAccount(source);
  }
});

test('40 source image engines match system models across URLs but always use the 40 source wallet and Key', () => {
  const owner = credential({ issuer: process.env.NEWAPI40_ORIGIN, access_token: `sk-${'z'.repeat(48)}` });
  const id = external.saveNewAPIAccount(owner, external.getNewAPIConfig('newapi40'));
  const providers = db.listImageProviderConfigs({ userId: id });
  assert.deepEqual(providers.map((item) => item.systemProviderId).sort(), [...systemImageProviders.values()].map((item) => item.id).sort());
  for (const item of providers) {
    const configured = [...systemImageProviders.values()].find((provider) => provider.id === item.systemProviderId);
    const resolved = external.getNewAPIProvider(id, item.id);
    assert.equal(item.name, configured.name);
    assert.equal(resolved.baseUrl, owner.issuer);
    assert.equal(resolved.apiKey, owner.access_token);
    assert.equal(resolved.headers['X-Pic365-Client'], process.env.NEWAPI40_CLIENT_SECRET);
    assert.equal(resolved.billingSource, 'azure40');
    assert.equal(resolved.pricingStrategy, 'external-wallet');
  }
});

test('five-minute grants renew once for concurrent requests and recover after page sleep without changing identity', async () => {
  const owner = credential({ expires_at: Math.floor(Date.now() / 1000) + 5 });
  const id = external.saveNewAPIAccount(owner);
  let renewals = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${owner.access_token}`);
    assert.equal(init.headers['X-Pic365-Client'], process.env.NEWAPI16_CLIENT_SECRET);
    assert.equal(init.redirect, 'error');
    if (url.endsWith('/api/pic365/renew')) {
      renewals++;
      return new Response(JSON.stringify({ success: true, data: { issuer: owner.issuer, user_id: owner.user_id,
        token_id: owner.token_id, expires_at: Math.floor(Date.now() / 1000) + 300, grant_binding: 'r'.repeat(43) } }));
    }
    assert.ok(url.endsWith('/api/pic365/balance'));
    assert.equal(init.headers['X-Pic365-Grant'], 'r'.repeat(43));
    return new Response(JSON.stringify({ success: true, data: { quota: 500000, quota_per_unit: 500000, billing_source: 'wallet' } }));
  };
  const wallets = await Promise.all(Array.from({ length: 6 }, () => external.getNewAPIWallet(id)));
  assert.equal(renewals, 1);
  assert.ok(wallets.every((wallet) => wallet.available));
  db.getDb().prepare('UPDATE newapi_accounts SET expires_at = 1 WHERE user_id = ?').run(id);
  assert.equal((await external.getNewAPIWallet(id)).available, true);
  assert.equal(renewals, 2);
  assert.equal(external.getNewAPIAccountCredential(id).apiKey, owner.access_token);
  assert.equal(db.getUserProfile(id).creditBalance, 0);
  assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id=?').get(id).n, 0);
  globalThis.fetch = originalFetch;
});

test('renewal errors distinguish revocation from outages and cannot replace credentials installed by a concurrent login', async () => {
  const owner = credential({ expires_at: Math.floor(Date.now() / 1000) + 5 });
  const id = external.saveNewAPIAccount(owner);
  for (const [response, code] of [
    [new Response('{"success":false,"error":"authorization_required"}', { status: 401 }), 'NEWAPI_REAUTH_REQUIRED'],
    [new Response('<html>edge access denied</html>', { status: 403 }), 'NEWAPI_AUTH_UNAVAILABLE'],
    [new Response('{"success":false,"error":"invalid_client"}', { status: 401 }), 'NEWAPI_AUTH_UNAVAILABLE'],
    [new Response('{"success":false}', { status: 503 }), 'NEWAPI_AUTH_UNAVAILABLE'],
  ]) {
    globalThis.fetch = async () => response;
    await assert.rejects(external.ensureNewAPIAuthorization(id), (error) => error.code === code);
    assert.equal(external.getNewAPIAccountCredential(id).apiKey, owner.access_token);
  }
  globalThis.fetch = async () => { throw new Error('simulated timeout'); };
  await assert.rejects(external.ensureNewAPIAuthorization(id), (error) => error.code === 'NEWAPI_AUTH_UNAVAILABLE');
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: { issuer: 'https://other.invalid',
    user_id: owner.user_id, token_id: owner.token_id, expires_at: Math.floor(Date.now() / 1000) + 300, grant_binding: 'r'.repeat(43) } }));
  await assert.rejects(external.ensureNewAPIAuthorization(id), (error) => error.code === 'NEWAPI_AUTH_UNAVAILABLE');
  const next = { ...owner, grant_binding: 'n'.repeat(43), access_token: `sk-${'n'.repeat(48)}`, expires_at: Math.floor(Date.now() / 1000) + 300 };
  globalThis.fetch = async () => {
    external.saveNewAPIAccount(next);
    return new Response('{"success":false,"error":"authorization_required"}', { status: 401 });
  };
  await external.ensureNewAPIAuthorization(id);
  assert.equal(external.getNewAPIAccountCredential(id).apiKey, next.access_token);
  assert.equal(external.getNewAPIAccountCredential(id).binding, next.grant_binding);
  assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id=?').get(id).n, 0);
  globalThis.fetch = originalFetch;
});

test('HTML edge failures never claim that source authorization expired', async () => {
  globalThis.fetch = async () => new Response('<html>access denied</html>', { status: 403 });
  await assert.rejects(external.getNewAPIWallet(userId), (error) => error.code === 'NEWAPI_BALANCE_UNAVAILABLE');
  globalThis.fetch = originalFetch;
});

async function invoke(handler, body = {}, method = 'POST', cookie = `member_session=${session.token}`, query = {}) {
  let status, payload, location;
  const headers = new Map();
  const response = { once() {}, getHeader(key) { return headers.get(key.toLowerCase()); }, setHeader(key, value) { headers.set(key.toLowerCase(), value); }, status(value) { status = value; return this; }, json(value) { payload = value; return this; }, redirect(value, url) { status = value; location = url; return this; } };
  await handler({ method, body, query, once() {}, socket: { remoteAddress: '127.0.0.1' }, headers: { cookie, 'x-forwarded-proto': 'https' } }, response);
  return { status, payload, location, headers };
}

test('SSO creates a normal account without credits, role escalation or email-based merging', () => {
  assert.equal(db.getUserById(userId).role, 'user');
  assert.equal(db.getUserProfile(userId).creditBalance, 0);
  assert.equal(db.getUserProfile(userId).externalWallet.source, 'azure16');
  assert.equal(db.getUserById(userId).fullName, 'alice@99off');
  assert.equal(external.saveNewAPIAccount({ ...source, role: 100, email: 'existing@example.test' }), userId);
  const fresh = external.saveNewAPIAccount(credential({ user_id: 2 }));
  assert.notEqual(fresh, userId, 'a recycled source numeric ID cannot inherit the old Pic365 account');
  const row = db.getDb().prepare('SELECT token_encrypted FROM newapi_accounts WHERE user_id=?').get(userId);
  assert.equal(row.token_encrypted.includes(source.access_token), false);
  assert.equal(JSON.stringify(db.getUserProfile(userId)).includes(source.access_token), false);
});

test('source username changes update only the display name of the existing account', () => {
  const database = db.getDb();
  const before = database.prepare('SELECT id, email, password_hash, credit_balance, role, system_group_id FROM users WHERE id = ?').get(userId);
  assert.equal(external.saveNewAPIAccount({ ...source, username: 'renamed' }), userId);
  assert.equal(db.getUserById(userId).fullName, 'renamed@99off');
  assert.deepEqual(database.prepare('SELECT id, email, password_hash, credit_balance, role, system_group_id FROM users WHERE id = ?').get(userId), before);
  for (const username of ['', '   ', 'bad\nname', 'a'.repeat(129), undefined]) {
    assert.throws(() => external.saveNewAPIAccount({ ...source, username }), /NEWAPI_LOGIN_INVALID/);
  }
  assert.equal(external.saveNewAPIAccount(source), userId);
});

test('linked accounts hide and lock Templates, Examples and API even after a forged preference update or expired authorization', async () => {
  const database = db.getDb();
  database.prepare('INSERT INTO user_ui_preferences (user_id, hide_templates, hide_cases, hide_api, updated_at) VALUES (?, 0, 0, 0, ?)')
    .run(userId, new Date().toISOString());
  const defaults = await invoke(menuSettings, {}, 'GET');
  assert.deepEqual(defaults.payload.menu.effective, { ecommerce: true, templates: false, cases: false, api: false });
  assert.deepEqual(defaults.payload.menu.personal.locked, { hideEcommerce: false, hideTemplates: true, hideCases: true, hideApi: true });
  const forged = await invoke(menuSettings, { hideEcommerce: true, hideTemplates: false, hideCases: false, hideApi: false, locked: {}, source: 'ordinary' }, 'PATCH');
  assert.equal(forged.status, 200);
  assert.deepEqual(forged.payload.menu.effective, { ecommerce: false, templates: false, cases: false, api: false });
  assert.deepEqual({ ...database.prepare('SELECT hide_templates, hide_cases, hide_api FROM user_ui_preferences WHERE user_id = ?').get(userId) }, { hide_templates: 1, hide_cases: 1, hide_api: 1 });
  database.prepare('UPDATE newapi_accounts SET expires_at = 1 WHERE user_id = ?').run(userId);
  const expired = await invoke(menuSettings, {}, 'GET');
  assert.equal(expired.payload.menu.personal.locked.hideApi, true);
  external.saveNewAPIAccount(source);
  const reopened = await invoke(menuSettings, { hideEcommerce: false }, 'PATCH');
  assert.deepEqual(reopened.payload.menu.effective, { ecommerce: true, templates: false, cases: false, api: false });

  const ordinary = db.createUser({ email: 'ordinary-menus@example.test', password: 'local-test-password', fullName: 'Ordinary' });
  const ordinarySession = db.createSession(ordinary.id);
  const ordinaryResult = await invoke(menuSettings, { hideTemplates: false, hideCases: false, hideApi: false }, 'PATCH', `member_session=${ordinarySession.token}`);
  assert.equal(ordinaryResult.status, 200);
  assert.deepEqual(ordinaryResult.payload.menu.effective, { ecommerce: true, templates: true, cases: true, api: true });
  assert.deepEqual(ordinaryResult.payload.menu.personal.locked, { hideEcommerce: false, hideTemplates: false, hideCases: false, hideApi: false });
});

test('login state is browser-bound, expires and can be redeemed only once', async () => {
  let redirect, cookie;
  external.startNewAPILogin({ query: { entry: 'https://example.invalid/' } }, { setHeader(key, value) { if (key === 'Set-Cookie') cookie = value.split(';')[0]; }, redirect(code, url) { redirect = url; } });
  const search = new URL(redirect).searchParams;
  const state = search.get('state');
  const flow = db.getDb().prepare('SELECT expires_at FROM newapi_login_flows WHERE consumed_at IS NULL ORDER BY expires_at DESC LIMIT 1').get();
  assert.ok(Math.abs(flow.expires_at - Math.floor(Date.now() / 1000) - 300) <= 1);
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, `${process.env.NEWAPI16_ORIGIN}/api/pic365/token`);
    assert.equal(init.headers.Authorization, `Bearer ${process.env.NEWAPI16_CLIENT_SECRET}`);
    const request = JSON.parse(init.body);
    assert.equal(request.redirect_uri, `${process.env.APP_URL}/api/auth/newapi16/callback`);
    assert.deepEqual(request.text_models, [...new Set(chatEngine.listChatProviderConfigs({ admin: true })
      .filter((provider) => provider.enabled && (provider.magicEnabled || provider.assistantEnabled)).map((provider) => provider.model))]);
    assert.ok(request.code_verifier);
    return new Response(JSON.stringify({ success: true, data: source }));
  };
  const query = { state, code: 'c'.repeat(43), entry: 'create' };
  const rejected = await invoke(callback, {}, 'GET', 'pic365_newapi_login=wrong-browser', query);
  assert.equal(rejected.location, '/?newapi_login=failed');
  assert.equal(calls, 0);
  const result = await invoke(callback, {}, 'GET', cookie, query);
  assert.equal(result.location, '/');
  assert.match(result.headers.get('set-cookie')[0], /member_session=.*HttpOnly; SameSite=Lax; Secure/);
  assert.match(result.headers.get('set-cookie')[1], /pic365_newapi_login=;.*Max-Age=0/);
  assert.equal(JSON.stringify(result.headers.get('set-cookie')).includes(source.access_token), false);
  const replay = await invoke(callback, {}, 'GET', cookie, query);
  assert.equal(replay.location, '/?newapi_login=failed');
  assert.equal(calls, 1);
  let expiredRedirect;
  external.startNewAPILogin({}, { setHeader() {}, redirect(code, url) { expiredRedirect = url; } });
  db.getDb().prepare('UPDATE newapi_login_flows SET expires_at = 1 WHERE consumed_at IS NULL').run();
  const expired = await invoke(callback, {}, 'GET', cookie, { state: new URL(expiredRedirect).searchParams.get('state'), code: 'c'.repeat(43) });
  assert.equal(expired.location, '/?newapi_login=failed');
  globalThis.fetch = originalFetch;
});

test('gateway launch opens Create only after SSO authenticates and rotates the Pic365 session', async (t) => {
  for (const [sourceId, startHandler, callbackHandler] of [
    ['newapi16', start16, callback],
    ['newapi40', start40, callback40]
  ]) {
    await t.test(sourceId, async (t) => {
      const config = external.getNewAPIConfig(sourceId);
      const owner = credential({ issuer: config.origin });
      const start = await invoke(startHandler, {}, 'GET', '', { entry: 'create' });
      assert.equal(start.status, 302);
      const gateway = new URL(start.location);
      assert.equal(gateway.origin, config.origin);
      assert.equal(gateway.pathname, '/pic365');
      const flowCookie = start.headers.get('set-cookie').split(';')[0];
      const oldSession = db.createSession(userId);
      const query = { state: gateway.searchParams.get('state'), code: 'c'.repeat(43), entry: 'https://example.invalid/' };
      let exchangeAllowed = false;
      const exchange = t.mock.method(globalThis, 'fetch', async (url, init) => {
        assert.equal(url, `${config.origin}/api/pic365/token`);
        const request = JSON.parse(init.body);
        assert.equal(request.redirect_uri, config.callback);
        assert.equal(gateway.searchParams.get('code_challenge'),
          createHash('sha256').update(request.code_verifier).digest('base64url'));
        return new Response(JSON.stringify(exchangeAllowed ? { success: true, data: owner } : { success: false }),
          { status: exchangeAllowed ? 200 : 400 });
      });
      const startedCookie = `${flowCookie}; member_session=${oldSession.token}`;
      const rejected = await invoke(callbackHandler, {}, 'GET', startedCookie, query);
      assert.equal(rejected.location, '/?newapi_login=failed');
      assert.ok(!rejected.headers.get('set-cookie').some((cookie) => cookie.startsWith('member_session=')));
      assert.ok(db.getUserBySessionToken(oldSession.token), 'a rejected exchange does not change the current session');

      exchangeAllowed = true;
      const retry = await invoke(startHandler, {}, 'GET', '', { entry: 'create' });
      const retryGateway = new URL(retry.location);
      gateway.search = retryGateway.search;
      const retryCookie = retry.headers.get('set-cookie').split(';')[0];
      const retryQuery = { ...query, state: retryGateway.searchParams.get('state') };
      const result = await invoke(callbackHandler, {}, 'GET', `${retryCookie}; member_session=${oldSession.token}`, retryQuery);
      assert.equal(result.status, 303);
      assert.equal(result.location, '/#create');
      const cookies = result.headers.get('set-cookie');
      const issued = cookies.find((cookie) => cookie.startsWith('member_session='));
      assert.match(issued, /HttpOnly; SameSite=Lax; Secure/);
      const token = decodeURIComponent(issued.split(';')[0].slice('member_session='.length));
      const authenticated = db.getUserBySessionToken(token);
      assert.equal(external.getNewAPIAccountProfile(authenticated.id).source, config.source);
      assert.ok(!db.getUserBySessionToken(oldSession.token));
      const replay = await invoke(callbackHandler, {}, 'GET', retryCookie, retryQuery);
      assert.equal(replay.location, '/?newapi_login=failed');
      assert.equal(exchange.mock.callCount(), 2, 'the replay is rejected before contacting the gateway');
    });
  }
});

test('external image generation sends the owner key to 16 and never creates a Pic365 debit or refund', async () => {
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#d72a30' } }).png().toBuffer();
  let modelCalls = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${source.access_token}`);
    assert.equal(init.headers['X-Pic365-Client'], process.env.NEWAPI16_CLIENT_SECRET);
    assert.equal(init.headers['X-Pic365-Grant'], source.grant_binding);
    if (url.endsWith('/api/pic365/balance')) return new Response(JSON.stringify({ success: true, data: { quota: 500000, quota_per_unit: 500000, billing_source: 'wallet' } }));
    assert.equal(url, 'https://api.99off.net/v1/images/generations');
    assert.equal(JSON.parse(init.body).model, 'gpt-image-2');
    modelCalls++;
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }], usage: { input_tokens: 1000, output_tokens: 1000 } }));
  };
  const body = { providerId: 'newapi16:gpt-image-2', prompt: 'A red product photograph', size: '1024x1024', quality: 'low', clientTaskId: 'external-image-1' };
  const quote = await invoke(quotes, body);
  assert.equal(quote.status, 200);
  assert.equal(quote.payload.quotes[0].pricing.credits, 0);
  const result = await invoke(images, body);
  assert.equal(result.status, 200);
  assert.equal(modelCalls, 1);
  assert.equal(result.payload.creditsCharged, 0);
  assert.equal(db.getUserProfile(userId).creditBalance, 0);
  assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id=?').get(userId).n, 0);
  const reservation = db.getDb().prepare('SELECT * FROM credit_reservations WHERE user_id=? ORDER BY created_at DESC').get(userId);
  assert.equal(reservation.billing_scope, 'external_newapi');
  assert.equal(reservation.amount_centi, 0);
  assert.equal(reservation.status, 'succeeded');
  const providers = db.listImageProviderConfigs({ userId });
  assert.ok(providers.every((item) => item.id.startsWith('newapi16:')));
  assert.equal(JSON.stringify(providers).includes(source.access_token), false);
  const otherProvider = await invoke(images, { ...body, clientTaskId: 'external-image-forbidden', providerId: 'another-wallet-provider' });
  assert.equal(otherProvider.status, 403);
  assert.equal(modelCalls, 1);
  globalThis.fetch = originalFetch;
});

test('Gemini and Grok image engines use the source wallet and existing protocol adapters', async () => {
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#d72a30' } }).png().toBuffer();
  const seen = [];
  globalThis.fetch = async (url, init) => {
    assert.ok(url.startsWith(process.env.NEWAPI16_ORIGIN));
    assert.equal(init.headers.Authorization, `Bearer ${source.access_token}`);
    assert.equal(init.headers['X-Pic365-Grant'], source.grant_binding);
    if (url.endsWith('/api/pic365/balance')) return new Response(JSON.stringify({ success: true, data: { quota: 500000, quota_per_unit: 500000, billing_source: 'wallet' } }));
    const body = JSON.parse(init.body);
    seen.push(body.model);
    assert.equal(init.redirect, 'error');
    if (body.model.startsWith('gemini')) {
      assert.equal(url, `${process.env.NEWAPI16_ORIGIN}/v1/chat/completions`);
      assert.equal(body.stream, false);
      assert.equal(body.extra_body.google.image_config.image_size, '1K');
      return new Response(JSON.stringify({ choices: [{ message: { content: `![image](data:image/png;base64,${png.toString('base64')})` } }] }));
    }
    assert.equal(url, `${process.env.NEWAPI16_ORIGIN}/v1/images/generations`);
    assert.equal(body.n, 1);
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
  };
  for (const model of ['gemini-3.1-flash-image-preview', 'grok-imagine-image-2.0']) {
    const result = await invoke(images, { providerId: `newapi16:${model}`, prompt: 'A test product photo', size: '1024x1024', quality: 'low', clientTaskId: `engine-${model}` });
    assert.equal(result.status, 200);
    assert.equal(result.payload.creditsCharged, 0);
  }
  assert.deepEqual(seen, ['gemini-3.1-flash-image-preview', 'grok-imagine-image-2.0']);
  assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id=?').get(userId).n, 0);
  globalThis.fetch = originalFetch;
});

test('40 identities, providers, credentials and billing remain separate from 16', async () => {
  const config = external.getNewAPIConfig('newapi40');
  const account40 = credential({ issuer: config.origin, subject: source.subject, access_token: `sk-${'z'.repeat(48)}`, grant_binding: 'd'.repeat(43) });
  const user40 = external.saveNewAPIAccount(account40, config);
  assert.notEqual(user40, userId, 'identical numeric IDs and subjects at different issuers are not merged');
  assert.equal(db.getUserProfile(user40).externalWallet.source, 'azure40');
  assert.equal(db.getUserById(user40).fullName, 'alice@unikeyx');
  assert.equal(db.getUserProfile(user40).externalWallet.startUrl, '/api/auth/newapi40/start');
  const session40 = db.createSession(user40);
  const menus40 = await invoke(menuSettings, { hideTemplates: false, hideCases: false, hideApi: false }, 'PATCH', `member_session=${session40.token}`);
  assert.deepEqual(menus40.payload.menu.effective, { ecommerce: true, templates: false, cases: false, api: false });
  assert.equal(menus40.payload.menu.personal.locked.hideTemplates, true);
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#d72a30' } }).png().toBuffer();
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    assert.ok(url.startsWith(config.origin));
    assert.equal(init.headers.Authorization, `Bearer ${account40.access_token}`);
    assert.equal(init.headers['X-Pic365-Client'], config.secret);
    assert.equal(init.headers['X-Pic365-Grant'], account40.grant_binding);
    if (url.endsWith('/api/pic365/balance')) return new Response(JSON.stringify({ success: true, data: { quota: 500000, quota_per_unit: 500000, billing_source: 'wallet' } }));
    calls++;
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
  };
  const result = await invoke(images, { providerId: 'newapi40:gpt-image-2', prompt: 'A product photo', size: '1024x1024', quality: 'low', clientTaskId: 'source40-image' }, 'POST', `member_session=${session40.token}`);
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
  assert.equal(result.payload.creditsCharged, 0);
  const reservation = db.getDb().prepare('SELECT billing_source, amount_centi FROM credit_reservations WHERE user_id=?').get(user40);
  assert.equal(reservation.billing_source, 'azure40');
  assert.equal(reservation.amount_centi, 0);
  assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id=?').get(user40).n, 0);
  assert.throws(() => external.getNewAPIProvider(user40, 'newapi16:gpt-image-2'), /NEWAPI_MODEL_NOT_ALLOWED/);
  globalThis.fetch = originalFetch;
});

test('source binding prevents redeeming a 16 login flow through the 40 callback', async () => {
  let redirect, cookie;
  external.startNewAPILogin({}, { setHeader(key, value) { if (key === 'Set-Cookie') cookie = value.split(';')[0]; }, redirect(code, url) { redirect = url; } });
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not exchange across sources'); };
  await assert.rejects(external.finishNewAPILogin({ query: { state: new URL(redirect).searchParams.get('state'), code: 'c'.repeat(43) }, headers: { cookie } }, 'newapi40'), /NEWAPI_LOGIN_INVALID/);
  assert.equal(calls, 0);
  globalThis.fetch = originalFetch;
});

test('insufficient source balance and revoked credentials block before image generation without local charging', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.ok(url.endsWith('/api/pic365/balance'));
    return new Response(JSON.stringify({ success: true, data: { quota: 0, quota_per_unit: 500000, billing_source: 'wallet' } }));
  };
  const body = { providerId: 'newapi16:gpt-image-2', prompt: 'A product photograph', quality: 'low', size: '1024x1024' };
  const low = await invoke(images, body);
  assert.equal(low.status, 402);
  assert.equal(low.payload.error, 'NEWAPI_BALANCE_REQUIRED');
  assert.equal(calls, 1);
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, error: 'authorization_required' }), { status: 401 });
  const revoked = await invoke(images, body);
  assert.equal(revoked.status, 401);
  assert.equal(revoked.payload.error, 'NEWAPI_REAUTH_REQUIRED');
  assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id=?').get(userId).n, 0);
  globalThis.fetch = originalFetch;
});

test('source network errors never trigger fallback or local charges', async () => {
  globalThis.fetch = async () => { throw new Error('local simulated connection failure'); };
  const result = await invoke(images, { providerId: 'newapi16:gpt-image-2', prompt: 'A product photo', quality: 'low', size: '1024x1024' });
  assert.equal(result.status, 503);
  assert.equal(result.payload.error, 'NEWAPI_BALANCE_UNAVAILABLE');
  assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id=?').get(userId).n, 0);
  globalThis.fetch = originalFetch;
});

test('positive balance below required upstream reservation reports source insufficiency and releases the zero reservation', async () => {
  globalThis.fetch = async (url) => url.endsWith('/api/pic365/balance')
    ? new Response(JSON.stringify({ success: true, data: { quota: 1, quota_per_unit: 500000, billing_source: 'wallet' } }))
    : new Response(JSON.stringify({ error: { message: 'Insufficient quota for pre-consumption', code: 'insufficient_user_quota' } }), { status: 403 });
  const result = await invoke(images, { providerId: 'newapi16:gpt-image-2', prompt: 'A product photo', quality: 'low', size: '1024x1024', clientTaskId: 'positive-low-source-balance' });
  assert.equal(result.status, 402);
  assert.equal(result.payload.error, 'NEWAPI_BALANCE_REQUIRED');
  assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id=?').get(userId).n, 0);
  assert.equal(db.getUserProfile(userId).creditBalance, 0);
  globalThis.fetch = originalFetch;
});

const configuredTextModels = ['gpt-6-luna', 'system-assistant-model', 'system-next-model'];
let magicProvider, assistantProvider, nextProvider, textAdmin;

test('16 and 40 text calls retain system models and prompts but use only their own credentials and wallets', async () => {
  magicProvider = chatEngine.saveChatProviderConfig({ id: chatEngine.getChatProviderConfig().id, name: 'System Magic', model: configuredTextModels[0],
    baseUrl: 'https://system-text.invalid/v1', apiKey: 'system-unified-key', magicEnabled: true, assistantEnabled: false, isDefault: false });
  assistantProvider = chatEngine.saveChatProviderConfig({ name: 'System Assistant', model: configuredTextModels[1],
    baseUrl: 'https://system-text.invalid/v1', apiKey: 'system-unified-key', magicEnabled: false, assistantEnabled: true, isDefault: true });
  nextProvider = chatEngine.saveChatProviderConfig({ name: 'Next Assistant', model: configuredTextModels[2],
    baseUrl: 'https://next-system-text.invalid/v1', apiKey: 'next-system-key', magicEnabled: false, assistantEnabled: true, isDefault: false });
  textAdmin = db.createUser({ email: 'text-admin@example.test', password: 'local-test-password', initialCredits: 20 });
  db.getDb().prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(textAdmin.id);
  assistantSettings.saveAdminChatSettings(textAdmin.id, { systemPrompt: 'Configured assistant prompt',
    allowedModels: [assistantProvider.model, nextProvider.model], defaultProviderId: assistantProvider.id });
  for (const sourceId of ['newapi16', 'newapi40']) {
    const config = external.getNewAPIConfig(sourceId);
    const owner = credential({ issuer: config.origin, access_token: `sk-${(sourceId === 'newapi16' ? 'a' : 'z').repeat(48)}`,
      grant_binding: (sourceId === 'newapi16' ? 'b' : 'd').repeat(43), text_models: configuredTextModels });
    const id = external.saveNewAPIAccount(owner, config);
    const cookie = `member_session=${db.createSession(id).token}`;
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      assert.equal(init.headers.Authorization, `Bearer ${owner.access_token}`);
      assert.equal(init.headers['X-Pic365-Client'], config.secret);
      assert.equal(init.headers['X-Pic365-Grant'], owner.grant_binding);
      assert.equal(init.redirect, 'error');
      if (url.endsWith('/api/pic365/balance')) return new Response(JSON.stringify({ success: true, data: { quota: 500000, quota_per_unit: 500000, billing_source: 'wallet' } }));
      assert.equal(url, `${config.origin}/v1/chat/completions`);
      const body = JSON.parse(init.body);
      assert.equal(body.model, calls === 0 ? assistantProvider.model : magicProvider.model);
      if (calls === 0) assert.equal(body.messages[0].content, 'Configured assistant prompt');
      calls++;
      return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: calls === 3
        ? '{"status":"ok","prompt":"A clean product image"}' : 'Configured text result' } }], usage: { prompt_tokens: 90, completion_tokens: 35 } }));
    };
    const body = { text: 'A model routing test', clientRequestId: `source-chat-${sourceId}`,
      baseUrl: 'https://forged.invalid', apiKey: 'forged-key', model: 'forged-model' };
    const reply = await invoke(assistant, body, 'POST', cookie);
    assert.equal(reply.status, 200);
    assert.equal(reply.payload.message.chargedCredits, 0);
    const repeated = await invoke(assistant, body, 'POST', cookie);
    assert.equal(repeated.payload.duplicate, true);
    const optimized = await invoke(magic, { prompt: 'A model routing test', providerId: nextProvider.id,
      baseUrl: 'https://forged.invalid', apiKey: 'forged-key' }, 'POST', cookie);
    assert.equal(optimized.status, 200);
    assert.equal(optimized.payload.chargedCredits, 0);
    const rewritten = await invoke(sanitize, { prompt: 'A model routing test' }, 'POST', cookie);
    assert.equal(rewritten.status, 200);
    assert.equal(calls, 3);
    const quote = await invoke(textQuotes, { text: 'A quote test' }, 'POST', cookie);
    assert.equal(quote.payload.quote.externalWallet, true);
    assert.equal(quote.payload.quote.estimatedCredits, 0);
    assert.equal(db.getUserProfile(id).creditBalance, 0);
    assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id = ?').get(id).n, 0);
    assert.ok(db.getDb().prepare('SELECT billing_scope, amount_centi, settled_centi, status FROM credit_reservations WHERE user_id = ?').all(id)
      .every((row) => row.billing_scope === 'external_newapi' && row.amount_centi === 0 && row.settled_centi === 0 && row.status === 'succeeded'));
    assert.equal(JSON.stringify(reply.payload).includes(owner.access_token), false);
    assert.equal(JSON.stringify(optimized.payload).includes(config.secret), false);
  }
  globalThis.fetch = originalFetch;
});

test('ordinary Pic365 users retain system URL and unified key with original local billing', async () => {
  const ordinary = db.createUser({ email: 'native-text@example.test', password: 'local-test-password', initialCredits: 20 });
  const cookie = `member_session=${db.createSession(ordinary.id).token}`;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://system-text.invalid/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer system-unified-key');
    assert.equal(init.headers['X-Pic365-Client'], undefined);
    assert.equal(init.headers['X-Pic365-Grant'], undefined);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Native text result' } }], usage: { prompt_tokens: 90, completion_tokens: 35 } }));
  };
  const reply = await invoke(assistant, { text: 'Native chat test', clientRequestId: 'native-text-test' }, 'POST', cookie);
  assert.equal(reply.status, 200);
  assert.ok(reply.payload.message.chargedCredits > 0);
  const beforeMagic = db.getUserProfile(ordinary.id).creditBalance;
  const optimized = await invoke(magic, { prompt: 'Native magic test' }, 'POST', cookie);
  assert.equal(optimized.status, 200);
  assert.equal(optimized.payload.chargedCredits, 1);
  assert.equal(db.getUserProfile(ordinary.id).creditBalance, beforeMagic - 1);
  const quote = await invoke(textQuotes, { text: 'Native quote test' }, 'POST', cookie);
  assert.equal(quote.payload.quote.fixedPrice, true);
  assert.equal(quote.payload.quote.estimatedCredits, 1);
  assert.equal(calls, 2);
  globalThis.fetch = originalFetch;
});

test('system model changes preserve source credentials, and ungranted models or expired origins never fall back', async () => {
  external.saveNewAPIAccount({ ...source, text_models: configuredTextModels });
  assistantSettings.saveAdminChatSettings(textAdmin.id, { systemPrompt: 'Changed system prompt',
    allowedModels: [assistantProvider.model, nextProvider.model], defaultProviderId: nextProvider.id });
  const selected = assistantSettings.resolveChatAssistantProvider(userId);
  assert.equal(selected.model, nextProvider.model);
  assert.equal(selected.systemPrompt, 'Changed system prompt');
  assert.equal(selected.baseUrl, process.env.NEWAPI16_ORIGIN);
  assert.equal(selected.apiKey, source.access_token);
  assert.equal(chatEngine.getChatProviderConfig('', { userId, purpose: 'magic' }).model, magicProvider.model);
  external.saveNewAPIAccount({ ...source, text_models: [magicProvider.model] });
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.ok(url.endsWith('/api/pic365/renew'), 'expired authorization attempts renewal, not inference');
    return new Response('{"success":false,"error":"authorization_required"}', { status: 401 });
  };
  const forbidden = await invoke(assistant, { text: 'Unauthorized test', clientRequestId: 'text-forbidden' });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.payload.error, 'NEWAPI_MODEL_NOT_ALLOWED');
  external.saveNewAPIAccount({ ...source, text_models: configuredTextModels });
  db.getDb().prepare('UPDATE newapi_accounts SET expires_at = 1 WHERE user_id = ?').run(userId);
  const expired = await invoke(magic, { prompt: 'Expired test' });
  assert.equal(expired.status, 401);
  assert.equal(expired.payload.error, 'NEWAPI_REAUTH_REQUIRED');
  external.saveNewAPIAccount({ ...source, text_models: configuredTextModels });
  const origin = process.env.NEWAPI16_ORIGIN;
  process.env.NEWAPI16_ORIGIN = 'https://changed-origin.invalid';
  const unknown = await invoke(magic, { prompt: 'Unknown origin test' });
  assert.equal(unknown.status, 401);
  process.env.NEWAPI16_ORIGIN = origin;
  assert.equal(calls, 1);
  assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id = ?').get(userId).n, 0);
  globalThis.fetch = originalFetch;
});

test('text failures release only zero local holds, do not retry, and never debit or refund source funds locally', async () => {
  external.saveNewAPIAccount({ ...source, text_models: configuredTextModels });
  for (const scenario of ['no-balance', 'revoked', 'upstream-quota', 'network', 'missing-usage', 'invalid-json']) {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      assert.equal(init.headers.Authorization, `Bearer ${source.access_token}`);
      if (url.endsWith('/api/pic365/renew')) return new Response('{"success":false,"error":"authorization_required"}', { status: 401 });
      if (url.endsWith('/api/pic365/balance')) {
        if (scenario === 'revoked') return new Response('{"success":false}', { status: 403 });
        return new Response(JSON.stringify({ success: true, data: { quota: scenario === 'no-balance' ? 0 : 500000, quota_per_unit: 500000, billing_source: 'wallet' } }));
      }
      calls++;
      if (scenario === 'upstream-quota') return new Response('{"error":{"code":"insufficient_user_quota","message":"Insufficient quota"}}', { status: 403 });
      if (scenario === 'network') throw new Error('simulated network error');
      if (scenario === 'invalid-json') return new Response('{"choices":[{"message":{"content":"not a JSON safety result"}}],"usage":{"prompt_tokens":90,"completion_tokens":35}}');
      return new Response('{"choices":[{"message":{"content":"result without usage"}}]}');
    };
    const handler = scenario === 'invalid-json' ? sanitize : magic;
    const result = await invoke(handler, { prompt: `Failure test ${scenario}` });
    assert.equal(result.payload.ok, false);
    assert.equal(result.status, scenario === 'no-balance' || scenario === 'upstream-quota' ? 402 : scenario === 'revoked' ? 401 : 502);
    assert.equal(calls, ['no-balance', 'revoked'].includes(scenario) ? 0 : 1);
  }
  assert.equal(db.getUserProfile(userId).creditBalance, 0);
  assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id = ?').get(userId).n, 0);
  assert.equal(db.getDb().prepare("SELECT count(*) AS n FROM credit_reservations WHERE user_id = ? AND status = 'reserved'").get(userId).n, 0);
  globalThis.fetch = originalFetch;
});

test('expired 16 and 40 authorization renews before Assistant and Magic Pen calls, with no native-credit charge', async () => {
  for (const sourceId of ['newapi16', 'newapi40']) {
    const config = external.getNewAPIConfig(sourceId);
    const owner = credential({ issuer: config.origin, text_models: configuredTextModels,
      expires_at: Math.floor(Date.now() / 1000) + 5 });
    const id = external.saveNewAPIAccount(owner, config);
    const cookie = `member_session=${db.createSession(id).token}`;
    db.getDb().prepare('UPDATE newapi_accounts SET expires_at = 1 WHERE user_id=?').run(id);
    const calls = [];
    globalThis.fetch = async (url, init) => {
      assert.ok(url.startsWith(config.origin));
      assert.equal(init.headers.Authorization, `Bearer ${owner.access_token}`);
      assert.equal(init.headers['X-Pic365-Client'], config.secret);
      calls.push(url.split('/').at(-1));
      if (url.endsWith('/renew')) return new Response(JSON.stringify({ success: true, data: {
        issuer: config.origin, user_id: owner.user_id, token_id: owner.token_id,
        expires_at: Math.floor(Date.now() / 1000) + 300, grant_binding: 'r'.repeat(43) } }));
      assert.equal(init.headers['X-Pic365-Grant'], 'r'.repeat(43));
      if (url.endsWith('/balance')) return new Response('{"success":true,"data":{"quota":500000,"quota_per_unit":500000,"billing_source":"wallet"}}');
      assert.ok(url.endsWith('/v1/chat/completions'));
      return new Response('{"choices":[{"message":{"content":"Renewed text response"}}],"usage":{"prompt_tokens":90,"completion_tokens":35}}');
    };
    const result = await invoke(assistant, { text: 'Resume after sleep', clientRequestId: `sleep-${sourceId}` }, 'POST', cookie);
    assert.equal(result.status, 200);
    assert.equal(result.payload.message.chargedCredits, 0);
    assert.deepEqual(calls, ['renew', 'balance', 'completions']);
    calls.length = 0;
    db.getDb().prepare('UPDATE newapi_accounts SET expires_at = 1 WHERE user_id=?').run(id);
    const optimized = await invoke(magic, { prompt: 'Resume Magic Pen after sleep' }, 'POST', cookie);
    assert.equal(optimized.status, 200);
    assert.equal(optimized.payload.chargedCredits, 0);
    assert.deepEqual(calls, ['renew', 'balance', 'completions']);
    assert.equal(db.getDb().prepare('SELECT count(*) AS n FROM credit_ledger WHERE user_id=?').get(id).n, 0);
  }
  globalThis.fetch = originalFetch;
});
