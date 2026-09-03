import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-system-groups-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.PROVIDER_CONFIG_SECRET = 'system-groups-provider-secret';
process.env.SESSION_SECRET = 'system-groups-session-secret';
process.env.SUPER_ADMIN_EMAILS = 'system-groups-admin@example.com';
process.env.AI_API_KEY = 'system-groups-image-key';
process.env.AI_BASE_URL = 'https://provider.example';
process.env.AI_IMAGE_MODEL = 'gpt-image-2';

const [
  db,
  chat,
  { default: systemGroupsHandler },
  { default: editUserHandler },
  { default: imageProvidersHandler },
  { default: videoProvidersHandler },
  { default: imagePricingHandler }
] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/chat-engine.js'),
  import('../api/admin/system-groups.js'),
  import('../api/admin/users/edit.js'),
  import('../api/image-providers.js'),
  import('../api/video-providers.js'),
  import('../api/image-pricing.js')
]);

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function sessionHeaders(userId) {
  const session = db.createSession(userId);
  return { cookie: `member_session=${encodeURIComponent(session.token)}` };
}

async function invoke(handler, req = {}) {
  let statusCode = 200;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  await handler({ method: 'GET', headers: {}, query: {}, ...req }, res);
  return { statusCode, payload };
}

test('ordinary users enumerate and use only channels bound to their system group', async () => {
  const admin = db.createUser({ email: 'system-groups-admin@example.com', password: 'testing-1234', fullName: 'Admin' });
  const member = db.createUser({ email: 'system-groups-member@example.com', password: 'testing-1234', fullName: 'Member', initialCredits: 1000 });
  const adminHeaders = sessionHeaders(admin.id);
  const memberHeaders = sessionHeaders(member.id);

  const defaultImage = db.listImageProviderConfigs({ admin: true })[0];
  const restrictedImage = db.saveImageProviderConfig({
    name: 'Restricted image',
    providerType: 'openai-compatible',
    baseUrl: 'https://restricted.example',
    apiKey: 'restricted-key',
    model: 'gpt-image-2',
    enabled: true,
    isDefault: false
  });

  const forbidden = await invoke(systemGroupsHandler, { headers: memberHeaders });
  assert.equal(forbidden.statusCode, 403);

  const created = await invoke(systemGroupsHandler, {
    method: 'POST',
    headers: adminHeaders,
    body: {
      name: '图像专用组',
      description: '只允许指定图片渠道',
      channels: { image: [restrictedImage.id], video: [], chat: [] }
    }
  });
  assert.equal(created.statusCode, 201);
  const groupId = created.payload.group.id;

  const assigned = await invoke(editUserHandler, {
    method: 'PATCH',
    headers: adminHeaders,
    body: { userId: member.id, role: 'user', systemGroupId: groupId }
  });
  assert.equal(assigned.statusCode, 200);
  assert.equal(assigned.payload.user.systemGroupId, groupId);
  assert.equal(assigned.payload.user.systemGroupName, '图像专用组');

  const imageProviders = await invoke(imageProvidersHandler, { headers: memberHeaders });
  assert.deepEqual(imageProviders.payload.providers.map((provider) => provider.id), [restrictedImage.id]);
  const videoProviders = await invoke(videoProvidersHandler, { headers: memberHeaders });
  assert.deepEqual(videoProviders.payload.providers, []);
  assert.equal(chat.getChatProviderConfig('', { includeSecret: false, userId: member.id }), null);
  assert.equal(db.getImageProviderConfig(defaultImage.id, { includeSecret: false, userId: member.id }), null);
  assert.equal(db.getImageProviderConfig(restrictedImage.id, { includeSecret: false, userId: member.id })?.id, restrictedImage.id);
  assert.equal(db.listImageProviderConfigs({ userId: admin.id }).length, 2);

  const deniedQuote = await invoke(imagePricingHandler, {
    headers: memberHeaders,
    query: { providerId: defaultImage.id, size: '1024x1024', quality: 'low' }
  });
  assert.equal(deniedQuote.statusCode, 400);
  const allowedQuote = await invoke(imagePricingHandler, {
    headers: memberHeaders,
    query: { providerId: restrictedImage.id, size: '1024x1024', quality: 'low' }
  });
  assert.equal(allowedQuote.statusCode, 200);

  const deleted = await invoke(systemGroupsHandler, {
    method: 'DELETE', headers: adminHeaders, body: { id: groupId }
  });
  assert.equal(deleted.statusCode, 200);
  assert.equal(db.getUserById(member.id).systemGroupId, db.DEFAULT_SYSTEM_USER_GROUP_ID);
});
