import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';
import { parseUpstreamModelPrice, estimateMagicPrice } from '../shared/upstream-pricing.js';
import { calculateChatChargeCenti } from '../shared/chat-billing.js';
import { applyImagePromotion, getImageGenerationPricing } from '../shared/image-pricing.js';
import { estimateTextTokens } from '../api/_lib/text-token-estimate.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-upstream-rules-'));
process.env.APP_DB_PATH = path.join(directory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(directory, 'images');
process.env.PROVIDER_CONFIG_SECRET = 'upstream-rules-test-secret';
process.env.CHAT_PROVIDER_API_KEY = 'sk-upstream-test';
process.env.CHAT_PROVIDER_BASE_URL = 'https://provider.example.invalid/v1';
process.env.AI_API_KEY = 'sk-image-upstream-test';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;
const db = await import('../api/_lib/local-db.js');
const chat = await import('../api/_lib/chat-engine.js');
const rules = await import('../api/_lib/upstream-model-rules.js');
const magic = await import('../api/_lib/magic-billing.js');
const { default: adminHandler } = await import('../api/admin/upstream-rules.js');
const { default: pricingHandler } = await import('../api/image-pricing.js');
const { default: modelsHandler } = await import('../api/text-models.js');
const { default: optimizeHandler } = await import('../api/optimize-image-prompt.js');
const { default: generationHandler } = await import('../api/generate-image.js');
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; db.getDb().close(); fs.rmSync(directory, { recursive: true, force: true }); });

function account(name, role = 'user', credits = 500) {
  const user = db.createUser({ email: `${name}@example.test`, password: 'testing-1234', fullName: name, initialCredits: credits });
  db.getDb().prepare('UPDATE users SET role = ?, credit_balance = ? WHERE id = ?').run(role, credits, user.id);
  return { ...user, token: db.createSession(user.id).token };
}
async function invoke(handler, user, body, method = 'POST', query = {}) {
  let status = 200;
  let payload;
  const res = {
    writableEnded: false, once() {}, setHeader() {},
    status(value) { status = value; return this; },
    json(value) { payload = value; this.writableEnded = true; return value; }
  };
  await handler({ method, body, query, once() {}, socket: { remoteAddress: '127.0.0.1' },
    headers: user ? { cookie: `member_session=${encodeURIComponent(user.token)}` } : {} }, res);
  return { status, payload };
}
function textProvider(overrides = {}) {
  return chat.saveChatProviderConfig({ name: 'Text rules test', model: 'gpt-6-luna', baseUrl: 'https://provider.example.invalid/v1',
    apiKey: 'sk-text-test', enabled: true, isDefault: false, magicEnabled: true, assistantEnabled: true,
    pricing: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }, ...overrides });
}
function imageProvider(overrides = {}) {
  const provider = db.saveImageProviderConfig({ name: 'Flare test', model: 'gpt-image-2.5-flare',
    baseUrl: 'https://provider.example.invalid/v1', apiKey: 'sk-image-test', enabled: true, isDefault: false,
    pricingConfig: { strategy: 'fixed-image', fixedPriceRmb: 0.4, referenceImagePriceRmb: 0.12 }, ...overrides });
  db.bindDefaultSystemGroupChannel('image', provider.id);
  return provider;
}

test('upstream parser preserves both context tiers, cache rates, and ratio-based image input prices', () => {
  const text = parseUpstreamModelPrice({
    billing_mode: 'tiered_expr',
    billing_expr: 'len <= 272000 ? tier("base", p * 0.1 + c * 0.5 + cr * 0.01 + cc * 0.125) : tier("large", p * 0.2 + c * 0.75 + cr * 0.02 + cc * 0.25)'
  }, 7);
  assert.ok(Math.abs(text.pricing.input - 0.7) < 1e-10);
  assert.equal(text.pricing.tiers[0].aboveTokens, 272000);
  assert.equal(text.pricing.tiers[0].output, 5.25);
  const image = parseUpstreamModelPrice({ quota_type: 0, model_ratio: 2.5, completion_ratio: 6, cache_ratio: 0.25, image_ratio: 1.6 }, 7);
  assert.deepEqual(image.pricing, { input: 35, output: 210, cacheRead: 8.75, cacheWrite: 35 });
  assert.equal(image.imageInput, 56);
  assert.equal(calculateChatChargeCenti({
    usage: { inputTokens: 280000 }, pricing: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1, tiers: [{ aboveTokens: 272000, input: 2, output: 2, cacheRead: 2, cacheWrite: 2 }] }
  }), 5600);
});

