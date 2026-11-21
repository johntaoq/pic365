import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-ecommerce-task-provider-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.PROVIDER_CONFIG_SECRET = 'ecommerce-task-provider-test-secret';
process.env.AI_API_KEY = 'sk-test-default-provider';
process.env.AI_BASE_URL = 'https://provider.example.invalid';
process.env.AI_IMAGE_MODEL = 'gpt-image-2';
process.env.SUPER_ADMIN_EMAILS = 'provider-admin@example.com';

const [localDb, { default: tasksHandler }, ecommerceWorker, p1Db, { default: adminProvidersHandler }] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/ecommerce/tasks.js'),
  import('../server/ecommerce-generation-worker.js'),
  import('../api/_lib/ecommerce-p1-db.js'),
  import('../api/admin/image-providers.js')
]);

after(async () => {
  await ecommerceWorker.stopEcommerceGenerationWorker();
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(token, body, handler = tasksHandler, method = 'POST') {
  let statusCode = 200;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(handler({
    method,
    headers: { authorization: `Bearer ${token}` },
    query: {},
    body
  }, res)).then(() => ({ statusCode, payload }));
}

test('task creation persists the explicitly selected provider for a legacy project', async () => {
  const user = localDb.createUser({
    email: 'provider-task@example.com',
    password: 'testing-1234',
    fullName: 'Provider Task'
  });
  const session = localDb.createSession(user.id);
  localDb.getImageProviderConfig('', { includeSecret: false });
  const provider = localDb.saveImageProviderConfig({
    name: 'Second image service',
    providerType: 'openai-compatible',
    baseUrl: 'https://second-provider.example.invalid',
    apiKey: 'sk-test-second-provider',
    model: 'gpt-image-2',
    enabled: true,
    isDefault: false
  });
  const defaultGroup = localDb.getSystemUserGroup(localDb.DEFAULT_SYSTEM_USER_GROUP_ID);
  localDb.saveSystemUserGroup({
    ...defaultGroup,
    channels: {
      ...defaultGroup.channels,
      image: [...defaultGroup.channels.image, provider.id]
    }
  });
  const project = localDb.createEcommerceProject(user.id, {
    projectName: 'Legacy provider project',
    platformId: 'douyin',
    industryId: 'general',
    productName: 'Test product',
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
    imageProviderId: '',
    selectedSlots: ['detail-closeup']
  });

  const result = await invoke(session.token, {
    projectId: project.id,
    providerId: provider.id,
    requests: [{ id: 'provider-task-1', slotId: 'detail-closeup', quality: 'medium' }]
  });
  await ecommerceWorker.stopEcommerceGenerationWorker();

  assert.equal(result.statusCode, 201);
  assert.equal(result.payload.ok, true);
  assert.equal(localDb.getEcommerceProject(user.id, project.id).imageProviderId, provider.id);
  assert.equal(result.payload.tasks[0].request.projectUpdatedAt, localDb.getEcommerceProject(user.id, project.id).updatedAt);

  const original = result.payload.tasks[0];
  p1Db.completeEcommerceGenerationTask(user.id, original.id, { status: 'failed', errorCode: 'GENERATION_FAILED' });
  const retry = await invoke(session.token, { action: 'retry', taskId: original.id });
  await ecommerceWorker.stopEcommerceGenerationWorker();
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.payload.task.status, 'queued');
  assert.notEqual(retry.payload.task.id, original.id);
  assert.equal(retry.payload.task.request.retryOfTaskId, original.id);

  const sameRetry = await invoke(session.token, { action: 'retry', taskId: original.id });
  await ecommerceWorker.stopEcommerceGenerationWorker();
  assert.equal(sameRetry.statusCode, 200);
  assert.equal(sameRetry.payload.task.id, retry.payload.task.id);
  assert.equal(p1Db.getEcommerceGenerationTask(user.id, original.id).status, 'failed');
});

test('an admin can delete a channel in use without migrating projects or disturbing image history', async (t) => {
  const admin = localDb.createUser({ email: 'provider-admin@example.com', password: 'testing-1234', fullName: 'Admin' });
  const user = localDb.createUser({ email: 'provider-owner@example.com', password: 'testing-1234', fullName: 'Project owner', initialCredits: 100 });
  const adminToken = localDb.createSession(admin.id).token;
  const ownerToken = localDb.createSession(user.id).token;
  const alternative = localDb.getImageProviderConfig('', { includeSecret: false });
  const oldProvider = localDb.saveImageProviderConfig({
    name: 'Service to retire',
    providerType: 'openai-compatible',
    baseUrl: 'https://retired-provider.example.invalid',
    apiKey: 'test-only',
    model: 'gpt-image-2',
    enabled: true,
    isDefault: true
  });
  const defaultGroup = localDb.getSystemUserGroup(localDb.DEFAULT_SYSTEM_USER_GROUP_ID);
  localDb.saveSystemUserGroup({
    ...defaultGroup,
    channels: { ...defaultGroup.channels, image: [...new Set([...defaultGroup.channels.image, oldProvider.id, alternative.id])] }
  });
  const project = localDb.createEcommerceProject(user.id, {
    projectName: 'Existing product',
    productName: 'Test product',
    platformId: 'douyin',
    industryId: 'general',
    brandName: '',
    specifications: '',
    prohibitedContent: '',
    visualStyleId: 'clean-commercial',
    imageProviderId: oldProvider.id,
    selectedSlots: ['detail-closeup']
  });
  const reservation = localDb.reserveCredit(user.id, { prompt: 'Already generated fixture' });
  const imageId = localDb.createGeneration({
    userId: user.id, reservationId: reservation.reservationId, caseId: null, projectId: project.id, slotId: 'detail-closeup',
    prompt: 'Already generated fixture', model: oldProvider.model, size: '1024x1024', quality: 'low', provider: oldProvider.name
  });
  localDb.updateGeneration(imageId, { status: 'succeeded', storage_path: 'generated/test.png' });
  localDb.completeCreditReservation(reservation.reservationId);
  const imageBefore = localDb.getGeneration(user.id, imageId);
  const balanceBefore = localDb.getUserProfile(user.id).creditBalance;
  const upstream = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected upstream request'); });

  assert.equal((await invoke(ownerToken, { id: oldProvider.id }, adminProvidersHandler, 'DELETE')).statusCode, 403);
  const removed = await invoke(adminToken, { id: oldProvider.id }, adminProvidersHandler, 'DELETE');
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.payload.provider.id, oldProvider.id);
  assert.ok(!localDb.listImageProviderConfigs({ admin: true }).some((provider) => provider.id === oldProvider.id));
  assert.ok(!localDb.getSystemUserGroup(defaultGroup.id).channels.image.includes(oldProvider.id));
  assert.ok(localDb.getImageProviderConfig('', { includeSecret: false, userId: user.id }));
  assert.deepEqual(localDb.getEcommerceProject(user.id, project.id), project);
  assert.deepEqual(localDb.getGeneration(user.id, imageId), imageBefore);

  for (const providerId of [undefined, oldProvider.id]) {
    const result = await invoke(ownerToken, {
      projectId: project.id, providerId, requests: [{ slotId: 'detail-closeup' }]
    });
    assert.equal(result.statusCode, 400);
    assert.equal(result.payload.error, 'AI_PROVIDER_NOT_CONFIGURED');
  }
  assert.equal(p1Db.listEcommerceGenerationTasks(user.id, project.id).length, 0);
  assert.equal(localDb.getUserProfile(user.id).creditBalance, balanceBefore);
  assert.equal(upstream.mock.callCount(), 0);

  const selected = await invoke(ownerToken, {
    projectId: project.id, providerId: alternative.id, requests: [{ slotId: 'detail-closeup' }]
  });
  await ecommerceWorker.stopEcommerceGenerationWorker();
  assert.equal(selected.statusCode, 201);
  assert.equal(localDb.getEcommerceProject(user.id, project.id).imageProviderId, alternative.id);
  assert.equal(upstream.mock.callCount(), 0);
});
