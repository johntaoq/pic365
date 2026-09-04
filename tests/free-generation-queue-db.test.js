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

test('free generation tasks keep 30 records and evict the oldest completed task', () => {
  const user = createTestUser('queue-capacity');
  const created = Array.from({ length: 20 }, (_, index) => queue.createFreeGenerationTask(user.id, taskRequest(index)));
  assert.equal(queue.listFreeGenerationTasks(user.id).length, 20);
  assert.throws(() => queue.createFreeGenerationTask(user.id, taskRequest(21)), (error) => error?.code === 'TASK_ACTIVE_LIMIT');

  for (const task of created) queue.completeFreeGenerationTask(user.id, task.id, { status: 'completed', result: { ok: true, images: [] } });
  for (let index = 20; index < 30; index += 1) queue.createFreeGenerationTask(user.id, taskRequest(index));
  assert.equal(queue.listFreeGenerationTasks(user.id).length, 30);
  const newest = queue.createFreeGenerationTask(user.id, taskRequest(31));
  const retained = queue.listFreeGenerationTasks(user.id);
  assert.equal(retained.length, 30);
  assert.equal(retained.some((task) => task.id === created[0].id), false);
  assert.equal(retained.some((task) => task.id === newest.id), true);
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
    stylePresetId: 'cinematic-photo',
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
  assert.equal(redoRequest.stylePresetId, originalRequest.stylePresetId);
  assert.deepEqual(redoRequest.references, originalRequest.references);

  const redo = queue.createFreeGenerationTask(user.id, redoRequest);
  const storedRedo = queue.getFreeGenerationTask(user.id, redo.id, { includeRequest: true });
  assert.equal(storedRedo.status, 'queued');
  assert.equal(storedRedo.request.prompt, originalRequest.prompt);
  assert.equal(storedRedo.request.stylePresetId, originalRequest.stylePresetId);
  assert.deepEqual(storedRedo.request.references, originalRequest.references);
});

test('canvas retry can reuse the same task node and position', () => {
  const user = createTestUser('canvas-retry-in-place');
  const original = queue.createFreeGenerationTask(user.id, {
    ...taskRequest(91),
    canvasProjectId: 'canvas-project-one',
    canvasParentNodeId: 'canvas-parent-one',
    canvasTaskNodeId: 'canvas-task-node-one',
    canvasDisplayPrompt: '只调整背景',
    canvasReferenceNodeIds: ['canvas-parent-one', 'style-reference'],
    canvasX: 640,
    canvasY: 280
  });
  queue.completeFreeGenerationTask(user.id, original.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
  const retry = queue.buildFreeGenerationRedoRequest(user.id, original.id, {
    clientTaskId: 'canvas-retry-task',
    canvasTaskNodeId: 'canvas-task-node-one',
    canvasX: 640,
    canvasY: 280,
    replaceTaskId: true
  });
  assert.equal(retry.clientTaskId, 'canvas-retry-task');
  assert.equal(retry.canvasTaskNodeId, 'canvas-task-node-one');
  assert.equal(retry.canvasX, 640);
  assert.equal(retry.canvasY, 280);
  assert.equal(retry.canvasDisplayPrompt, '只调整背景');
  assert.deepEqual(retry.canvasReferenceNodeIds, ['canvas-parent-one', 'style-reference']);
  const createdRetry = queue.createFreeGenerationTask(user.id, retry);
  assert.equal(createdRetry.id, 'canvas-retry-task');
  assert.equal(queue.getFreeGenerationTask(user.id, original.id), null);
});

test('task creation rejects reference overflow instead of silently truncating it', () => {
  const user = createTestUser('reference-overflow');
  assert.throws(() => queue.createFreeGenerationTask(user.id, {
    ...taskRequest(92),
    references: Array.from({ length: 10 }, (_, index) => ({ generationId: `reference-${index}` }))
  }), (error) => error?.code === 'TOO_MANY_REFERENCE_IMAGES');
});

test('multi-image task results expose the per-image credits used by canvas comparison', () => {
  const user = createTestUser('canvas-result-credits');
  const task = queue.createFreeGenerationTask(user.id, {
    clientTaskId: 'canvas-result-credits',
    prompt: 'two options',
    size: '1024x1024',
    quality: 'low',
    count: 2,
    providerId: 'provider-test',
    references: []
  });
  queue.completeFreeGenerationTask(user.id, task.id, {
    status: 'completed',
    result: {
      unitCredits: 20,
      images: [
        { generationId: 'credits-one', image: '/api/generated?id=credits-one' },
        { generationId: 'credits-two', image: '/api/generated?id=credits-two' }
      ]
    }
  });
  assert.deepEqual(queue.getFreeGenerationTask(user.id, task.id).results.map((item) => item.creditsCharged), [20, 20]);
});

test('IC-AT-008 canvas task metadata survives queue reload for project recovery', () => {
  const user = createTestUser('canvas-task-recovery');
  const task = queue.createFreeGenerationTask(user.id, {
    ...taskRequest(91),
    canvasProjectId: 'canvas-project-one',
    canvasParentNodeId: 'canvas-parent-one',
    canvasTaskNodeId: 'canvas-task-node-one',
    canvasDisplayPrompt: '仅显示这一句用户输入',
    canvasX: 640,
    canvasY: -120
  });
  assert.equal(task.canvasProjectId, 'canvas-project-one');
  assert.equal(task.canvasParentNodeId, 'canvas-parent-one');
  assert.equal(task.canvasTaskNodeId, 'canvas-task-node-one');
  assert.equal(task.canvasDisplayPrompt, '仅显示这一句用户输入');
  assert.equal(task.canvasX, 640);
  assert.equal(task.canvasY, -120);

  const restored = queue.listFreeGenerationTasks(user.id).find((item) => item.id === task.id);
  assert.equal(restored.canvasProjectId, 'canvas-project-one');
  assert.equal(restored.canvasTaskNodeId, 'canvas-task-node-one');
  assert.equal(restored.canvasDisplayPrompt, '仅显示这一句用户输入');
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
    preserveSourceSize: index !== 0,
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
  assert.equal(storedBatch.request.preserveSourceSize, false);
  assert.equal(tasks[2].status, 'failed');
  assert.equal(tasks[2].error, 'PROVIDER_SOURCE_SIZE_UNSUPPORTED');

  const claimed = queue.claimFreeGenerationTasks(12).filter((task) => task.userId === user.id);
  assert.equal(claimed.length, 2);
  assert.equal(claimed.some((task) => task.id === tasks[2].id), false);
});

test('batch repair active capacity is all-or-nothing', () => {
  const user = createTestUser('queue-batch-capacity');
  for (let index = 0; index < 19; index += 1) queue.createFreeGenerationTask(user.id, taskRequest(index));
  assert.throws(
    () => queue.createFreeGenerationTasks(user.id, [taskRequest(30), taskRequest(31)]),
    (error) => error?.code === 'TASK_ACTIVE_LIMIT'
  );
  assert.equal(queue.listFreeGenerationTasks(user.id).length, 19);
});
