import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';
import { imageInputFees, normalizeImageInputUsage, settleImageInputPricing } from '../shared/image-input-billing.js';
import { getImageGenerationPricing, applyImagePromotion, imageTokenBillingFlagsMatch } from '../shared/image-pricing.js';
import { estimateTextTokens } from '../api/_lib/text-token-estimate.js';
import { LAYOUT_TEMPLATES, buildEcommerceLayoutPrompt, buildLayoutReferenceInputs, layoutReferenceCount, layoutSlots } from '../shared/ecommerce-layout-studio.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-image-input-billing-'));
Object.assign(process.env, {
  APP_DB_PATH: path.join(directory, 'app.sqlite'), LOCAL_STORAGE_ROOT: path.join(directory, 'images'),
  PROVIDER_CONFIG_SECRET: 'image-input-test-secret', AI_API_KEY: 'image-test-only',
  AI_BASE_URL: 'https://retail-channel.example.invalid', AZURE_STORAGE_CONNECTION_STRING: ''
});
const db = await import('../api/_lib/local-db.js');
const rules = await import('../api/_lib/upstream-model-rules.js');
const billing = await import('../api/_lib/image-input-billing.js');
const { default: adminHandler } = await import('../api/admin/upstream-rules.js');
const { default: providerHandler } = await import('../api/admin/image-providers.js');
const { default: imageHandler } = await import('../api/generate-image.js');
const { default: pricingHandler } = await import('../api/image-pricing.js');
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; db.getDb().close(); fs.rmSync(directory, { recursive: true, force: true }); });
let index = 0;
function user(role = 'user', balance = 500) {
  const result = db.createUser({ email: `input-${++index}@example.test`, password: 'test-only-password', fullName: `Image user ${index}`, initialCredits: balance });
  db.getDb().prepare('UPDATE users SET role=? WHERE id=?').run(role, result.id);
  return { ...result, token: db.createSession(result.id).token };
}
async function invoke(handler, actor, body = {}, method = 'POST') {
  let status, payload;
  await handler({ method, body, query: {}, once() {}, socket: { remoteAddress: '127.0.0.1' },
    headers: actor ? { cookie: `member_session=${encodeURIComponent(actor.token)}` } : {} },
  { once() {}, setHeader() {}, status(value) { status = value; return this; }, json(value) { payload = value; return value; } });
  return { status, payload };
}
function upstream(model, overrides = {}) {
  return rules.saveModelRule(db.getDb(), {
    kind: 'image', model, upstreamBaseUrl: 'https://upstream-cost.example.invalid', pricingSchemaVersion: 2, unit: 'tokens',
    pricing: { input: 35, output: 210, cacheRead: 0, cacheWrite: 0 }, imageTextInputRmb: 35, imageInput: 56,
    referenceTokenBudget: 4096, ...overrides
  });
}
function provider(model = 'gpt-image-2', overrides = {}) {
  const result = db.saveImageProviderConfig({
    name: `Retail ${++index}`, model, baseUrl: 'https://retail-channel.example.invalid', apiKey: 'test-only',
    isDefault: false, pricingConfig: { strategy: 'fixed-image', fixedPriceRmb: 0.4, referenceImagePriceRmb: 0.015, ...overrides }
  });
  db.bindDefaultSystemGroupChannel('image', result.id);
  return result;
}
const admin = user('super_admin');

