import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const directory = mkdtempSync(path.join(os.tmpdir(), 'pic365-model-deletion-'));
process.env.APP_DB_PATH = path.join(directory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(directory, 'images');
process.env.PROVIDER_CONFIG_SECRET = 'test-model-deletion-secret';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;
const db = await import('../api/_lib/local-db.js');
const chat = await import('../api/_lib/chat-engine.js');
const { getModelRule, isImageModelRuleDeleted } = await import('../api/_lib/upstream-model-rules.js');
const { default: handler } = await import('../api/admin/upstream-rules.js');
const { default: quote } = await import('../api/image-pricing.js');

function account(name, role = 'user') {
  const user = db.createUser({ email: `${name}@example.test`, password: 'testing-1234', fullName: name });
  db.getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  return { ...user, token: db.createSession(user.id).token };
}

async function invoke(user, method, body, endpoint = handler) {
  let status = 200;
  let payload;
  const res = {
    setHeader() {},
    status(value) { status = value; return this; },
    json(value) { payload = value; return value; }
  };
  await endpoint({ method, body, headers: user ? { cookie: `member_session=${encodeURIComponent(user.token)}` } : {} }, res);
  return { status, payload };
}

test('upstream rules may be deleted by admins while retaining one model of each kind', async (t) => {
  t.after(() => { db.getDb().close(); rmSync(directory, { recursive: true, force: true }); });
  const admin = account('model-admin', 'super_admin');
  const operator = account('channel-operator', 'operations');
  const user = account('model-user');
  const sql = db.getDb();
  const baseUrl = 'https://provider.example.invalid/v1';
  const apiKey = 'sk-model-fixture';
  const image = (model, chargeTextTokens = false) => db.saveImageProviderConfig({
    name: model, model, baseUrl, apiKey, enabled: true,
    pricingConfig: { strategy: 'fixed-image', fixedPriceRmb: 0.4, chargeTextTokens }
  });
  const text = (model) => chat.saveChatProviderConfig({ name: model, model, baseUrl, apiKey, enabled: true, isDefault: false });
  const imgRemoved = image('image-to-remove', true);
  const imgKeeper = image('image-to-keep');
  const textRemoved = [text('text-to-remove'), text('text-to-remove')];
  const textKeeper = [text('text-to-keep'), text('text-to-keep')];
  db.bindDefaultSystemGroupChannel('image', imgRemoved.id);
  const img = { kind: 'image', model: imgRemoved.model };
  const txt = { kind: 'text', model: textRemoved[0].model };
  assert.equal((await invoke(admin, 'GET')).status, 200);

  await t.test('rejects unauthenticated, unprivileged, invalid and unknown requests', async () => {
    for (const target of [img, txt]) {
      assert.equal((await invoke(null, 'DELETE', target)).status, 401);
      assert.equal((await invoke(user, 'DELETE', target)).status, 403);
      assert.equal((await invoke(operator, 'DELETE', target)).status, 403);
      const result = await invoke(admin, 'DELETE', { ...target, model: 'nonexistent' });
      assert.equal(result.status, 404);
      assert.equal(result.payload.error, 'MODEL_RULE_NOT_FOUND');
      assert.ok(getModelRule(sql, target.kind, target.model));
    }
    assert.equal((await invoke(admin, 'DELETE', { kind: 'image', model: ' ' })).payload.error, 'INVALID_MODEL_RULE');
  });

  await t.test('deletes an image rule without removing its channel or recreating the rule on refresh or late sync', async (t) => {
    const modelPrice = { ...img, upstreamBaseUrl: baseUrl, unit: 'tokens', imageInput: 2,
      pricing: { input: 1, output: 5, cacheRead: 0, cacheWrite: 0 } };
    assert.equal((await invoke(admin, 'PATCH', { ...modelPrice, action: 'update' })).status, 200);
    assert.equal((await invoke(user, 'POST', { providerId: imgRemoved.id }, quote)).status, 200);
    const pending = Promise.withResolvers();
    const started = Promise.withResolvers();
    t.mock.method(globalThis, 'fetch', (url) => {
      if (!String(url).endsWith('/api/pricing')) return Promise.resolve(new Response('{}'));
      started.resolve();
      return pending.promise;
    });
    const sync = invoke(admin, 'POST', { ...img, action: 'sync' });
    await started.promise;
    try {
      const deleted = await invoke(admin, 'DELETE', img);
      assert.equal(deleted.status, 200);
      assert.deepEqual(deleted.payload.rules.filter((r) => r.kind === 'image').map((r) => r.model), [imgKeeper.model]);
      assert.equal(db.getImageProviderConfig(imgRemoved.id, { includeSecret: false }).pricingConfig.chargeTextTokens, true);
      assert.equal((await invoke(user, 'POST', { providerId: imgRemoved.id }, quote)).payload.error, 'UPSTREAM_MODEL_PRICE_REQUIRED');
    } finally {
      pending.resolve(new Response(JSON.stringify({ success: true, data: [{
        model_name: img.model, quota_type: 0, model_ratio: 1, completion_ratio: 1
      }] })));
    }
    assert.equal((await sync).payload.error, 'MODEL_RULE_NOT_FOUND');
    assert.ok(!(await invoke(admin, 'GET')).payload.rules.some((r) => r.model === img.model));
    assert.equal((await invoke(admin, 'PATCH', { ...modelPrice, action: 'update' })).status, 404);
    assert.equal(isImageModelRuleDeleted(sql, img.model), true);
    const blocked = await invoke(admin, 'DELETE', { kind: 'image', model: imgKeeper.model });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.payload.error, 'LAST_MODEL_RULE_REQUIRED');
    assert.equal((await invoke(admin, 'PATCH', { ...modelPrice, action: 'create' })).status, 200);
    assert.equal(isImageModelRuleDeleted(sql, img.model), false);
    assert.equal((await invoke(user, 'POST', { providerId: imgRemoved.id }, quote)).status, 200);
  });

  await t.test('deletes all service configs of one text model without deleting history or the last distinct model', async () => {
    const conversation = chat.getOrCreateChatConversation(user.id);
    sql.prepare(`INSERT INTO chat_messages (id, conversation_id, user_id, role, content, created_at)
      VALUES ('saved-reply', ?, ?, 'assistant', 'Saved reply', ?)`
    ).run(conversation.id, user.id, new Date().toISOString());
    sql.prepare(`INSERT INTO chat_usage_records (id, client_request_id, user_id, conversation_id, assistant_message_id, provider_id, model, created_at)
      VALUES ('saved-usage', 'saved-request', ?, ?, 'saved-reply', ?, ?, ?)`
    ).run(user.id, conversation.id, textRemoved[0].id, txt.model, new Date().toISOString());
    const deleted = await invoke(admin, 'DELETE', txt);
    assert.equal(deleted.status, 200);
    assert.deepEqual(new Set(deleted.payload.textProviders.map((p) => p.id)), new Set(textKeeper.map((p) => p.id)));
    assert.equal(getModelRule(sql, 'text', txt.model), null);
    for (const provider of textRemoved) {
      assert.equal(sql.prepare("SELECT 1 FROM system_user_group_channels WHERE channel_id = ? AND channel_type = 'chat'").get(provider.id), undefined);
    }
    assert.equal(chat.listChatMessages(user.id).messages[0].content, 'Saved reply');
    assert.equal(sql.prepare("SELECT provider_id FROM chat_usage_records WHERE id = 'saved-usage'").get().provider_id, textRemoved[0].id);
    const last = await invoke(admin, 'DELETE', { kind: 'text', model: textKeeper[0].model });
    assert.equal(last.status, 409);
    assert.equal(last.payload.error, 'LAST_MODEL_RULE_REQUIRED');
    assert.equal((await invoke(admin, 'DELETE', txt)).status, 404);
    const audited = sql.prepare("SELECT entity_id, before_json FROM audit_events WHERE action = 'upstream_rule_deleted' ORDER BY entity_id").all();
    assert.deepEqual(audited.map((row) => row.entity_id), [`image:${img.model}`, `text:${txt.model}`]);
    assert.equal(JSON.parse(audited[1].before_json).providers.length, 2);
    assert.ok(!JSON.stringify(audited).includes(apiKey));
    assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
  });
});
