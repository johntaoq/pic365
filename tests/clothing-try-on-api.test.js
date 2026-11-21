import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';
import { SYSTEM_TRY_ON_MODELS, TRY_ON_REFERENCE_ORDER, buildModelPhotoPrompt, buildClothingTryOnPrompt, normalizeClothingStudioWorkflow } from '../shared/clothing-try-on.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-clothing-api-'));
Object.assign(process.env, { APP_DB_PATH: path.join(root, 'app.sqlite'), LOCAL_STORAGE_ROOT: path.join(root, 'images'),
  PROVIDER_CONFIG_SECRET: 'clothing-test-only', AZURE_STORAGE_CONNECTION_STRING: '', AI_API_KEY: '' });
const db = await import('../api/_lib/local-db.js');
const models = await import('../api/_lib/clothing-try-on-models.js');
const media = await import('../api/_lib/media-assets.js');
const queue = await import('../api/_lib/free-generation-queue.js');
const worker = await import('../server/free-generation-worker.js');
const { default: generate } = await import('../api/generate-image.js');
const { default: tasks } = await import('../api/generation-tasks.js');
const { default: modelHandler } = await import('../api/try-on-models.js');
const { default: pricingHandler } = await import('../api/image-pricing.js');
const previousFetch = globalThis.fetch;
let requests = [];
let nextStatus = 200;
const output = await sharp({ create: { width: 64, height: 96, channels: 3, background: '#c6b69f' } }).png().toBuffer();
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  requests.push({ url: String(url), ...body });
  return new Response(JSON.stringify(nextStatus === 200 ? { data: [{ b64_json: output.toString('base64') }] } : { error: { message: 'Test provider unavailable' } }), { status: nextStatus, headers: { 'Content-Type': 'application/json' } });
};
after(async () => { await worker.stopFreeGenerationWorker(); globalThis.fetch = previousFetch; db.getDb().close(); fs.rmSync(root, { recursive: true, force: true }); });

let sequence = 0;
function actor() {
  const value = db.createUser({ email: `clothing-${++sequence}@example.test`, password: 'test-only-password', fullName: 'Clothing test', initialCredits: 500 });
  return { ...value, token: db.createSession(value.id).token };
}
function provider(model) {
  const value = db.saveImageProviderConfig({ name: `Test ${model}`, model, baseUrl: 'https://clothing.example.invalid', apiKey: 'test-only', pricingConfig: { strategy: 'fixed-image', fixedPriceRmb: 0.3 }, isDefault: false });
  db.bindDefaultSystemGroupChannel('image', value.id);
  return value;
}
const image25 = provider('gpt-image-2.5-flare');
const image2 = provider('gpt-image-2');
const definition = { ...SYSTEM_TRY_ON_MODELS[0], name: '私有 Low 模特' };
const modelRequest = overrides => ({ prompt: buildModelPhotoPrompt(definition), providerId: image25.id, size: '1024x1536', quality: 'low', count: 1,
  clientTaskId: `model-test-${++sequence}`, references: [], studioWorkflow: { kind: 'model-creation', definition }, ...overrides });
const balance = user => db.getUserProfile(user.id).creditBalance;
async function invoke(handler, user, body = {}, method = 'POST') {
  let status, payload;
  await handler({ method, query: {}, body, headers: user ? { cookie: `member_session=${encodeURIComponent(user.token)}` } : {}, once() {}, socket: { remoteAddress: '127.0.0.1' } },
    { once() {}, setHeader() {}, status(value) { status = value; return this; }, json(value) { payload = value; return value; } });
  return { status, payload };
}

test('High model creation is rejected before billing or an upstream call in both immediate and queue APIs', async () => {
  const user = actor();
  const before = balance(user);
  for (const handler of [generate, tasks]) {
    for (const quality of ['high', 'medium', 'auto', undefined]) {
      const calls = requests.length;
      const result = await invoke(handler, user, modelRequest({ quality }));
      assert.equal(result.status, 400);
      assert.equal(result.payload.error, 'MODEL_LOW_QUALITY_REQUIRED');
      assert.equal(requests.length, calls);
      assert.equal(balance(user), before);
    }
    const wrongProvider = await invoke(handler, user, modelRequest({ providerId: image2.id }));
    assert.equal(wrongProvider.payload.error, 'MODEL_IMAGE_25_REQUIRED');
  }
  const guest = await invoke(generate, null, modelRequest());
  assert.equal(guest.status, 401);
});

