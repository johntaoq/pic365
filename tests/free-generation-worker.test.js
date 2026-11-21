import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';
import { submitLayoutGenerationTasks } from '../src/ecommerce-layout-requests.js';
import { buildEcommerceLayoutPrompt, layoutSlots } from '../shared/ecommerce-layout-studio.js';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-free-worker-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'generated');
process.env.PROVIDER_CONFIG_SECRET = 'test-provider-secret-for-worker';
process.env.FREE_GENERATION_WORKER_CONCURRENCY = '3';

const previousFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({
  id: 'provider-request-1',
  data: [{ b64_json: 'aGVsbG8=' }]
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});

const localDb = await import('../api/_lib/local-db.js');
const queue = await import('../api/_lib/free-generation-queue.js');
const worker = await import('../server/free-generation-worker.js');
const storage = await import('../api/_lib/storage.js');
const { default: taskHandler } = await import('../api/generation-tasks.js');

after(async () => {
  await worker.stopFreeGenerationWorker();
  globalThis.fetch = previousFetch;
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

async function waitForTask(userId, taskId, statuses, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = queue.getFreeGenerationTask(userId, taskId);
    if (statuses.includes(task?.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('TASK_WAIT_TIMEOUT');
}

test('server worker completes a queued task without a browser request remaining open', async () => {
  const user = localDb.createUser({
    email: `worker-${Date.now()}@example.com`,
    password: 'testing-1234',
    fullName: 'Worker Test'
  });
  localDb.getDb().prepare('UPDATE users SET credit_balance = 100 WHERE id = ?').run(user.id);
  const provider = localDb.saveImageProviderConfig({
    name: 'Worker Provider',
    providerType: 'openai-compatible',
    baseUrl: 'https://provider.example',
    apiKey: 'worker-key',
    model: 'gpt-image-2',
    enabled: true,
    isDefault: true
  });
  localDb.bindDefaultSystemGroupChannel('image', provider.id);
  localDb.updatePromptLoggingConfig({ enabled: true }, user.id);
  const created = queue.createFreeGenerationTask(user.id, {
    prompt: 'Generate a worker image',
    size: '1024x1024',
    quality: 'low',
    count: 1,
    providerId: provider.id,
    references: []
  });

  worker.startFreeGenerationWorker();
  const completed = await waitForTask(user.id, created.id, ['completed', 'failed']);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.results.length, 1);
  assert.ok(completed.results[0].generationId);
  assert.equal(localDb.getDb().prepare(`
    SELECT COUNT(*) AS count FROM credit_reservations WHERE user_id = ? AND status = 'succeeded'
  `).get(user.id).count, 1);
  assert.equal(localDb.getDb().prepare(`
    SELECT COUNT(*) AS count FROM generations WHERE user_id = ? AND status = 'succeeded'
  `).get(user.id).count, 1);
  const [promptLog] = localDb.listPromptAuditLogs();
  assert.equal(promptLog.userEmail, user.email);
  assert.equal(promptLog.taskMode, 'single');
  assert.equal(promptLog.userPrompt, 'Generate a worker image');
  assert.equal(promptLog.model, 'gpt-image-2');
  assert.equal(promptLog.size, '1024x1024');
  assert.equal(promptLog.quality, 'low');
});

for (const sharedSupported of [true, false]) {
test(`commerce ${sharedSupported ? 'shared' : 'legacy'} submission queues complete references through the worker`, async () => {
  await worker.stopFreeGenerationWorker();
  const user = localDb.createUser({
    email: `commerce-worker-${Date.now()}@example.test`, password: 'testing-1234', fullName: 'Commerce Worker'
  });
  localDb.getDb().prepare('UPDATE users SET credit_balance = 1000 WHERE id = ?').run(user.id);
  const token = localDb.createSession(user.id).token;
  const provider = localDb.saveImageProviderConfig({
    name: 'Commerce Worker', baseUrl: 'https://provider.example', apiKey: 'test-only',
    model: 'gpt-image-2', enabled: true, pricingConfig: { strategy: 'fixed-image', fixedPriceRmb: .4 }
  });
  localDb.bindDefaultSystemGroupChannel('image', provider.id);
  const photos = await Promise.all(['#223344', '#334455', '#445566'].map(async (background) => {
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background } }).jpeg().toBuffer();
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
  }));
  const received = [];
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.deepEqual(request.images.map((image) => image.image_url), photos);
    received.push(request.quality);
    return new Response(JSON.stringify({ data: [{ b64_json: photos[0].split(',')[1] }] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  };
  const tasks = ['low', 'medium', 'high'].map((quality, index) => ({
    clientTaskId: `layout-api-${sharedSupported}-${index}`, batchId: 'layout-api', batchIndex: index,
    layoutId: 'icon-rails', layoutReferenceMode: 'prompt-only',
    prompt: buildEcommerceLayoutPrompt({
      slot: layoutSlots(['icon-rails'])[0], productName: '户外手电筒', sellingPoints: '续航久', productReferenceCount: 3
    }),
    size: '1024x1024', quality, count: 1, providerId: provider.id, layoutProductReferenceCount: 3,
    references: []
  }));
  const { response, payload } = await submitLayoutGenerationTasks(tasks,
    photos.slice(0, 3).map((imageDataUrl) => ({ imageDataUrl })), async (_url, init) => {
      let status, body;
      if (init.method === 'POST' && !sharedSupported) {
        const sent = JSON.parse(init.body);
        assert.equal(sent.sharedReferences, undefined);
        assert.ok(sent.tasks.every((task) => task.references.length === 3));
      }
      await taskHandler({
        method: init.method || 'GET', headers: { cookie: `member_session=${encodeURIComponent(token)}` },
        ...(init.body ? { body: JSON.parse(init.body) } : {})
      }, { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; } });
      if (!init.method && !sharedSupported) delete body.capabilities;
      return Response.json(body, { status });
    });
  assert.equal(response.status, 201);
  assert.equal(payload.tasks.length, 3);
  assert.ok(payload.tasks.every((task) => task.status === 'queued'));
  const finished = await Promise.all(payload.tasks.map((task) => waitForTask(user.id, task.id, ['completed', 'failed'])));
  assert.ok(finished.every((task) => task.status === 'completed'), JSON.stringify(finished.map((task) => task.error)));
  assert.deepEqual(received.sort(), ['high', 'low', 'medium']);
  assert.equal(localDb.getDb().prepare("SELECT COUNT(*) AS count FROM credit_reservations WHERE user_id=? AND status='succeeded'").get(user.id).count, 3);
});
}

test('watermarked layout batches save marked images while the model receives only the product photo', async () => {
  await worker.stopFreeGenerationWorker();
  const user = localDb.createUser({
    email: `watermark-worker-${Date.now()}@example.test`, password: 'testing-1234', fullName: 'Watermark Worker'
  });
  localDb.getDb().prepare('UPDATE users SET credit_balance = 1000 WHERE id = ?').run(user.id);
  const token = localDb.createSession(user.id).token;
  const provider = localDb.saveImageProviderConfig({
    name: 'Watermark Worker', baseUrl: 'https://provider.example', apiKey: 'test-only',
    model: 'gpt-image-2', enabled: true, pricingConfig: { strategy: 'fixed-image', fixedPriceRmb: .4 }
  });
  localDb.bindDefaultSystemGroupChannel('image', provider.id);
  const product = await sharp({ create: { width: 96, height: 96, channels: 3, background: '#555555' } }).jpeg().toBuffer();
  const output = await sharp({ create: { width: 320, height: 320, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const logo = await sharp({ create: {
    width: 180, height: 40, channels: 3, background: '#ff1414'
  } }).webp().toBuffer();
  const text = await sharp({ create: {
    width: 240, height: 65, channels: 4, background: { r: 30, g: 30, b: 30, alpha: .6 }
  } }).png().toBuffer();
  const productUrl = `data:image/jpeg;base64,${product.toString('base64')}`;
  const logoUrl = `data:image/webp;base64,${logo.toString('base64')}`;
  const layoutWatermark = {
    angle: -45, columns: 2, text: '我的店铺', textImageDataUrl: `data:image/png;base64,${text.toString('base64')}`,
    imageDataUrl: logoUrl
  };
  let modelCalls = 0;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.deepEqual(request.images.map((image) => image.image_url), [productUrl]);
    assert.equal(request.quality, 'medium');
    modelCalls++;
    return Response.json({ data: [{ b64_json: output.toString('base64') }] });
  };
  const tasks = ['single-frame', 'icon-rails'].map((layoutId, index) => ({
    clientTaskId: `layout-watermark-${index}`, batchId: 'layout-watermark-worker', batchIndex: index,
    layoutId, layoutReferenceMode: 'prompt-only', layoutProductReferenceCount: 1,
    prompt: 'Keep the product intact', size: '1024x1024', quality: 'medium',
    providerId: provider.id, count: 1, layoutWatermark, references: []
  }));
  const { response, payload } = await submitLayoutGenerationTasks(tasks, [{ imageDataUrl: productUrl }],
    async (_url, init) => {
      let status, body;
      await taskHandler({
        method: init.method || 'GET', headers: { cookie: `member_session=${encodeURIComponent(token)}` },
        ...(init.body ? { body: JSON.parse(init.body) } : {})
      }, { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; } });
      return Response.json(body, { status });
    });
  assert.equal(response.status, 201, payload.error);
  const finished = await Promise.all(payload.tasks.map((task) => waitForTask(user.id, task.id, ['completed', 'failed'])));
  assert.deepEqual(finished.map((task) => task.status), ['completed', 'completed']);
  assert.equal(modelCalls, 2);
  for (const task of finished) {
    const row = localDb.getDb().prepare('SELECT storage_path, mime_type FROM generations WHERE id = ?')
      .get(task.results[0].generationId);
    const image = await storage.readStoredFile(row.storage_path);
    assert.equal(row.mime_type, 'image/png');
    assert.equal((await sharp(image.bytes).metadata()).width, 320);
    assert.notDeepEqual(image.bytes, output);
    const { data, info } = await sharp(image.bytes).raw().toBuffer({ resolveWithObject: true });
    for (const [left, top] of [[0, 0], [160, 0], [0, 160], [160, 160]]) {
      let markedPixels = 0;
      for (let y = top; y < top + 160; y++) {
        for (let x = left; x < left + 160; x++) {
          const offset = (y * info.width + x) * info.channels;
          if (data[offset + 1] < 245) markedPixels++;
        }
      }
      assert.ok(markedPixels > 0, `missing watermark at ${left},${top}`);
    }
    const result = JSON.parse(localDb.getDb().prepare('SELECT result_json FROM free_generation_tasks WHERE id = ?')
      .get(task.id).result_json);
    assert.equal(result.pricing.referenceCount, 1);
  }
  assert.equal(localDb.getDb().prepare(
    "SELECT COUNT(*) AS count FROM credit_reservations WHERE user_id=? AND status='succeeded'"
  ).get(user.id).count, 2);
});

test('task API rejects unreadable watermarks before queuing or reserving credits', async () => {
  await worker.stopFreeGenerationWorker();
  const user = localDb.createUser({
    email: `watermark-reject-${Date.now()}@example.test`, password: 'testing-1234', fullName: 'Watermark Reject'
  });
  const token = localDb.createSession(user.id).token;
  const provider = localDb.saveImageProviderConfig({
    name: 'Watermark Reject', baseUrl: 'https://provider.example', apiKey: 'test-only',
    model: 'gpt-image-2', enabled: true
  });
  localDb.bindDefaultSystemGroupChannel('image', provider.id);
  const product = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#555555' } }).png().toBuffer();
  let status, body;
  await taskHandler({
    method: 'POST', headers: { cookie: `member_session=${encodeURIComponent(token)}` },
    body: {
      tasks: [{
        clientTaskId: 'invalid-watermark-preflight', batchId: 'layout-invalid-watermark', batchIndex: 0,
        layoutId: 'single-frame', layoutReferenceMode: 'prompt-only', layoutProductReferenceCount: 1,
        prompt: 'Keep the product intact', size: '1024x1024', quality: 'low',
        providerId: provider.id, references: [],
        layoutWatermark: { angle: 0, imageDataUrl: 'data:image/png;base64,YWJj' }
      }],
      sharedReferences: [{ imageDataUrl: `data:image/png;base64,${product.toString('base64')}` }]
    }
  }, { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; } });
  assert.equal(status, 400);
  assert.equal(body.error, 'LAYOUT_WATERMARK_INVALID');
  assert.equal(localDb.getDb().prepare('SELECT COUNT(*) AS count FROM free_generation_tasks WHERE id = ?')
    .get('invalid-watermark-preflight').count, 0);
  assert.equal(localDb.getDb().prepare('SELECT COUNT(*) AS count FROM credit_reservations WHERE user_id = ?')
    .get(user.id).count, 0);
});
