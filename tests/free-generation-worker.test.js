import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

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