test('an image2.5 Low model is automatically saved privately, saving twice is free and restart metadata is recoverable', async () => {
  const user = actor();
  const stranger = actor();
  const before = balance(user);
  const quote = await invoke(pricingHandler, user, { providerId: image25.id, size: '1024x1536', quality: 'low', referenceCount: 0, prompt: buildModelPhotoPrompt(definition) });
  const quotedCredits = quote.payload.quotes[0].pricing.credits;
  const result = await invoke(generate, user, modelRequest());
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).model, 'gpt-image-2.5-flare');
  assert.equal(requests.at(-1).quality, 'low');
  assert.equal(result.payload.createdModel.generated, true);
  assert.equal(balance(user), before - quotedCredits);
  const calls = requests.length;
  const stored = result.payload.createdModel;
  const saved = models.saveGeneratedTryOnModel(user.id, result.payload.generationId, definition);
  assert.equal(saved.id, stored.id);
  assert.equal(requests.length, calls);
  assert.equal(balance(user), before - quotedCredits);
  assert.equal(models.listPrivateTryOnModels(stranger.id).length, 0);
  assert.throws(() => models.saveGeneratedTryOnModel(stranger.id, result.payload.generationId, definition), { code: 'MODEL_GENERATION_NOT_FOUND' });
  const asset = media.getAccessibleAsset(user.id, stored.id);
  assert.equal(asset.visibility, 'private');
  assert.match(stored.imageUrl, /\/api\/assets\/file/);
  // Simulate the normal generation asset index rebuilding its metadata.
  db.getDb().prepare('UPDATE assets SET metadata_json = ? WHERE id = ?').run(JSON.stringify({ generationId: result.payload.generationId, quality: 'low' }), stored.id);
  assert.equal(models.listPrivateTryOnModels(user.id)[0].id, stored.id);
  models.validatePrivateTryOnReference(user.id, { kind: 'clothing-try-on', modelSource: 'custom', modelId: stored.id }, [{ assetId: 'garment' }, { assetId: stored.id }]);
});

test('uploaded adult models stay private and removal preserves the original asset', async () => {
  const user = actor();
  const noConsent = await invoke(modelHandler, user, { imageDataUrl: `data:image/png;base64,${output.toString('base64')}`, definition, adultConfirmed: false });
  assert.equal(noConsent.payload.error, 'ADULT_MODEL_CONFIRMATION_REQUIRED');
  const uploaded = await invoke(modelHandler, user, { imageDataUrl: `data:image/png;base64,${output.toString('base64')}`, definition, adultConfirmed: true });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.payload.model.generated, false);
  const other = actor();
  const references = [{ assetId: 'garment' }, { assetId: uploaded.payload.model.id }];
  models.validatePrivateTryOnReference(user.id, { kind: 'clothing-try-on', modelSource: 'custom', modelId: uploaded.payload.model.id }, references);
  assert.throws(() => models.validatePrivateTryOnReference(other.id, { kind: 'clothing-try-on', modelSource: 'custom', modelId: uploaded.payload.model.id }, references), { code: 'TRY_ON_MODEL_NOT_FOUND' });
  assert.throws(() => models.validatePrivateTryOnReference(user.id, { kind: 'clothing-try-on', modelSource: 'custom', modelId: uploaded.payload.model.id }, references.toReversed()), { code: 'TRY_ON_MODEL_NOT_FOUND' });
  assert.throws(() => models.validatePrivateTryOnReference(user.id, { kind: 'clothing-try-on', modelSource: 'custom', modelId: uploaded.payload.model.id }, [{ assetId: 'garment' }, { assetId: 'another-photo' }]), { code: 'TRY_ON_MODEL_NOT_FOUND' });
  const removal = await invoke(modelHandler, user, { modelId: uploaded.payload.model.id }, 'DELETE');
  assert.equal(removal.status, 200);
  assert.equal(models.listPrivateTryOnModels(user.id).length, 0);
  assert.ok(media.getAccessibleAsset(user.id, uploaded.payload.model.id, { includeDeleted: false }));
});