test('unsupported price formats cannot silently become zero or execute expressions', () => {
  for (const row of [{}, { quota_type: 1 }, { quota_type: 0, model_ratio: -1, completion_ratio: 6 },
    { billing_expr: 'process.exit(1)' }, { billing_expr: 'p * 1 + p * 3 + c * 2' }, { quota_type: 3, model_ratio: 1, completion_ratio: 1 }]) {
    assert.throws(() => parseUpstreamModelPrice(row, 7));
  }
});

test('existing text prices migrate; shared model flags and prices update all matching channels', () => {
  const legacy = chat.ensureDefaultChatProviderConfig();
  assert.deepEqual(rules.getModelRule(db.getDb(), 'text', legacy.model).pricing, legacy.pricing);
  const a = textProvider({ model: 'shared-text-model' });
  const b = textProvider({ model: 'shared-text-model', pricing: { input: 2, output: 3, cacheRead: 0.2, cacheWrite: 2 }, magicEnabled: false });
  assert.equal(chat.getChatProviderConfig(a.id, { purpose: 'magic' }), null);
  assert.equal(chat.getChatProviderConfig(b.id, { purpose: 'magic' }), null);
  assert.equal(chat.getChatProviderConfig(a.id).pricing.input, 2);
  assert.ok(chat.getChatProviderConfig(a.id).apiKey);
});

