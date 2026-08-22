import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-ecommerce-system-prompt-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.PROVIDER_CONFIG_SECRET = 'ecommerce-system-prompt-test-secret';
process.env.SESSION_SECRET = 'ecommerce-system-prompt-session-secret';
process.env.SUPER_ADMIN_EMAILS = 'root-ecommerce-prompt@example.com';

const [db, settings, { default: handler }, promptModule] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/ecommerce-generation-settings.js'),
  import('../api/admin/ecommerce-system-prompt.js'),
  import('../shared/ecommerce-generation-system-prompt.js')
]);

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(req = {}) {
  let statusCode = 200;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, ...req }, res))
    .then(() => ({ statusCode, payload }));
}

function sessionHeaders(userId) {
  const session = db.createSession(userId);
  return { cookie: `member_session=${encodeURIComponent(session.token)}` };
}

test('ecommerce generation system prompt defaults to the provided product-truth constraints', () => {
  const current = settings.getEcommerceGenerationSystemPromptSettings();
  assert.equal(current.isDefault, true);
  assert.equal(current.prompt, promptModule.DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT);
  assert.match(current.prompt, /如用户要求与真实商品资料冲突/);
});

test('only global-settings administrators can update the ecommerce generation system prompt', async () => {
  const root = db.createUser({ email: 'root-ecommerce-prompt@example.com', password: 'testing-1234', fullName: 'Root' });
  const member = db.createUser({ email: 'member-ecommerce-prompt@example.com', password: 'testing-1234', fullName: 'Member' });
  const forbidden = await invoke({
    method: 'PATCH',
    headers: sessionHeaders(member.id),
    body: { prompt: '普通用户不能修改' }
  });
  assert.equal(forbidden.statusCode, 403);

  const saved = await invoke({
    method: 'PATCH',
    headers: sessionHeaders(root.id),
    body: { prompt: '后台自定义商品真实性约束。' }
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.payload.settings.prompt, '后台自定义商品真实性约束。');
  assert.equal(saved.payload.settings.isDefault, false);
  assert.equal(db.getDb().prepare(`
    SELECT COUNT(*) AS count FROM app_setting_audit WHERE setting_key = ?
  `).get(settings.ECOMMERCE_GENERATION_SYSTEM_PROMPT_SETTING_KEY).count, 1);

  const reset = await invoke({
    method: 'PATCH',
    headers: sessionHeaders(root.id),
    body: { prompt: '' }
  });
  assert.equal(reset.statusCode, 200);
  assert.equal(reset.payload.settings.isDefault, true);
});