test('try-on immediate generation sends garment first, model second, charges the server quote and preserves the workflow in retries', async () => {
  const user = actor();
  const uploaded = await models.uploadPrivateTryOnModel(user.id, { bytes: output, mimeType: 'image/png', definition, adultConfirmed: true });
  const garmentBytes = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#123456' } }).png().toBuffer();
  const workflow = { kind: 'clothing-try-on', referenceOrder: TRY_ON_REFERENCE_ORDER, adultConfirmed: true, modelSource: 'custom', modelId: uploaded.id, modelName: uploaded.name, garmentName: '衣服.png', garmentType: 'top', notes: '保留背景' };
  const request = { clientTaskId: `try-on-test-${++sequence}`, providerId: image2.id, prompt: buildClothingTryOnPrompt(workflow), quality: 'low', size: '1024x1536', count: 1,
    studioWorkflow: workflow, references: [{ imageDataUrl: `data:image/png;base64,${garmentBytes.toString('base64')}` }, { assetId: uploaded.id }] };
  const before = balance(user);
  const quote = await invoke(pricingHandler, user, { ...request, referenceCount: 2 });
  const quotedCredits = quote.payload.quotes[0].pricing.credits;
  const result = await invoke(generate, user, request);
  assert.equal(result.status, 200);
  assert.equal(result.payload.referencesUsed, 2);
  const body = requests.at(-1);
  assert.equal(body.images[0].image_url, request.references[0].imageDataUrl);
  assert.equal(body.images[1].image_url, `data:image/png;base64,${output.toString('base64')}`);
  assert.match(body.prompt, /REFERENCE 1 is the GARMENT PRODUCT/);
  assert.match(body.prompt, /REFERENCE 2 is the ADULT MODEL/);
  assert.doesNotMatch(body.prompt, /This is the primary subject image and the default editing target/);
  assert.equal(balance(user), before - quotedCredits);
  const task = queue.createFreeGenerationTask(user.id, { ...request, clientTaskId: `retry-${++sequence}` });
  assert.deepEqual(queue.getFreeGenerationTask(user.id, task.id, { includeRequest: true }).request.references, request.references);
  queue.completeFreeGenerationTask(user.id, task.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
  const redo = queue.buildFreeGenerationRedoRequest(user.id, task.id);
  assert.deepEqual(redo.studioWorkflow, workflow);
  assert.deepEqual(redo.references, request.references);
  // Duplicate photo references collapse to one; reject rather than drop a role.
  const duplicate = await invoke(generate, user, { ...request, clientTaskId: `duplicate-${++sequence}`, references: [{ assetId: uploaded.id }, { assetId: uploaded.id }] });
  assert.equal(duplicate.payload.error, 'TRY_ON_TWO_REFERENCES_REQUIRED');
  // A private model cannot silently occupy the garment slot in a new request.
  const calls = requests.length;
  const misplaced = await invoke(generate, user, { ...request, clientTaskId: `misplaced-${++sequence}`, references: request.references.toReversed() });
  assert.equal(misplaced.payload.error, 'TRY_ON_MODEL_NOT_FOUND');
  assert.equal(requests.length, calls);
});

test('legacy stored tasks and their retries migrate to garment first, model second without modifying the source snapshot', async () => {
  const user = actor();
  const model = await models.uploadPrivateTryOnModel(user.id, { bytes: output, mimeType: 'image/png', definition, adultConfirmed: true });
  const garment = await media.createUploadedAsset(user.id, { bytes: await sharp({ create: { width: 96, height: 64, channels: 3, background: '#876543' } }).png().toBuffer(), mimeType: 'image/png', fileName: 'garment.png' });
  const workflow = normalizeClothingStudioWorkflow({ kind: 'clothing-try-on', modelSource: 'custom', modelId: model.id, adultConfirmed: true });
  const request = { clientTaskId: `legacy-${++sequence}`, providerId: image2.id, prompt: buildClothingTryOnPrompt(workflow), quality: 'low', size: '1024x1536', count: 1,
    studioWorkflow: workflow, references: [{ assetId: garment.id }, { assetId: model.id }] };
  const task = queue.createFreeGenerationTask(user.id, request);
  const oldWorkflow = { ...workflow };
  delete oldWorkflow.referenceOrder;
  const snapshot = JSON.stringify({ ...request, prompt: 'Legacy prompt: reference 1 is the model, reference 2 is the garment.', studioWorkflow: oldWorkflow, references: request.references.toReversed() });
  db.getDb().prepare('UPDATE free_generation_tasks SET request_json = ?, prompt = ? WHERE id = ?').run(snapshot, 'Legacy prompt', task.id);
  const claimedRequest = queue.getFreeGenerationTask(user.id, task.id, { includeRequest: true }).request;
  assert.deepEqual(claimedRequest.references, request.references);
  assert.equal(claimedRequest.studioWorkflow.referenceOrder, TRY_ON_REFERENCE_ORDER);
  const direct = await invoke(generate, user, claimedRequest);
  assert.equal(direct.status, 200);
  assert.equal(requests.at(-1).images[1].image_url, `data:image/png;base64,${output.toString('base64')}`);
  queue.completeFreeGenerationTask(user.id, task.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
  const redo = queue.buildFreeGenerationRedoRequest(user.id, task.id);
  assert.deepEqual(redo.references, request.references);
  assert.deepEqual(redo.studioWorkflow, workflow);
  assert.match(redo.prompt, /REFERENCE 1 is the GARMENT PRODUCT/);
  assert.equal(db.getDb().prepare('SELECT request_json FROM free_generation_tasks WHERE id = ?').get(task.id).request_json, snapshot);
  const result = await invoke(generate, user, redo);
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).images[1].image_url, `data:image/png;base64,${output.toString('base64')}`);
});

