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

test('redo preserves the original prompt, references, provider, size, quality, and count', () => {
  const user = createTestUser('queue-redo');
  const originalRequest = {
    ...taskRequest(77),
    prompt: 'repair the marked logo only',
    size: '1536x1024',
    quality: 'high',
    count: 3,
    providerId: 'provider-redo',
    references: [{
      generationId: 'reference-generation-1',
      annotations: [{ type: 'rectangle', x1: 0.1, y1: 0.2, x2: 0.4, y2: 0.5 }]
    }]
  };
  const original = queue.createFreeGenerationTask(user.id, originalRequest);
  queue.completeFreeGenerationTask(user.id, original.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
  assert.equal(queue.getFreeGenerationTask(user.id, original.id).redoAvailable, true);

  const redoRequest = queue.buildFreeGenerationRedoRequest(user.id, original.id);
  assert.equal(redoRequest.prompt, originalRequest.prompt);
  assert.equal(redoRequest.size, originalRequest.size);
  assert.equal(redoRequest.quality, originalRequest.quality);
  assert.equal(redoRequest.count, originalRequest.count);
  assert.equal(redoRequest.providerId, originalRequest.providerId);
  assert.deepEqual(redoRequest.references, originalRequest.references);

  const redo = queue.createFreeGenerationTask(user.id, redoRequest);
  const storedRedo = queue.getFreeGenerationTask(user.id, redo.id, { includeRequest: true });
  assert.equal(storedRedo.status, 'queued');
  assert.equal(storedRedo.request.prompt, originalRequest.prompt);
  assert.deepEqual(storedRedo.request.references, originalRequest.references);
});

test('batch repair tasks are created atomically with source metadata and preflight failures do not run', () => {
  const user = createTestUser('queue-batch-repair');
  const batchId = `batch-${Date.now()}`;
  const requests = [0, 1, 2].map((index) => ({
    ...taskRequest(index),
    taskMode: 'batch-repair',
    batchId,
    batchIndex: index,
    sourceName: `source-${index}.png`,
    sourceWidth: 1279 + index,
    sourceHeight: 2275 + index,
    sourceThumbnail: `data:image/webp;base64,thumb-${index}`,
    references: index === 2 ? [] : [{ clientId: `source-${index}`, imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }],
    ...(index === 2 ? { preflightError: 'PROVIDER_SOURCE_SIZE_UNSUPPORTED' } : {})
  }));
  const tasks = queue.createFreeGenerationTasks(user.id, requests);
  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].taskMode, 'batch-repair');
  assert.equal(tasks[0].batchId, batchId);
  assert.equal(tasks[0].batchIndex, 0);
  assert.equal(tasks[0].sourceName, 'source-0.png');
  assert.equal(tasks[0].sourceWidth, 1279);
  assert.equal(tasks[0].sourceHeight, 2275);
  assert.match(tasks[0].sourceThumbnail, /^data:image\/webp/);
  const storedBatch = queue.getFreeGenerationTask(user.id, tasks[0].id, { includeRequest: true });
  assert.equal(storedBatch.request.sourceName, 'source-0.png');
  assert.equal(storedBatch.request.sourceWidth, 1279);
  assert.equal(storedBatch.request.sourceHeight, 2275);
  assert.equal(tasks[2].status, 'failed');
  assert.equal(tasks[2].error, 'PROVIDER_SOURCE_SIZE_UNSUPPORTED');

  const claimed = queue.claimFreeGenerationTasks(12).filter((task) => task.userId === user.id);
  assert.equal(claimed.length, 2);
  assert.equal(claimed.some((task) => task.id === tasks[2].id), false);
});

test('batch repair capacity is all-or-nothing', () => {
  const user = createTestUser('queue-batch-capacity');
  for (let index = 0; index < 19; index += 1) queue.createFreeGenerationTask(user.id, taskRequest(index));
  assert.throws(
    () => queue.createFreeGenerationTasks(user.id, [taskRequest(30), taskRequest(31)]),
    (error) => error?.code === 'TASK_LIST_FULL'
  );
  assert.equal(queue.listFreeGenerationTasks(user.id).length, 19);
});