test('model list and execution both enforce purpose checkboxes and reject unknown IDs', async () => {
  const user = account('purpose');
  const magicOnly = textProvider({ model: 'magic-only', assistantEnabled: false });
  const assistantOnly = textProvider({ model: 'assistant-only', magicEnabled: false });
  const list = await invoke(modelsHandler, user, null, 'GET', { purpose: 'magic' });
  assert.deepEqual(list.payload.providers.map((p) => p.id), [magicOnly.id]);
  assert.ok(!list.payload.providers.some((p) => p.id === assistantOnly.id));
  assert.ok(!JSON.stringify(list.payload).includes('apiKey'));
  for (const text of ['A bottle', 'A bottle '.repeat(10000)]) {
    const quote = await invoke(modelsHandler, user, { providerId: magicOnly.id, text, mode: 'optimizer' });
    assert.equal(quote.status, 200);
    assert.equal(quote.payload.quote.fixedPrice, true);
    assert.equal(quote.payload.quote.estimatedCredits, 1);
  }
  const ecommerceQuote = await invoke(modelsHandler, user, { providerId: magicOnly.id, text: 'A bottle', mode: 'ecommerce' });
  assert.equal(ecommerceQuote.status, 200);
  assert.equal(ecommerceQuote.payload.quote.fixedPrice, undefined);
  const ignoredSelection = await invoke(modelsHandler, user, { providerId: assistantOnly.id, text: 'A bottle', mode: 'optimizer' });
  assert.equal(ignoredSelection.payload.quote.providerId, magicOnly.id);
  assert.equal(chat.getChatProviderConfig(magicOnly.id, { userId: user.id }), null);
  assert.equal(chat.getChatProviderConfig('missing-id', { userId: user.id, purpose: 'magic' }), null);
  const before = db.getUserProfile(user.id).creditBalance;
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).model, magicOnly.model);
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'A refined bottle prompt' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 }
    }), { status: 200 });
  };
  try {
    const result = await invoke(optimizeHandler, user, { providerId: assistantOnly.id, prompt: 'A bottle' });
    assert.equal(result.status, 200, JSON.stringify(result.payload));
    assert.equal(result.payload.chargedCredits, 1);
    assert.equal(db.getUserProfile(user.id).creditBalance, before - 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('selecting Magic model replaces the previous choice without changing Assistant eligibility', async () => {
  const admin = account('magic-select-admin', 'super_admin');
  const user = account('magic-select-user');
  const first = textProvider({ model: 'magic-primary', isDefault: true });
  const second = textProvider({ model: 'magic-secondary', magicEnabled: false, isDefault: false });
  assert.deepEqual((await invoke(modelsHandler, user, null, 'GET', { purpose: 'magic' })).payload.providers.map((p) => p.id), [first.id]);
  const updated = await invoke(adminHandler, admin, {
    kind: 'text', model: second.model, provider: { ...second, magicEnabled: true }
  }, 'PATCH');
  assert.equal(updated.status, 200, JSON.stringify(updated.payload));
  assert.deepEqual(updated.payload.textProviders.filter((p) => p.magicEnabled).map((p) => p.id), [second.id]);
  assert.equal(rules.getModelRule(db.getDb(), 'text', first.model).magicEnabled, false);
  assert.equal(rules.getModelRule(db.getDb(), 'text', second.model).magicEnabled, true);
  assert.equal(chat.getChatProviderConfig('', { purpose: 'magic' }).id, second.id);
  assert.deepEqual((await invoke(modelsHandler, user, null, 'GET', { purpose: 'magic' })).payload.providers.map((p) => p.id), [second.id]);
  assert.ok((await invoke(modelsHandler, user, null, 'GET')).payload.providers.some((p) => p.id === first.id));
  const third = textProvider({ model: 'magic-third', magicEnabled: false, isDefault: false });
  assert.equal(chat.getChatProviderConfig('', { purpose: 'magic' }).id, second.id);
  assert.equal(rules.getModelRule(db.getDb(), 'text', third.model).magicEnabled, false);
});

test('legacy multiple Magic selections collapse to the enabled former default', () => {
  const first = textProvider({ model: 'legacy-magic-first', magicEnabled: false, isDefault: false });
  const chosen = textProvider({ model: 'legacy-magic-default', magicEnabled: true, isDefault: true });
  db.getDb().prepare('UPDATE chat_provider_configs SET magic_enabled=1 WHERE id=?').run(first.id);
  const rule = rules.getModelRule(db.getDb(), 'text', first.model);
  db.getDb().prepare("UPDATE upstream_model_rules SET config_json=? WHERE kind='text' AND model=?")
    .run(JSON.stringify({ ...rule, magicEnabled: true }), first.model);
  const list = chat.listChatProviderConfigs({ purpose: 'magic' });
  assert.deepEqual(list.map((provider) => provider.id), [chosen.id]);
  assert.equal(rules.getModelRule(db.getDb(), 'text', first.model).magicEnabled, false);
  assert.equal(chat.getChatProviderConfig('', { purpose: 'magic' }).id, chosen.id);
});

test('upstream admin is permissioned, sync uses exact model names, and failed sync preserves prior rules', async () => {
  const admin = account('upstream-admin', 'super_admin');
  const user = account('not-admin');
  assert.equal((await invoke(adminHandler, user, null, 'GET')).status, 403);
  const provider = imageProvider();
  let exact = false;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).endsWith('/api/status')
    ? { data: { usd_exchange_rate: 7 } } : { success: true, pricing_version: 'v-test', data: [{
      model_name: exact ? 'gpt-image-2.5-flare' : 'gpt-image-2.5', quota_type: 0, model_ratio: 2.5, completion_ratio: 6, cache_ratio: 0.25
    }] }), { status: 200 });
  try {
    await invoke(adminHandler, admin, null, 'GET');
    const before = rules.getModelRule(db.getDb(), 'image', provider.model);
    let response = await invoke(adminHandler, admin, { action: 'sync', kind: 'image', model: provider.model, providerId: provider.id });
    assert.equal(response.payload.error, 'MODEL_PRICE_NOT_FOUND');
    assert.deepEqual(rules.getModelRule(db.getDb(), 'image', provider.model), before);
    exact = true;
    response = await invoke(adminHandler, admin, { action: 'sync', kind: 'image', model: provider.model, providerId: provider.id });
    assert.equal(response.status, 200);
    const synced = rules.getModelRule(db.getDb(), 'image', provider.model);
    assert.equal(synced.model, 'gpt-image-2.5-flare');
    assert.equal(synced.imageTextInputRmb, 35);
    assert.equal(synced.pricing.output, 210);
    assert.equal(synced.includeImageText, undefined);
    assert.equal(synced.upstreamBaseUrl, 'https://provider.example.invalid');
    assert.ok(!JSON.stringify(response.payload).includes('sk-image-test'));
    const audited = db.getDb().prepare("SELECT actor_name_snapshot FROM audit_events WHERE action = 'upstream_rule_synced' ORDER BY created_at DESC LIMIT 1").get();
    assert.equal(audited.actor_name_snapshot, 'upstream-admin');
  } finally { globalThis.fetch = originalFetch; }
});

