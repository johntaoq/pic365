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

const [localDb, { default: tasksHandler }, ecommerceWorker] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/ecommerce/tasks.js'),
  import('../server/ecommerce-generation-worker.js')
]);

after(async () => {
  await ecommerceWorker.stopEcommerceGenerationWorker();
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(token, body) {
  let statusCode = 200;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(tasksHandler({
    method: 'POST',
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
});
