import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-generation-prompt-privacy-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');

const [localDb, { default: generationsHandler }, { default: ecommerceOutputsHandler }] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/generations.js'),
  import('../api/ecommerce/outputs.js')
]);

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, { token, query = {}, method = 'GET', requestBody } = {}) {
  let statusCode = 200;
  let body;
  const headers = {};
  const res = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return payload;
    },
    end(payload = '') {
      body = payload;
      return payload;
    }
  };
  return Promise.resolve(handler({
    method,
    query,
    body: requestBody,
    headers: {
      authorization: `Bearer ${token}`,
      ...(requestBody === undefined ? {} : { 'content-type': 'application/json' })
    }
  }, res)).then(() => ({ statusCode, headers, body }));
}

test('ordinary users can see free prompts but not ecommerce system prompts', async () => {
  const user = localDb.createUser({
    email: 'prompt-privacy@example.com',
    password: 'testing-1234',
    fullName: 'Prompt Privacy'
  });
  const session = localDb.createSession(user.id);
  const project = localDb.createEcommerceProject(user.id, {
    projectName: 'Private system prompt project',
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
    selectedSlots: ['comparison']
  });
  const timestamp = new Date().toISOString();
  localDb.getDb().prepare(`
    INSERT INTO generations
      (id, user_id, project_id, slot_id, prompt, model, size, quality, provider, status, storage_path, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, 'gpt-image-2', '1024x1024', 'medium', 'test', 'succeeded', ?, ?, ?)
  `).run('ecommerce-generation', user.id, project.id, 'comparison', 'SECRET SYSTEM ECOMMERCE PROMPT', 'private/ecommerce.png', timestamp, timestamp);
  localDb.getDb().prepare(`
    INSERT INTO generations
      (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at, completed_at)
    VALUES (?, ?, ?, 'gpt-image-2', '1024x1024', 'medium', 'test', 'succeeded', ?, ?, ?)
  `).run('free-generation', user.id, 'MY FREE WORKSHOP PROMPT', 'private/free.png', timestamp, timestamp);

  const history = await invoke(generationsHandler, { token: session.token, query: { limit: 10 } });
  assert.equal(history.statusCode, 200);
  const ecommerceItem = history.body.generations.find((item) => item.id === 'ecommerce-generation');
  const freeItem = history.body.generations.find((item) => item.id === 'free-generation');
  assert.equal(ecommerceItem.prompt, '');
  assert.equal(ecommerceItem.promptHidden, true);
  assert.equal(ecommerceItem.sourceType, 'ecommerce');
  assert.equal(freeItem.prompt, 'MY FREE WORKSHOP PROMPT');
  assert.equal(freeItem.promptHidden, false);
  assert.equal(freeItem.sourceType, 'free');

  const projectOutputs = await invoke(ecommerceOutputsHandler, {
    token: session.token,
    query: { projectId: project.id }
  });
  assert.equal(projectOutputs.statusCode, 200);
  assert.equal(projectOutputs.body.generations[0].prompt, '');
  assert.equal(projectOutputs.body.generations[0].promptHidden, true);

  localDb.getDb().prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(user.id);
  const adminHistory = await invoke(generationsHandler, { token: session.token, query: { limit: 10 } });
  assert.equal(adminHistory.body.generations.find((item) => item.id === 'ecommerce-generation').prompt, 'SECRET SYSTEM ECOMMERCE PROMPT');
  const adminOutputs = await invoke(ecommerceOutputsHandler, {
    token: session.token,
    query: { projectId: project.id }
  });
  assert.equal(adminOutputs.body.generations[0].prompt, 'SECRET SYSTEM ECOMMERCE PROMPT');
  assert.equal(adminOutputs.body.generations[0].promptHidden, false);

  const deleteOne = await invoke(generationsHandler, {
    token: session.token,
    method: 'DELETE',
    requestBody: { generationId: 'free-generation' }
  });
  assert.equal(deleteOne.statusCode, 200);
  assert.equal(deleteOne.body.removed, 1);
  assert.equal(localDb.getGeneration(user.id, 'free-generation').storage_path, 'private/free.png');
  const historyAfterDelete = await invoke(generationsHandler, { token: session.token, query: { limit: 10 } });
  assert.equal(historyAfterDelete.body.generations.some((item) => item.id === 'free-generation'), false);
  assert.equal(historyAfterDelete.body.generations.some((item) => item.id === 'ecommerce-generation'), true);

  const clearAll = await invoke(generationsHandler, {
    token: session.token,
    method: 'DELETE',
    requestBody: { all: true }
  });
  assert.equal(clearAll.statusCode, 200);
  assert.equal(clearAll.body.removed, 1);
  const historyAfterClear = await invoke(generationsHandler, { token: session.token, query: { limit: 10 } });
  assert.deepEqual(historyAfterClear.body.generations, []);
  const outputsAfterClear = await invoke(ecommerceOutputsHandler, {
    token: session.token,
    query: { projectId: project.id }
  });
  assert.equal(outputsAfterClear.body.generations.some((item) => item.id === 'ecommerce-generation'), true);
});