test('downstream text reservation is optional, fractional, model-specific, and excluded from promotion', () => {
  const provider = imageProvider({ model: 'optional-fee-image' });
  const options = { size: '1024x1024', quality: 'low', model: provider.model, prompt: '包'.repeat(3000), referenceCount: 2 };
  const baseline = getImageGenerationPricing(options, provider.pricingConfig);
  const upstream = { kind: 'image', model: provider.model, imagePricingConfig: provider.pricingConfig, imageTextInputRmb: 35, includeImageText: false };
  rules.saveModelRule(db.getDb(), upstream);
  let config = db.getImageProviderConfig(provider.id, { includeSecret: false }).pricingConfig;
  assert.equal(getImageGenerationPricing(options, config).credits, baseline.credits);
  rules.saveModelRule(db.getDb(), { ...upstream, includeImageText: true });
  db.saveImageProviderConfig({ ...provider, pricingConfig: { ...provider.pricingConfig, chargeTextTokens: true } });
  config = db.getImageProviderConfig(provider.id, { includeSecret: false }).pricingConfig;
  const estimatedOptions = { ...options, estimatedTextTokens: estimateTextTokens(options.prompt) };
  const pricing = getImageGenerationPricing(estimatedOptions, config);
  assert.equal(pricing.imageTextTokens, 2250);
  assert.equal(pricing.imageTextCredits, 7.88);
  assert.equal(pricing.credits, 71.88);
  assert.equal(applyImagePromotion(pricing, { enabled: true, payPercent: 50 }).credits, 39.88);
  assert.equal(getImageGenerationPricing({ ...options, prompt: '' }, config).imageTextCredits, 0);
  textProvider({ model: 'totally-independent', pricing: { input: 999, output: 999, cacheRead: 999, cacheWrite: 999 } });
  assert.equal(getImageGenerationPricing(estimatedOptions, config).credits, 71.88);
});

test('image final debit settles reported prompt tokens within the server reservation; failures refund', async () => {
  const user = account('image-fee-billing');
  const provider = imageProvider({ model: 'gpt-image-2.5-flare' });
  rules.saveModelRule(db.getDb(), { kind: 'image', model: provider.model, imagePricingConfig: provider.pricingConfig, includeImageText: true, imageTextInputRmb: 35 });
  db.saveImageProviderConfig({ ...provider, pricingConfig: { ...provider.pricingConfig, chargeTextTokens: true } });
  const body = { providerId: provider.id, prompt: '包'.repeat(300), size: '1024x1024', quality: 'low' };
  const quote = await invoke(pricingHandler, user, body);
  assert.equal(quote.status, 200);
  const price = quote.payload.quotes[0].pricing;
  assert.equal(price.credits, 40.79);
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#008866' } }).png().toBuffer();
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: bytes.toString('base64') }],
    usage: { input_tokens_details: { text_tokens: 300, image_tokens: 0 } } }), { status: 200 });
  try {
    const result = await invoke(generationHandler, user, body);
    assert.equal(result.status, 200, JSON.stringify(result.payload));
    assert.equal(result.payload.creditsCharged, 40.79);
    assert.equal(result.payload.pricing.quotedCredits, price.credits);
    assert.equal(db.getUserProfile(user.id).creditBalance, 459.21);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'invalid_api_key' } }), { status: 401 });
    await invoke(generationHandler, user, body);
    assert.equal(db.getUserProfile(user.id).creditBalance, 459.21);
  } finally { globalThis.fetch = originalFetch; }
});