test('legacy commerce requests still bill their compressed template at every selected quality', async () => {
  const p = provider('gpt-image-2', { chargeReferenceTokens: true });
  upstream(p.model);
  const products = await Promise.all(['#223344', '#334455', '#445566'].map((background) =>
    sharp({ create: { width: 1024, height: 1536, channels: 3, background } }).png().toBuffer()));
  const template = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#bbcccc' } }).jpeg({ quality: 72 }).toBuffer();
  const output = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#abcdef' } }).png().toBuffer();
  let productCount = 1;
  const received = [];
  globalThis.fetch = async (url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.images.length, layoutReferenceCount(productCount));
    const actualTemplate = Buffer.from(request.images.at(-1).image_url.split(',')[1], 'base64');
    for (let i = 0; i < productCount; i++) assert.equal(request.images[i].image_url, `data:image/png;base64,${products[i].toString('base64')}`);
    const metadata = await sharp(actualTemplate).metadata();
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 512);
    assert.equal(metadata.format, 'jpeg');
    received.push(request.quality);
    return new Response(JSON.stringify({
      data: [{ b64_json: output.toString('base64') }],
      usage: { input_tokens: 760, output_tokens: 100, input_tokens_details: { text_tokens: 60, image_tokens: 700 } }
    }));
  };
  const actor = user();
  try {
    for (productCount = 1; productCount <= 3; productCount++) {
      const references = buildLayoutReferenceInputs(
        products.slice(0, productCount).map((product) => ({ imageDataUrl: `data:image/png;base64,${product.toString('base64')}` })),
        `data:image/jpeg;base64,${template.toString('base64')}`, 'compressed-layout'
      );
      for (const quality of ['low', 'medium', 'high']) {
      const body = { providerId: p.id, prompt: 'Product identity first, layout composition second.', size: '1024x1024', quality };
      const quote = await invoke(pricingHandler, actor, { ...body, referenceCount: references.length });
      assert.equal(quote.status, 200);
      assert.equal(quote.payload.quotes[0].pricing.referenceCount, productCount + 1);
      assert.equal(quote.payload.quotes[0].pricing.referenceTokens, 4096 * (productCount + 1));
      const result = await invoke(imageHandler, actor, {
        ...body, references, batchId: 'layout-billing', layoutProductReferenceCount: productCount
      });
      assert.equal(result.status, 200);
      assert.equal(result.payload.pricing.referenceCount, productCount + 1);
      assert.equal(result.payload.pricing.referenceTokens, 700);
      assert.equal(result.payload.pricing.referenceTokenCredits, 3.92);
      assert.equal(result.payload.creditsCharged, 43.92);
      }
    }
    assert.deepEqual(received, Array(3).fill(['low', 'medium', 'high']).flat());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('prompt-only first layout bills the product photo without uploading a composition sample', async () => {
  const p = provider('gpt-image-2', { chargeTextTokens: true, chargeReferenceTokens: true });
  upstream(p.model);
  const product = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#232323' } }).jpeg().toBuffer();
  const output = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#acbedf' } }).png().toBuffer();
  const prompt = buildEcommerceLayoutPrompt({
    slot: layoutSlots(['single-frame'])[0], productName: '户外手电筒',
    sellingPoints: '便于握持', productReferenceCount: 1
  });
  let modelCalls = 0;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.images.length, 1);
    assert.equal(request.images[0].image_url, `data:image/jpeg;base64,${product.toString('base64')}`);
    assert.equal(request.quality, 'low');
    modelCalls++;
    return new Response(JSON.stringify({
      data: [{ b64_json: output.toString('base64') }],
      usage: { input_tokens: 760, output_tokens: 100, input_tokens_details: { text_tokens: 260, image_tokens: 500 } }
    }));
  };
  const actor = user();
  try {
    const quoteInput = { providerId: p.id, prompt, size: '1024x1024', quality: 'low' };
    const before = await invoke(pricingHandler, actor, { ...quoteInput, referenceCount: 2 });
    const after = await invoke(pricingHandler, actor, { ...quoteInput, referenceCount: 1 });
    assert.equal(before.status, 200);
    assert.equal(after.status, 200);
    assert.equal(before.payload.quotes[0].pricing.referenceTokens - after.payload.quotes[0].pricing.referenceTokens, 4096);
    assert.ok(before.payload.quotes[0].pricing.credits > after.payload.quotes[0].pricing.credits);
    const result = await invoke(imageHandler, actor, {
      ...quoteInput, batchId: 'layout-prompt-only', layoutId: 'single-frame',
      layoutProductReferenceCount: 1, references: [{ imageDataUrl: `data:image/jpeg;base64,${product.toString('base64')}` }]
    });
    assert.equal(result.status, 200);
    assert.equal(result.payload.pricing.referenceCount, 1);
    assert.equal(result.payload.pricing.referenceTokens, 500);
    assert.equal(modelCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('second and third layout quotes and model requests contain no uploaded sample', async () => {
  const p = provider('gpt-image-2', { chargeTextTokens: true, chargeReferenceTokens: true });
  upstream(p.model);
  const product = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#232323' } }).jpeg().toBuffer();
  const output = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#acbedf' } }).png().toBuffer();
  const productUrl = `data:image/jpeg;base64,${product.toString('base64')}`;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.deepEqual(request.images.map((image) => image.image_url), [productUrl]);
    assert.equal(request.quality, 'low');
    calls.push(request);
    return new Response(JSON.stringify({
      data: [{ b64_json: output.toString('base64') }],
      usage: { input_tokens: 760, output_tokens: 100, input_tokens_details: { text_tokens: 260, image_tokens: 500 } }
    }));
  };
  const actor = user();
  try {
    for (const id of ['bottom-band', 'full-bleed-detail']) {
      const prompt = buildEcommerceLayoutPrompt({
        slot: layoutSlots([id])[0], productName: '户外手电筒',
        sellingPoints: '便于握持', productReferenceCount: 1
      });
      const input = { providerId: p.id, prompt, size: '1024x1024', quality: 'low' };
      const withSample = await invoke(pricingHandler, actor, { ...input, referenceCount: 2 });
      const withoutSample = await invoke(pricingHandler, actor, { ...input, referenceCount: 1 });
      assert.equal(withSample.status, 200);
      assert.equal(withoutSample.status, 200);
      assert.equal(withSample.payload.quotes[0].pricing.referenceTokens - withoutSample.payload.quotes[0].pricing.referenceTokens, 4096);
      assert.ok(withSample.payload.quotes[0].pricing.credits > withoutSample.payload.quotes[0].pricing.credits);
      const result = await invoke(imageHandler, actor, {
        ...input, batchId: 'layout-prompt-only-next', layoutId: id,
        layoutProductReferenceCount: 1, references: [{ imageDataUrl: productUrl }]
      });
      assert.equal(result.status, 200);
      assert.equal(result.payload.pricing.referenceCount, 1);
      assert.equal(result.payload.pricing.referenceTokens, 500);
    }
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('all remaining layouts quote and send only their one to three product photos', async () => {
  const p = provider('gpt-image-2', { chargeTextTokens: true, chargeReferenceTokens: true });
  upstream(p.model);
  const products = await Promise.all(['#304050', '#506070', '#708090'].map((background) =>
    sharp({ create: { width: 32, height: 32, channels: 3, background } }).jpeg().toBuffer()));
  const images = products.map((product) => `data:image/jpeg;base64,${product.toString('base64')}`);
  const output = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#acbedf' } }).png().toBuffer();
  const ids = LAYOUT_TEMPLATES.slice(3).map((layout) => layout.id);
  const received = [];
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    const current = received.length;
    const count = current % 3 + 1;
    assert.deepEqual(request.images.map((image) => image.image_url), images.slice(0, count));
    assert.equal(request.quality, ['low', 'medium', 'high'][current % 3]);
    received.push(ids[current]);
    return new Response(JSON.stringify({
      data: [{ b64_json: output.toString('base64') }],
      usage: { input_tokens: 260 + 500 * count, output_tokens: 100,
        input_tokens_details: { text_tokens: 260, image_tokens: 500 * count } }
    }));
  };
  const actor = user('user', 5000);
  try {
    for (const [index, id] of ids.entries()) {
      const count = index % 3 + 1;
      const prompt = buildEcommerceLayoutPrompt({
        slot: layoutSlots([id])[0], productName: '便携音箱',
        sellingPoints: '顶部网孔\n侧边挂绳\n机身竖向纹理', productReferenceCount: count
      });
      const refs = buildLayoutReferenceInputs(images.slice(0, count).map((imageDataUrl) => ({ imageDataUrl })),
        undefined, undefined, id);
      const input = { providerId: p.id, prompt, size: '1024x1024', quality: ['low', 'medium', 'high'][index % 3] };
      const oldQuote = await invoke(pricingHandler, actor, { ...input, referenceCount: count + 1 });
      const newQuote = await invoke(pricingHandler, actor, { ...input, referenceCount: count });
      assert.equal(oldQuote.status, 200);
      assert.equal(newQuote.status, 200);
      assert.equal(oldQuote.payload.quotes[0].pricing.referenceTokens
        - newQuote.payload.quotes[0].pricing.referenceTokens, 4096);
      assert.ok(oldQuote.payload.quotes[0].pricing.credits > newQuote.payload.quotes[0].pricing.credits);
      const result = await invoke(imageHandler, actor, {
        ...input, batchId: `layout-all-${index}`, layoutId: id, layoutReferenceMode: 'prompt-only',
        layoutProductReferenceCount: count, references: refs
      });
      assert.equal(result.status, 200, `${id}: ${JSON.stringify(result.payload)}`);
      assert.equal(result.payload.pricing.referenceCount, count);
      assert.equal(result.payload.pricing.referenceTokens, 500 * count);
    }
    assert.deepEqual(received, ids);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sample-only layout requests are rejected before calling the model or reserving credits', async () => {
  const p = provider();
  const actor = user();
  const balance = db.getUserProfile(actor.id).creditBalance;
  globalThis.fetch = async () => { assert.fail('Missing product must not trigger paid generation'); };
  try {
    for (const metadata of [{}, { layoutProductReferenceCount: 1 }, { layoutProductReferenceCount: 3 }]) {
      const result = await invoke(imageHandler, actor, {
        providerId: p.id, prompt: 'Use two references for a flashlight layout.', batchId: 'layout-missing',
        references: [{ imageDataUrl: 'data:image/jpeg;base64,sample' }], ...metadata
      });
      assert.equal(result.status, 400);
      assert.equal(result.payload.error, 'LAYOUT_REFERENCES_INCOMPLETE');
    }
    assert.equal(db.getUserProfile(actor.id).creditBalance, balance);
    assert.equal(db.getDb().prepare('SELECT COUNT(*) AS count FROM credit_reservations WHERE user_id=?').get(actor.id).count, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid layout watermark images are rejected before provider calls or credit reservation', async () => {
  const p = provider();
  const actor = user();
  const product = await sharp({ create: {
    width: 32, height: 32, channels: 3, background: '#334455'
  } }).png().toBuffer();
  const body = {
    providerId: p.id, prompt: 'Product identity first', batchId: 'layout-watermark-validation',
    layoutId: 'single-frame', layoutReferenceMode: 'prompt-only',
    layoutProductReferenceCount: 1,
    references: [{ imageDataUrl: `data:image/png;base64,${product.toString('base64')}` }]
  };
  const balance = db.getUserProfile(actor.id).creditBalance;
  globalThis.fetch = async () => { assert.fail('Invalid watermark must not trigger paid generation'); };
  try {
    for (const layoutWatermark of [
      { angle: 0, imageDataUrl: 'data:image/png;base64,bm90LWFuLWltYWdl' },
      { angle: 45, text: '图'.repeat(20), textImageDataUrl: `data:image/png;base64,${product.toString('base64')}` },
      { angle: 0, text: '店铺' }
    ]) {
      const result = await invoke(imageHandler, actor, { ...body, layoutWatermark });
      assert.equal(result.status, 400);
      assert.equal(result.payload.error, 'LAYOUT_WATERMARK_INVALID');
    }
    assert.equal(db.getUserProfile(actor.id).creditBalance, balance);
    assert.equal(db.getDb().prepare('SELECT COUNT(*) AS count FROM credit_reservations WHERE user_id=?')
      .get(actor.id).count, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('save verification rejects missing or changed token switches from an outdated service', () => {
  const expected = { chargeTextTokens: true, chargeReferenceTokens: true };
  assert.equal(imageTokenBillingFlagsMatch(expected, {}), false);
  assert.equal(imageTokenBillingFlagsMatch(expected, { chargeTextTokens: true, chargeReferenceTokens: false }), false);
  assert.equal(imageTokenBillingFlagsMatch(expected, expected), true);
  assert.equal(imageTokenBillingFlagsMatch({ chargeTextTokens: false }, {}), false);
  assert.equal(imageTokenBillingFlagsMatch({}, {}), true);
});

test('saved switches survive reload and control prompt-sensitive server quotes independently', async () => {
  const p = provider();
  upstream(p.model);
  const request = { providerId: p.id, prompt: 'bottle', size: '1024x1024', quality: 'low', referenceCount: 1 };
  for (const [text, reference] of [[false, false], [true, false], [false, true], [true, true]]) {
    const saved = await invoke(providerHandler, admin, { ...p, pricingConfig: {
      ...p.pricingConfig, chargeTextTokens: text, chargeReferenceTokens: reference
    } }, 'PATCH');
    assert.equal(saved.status, 200);
    const stored = JSON.parse(db.getDb().prepare('SELECT pricing_config FROM image_provider_configs WHERE id=?').get(p.id).pricing_config);
    assert.equal(stored.chargeTextTokens, text);
    assert.equal(stored.chargeReferenceTokens, reference);
    const reload = await invoke(providerHandler, admin, {}, 'GET');
    assert.ok(imageTokenBillingFlagsMatch(stored, reload.payload.providers.find((item) => item.id === p.id).pricingConfig));
    const response = await invoke(pricingHandler, admin, request);
    assert.equal(response.status, 200, JSON.stringify(response.payload));
    const quote = response.payload.quotes[0].pricing;
    assert.equal(quote.imageTextEnabled, text);
    assert.equal(quote.referenceTokenEnabled, reference);
    assert.equal(quote.imageTextCredits, 0);
    assert.equal(quote.referenceTokenCredits > 0, reference);
    assert.equal(quote.referenceCredits, reference ? 0 : 1.5);
    assert.equal(quote.credits, Number((quote.imageCredits + quote.imageTextCredits + quote.referenceTokenCredits).toFixed(2)));
    const longer = await invoke(pricingHandler, admin, { ...request, prompt: 'bottle '.repeat(1000) });
    assert.equal(longer.payload.quotes[0].pricing.imageTextCredits > quote.imageTextCredits, text);
  }
});

test('legacy channel edits without token fields preserve both switches', async () => {
  const p = provider('legacy-channel-image', { chargeTextTokens: true, chargeReferenceTokens: true });
  upstream(p.model);
  const oldPricing = { ...p.pricingConfig };
  delete oldPricing.chargeTextTokens;
  delete oldPricing.chargeReferenceTokens;
  const saved = await invoke(providerHandler, admin, {
    ...p, name: 'Renamed legacy channel', pricingConfig: oldPricing
  }, 'PATCH');
  assert.equal(saved.status, 200, JSON.stringify(saved.payload));
  assert.equal(saved.payload.provider.pricingConfig.chargeTextTokens, true);
  assert.equal(saved.payload.provider.pricingConfig.chargeReferenceTokens, true);
  const stored = JSON.parse(db.getDb().prepare('SELECT pricing_config FROM image_provider_configs WHERE id = ?').get(p.id).pricing_config);
  assert.equal(stored.chargeTextTokens, true);
  assert.equal(stored.chargeReferenceTokens, true);
  assert.equal(stored.referenceImagePriceRmb, 0.015);
  const quote = await invoke(pricingHandler, admin, {
    providerId: p.id, prompt: 'Legacy client', referenceCount: 1
  });
  assert.equal(quote.payload.quotes[0].pricing.referenceCredits, 0);
  assert.equal(quote.payload.quotes[0].pricing.imageTextCredits, 0);
  assert.ok(quote.payload.quotes[0].pricing.referenceTokenCredits > 0);
});

test('upstream records are independent, unique by exact model, editable without a downstream channel', async () => {
  const body = { action: 'create', kind: 'image', model: 'standalone-image', upstreamBaseUrl: 'https://cost-source.example.invalid/v1',
    unit: 'tokens', pricing: { input: 35, output: 210, cacheRead: 0, cacheWrite: 0 }, imageInput: 56, referenceTokenBudget: 2048 };
  assert.equal((await invoke(adminHandler, user(), body)).status, 403);
  const added = await invoke(adminHandler, admin, body);
  assert.equal(added.status, 200, JSON.stringify(added.payload));
  const entry = added.payload.rules.find((r) => r.model === body.model);
  assert.equal(entry.upstreamBaseUrl, 'https://cost-source.example.invalid');
  assert.equal(entry.imagePricingConfig, undefined);
  assert.ok(!added.payload.imageProviders.some((p) => p.model === body.model));
  assert.equal((await invoke(adminHandler, admin, body)).status, 409);
  const updated = await invoke(adminHandler, admin, { ...body, action: 'update', imageInput: 57.015 });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.rules.find((r) => r.model === body.model).imageInput, 57.015);
  const invalid = await invoke(adminHandler, admin, { ...body, model: 'bad-url-image', upstreamBaseUrl: 'https://user:password@example.invalid' });
  assert.equal(invalid.payload.error, 'INVALID_UPSTREAM_URL');
});

test('sync uses configured upstream instead of retail address, exact names, and never changes retail prices', async () => {
  const p = provider('sync-image', { fixedPriceRmb: 0.501, chargeTextTokens: true });
  upstream(p.model);
  const previousRetail = db.getImageProviderConfig(p.id, { includeSecret: false }).pricingConfig;
  let match = false;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify(String(url).endsWith('/api/status') ? { data: { usd_exchange_rate: 7 } }
      : { success: true, data: [{ model_name: match ? p.model : 'sync-image-wrong', quota_type: 0, model_ratio: 2.5, completion_ratio: 6, image_ratio: 1.6 }] }));
  };
  const before = rules.getModelRule(db.getDb(), 'image', p.model);
  assert.equal((await invoke(adminHandler, admin, { action: 'sync', kind: 'image', model: p.model })).payload.error, 'MODEL_PRICE_NOT_FOUND');
  assert.deepEqual(rules.getModelRule(db.getDb(), 'image', p.model), before);
  match = true;
  const result = await invoke(adminHandler, admin, { action: 'sync', kind: 'image', model: p.model });
  assert.equal(result.status, 200);
  assert.ok(urls.every((url) => url.startsWith('https://upstream-cost.example.invalid/')));
  assert.equal(rules.getModelRule(db.getDb(), 'image', p.model).imageInput, 56);
  const nextRetail = db.getImageProviderConfig(p.id, { includeSecret: false }).pricingConfig;
  assert.equal(nextRetail.fixedPriceRmb, previousRetail.fixedPriceRmb);
  assert.equal(nextRetail.chargeTextTokens, true);
  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  const last = rules.getModelRule(db.getDb(), 'image', p.model);
  assert.equal((await invoke(adminHandler, admin, { action: 'sync', kind: 'image', model: p.model })).status, 400);
  assert.deepEqual(rules.getModelRule(db.getDb(), 'image', p.model), last);
});

test('retail channels sharing one model keep independent token switches; missing rates prevent enabling', async () => {
  const a = provider('shared-image'), b = provider('shared-image');
  upstream(a.model);
  const updated = await invoke(providerHandler, admin, { ...a, pricingConfig: { ...a.pricingConfig, chargeTextTokens: true, chargeReferenceTokens: true } }, 'PATCH');
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.provider.pricingConfig.chargeReferenceTokens, true);
  assert.equal(db.getImageProviderConfig(b.id, { includeSecret: false }).pricingConfig.chargeReferenceTokens, false);
  assert.equal(rules.listModelRules(db.getDb()).filter((r) => r.model === a.model).length, 1);
  const missing = provider('no-upstream');
  assert.equal((await invoke(providerHandler, admin, { ...missing, pricingConfig: { ...missing.pricingConfig, chargeTextTokens: true } }, 'PATCH')).status, 400);
});

test('text fees are waived through 0.5 credits; image fee uses summed image tokens, not count; token fees exclude promotion', () => {
  const p = provider('calculation-image', { chargeTextTokens: true, chargeReferenceTokens: true });
  upstream(p.model);
  const config = db.getImageProviderConfig(p.id, { includeSecret: false }).pricingConfig;
  const quoted = applyImagePromotion(getImageGenerationPricing({
    model: p.model, prompt: 'bottle', estimatedTextTokens: estimateTextTokens('bottle'), referenceCount: 2
  }, config), { enabled: true, payPercent: 50 });
  assert.equal(quoted.referenceCredits, 0);
  assert.equal(quoted.imageCredits, 20);
  const settled = settleImageInputPricing(quoted, { textTokens: 1, referenceTokens: 1500, outputTokens: 2000 });
  assert.equal(settled.imageTextCredits, 0);
  assert.equal(settled.referenceTokenCredits, 8.4);
  assert.equal(settled.credits, 28.4);
  assert.equal(settled.inputTokenBillingMode, 'actual');
  assert.equal(imageInputFees({ usage: { textTokens: 10000 } }, config).imageTextCredits, 35);
});

test('text threshold applies to quote and actual usage independently; reference budget cannot pay text overage', () => {
  const config = { chargeTextTokens: true, chargeReferenceTokens: true,
    upstreamCost: { imageTextInputRmb: 50, imageInput: 56, referenceTokenBudget: 4096 } };
  const quote = (tokens) => imageInputFees({ prompt: 'example', estimatedTextTokens: tokens, referenceCount: 1 }, config);
  assert.equal(quote(99).imageTextCredits, 0);
  assert.equal(quote(100).imageTextCredits, 0);
  assert.equal(quote(101).imageTextCredits, 0.51);
  assert.equal(imageInputFees({ referenceCount: 1, usage: { textTokens: 100, referenceTokens: 500 } }, config).imageTextCredits, 0);
  assert.equal(imageInputFees({ referenceCount: 1, usage: { textTokens: 101, referenceTokens: 500 } }, config).imageTextCredits, 0.51);
  const lowQuote = { ...quote(100), imageCredits: 40, credits: 40 + quote(100).referenceTokenCredits,
    referenceCount: 1, upstreamOutputRmbPerMillion: 0, upstreamFixedPriceRmb: null };
  const actual = settleImageInputPricing(lowQuote, { textTokens: 1000, referenceTokens: 500 });
  assert.equal(actual.actualImageTextCredits, 5);
  assert.equal(actual.imageTextCredits, 0);
  assert.equal(actual.referenceTokenCredits, 2.8);
  assert.equal(actual.credits, 42.8);
  const highQuote = { ...quote(101), imageCredits: 40, credits: 40 + quote(101).imageTextCredits,
    referenceCount: 0, referenceTokenCredits: 0, upstreamOutputRmbPerMillion: 0, upstreamFixedPriceRmb: null };
  const waived = settleImageInputPricing(highQuote, { textTokens: 100 });
  assert.equal(waived.imageTextCredits, 0);
  assert.equal(waived.credits, 40);
});

test('usage parsing never treats total or output image tokens as reference tokens', () => {
  assert.deepEqual(normalizeImageInputUsage({ usage: { input_tokens: 500, output_tokens: 9999,
    input_tokens_details: { text_tokens: 50, image_tokens: 450 } } }),
  { textTokens: 50, referenceTokens: 450, inputTokens: 500, outputTokens: 9999 });
  const noDetails = normalizeImageInputUsage({ usage: { prompt_tokens: 5000, completion_tokens: 7000 } });
  assert.equal(noDetails.referenceTokens, null);
  assert.equal(noDetails.textTokens, null);
  const gemini = normalizeImageInputUsage({ usageMetadata: { promptTokenCount: 603,
    promptTokensDetails: [{ modality: 'TEXT', tokenCount: 3 }, { modality: 'IMAGE', tokenCount: 200 }, { modality: 'IMAGE', tokenCount: 400 }] } });
  assert.equal(gemini.referenceTokens, 600);
  assert.equal(gemini.textTokens, 3);
  assert.equal(normalizeImageInputUsage({ usage: { input_tokens_details: { image_tokens: -5 } } }).referenceTokens, null);
});

test('legacy global switch migrates once without overriding explicit retail choices', () => {
  const a = provider('legacy-image'), b = provider('legacy-image', { chargeTextTokens: false });
  const stored = JSON.parse(db.getDb().prepare('SELECT pricing_config FROM image_provider_configs WHERE id=?').get(a.id).pricing_config);
  delete stored.chargeTextTokens;
  delete stored.chargeReferenceTokens;
  db.getDb().prepare('UPDATE image_provider_configs SET pricing_config=? WHERE id=?').run(JSON.stringify(stored), a.id);
  upstream(a.model, { includeImageText: true });
  assert.equal(db.getImageProviderConfig(a.id, { includeSecret: false }).pricingConfig.chargeTextTokens, true);
  assert.equal(db.getImageProviderConfig(b.id, { includeSecret: false }).pricingConfig.chargeTextTokens, false);
  assert.equal(rules.getModelRule(db.getDb(), 'image', a.model).includeImageText, undefined);
});

test('generation settles actual reference tokens, refunds reservations, and preserves super-admin exemption', async () => {
  const p = provider('gpt-image-2.5-flare', { chargeTextTokens: true, chargeReferenceTokens: true });
  upstream(p.model);
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#336633' } }).png().toBuffer();
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: image.toString('base64') }],
    usage: { input_tokens: 560, output_tokens: 1000, input_tokens_details: { text_tokens: 60, image_tokens: 500 } } }));
  const body = { providerId: p.id, prompt: 'A bottle', references: [{ imageDataUrl: `data:image/png;base64,${image.toString('base64')}` }] };
  const actor = user();
  const result = await invoke(imageHandler, actor, body);
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.creditsCharged, 42.8);
  assert.equal(result.payload.pricing.referenceTokens, 500);
  assert.equal(result.payload.pricing.imageTextCredits, 0);
  assert.equal(db.getUserProfile(actor.id).creditBalance, 457.2);
  const row = db.getDb().prepare('SELECT * FROM credit_reservations WHERE user_id=? ORDER BY created_at DESC LIMIT 1').get(actor.id);
  assert.equal(row.settled_centi, 4280);
  assert.ok(row.amount_centi > row.settled_centi);
  const duplicate = billing.settleImageGenerationBilling(row.id, result.payload.pricing, { textTokens: 1, referenceTokens: 1 });
  assert.equal(duplicate.chargedCredits, 42.8);
  assert.equal(db.getUserProfile(actor.id).creditBalance, 457.2);
  const free = await invoke(imageHandler, admin, body);
  assert.equal(free.status, 200);
  assert.equal(free.payload.creditsCharged, 0);
});

test('missing usage is not billed, over-budget input fees cannot overdraw, and no fake generation failure', async () => {
  const p = provider('gpt-image-2', { chargeTextTokens: true, chargeReferenceTokens: true });
  upstream(p.model);
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#333333' } }).png().toBuffer();
  const actor = user();
  const body = { providerId: p.id, prompt: 'bottle', references: [{ imageDataUrl: `data:image/png;base64,${image.toString('base64')}` }] };
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: image.toString('base64') }] }));
  const missing = await invoke(imageHandler, actor, body);
  assert.equal(missing.status, 200);
  assert.equal(missing.payload.creditsCharged, 40);
  assert.equal(missing.payload.pricing.missingReferenceUsage, true);
  assert.equal(missing.payload.pricing.missingTextUsage, true);
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: image.toString('base64') }],
    usage: { input_tokens_details: { text_tokens: 100000, image_tokens: 1000000 } } }));
  const over = await invoke(imageHandler, actor, body);
  assert.equal(over.status, 200);
  assert.equal(over.payload.creditsCharged, over.payload.pricing.quotedCredits);
  assert.ok(over.payload.pricing.waivedOverageCredits > 0);
  assert.equal(Number((over.payload.pricing.imageCredits + over.payload.pricing.imageTextCredits + over.payload.pricing.referenceTokenCredits).toFixed(2)), over.payload.creditsCharged);
  const poor = user('user', 1);
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Must not generate'); };
  assert.equal((await invoke(imageHandler, poor, body)).status, 402);
  assert.equal(calls, 0);
});

