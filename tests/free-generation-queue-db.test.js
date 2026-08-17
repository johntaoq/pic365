import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-free-queue-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');

const localDb = await import('../api/_lib/local-db.js');
const queue = await import('../api/_lib/free-generation-queue.js');

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function createTestUser(label) {
  const user = localDb.createUser({
    email: `${label}-${Date.now()}-${Math.random()}@example.com`,
    password: 'testing-1234',
    fullName: label
  });
  localDb.getDb().prepare('UPDATE users SET credit_balance = 1000 WHERE id = ?').run(user.id);
  return user;
}

function taskRequest(index = 0) {
  return {
    clientTaskId: `queue-${Date.now()}-${index}-${Math.random()}`,
    prompt: `queued image ${index}`,
    size: '1024x1024',
    quality: 'low',
    count: 1,
    providerId: 'provider-test',
    references: []
  };
}

test('free generation tasks persist, enforce 20 records, and require deletion to free capacity', () => {
  const user = createTestUser('queue-capacity');
  const created = Array.from({ length: 20 }, (_, index) => queue.createFreeGenerationTask(user.id, taskRequest(index)));
  assert.equal(queue.listFreeGenerationTasks(user.id).length, 20);
  assert.throws(() => queue.createFreeGenerationTask(user.id, taskRequest(21)), (error) => error?.code === 'TASK_LIST_FULL');

  const cancelled = queue.requestFreeGenerationTaskCancellation(user.id, created[0].id);
  assert.equal(cancelled.status, 'cancelled');
  queue.deleteFreeGenerationTask(user.id, created[0].id);
  assert.equal(queue.listFreeGenerationTasks(user.id).length, 19);
  assert.equal(queue.createFreeGenerationTask(user.id, taskRequest(22)).status, 'queued');
});

test('queue claiming never runs more than three tasks for one user', () => {
  const user = createTestUser('queue-concurrency');
  for (let index = 0; index < 6; index += 1) queue.createFreeGenerationTask(user.id, taskRequest(index));
  const first = queue.claimFreeGenerationTasks(12);
  assert.equal(first.filter((task) => task.userId === user.id).length, 3);
  const second = queue.claimFreeGenerationTasks(12);
  assert.equal(second.filter((task) => task.userId === user.id).length, 0);

  const owned = first.find((task) => task.userId === user.id);
  queue.completeFreeGenerationTask(user.id, owned.id, { status: 'completed', result: { ok: true, images: [] } });
  const third = queue.claimFreeGenerationTasks(12);
  assert.equal(third.filter((task) => task.userId === user.id).length, 1);
});

test('completed task results survive reload and active tasks cannot be deleted', () => {
  const user = createTestUser('queue-results');
  const created = queue.createFreeGenerationTask(user.id, taskRequest(1));
  assert.throws(() => queue.deleteFreeGenerationTask(user.id, created.id), (error) => error?.code === 'TASK_ACTIVE');
  const [claimed] = queue.claimFreeGenerationTasks(1);
  queue.completeFreeGenerationTask(user.id, claimed.id, {
    status: 'completed',
    result: {
      ok: true,
      images: [{ generationId: 'generation-1', image: '/api/generated?id=generation-1', size: '1024x1024', quality: 'low', downloadAllowed: true }]
    }
  });
  const reloaded = queue.getFreeGenerationTask(user.id, created.id);
  assert.equal(reloaded.status, 'completed');
  assert.equal(reloaded.results.length, 1);
  assert.equal(reloaded.results[0].generationId, 'generation-1');
  assert.equal(queue.deleteFreeGenerationTask(user.id, created.id).id, created.id);
});