test('image magic costs exactly one credit even for expensive model usage; ecommerce magic still bills usage', () => {
  const user = account('magic-billing', 'user', 20);
  const provider = textProvider({ model: 'magic-billing', maxOutputTokens: 4096 });
  assert.ok(estimateMagicPrice(provider, { text: 'a', estimatedTextTokens: estimateTextTokens('a') }).estimatedCredits >= 1);
  let reservation = magic.reserveMagicCredit(user.id, provider, { text: 'a', outputTokens: 256 });
  assert.equal(reservation.quote.estimatedCredits, 1);
  assert.equal(reservation.quote.capacityCenti, 100);
  let result = magic.completeMagicCredit(reservation, { inputTokens: 10, outputTokens: 5 });
  assert.equal(result.chargedCredits, 1);
  assert.equal(result.user.creditBalance, 19);
  assert.equal(magic.completeMagicCredit(reservation, { inputTokens: 10, outputTokens: 5 }).user.creditBalance, 19);
  reservation = magic.reserveMagicCredit(user.id, provider, { text: 'longer', outputTokens: 512 });
  result = magic.completeMagicCredit(reservation, { inputTokens: 1000, outputTokens: 2000 });
  assert.equal(result.chargedCredits, 1);
  assert.equal(result.user.creditBalance, 18);
  reservation = magic.reserveMagicCredit(user.id, provider, { text: 'brief', outputTokens: 512, source: 'ai_magic_brief' });
  result = magic.completeMagicCredit(reservation, { inputTokens: 1000, outputTokens: 2000 });
  assert.equal(result.chargedCredits, 1.1);
  assert.equal(result.user.creditBalance, 16.9);
  reservation = magic.reserveMagicCredit(user.id, provider, { text: 'failure', outputTokens: 128 });
  magic.cancelMagicCredit(reservation, 'TEST_FAILED');
  magic.cancelMagicCredit(reservation, 'TEST_FAILED');
  assert.equal(db.getUserProfile(user.id).creditBalance, 16.9);
});

test('magic rejects insufficient balance before reserving and cannot settle more than its reservation', () => {
  const user = account('low-magic-balance', 'user', 0.99);
  const provider = textProvider({ model: 'low-balance-model' });
  assert.throws(() => magic.reserveMagicCredit(user.id, provider, { text: 'a' }), /CREDITS_REQUIRED/);
  assert.equal(db.getUserProfile(user.id).creditBalance, 0.99);
  const solvent = account('bounded-magic');
  const reservation = magic.reserveMagicCredit(solvent.id, provider, { text: 'a', outputTokens: 256, source: 'ai_magic_brief' });
  assert.throws(() => magic.completeMagicCredit(reservation, { inputTokens: 10000000, outputTokens: 10000000 }), /RESERVATION_AMOUNT_EXCEEDED/);
  magic.cancelMagicCredit(reservation, 'RESERVATION_AMOUNT_EXCEEDED');
  assert.equal(db.getUserProfile(solvent.id).creditBalance, 500);
});

test('upstream fixed-quality cost retains sub-cent precision without changing selling prices', () => {
  const provider = imageProvider({ model: 'precision-image' });
  rules.saveModelRule(db.getDb(), {
    kind: 'image', model: provider.model, includeImageText: false,
    imagePricingConfig: { strategy: 'fixed-quality', qualityPricesRmb: { low: 0.002137, medium: 0.005231, high: 0.009789 }, actualCostRatio: 1 }
  });
  const config = db.getImageProviderConfig(provider.id, { includeSecret: false }).pricingConfig;
  const price = getImageGenerationPricing({ model: provider.model, quality: 'low' }, config);
  assert.equal(price.estimatedActualCostRmb, 0.002137);
  assert.equal(price.credits, 40);
  assert.throws(() => rules.saveModelRule(db.getDb(), {
    kind: 'image', model: provider.model, imagePricingConfig: { strategy: 'fixed-image', fixedPriceRmb: -1 }
  }), /INVALID_MODEL_PRICE/);
});

