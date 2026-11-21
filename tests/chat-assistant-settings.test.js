import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { calculateChatChargeCenti } from '../shared/chat-billing.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-assistant-settings-'));
Object.assign(process.env, {
  APP_DB_PATH: path.join(directory, 'app.sqlite'), LOCAL_STORAGE_ROOT: path.join(directory, 'images'),
  PROVIDER_CONFIG_SECRET: 'assistant-settings-test-secret', CHAT_PROVIDER_API_KEY: 'test-only-chat-key',
  CHAT_PROVIDER_BASE_URL: 'https://no-network.example.invalid', AI_API_KEY: 'test-only-image-key',
  AI_BASE_URL: 'https://no-network.example.invalid', AZURE_STORAGE_CONNECTION_STRING: ''
});
const db = await import('../api/_lib/local-db.js');
const engine = await import('../api/_lib/chat-engine.js');
const service = await import('../api/_lib/chat-assistant-settings.js');
const rules = await import('../api/_lib/upstream-model-rules.js');
const { default: adminHandler } = await import('../api/admin/chat-settings.js');
const { default: userHandler } = await import('../api/chat-settings.js');
const { default: chatHandler } = await import('../api/chat.js');
const { default: modelsHandler } = await import('../api/text-models.js');
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  db.getDb().close();
  fs.rmSync(directory, { recursive: true, force: true });
});
let counter = 0;
function account(role = 'user') {
  const user = db.createUser({ email: `assistant-${++counter}@example.test`, password: 'test-only-password', fullName: `测试用户${counter}`, initialCredits: 500 });
  db.getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  return { ...user, token: db.createSession(user.id).token };
}
async function invoke(handler, user, method = 'GET', body = {}, query = {}) {
  let status, payload;
  await handler({
    method, body, query, once() {}, socket: { remoteAddress: '127.0.0.1' },
    headers: user ? { cookie: `member_session=${encodeURIComponent(user.token)}` } : {}
  }, { once() {}, setHeader() {}, status(value) { status = value; return this; }, json(value) { payload = value; return value; } });
  return { status, payload };
}
const admin = account('super_admin');
const first = engine.saveChatProviderConfig({
  name: '默认文本模型', model: 'assistant-a', systemPrompt: '旧版自定义精灵提示词',
  baseUrl: 'https://no-network.example.invalid', apiKey: 'test-only-key', isDefault: true,
  pricing: { input: 1, output: 4, cacheRead: 0.1, cacheWrite: 1 }
});
const second = engine.saveChatProviderConfig({
  name: '可选文本模型', model: 'assistant-b', systemPrompt: '不应发送的旧提示词',
  baseUrl: 'https://no-network.example.invalid', apiKey: 'test-only-key', isDefault: false,
  pricing: { input: 2, output: 8, cacheRead: 0.2, cacheWrite: 2 }
});
const magic = engine.saveChatProviderConfig({
  name: '仅魔笔', model: 'magic-only', baseUrl: 'https://no-network.example.invalid', apiKey: 'test-only-key',
  isDefault: false, assistantEnabled: false
});
function configure(overrides = {}) {
  for (const provider of [first, second]) db.getDb().prepare('UPDATE chat_provider_configs SET enabled = 1 WHERE id = ?').run(provider.id);
  return service.saveAdminChatSettings(admin.id, {
    systemPrompt: '统一精灵系统提示词', allowedModels: [first.model, second.model], defaultProviderId: first.id, ...overrides
  });
}

test('legacy prompt/default migrate without disclosing keys or rates to assistant settings', () => {
  const settings = service.getAdminChatSettings();
  assert.equal(settings.systemPrompt, '旧版自定义精灵提示词');
  assert.equal(settings.defaultProviderId, first.id);
  assert.ok(!JSON.stringify(settings).includes('test-only-key'));
  assert.ok(!Object.hasOwn(settings.providers[0], 'pricing'));
  assert.ok(!Object.hasOwn(service.getUserChatSettings(admin.id), 'systemPrompt'));
  assert.ok(service.getUserChatSettings(admin.id).providers.every((provider) => !Object.hasOwn(provider, 'model')));
});

