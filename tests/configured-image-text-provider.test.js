import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-image-text-provider-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
process.env.PROVIDER_CONFIG_SECRET = 'image-text-provider-test-secret';
process.env.CHAT_PROVIDER_API_KEY = 'sk-image-text-test';
process.env.CHAT_PROVIDER_BASE_URL = 'https://chat.example.invalid/v1';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const [db, chat, sanitize, optimize] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/chat-engine.js'),
  import('../api/sanitize-prompt.js'),
  import('../api/optimize-image-prompt.js')
]);
const [storage, ecommerceOutputs, consistency] = await Promise.all([
  import('../api/_lib/storage.js'),
  import('../api/_lib/ecommerce-p1-db.js'),
  import('../api/ecommerce/check-consistency.js')
]);

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, session, body) {
  let statusCode = 200;
  let payload;
  const response = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  const request = {
    method: 'POST',
    headers: { cookie: `member_session=${encodeURIComponent(session.token)}` },
    body
  };
  return Promise.resolve(handler(request, response)).then(() => ({ statusCode, payload }));
}

test('image prompt tools follow chat assistant model changes without restarting or charging for sanitization', async () => {
  const user = db.createUser({
    email: 'image-text-provider@example.com',
    password: 'testing-1234',
    fullName: 'Image Text Provider',
    initialCredits: 10
  });
  const session = db.createSession(user.id);
  let provider = chat.getChatProviderConfig();
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url: String(url), body, authorization: options.headers.Authorization });
    const isSanitizer = body.messages[0].content.includes('safety-first prompt editor');
    return new Response(JSON.stringify({
      model: body.model,
      choices: [{ message: { content: isSanitizer
        ? '{"status":"ok","prompt":"A clean studio product photo with soft light."}'
        : 'A precise studio product photograph with balanced lighting.' } }],
      usage: { prompt_tokens: 90, completion_tokens: 35 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    for (const [index, model] of ['first-configured-model', 'next-configured-model'].entries()) {
      provider = chat.saveChatProviderConfig({
        ...provider,
        model,
        baseUrl: index ? 'https://chat-next.example.invalid/v1' : 'https://chat.example.invalid/v1',
        maxOutputTokens: index ? 3072 : 2048,
        ...(index ? { apiKey: 'sk-image-text-next' } : {})
      });
      const sanitized = await invoke(sanitize.default, session, { prompt: 'A studio product photo.' });
      assert.equal(sanitized.statusCode, 200);
      assert.equal(sanitized.payload.model, model);
      assert.equal(sanitized.payload.fallback, false);

      const optimized = await invoke(optimize.default, session, {
        prompt: 'A studio product photo.',
        language: 'en'
      });
      assert.equal(optimized.statusCode, 200);
      assert.equal(optimized.payload.model, model);
    }
    assert.equal(requests.length, 4);
    assert.deepEqual(requests.map((request) => request.body.model), [
      'first-configured-model', 'first-configured-model',
      'next-configured-model', 'next-configured-model'
    ]);
    for (const [index, request] of requests.entries()) {
      assert.equal(request.url, index < 2
        ? 'https://chat.example.invalid/v1/chat/completions'
        : 'https://chat-next.example.invalid/v1/chat/completions');
      assert.equal(request.authorization, index < 2
        ? 'Bearer sk-image-text-test'
        : 'Bearer sk-image-text-next');
      assert.equal(request.body.max_completion_tokens, index < 2 ? 2048 : 3072);
      assert.equal(Object.hasOwn(request.body, 'max_tokens'), false);
    }
    assert.equal(db.getUserProfile(user.id).creditBalance, 8);

    chat.saveChatProviderConfig({ ...provider, enabled: false });
    const fallback = await invoke(sanitize.default, session, { prompt: 'A studio product photo.' });
    assert.equal(fallback.payload.model, 'local-safe-fallback');
    const unavailable = await invoke(optimize.default, session, { prompt: 'A studio product photo.' });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(db.getUserProfile(user.id).creditBalance, 8);
    assert.equal(requests.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ecommerce consistency checks use the current assistant model for image comparisons', async () => {
  const user = db.createUser({
    email: 'consistency-provider@example.com',
    password: 'testing-1234',
    fullName: 'Consistency Provider',
    initialCredits: 100
  });
  const session = db.createSession(user.id);
  const project = db.createEcommerceProject(user.id, {
    projectName: 'Configured model check',
    platformId: 'taobao-tmall',
    industryId: 'general',
    productName: 'Bottle',
    brandName: '',
    coreUser: '',
    coreScenario: '',
    sellingPoints: [],
    specifications: '',
    prohibitedContent: '',
    aiBriefOriginals: {},
    identitySpec: {},
    templateId: '',
    visualStyleId: 'clean-commercial',
    selectedSlots: ['main-square']
  });
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==';
  const assetId = crypto.randomUUID();
  const master = await storage.persistProjectAsset({ userId: user.id, projectId: project.id, assetId, image });
  db.createEcommerceProjectAsset(user.id, {
    id: assetId,
    projectId: project.id,
    assetType: 'product',
    fileName: 'bottle.png',
    mimeType: master.contentType,
    fileSize: master.byteLength,
    storagePath: master.storagePath,
    purpose: 'master',
    sortOrder: 1
  });
  db.setEcommerceProjectMasterAsset(user.id, project.id, assetId);
  ecommerceOutputs.syncEcommerceProjectOutputs(user.id, project.id, ['main-square']);
  const reservation = db.reserveCredit(user.id, { prompt: 'Bottle photo' });
  const generationId = db.createGeneration({
    userId: user.id,
    reservationId: reservation.reservationId,
    caseId: null,
    projectId: project.id,
    slotId: 'main-square',
    prompt: 'Bottle photo',
    model: 'image-model',
    size: '1024x1024',
    quality: 'medium',
    provider: 'test'
  });
  const generated = await storage.persistImage({ userId: user.id, generationId, image });
  db.updateGeneration(generationId, {
    status: 'succeeded',
    storage_path: generated.storagePath,
    completed_at: new Date().toISOString()
  });
  db.completeCreditReservation(reservation.reservationId);
  assert.equal(
    ecommerceOutputs.selectEcommerceOutputGeneration(user.id, project.id, 'main-square', generationId)?.selectedGenerationId,
    generationId
  );

  let provider = chat.listChatProviderConfigs({ admin: true })[0];
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url: String(url), body });
    return new Response(JSON.stringify({
      model: body.model,
      choices: [{ message: { content: '{"score":96,"summary":"一致","issues":[]}' } }],
      usage: { prompt_tokens: 120, completion_tokens: 30 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    for (const model of ['consistency-first-model', 'consistency-next-model']) {
      provider = chat.saveChatProviderConfig({
        ...provider,
        model,
        baseUrl: 'https://chat.example.invalid/v1',
        enabled: true
      });
      const response = await invoke(consistency.default, session, { projectId: project.id, slotId: 'main-square' });
      assert.equal(response.statusCode, 200);
      assert.equal(response.payload.model, model);
      assert.equal(response.payload.consistency.score, 96);
    }
    assert.deepEqual(requests.map(({ body }) => body.model), ['consistency-first-model', 'consistency-next-model']);
    for (const { url, body } of requests) {
      assert.equal(url, 'https://chat.example.invalid/v1/chat/completions');
      assert.equal(body.max_completion_tokens, provider.maxOutputTokens);
      assert.equal(body.messages[0].content.filter((part) => part.type === 'image_url').length, 2);
    }
    assert.equal(db.getUserProfile(user.id).creditBalance, 99);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