test('queue API and worker keep garment first and the private adult model second', async () => {
  const user = actor();
  const model = await models.uploadPrivateTryOnModel(user.id, { bytes: output, mimeType: 'image/png', definition, adultConfirmed: true });
  const garmentBytes = await sharp({ create: { width: 64, height: 80, channels: 3, background: '#334455' } }).png().toBuffer();
  const workflow = normalizeClothingStudioWorkflow({ kind: 'clothing-try-on', modelSource: 'custom', modelId: model.id, adultConfirmed: true });
  const references = [{ imageDataUrl: `data:image/png;base64,${garmentBytes.toString('base64')}` }, { assetId: model.id }];
  const queued = await invoke(tasks, user, { clientTaskId: `queued-try-on-${++sequence}`, providerId: image2.id, size: '1024x1536', quality: 'low', count: 1,
    prompt: 'Use the garment on the model', studioWorkflow: workflow, references });
  assert.equal(queued.status, 201);
  assert.equal(queued.payload.task.studioWorkflow.referenceOrder, TRY_ON_REFERENCE_ORDER);
  assert.deepEqual(queue.getFreeGenerationTask(user.id, queued.payload.task.id, { includeRequest: true }).request.references, references);
  const deadline = Date.now() + 5000;
  let task;
  do {
    await new Promise(resolve => setTimeout(resolve, 40));
    task = queue.getFreeGenerationTask(user.id, queued.payload.task.id);
  } while (!['completed', 'failed'].includes(task.status) && Date.now() < deadline);
  assert.equal(task.status, 'completed');
  const body = requests.find(item => item.images?.[0]?.image_url === references[0].imageDataUrl);
  assert.ok(body);
  assert.equal(body.images[1].image_url, `data:image/png;base64,${output.toString('base64')}`);
  assert.match(body.prompt, /REFERENCE 2 is the ADULT MODEL/);
  assert.doesNotMatch(body.prompt, /default editing target/);
});

test('failed try-on releases the shared billing reservation', async () => {
  const user = actor();
  const one = `data:image/png;base64,${output.toString('base64')}`;
  const two = `data:image/png;base64,${(await sharp({ create: { width: 64, height: 64, channels: 3, background: '#445566' } }).png().toBuffer()).toString('base64')}`;
  const workflow = { kind: 'clothing-try-on', referenceOrder: TRY_ON_REFERENCE_ORDER, adultConfirmed: true, modelSource: 'system', modelId: 'female-01' };
  const before = balance(user);
  nextStatus = 503;
  try {
    const result = await invoke(generate, user, { prompt: buildClothingTryOnPrompt(workflow), studioWorkflow: workflow, providerId: image2.id,
      size: '1024x1024', quality: 'low', count: 1, references: [{ imageDataUrl: two }, { imageDataUrl: one }] });
    assert.equal(result.payload.ok, false);
    assert.equal(balance(user), before);
    assert.equal(db.getDb().prepare("SELECT COUNT(*) AS count FROM credit_reservations WHERE user_id = ? AND status = 'reserved'").get(user.id).count, 0);
  } finally { nextStatus = 200; }
});

test('queue worker completes a Low model and automatically restores it to the private picker', async () => {
  const user = actor();
  const queued = await invoke(tasks, user, modelRequest());
  assert.equal(queued.status, 201);
  assert.equal(queued.payload.task.studioWorkflow.kind, 'model-creation');
  const deadline = Date.now() + 5000;
  let task;
  do {
    await new Promise(resolve => setTimeout(resolve, 40));
    task = queue.getFreeGenerationTask(user.id, queued.payload.task.id);
  } while (!['completed', 'failed'].includes(task.status) && Date.now() < deadline);
  assert.equal(task.status, 'completed');
  assert.equal(task.quality, 'low');
  assert.equal(models.listPrivateTryOnModels(user.id).length, 1);
  assert.equal(requests.at(-1).quality, 'low');
  const redo = queue.buildFreeGenerationRedoRequest(user.id, task.id);
  assert.equal(redo.quality, 'low');
  assert.deepEqual(redo.studioWorkflow.definition.name, definition.name);
});