test('admin and user settings enforce authentication, permissions, validation and audited saves', async () => {
  const user = account();
  const operations = account('operations');
  assert.equal((await invoke(adminHandler, null)).status, 401);
  assert.equal((await invoke(userHandler, null)).status, 401);
  assert.equal((await invoke(adminHandler, user)).status, 403);
  assert.equal((await invoke(adminHandler, operations, 'PATCH')).status, 403);
  const settings = configure();
  const invalid = await invoke(adminHandler, admin, 'PATCH', { ...settings, systemPrompt: '' });
  assert.equal(invalid.payload.error, 'INVALID_CHAT_SYSTEM_PROMPT');
  assert.equal(service.getAdminChatSettings().systemPrompt, settings.systemPrompt);
  assert.equal((await invoke(adminHandler, admin, 'PATCH', { ...settings, allowedModels: ['missing'] })).status, 400);
  assert.equal((await invoke(adminHandler, admin, 'PATCH', { ...settings, defaultProviderId: magic.id })).status, 400);
  const saved = await invoke(adminHandler, admin, 'PATCH', { ...settings, systemPrompt: '管理员统一设定' });
  assert.equal(saved.status, 200);
  const audit = db.getDb().prepare("SELECT actor_user_id, actor_name_snapshot FROM audit_events WHERE action='chat_assistant_settings_updated' ORDER BY created_at DESC LIMIT 1").get();
  assert.equal(audit.actor_user_id, admin.id);
  assert.ok(audit.actor_name_snapshot);
  assert.equal((await invoke(adminHandler, admin, 'PATCH', settings)).payload.error, 'CHAT_SETTINGS_CHANGED');
});

test('account preferences persist independently and preserve other interface preferences', async () => {
  configure();
  const alice = account(), bob = account();
  db.getDb().prepare("INSERT INTO user_ui_preferences (user_id, hide_api, updated_at) VALUES (?,1,?)").run(alice.id, new Date().toISOString());
  const saved = await invoke(userHandler, alice, 'PATCH', { providerId: second.id, userId: bob.id });
  assert.equal(saved.status, 200);
  assert.equal(saved.payload.settings.effectiveProviderId, second.id);
  assert.equal(service.getUserChatSettings(bob.id).effectiveProviderId, first.id);
  assert.equal(db.getDb().prepare('SELECT hide_api FROM user_ui_preferences WHERE user_id=?').get(alice.id).hide_api, 1);
  const newSession = { ...alice, token: db.createSession(alice.id).token };
  assert.equal((await invoke(userHandler, newSession)).payload.settings.preferredProviderId, second.id);
  assert.equal((await invoke(userHandler, alice, 'PATCH', { providerId: '' })).payload.settings.followsDefault, true);
  assert.equal((await invoke(userHandler, alice, 'PATCH', { providerId: magic.id })).status, 403);
  assert.equal((await invoke(userHandler, alice, 'PATCH', { providerId: 42 })).status, 403);
});

test('global default changes affect followers but preserve valid personal selections and magic defaults', () => {
  configure();
  const follower = account(), chooser = account();
  service.saveUserChatSettings(chooser.id, { providerId: first.id });
  configure({ defaultProviderId: second.id });
  assert.equal(service.resolveChatAssistantProvider(follower.id).id, second.id);
  assert.equal(service.resolveChatAssistantProvider(chooser.id).id, first.id);
  assert.equal(engine.getChatProviderConfig('', { purpose: 'magic' }).id, first.id);
  assert.equal(service.resolveChatAssistantProvider(follower.id).systemPrompt, '统一精灵系统提示词');
});

test('assistant range and upstream checkboxes share one rule, preserving magic flags and prices', () => {
  configure();
  const before = rules.getModelRule(db.getDb(), 'text', second.model);
  configure({ allowedModels: [first.model] });
  const afterRule = rules.getModelRule(db.getDb(), 'text', second.model);
  assert.equal(afterRule.assistantEnabled, false);
  assert.deepEqual(afterRule.pricing, before.pricing);
  assert.equal(afterRule.magicEnabled, before.magicEnabled);
  assert.equal(engine.getChatProviderConfig(second.id, { purpose: 'magic' }), null);
  assert.ok(engine.getChatProviderConfig(first.id, { purpose: 'magic' }));
  rules.saveModelRule(db.getDb(), { kind: 'text', model: second.model, assistantEnabled: true });
  assert.ok(service.getAdminChatSettings().allowedModels.includes(second.model));
  assert.ok(service.getUserChatSettings(admin.id).providers.some((p) => p.id === second.id));
});