test('ecommerce quote reproduces the assembled prompt and final debit for generation and refinement', async () => {
  const storage = await import('../api/_lib/storage.js');
  const { default: generateSlot } = await import('../api/ecommerce/generate-slot.js');
  const user = account('ecommerce-text-fee', 'user', 1000);
  const provider = imageProvider();
  rules.saveModelRule(db.getDb(), { kind: 'image', model: provider.model,
    imagePricingConfig: provider.pricingConfig, includeImageText: true, imageTextInputRmb: 35 });
  db.saveImageProviderConfig({ ...provider, pricingConfig: { ...provider.pricingConfig, chargeTextTokens: true } });
  const project = db.createEcommerceProject(user.id, {
    projectName: 'Quote parity', platformId: 'taobao-tmall', industryId: 'general', productName: 'Bottle',
    brandName: 'Pic365', coreUser: '', coreScenario: '', sellingPoints: [], specifications: '',
    prohibitedContent: '', aiBriefOriginals: {}, identitySpec: {}, templateId: '', visualStyleId: 'clean-commercial',
    imageProviderId: provider.id, selectedSlots: ['main-square']
  });
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#999999' } }).png().toBuffer();
  const image = `data:image/png;base64,${bytes.toString('base64')}`;
  const assetId = crypto.randomUUID();
  const stored = await storage.persistProjectAsset({ userId: user.id, projectId: project.id, assetId, image });
  db.createEcommerceProjectAsset(user.id, {
    id: assetId, projectId: project.id, assetType: 'product', fileName: 'bottle.png', mimeType: stored.contentType,
    fileSize: stored.byteLength, storagePath: stored.storagePath, purpose: 'master', sortOrder: 1
  });
  db.setEcommerceProjectMasterAsset(user.id, project.id, assetId);
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: bytes.toString('base64') }],
    usage: { input_tokens_details: { text_tokens: 200, image_tokens: 500 } } }), { status: 200 });
  try {
    let baseGenerationId = '';
    for (const adjustment of ['', 'Only brighten the background.']) {
      const request = { projectId: project.id, slotId: 'main-square', providerId: provider.id, size: '1024x1024',
        quality: 'low', referenceCount: baseGenerationId ? 2 : 1, baseGenerationId, adjustment };
      const quoted = await invoke(pricingHandler, user, request);
      assert.equal(quoted.status, 200);
      const quote = quoted.payload.quotes[0].pricing;
      assert.ok(quote.imageTextTokens > 100);
      const generated = await invoke(generateSlot, user, request);
      assert.equal(generated.status, 200, JSON.stringify(generated.payload));
      assert.ok(generated.payload.creditsCharged <= quote.credits);
      assert.equal(generated.payload.pricing.quotedCredits, quote.credits);
      assert.equal(generated.payload.pricing.imageTextTokens, 200);
      assert.equal(generated.payload.pricing.imageTextCredits, 0.7);
      baseGenerationId = generated.payload.generation.id;
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('admin stores 0.015 yuan reference prices and actual generation charges 1.5 credits per reference', async () => {
  const { default: providerHandler } = await import('../api/admin/image-providers.js');
  const admin = account('three-decimal-admin', 'super_admin');
  const user = account('three-decimal-billing');
  let provider = imageProvider({ model: 'gpt-image-2.5-sunburst' });
  const updated = await invoke(providerHandler, admin, {
    ...provider, pricingConfig: { strategy: 'fixed-image', fixedPriceRmb: 0.201, referenceImagePriceRmb: 0.015 }
  }, 'PATCH');
  assert.equal(updated.status, 200);
  provider = db.getImageProviderConfig(provider.id, { includeSecret: false });
  assert.equal(provider.pricingConfig.referenceImagePriceRmb, 0.015);
  assert.equal(provider.pricingConfig.fixedPriceRmb, 0.201);
  const quoted = await invoke(pricingHandler, user, { providerId: provider.id, referenceCount: 3 });
  assert.equal(quoted.payload.quotes[0].pricing.referenceCredits, 4.5);
  assert.equal(quoted.payload.quotes[0].pricing.credits, 24.6);
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#808080' } }).png().toBuffer();
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: bytes.toString('base64') }] }), { status: 200 });
  try {
    const generated = await invoke(generationHandler, user, {
      providerId: provider.id, prompt: 'a product', size: '1024x1024', quality: 'low',
      references: [{ imageDataUrl: `data:image/png;base64,${bytes.toString('base64')}` }]
    });
    assert.equal(generated.status, 200);
    assert.equal(generated.payload.creditsCharged, 21.6);
    assert.equal(db.getUserProfile(user.id).creditBalance, 478.4);
  } finally { globalThis.fetch = originalFetch; }
});