test('group member settlement refunds unused budget without charging personal balance or settling twice', () => {
  const owner = user(), member = user('user', 0);
  db.createGroupAccount(owner.id, 'Input usage group');
  db.fundGroupAccount(owner.id, 200, 'input-group-fund');
  const invited = db.inviteGroupMember(owner.id, member.email);
  db.respondGroupInvitation(member.id, invited.membership.outgoingInvitations[0].id, true);
  db.adjustGroupMemberBudget(owner.id, member.id, 100, 'input-group-budget');
  const p = provider('group-input-image', { chargeTextTokens: true, chargeReferenceTokens: true });
  upstream(p.model);
  const config = db.getImageProviderConfig(p.id, { includeSecret: false }).pricingConfig;
  const quote = getImageGenerationPricing({
    model: p.model, prompt: 'bottle', estimatedTextTokens: estimateTextTokens('bottle'), referenceCount: 1
  }, config);
  const reservation = db.reserveCredit(member.id, { amount: quote.credits, requestKey: 'input-group-request' });
  const final = billing.settleImageGenerationBilling(reservation.reservationId, quote, { textTokens: 50, referenceTokens: 500 });
  assert.equal(final.chargedCredits, 42.8);
  assert.equal(db.getGroupAccountSummary(owner.id).membership.balance, 157.2);
  assert.equal(db.getGroupAccountSummary(member.id).membership.available, 57.2);
  assert.equal(db.getUserProfile(member.id).personalCreditBalance, 0);
  billing.settleImageGenerationBilling(reservation.reservationId, quote, { textTokens: 50, referenceTokens: 500 });
  assert.equal(db.getGroupAccountSummary(owner.id).membership.balance, 157.2);
});

test('multiple generated images settle their own modality usage and report the sum of actual charges', async () => {
  const p = provider('gpt-image-2.5-flare', { chargeTextTokens: true, chargeReferenceTokens: true });
  upstream(p.model);
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#224422' } }).png().toBuffer();
  let calls = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [{ b64_json: image.toString('base64') }],
    usage: { input_tokens_details: { text_tokens: 50, image_tokens: ++calls * 500 } }
  }));
  const actor = user();
  const result = await invoke(imageHandler, actor, { providerId: p.id, count: 2, prompt: 'bottle',
    references: [{ imageDataUrl: `data:image/png;base64,${image.toString('base64')}` }] });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.images.length, 2);
  assert.equal(result.payload.creditsCharged, 88.4);
  assert.equal(db.getUserProfile(actor.id).creditBalance, 411.6);
  assert.deepEqual(result.payload.images.map((i) => i.inputTokenSettlement.referenceTokens), [500, 1000]);
});