test('revoked or disabled personal models fall back; explicit unauthorized requests never reach billing/upstream', async () => {
  configure();
  const user = account();
  service.saveUserChatSettings(user.id, { providerId: second.id });
  configure({ allowedModels: [first.model] });
  assert.equal(service.getUserChatSettings(user.id).effectiveProviderId, first.id);
  assert.equal(service.getUserChatSettings(user.id).unavailablePreference, true);
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Must not contact upstream'); };
  const balance = db.getUserProfile(user.id).creditBalance;
  const result = await invoke(chatHandler, user, 'POST', { text: '你好', clientRequestId: 'forbidden-model', providerId: second.id });
  assert.equal(result.status, 403);
  assert.equal(result.payload.error, 'CHAT_MODEL_NOT_AVAILABLE');
  assert.equal(calls, 0);
  assert.equal(db.getUserProfile(user.id).creditBalance, balance);
  configure();
  db.getDb().prepare('UPDATE chat_provider_configs SET enabled=0 WHERE id=?').run(second.id);
  assert.equal(service.resolveChatAssistantProvider(user.id).id, first.id);
});

test('group restrictions narrow both the model picker and default fallback', async () => {
  configure();
  const user = account();
  const group = db.saveSystemUserGroup({ name: '精灵受限测试组', channels: { chat: [second.id] } });
  db.setUserSystemGroup(user.id, group.id);
  const settings = service.getUserChatSettings(user.id);
  assert.deepEqual(settings.providers.map((p) => p.id), [second.id]);
  assert.equal(settings.defaultProviderId, second.id);
  assert.equal(service.resolveChatAssistantProvider(user.id).id, second.id);
  assert.equal((await invoke(userHandler, user, 'PATCH', { providerId: first.id })).status, 403);
  assert.throws(() => service.resolveChatAssistantProvider(user.id, first.id), /CHAT_MODEL_NOT_AVAILABLE/);
});

test('no available models yields a clear unavailable state and no billable request', async () => {
  configure({ allowedModels: [], defaultProviderId: '' });
  const user = account();
  assert.equal(service.getUserChatSettings(user.id).effectiveProviderId, '');
  assert.deepEqual((await invoke(modelsHandler, user, 'GET')).payload.providers, []);
  assert.ok((await invoke(modelsHandler, user, 'GET', {}, { purpose: 'magic' })).payload.providers.length);
  const response = await invoke(chatHandler, user, 'POST', { text: '你好', clientRequestId: 'no-model' });
  assert.equal(response.status, 503);
  assert.equal(db.getUserProfile(user.id).creditBalance, 500);
});

test('chat uses saved user model and global prompt, bills that model once, and keeps history when switching', async () => {
  configure();
  const user = account();
  service.saveUserChatSettings(user.id, { providerId: second.id });
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({
      model: second.model, choices: [{ message: { content: '测试精灵回复' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
    }), { status: 200 });
  };
  const body = { text: '你好', clientRequestId: 'settings-chat-once' };
  const response = await invoke(chatHandler, user, 'POST', body);
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(requests[0].model, second.model);
  assert.equal(requests[0].messages[0].content, '统一精灵系统提示词');
  const expectedCenti = calculateChatChargeCenti({ usage: { inputTokens: 100, outputTokens: 50 }, pricing: second.pricing });
  assert.equal(response.payload.message.chargedCredits, expectedCenti / 100);
  assert.equal(db.getUserProfile(user.id).creditBalance, 500 - expectedCenti / 100);
  await invoke(chatHandler, user, 'POST', body);
  assert.equal(requests.length, 1);
  service.saveUserChatSettings(user.id, { providerId: '' });
  const history = await invoke(chatHandler, user);
  assert.equal(history.payload.messages.length, 2);
  assert.equal(history.payload.provider.id, first.id);
  assert.ok(!JSON.stringify(history.payload).includes('统一精灵系统提示词'));
  assert.ok(!JSON.stringify(history.payload).includes('test-only-key'));
});
