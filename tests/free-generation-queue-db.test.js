import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';
import { expandSharedTaskReferences } from '../shared/generation-task-references.js';

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

test('completed task results expose cache-busted canonical thumbnails and previews while keeping the original', () => {
  const user = createTestUser('preview-urls');
  const task = queue.createFreeGenerationTask(user.id, taskRequest());
  queue.completeFreeGenerationTask(user.id, task.id, { status: 'completed', result: {
    image: '/api/generated?id=preview-result', generationId: 'preview-result',
    thumbnailUrl: '/api/generated?id=preview-result&variant=thumbnail', downloadAllowed: true
  } });
  const result = queue.listFreeGenerationTasks(user.id)[0].results[0];
  assert.equal(result.imageUrl, '/api/generated?id=preview-result');
  assert.equal(result.thumbnailUrl, '/api/generated?id=preview-result&variant=thumb&v=v3');
  assert.equal(result.previewUrl, '/api/generated?id=preview-result&variant=preview&v=v3');
  assert.equal(result.downloadAllowed, true);
});

test('task polling reads cached metadata instead of large inline references and lazily repairs old rows once', () => {
  const user = createTestUser('lightweight-poll');
  const task = queue.createFreeGenerationTask(user.id, { ...taskRequest(), canvasProjectId: 'cached-project',
    references: [{ imageDataUrl: `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024)}` }] });
  const connection = localDb.getDb();
  const summary = connection.prepare('SELECT summary_json FROM free_generation_tasks WHERE id = ?').get(task.id).summary_json;
  assert.ok(summary.length < 1000);
  assert.equal(summary.includes('imageDataUrl'), false);
  const prepare = connection.prepare;
  const queries = [];
  connection.prepare = function (sql) { queries.push(sql); return prepare.call(this, sql); };
  try {
    const tasks = queue.listFreeGenerationTasks(user.id);
    assert.equal(tasks[0].canvasProjectId, 'cached-project');
    const listSql = queries.find((sql) => sql.includes('SELECT id, user_id, status'));
    assert.ok(listSql);
    assert.equal(listSql.includes('request_json'), false);
    assert.equal(JSON.stringify(tasks).includes('imageDataUrl'), false);
    connection.prepare("UPDATE free_generation_tasks SET summary_json = '' WHERE id = ?").run(task.id);
    queue.listFreeGenerationTasks(user.id);
    assert.notEqual(connection.prepare('SELECT summary_json FROM free_generation_tasks WHERE id = ?').get(task.id).summary_json, '');
    queue.completeFreeGenerationTask(user.id, task.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
    assert.equal(queue.buildFreeGenerationRedoRequest(user.id, task.id).references[0].imageDataUrl.length > 2 * 1024 * 1024, true);
  } finally { connection.prepare = prepare; }
});

test('commerce batches persist three shared products and each sample as independent retryable queue tasks', () => {
  const user = createTestUser('commerce-shared');
  const shared = [{ assetId: 'primary' }, { assetId: 'side' }, { assetId: 'detail' }];
  const requests = expandSharedTaskReferences(['low', 'medium', 'high'].map((quality, index) => ({
    ...taskRequest(index), quality, batchId: 'layout-shared', batchIndex: index,
    layoutProductReferenceCount: 3,
    references: [{ imageDataUrl: `data:image/jpeg;base64,sample${index}`, clientId: `sample-${index}` }]
  })), shared);
  const created = queue.createFreeGenerationTasks(user.id, requests);
  assert.equal(created.length, 3);
  for (const [index, task] of created.entries()) {
    assert.equal(task.status, 'queued');
    const restored = queue.getFreeGenerationTask(user.id, task.id, { includeRequest: true });
    assert.deepEqual(restored.request.references, requests[index].references);
    assert.equal(restored.request.references.length, 4);
    assert.equal(restored.request.quality, requests[index].quality);
    assert.equal(restored.request.layoutProductReferenceCount, 3);
    queue.completeFreeGenerationTask(user.id, task.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
    const redo = queue.buildFreeGenerationRedoRequest(user.id, task.id);
    assert.deepEqual(redo.references, requests[index].references);
    assert.equal(redo.layoutProductReferenceCount, 3);
    assert.equal(redo.batchId, 'layout-shared');
  }
});

test('prompt-only first layout keeps its product references and mode across retries', () => {
  const user = createTestUser('commerce-prompt-only');
  const products = [{ assetId: 'primary' }, { assetId: 'detail' }];
  const request = {
    ...taskRequest(1), batchId: 'layout-prompt-only', layoutId: 'single-frame',
    layoutProductReferenceCount: products.length, references: products
  };
  const task = queue.createFreeGenerationTask(user.id, request);
  const stored = queue.getFreeGenerationTask(user.id, task.id, { includeRequest: true });
  assert.equal(stored.request.layoutId, 'single-frame');
  assert.equal(stored.layoutId, 'single-frame');
  assert.equal(queue.listFreeGenerationTasks(user.id)[0].layoutId, 'single-frame');
  assert.deepEqual(stored.request.references, products);
  assert.equal(stored.redoAvailable, true);
  queue.completeFreeGenerationTask(user.id, task.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
  const retry = queue.buildFreeGenerationRedoRequest(user.id, task.id);
  assert.equal(retry.layoutId, 'single-frame');
  assert.equal(retry.layoutProductReferenceCount, 2);
  assert.deepEqual(retry.references, products);
  const retried = queue.createFreeGenerationTask(user.id, retry);
  assert.equal(queue.getFreeGenerationTask(user.id, retried.id, { includeRequest: true }).request.references.length, 2);
});

test('second and third prompt-only layouts preserve their mode through queue retry', () => {
  const user = createTestUser('commerce-prompt-only-next');
  const products = [{ assetId: 'primary' }, { assetId: 'detail' }];
  for (const layoutId of ['bottom-band', 'full-bleed-detail']) {
    const task = queue.createFreeGenerationTask(user.id, {
      ...taskRequest(layoutId), batchId: 'layout-prompt-only-next', layoutId,
      layoutProductReferenceCount: products.length, references: products
    });
    const stored = queue.getFreeGenerationTask(user.id, task.id, { includeRequest: true });
    assert.equal(stored.request.layoutId, layoutId);
    assert.equal(stored.request.references.length, 2);
    queue.completeFreeGenerationTask(user.id, task.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
    const retry = queue.buildFreeGenerationRedoRequest(user.id, task.id);
    assert.equal(retry.layoutId, layoutId);
    assert.deepEqual(retry.references, products);
    const retried = queue.createFreeGenerationTask(user.id, retry);
    assert.equal(queue.getFreeGenerationTask(user.id, retried.id, { includeRequest: true }).request.layoutId, layoutId);
  }
});

test('remaining prompt-only layouts persist their mode without a template across retries', () => {
  const user = createTestUser('commerce-prompt-only-rest');
  const products = [{ assetId: 'primary' }, { assetId: 'detail' }];
  for (const layoutId of ['detail-window', 'detail-ribbons', 'icon-rails', 'quad-cards']) {
    const task = queue.createFreeGenerationTask(user.id, {
      ...taskRequest(layoutId), batchId: 'layout-prompt-only-rest', layoutId,
      layoutReferenceMode: 'prompt-only', layoutProductReferenceCount: products.length,
      references: products
    });
    const stored = queue.getFreeGenerationTask(user.id, task.id, { includeRequest: true });
    assert.equal(stored.request.layoutReferenceMode, 'prompt-only');
    assert.deepEqual(stored.request.references, products);
    queue.completeFreeGenerationTask(user.id, task.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
    const retry = queue.buildFreeGenerationRedoRequest(user.id, task.id);
    assert.equal(retry.layoutId, layoutId);
    assert.equal(retry.layoutReferenceMode, 'prompt-only');
    assert.deepEqual(retry.references, products);
  }
});

test('one watermark setting survives independent layout tasks and retries without appearing in task listings', async () => {
  const user = createTestUser('commerce-watermark');
  const image = await sharp({ create: {
    width: 64, height: 24, channels: 4, background: { r: 240, g: 35, b: 35, alpha: 1 }
  } }).png().toBuffer();
  const imageDataUrl = `data:image/png;base64,${image.toString('base64')}`;
  const layoutWatermark = { angle: -45, columns: 4, text: '我的店铺', textImageDataUrl: imageDataUrl, imageDataUrl };
  const requests = ['single-frame', 'bottom-band'].map((layoutId, index) => ({
    ...taskRequest(index), batchId: 'layout-watermarked', batchIndex: index, layoutId,
    layoutReferenceMode: 'prompt-only', layoutProductReferenceCount: 1,
    references: [{ assetId: 'primary' }], layoutWatermark
  }));
  assert.throws(() => queue.createFreeGenerationTasks(user.id, [
    requests[0], { ...requests[1], layoutWatermark: { ...layoutWatermark, text: '图'.repeat(20) } }
  ]), (error) => error.code === 'LAYOUT_WATERMARK_INVALID');
  assert.equal(queue.listFreeGenerationTasks(user.id).length, 0);

  const created = queue.createFreeGenerationTasks(user.id, requests);
  for (const task of created) {
    assert.equal(task.request, undefined);
    assert.equal(task.layoutWatermark, undefined);
    const stored = queue.getFreeGenerationTask(user.id, task.id, { includeRequest: true });
    assert.deepEqual(stored.request.layoutWatermark, layoutWatermark);
    queue.completeFreeGenerationTask(user.id, task.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
    const retry = queue.buildFreeGenerationRedoRequest(user.id, task.id);
    assert.deepEqual(retry.layoutWatermark, layoutWatermark);
    const retried = queue.createFreeGenerationTask(user.id, retry);
    assert.deepEqual(queue.getFreeGenerationTask(user.id, retried.id, { includeRequest: true }).request.layoutWatermark,
      layoutWatermark);
  }
  assert.throws(() => queue.createFreeGenerationTask(user.id, {
    ...taskRequest(33), layoutWatermark
  }), (error) => error.code === 'LAYOUT_WATERMARK_INVALID');
  assert.throws(() => queue.createFreeGenerationTask(user.id, {
    ...requests[0], clientTaskId: 'invalid-watermark-columns',
    layoutWatermark: { ...layoutWatermark, columns: 9 }
  }), (error) => error.code === 'LAYOUT_WATERMARK_INVALID');
});

test('queued image-guided layouts from an older version remain retryable', () => {
  const user = createTestUser('commerce-before-prompt-only');
  const references = [{ assetId: 'primary' }, { imageDataUrl: 'data:image/jpeg;base64,original-template' }];
  const task = queue.createFreeGenerationTask(user.id, {
    ...taskRequest(1), batchId: 'layout-before-prompt-only', layoutId: 'icon-rails',
    layoutProductReferenceCount: 1, references
  });
  assert.equal(queue.getFreeGenerationTask(user.id, task.id).redoAvailable, true);
  queue.completeFreeGenerationTask(user.id, task.id, { status: 'failed', errorCode: 'TEST_FAILURE' });
  const retry = queue.buildFreeGenerationRedoRequest(user.id, task.id);
  assert.deepEqual(retry.references, references);
  assert.equal(retry.layoutId, 'icon-rails');
  assert.equal(retry.layoutReferenceMode, undefined);
});

test('incomplete layout batches are atomic and legacy sample-only tasks cannot be retried', () => {
  const user = createTestUser('layout-reference-guard');
  const valid = {
    ...taskRequest(1), batchId: 'layout-reference-guard', layoutProductReferenceCount: 1,
    references: [{ assetId: 'primary' }, { imageDataUrl: 'data:image/jpeg;base64,sample' }]
  };
  const invalid = { ...valid, clientTaskId: 'layout-missing-product', references: valid.references.slice(1) };
  assert.throws(() => queue.createFreeGenerationTasks(user.id, [valid, invalid]), /LAYOUT_REFERENCES_INCOMPLETE/);
  assert.equal(queue.listFreeGenerationTasks(user.id).length, 0);
  const created = queue.createFreeGenerationTask(user.id, valid);
  queue.completeFreeGenerationTask(user.id, created.id, { status: 'completed', result: { images: [] } });
  const legacyRequest = { ...invalid };
  delete legacyRequest.layoutProductReferenceCount;
  localDb.getDb().prepare('UPDATE free_generation_tasks SET request_json=? WHERE id=?')
    .run(JSON.stringify(legacyRequest), created.id);
  assert.equal(queue.getFreeGenerationTask(user.id, created.id).redoAvailable, false);
  assert.throws(() => queue.buildFreeGenerationRedoRequest(user.id, created.id), /LAYOUT_REFERENCES_INCOMPLETE/);
});
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
  const generationId = `generation-${Date.now()}-${Math.random()}`;
  const storedFileSize = 15 * 1024 * 1024 + 1;
  localDb.getDb().prepare(`
    INSERT INTO generations
      (id, user_id, prompt, model, size, quality, provider, status, storage_path, file_size, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
  `).run(generationId, user.id, 'queued image 1', 'provider-test', '1024x1024', 'low', 'provider-test', 'generated/test.png', storedFileSize, new Date().toISOString(), new Date().toISOString());
  const created = queue.createFreeGenerationTask(user.id, taskRequest(1));
  assert.throws(() => queue.deleteFreeGenerationTask(user.id, created.id), (error) => error?.code === 'TASK_ACTIVE');
  const [claimed] = queue.claimFreeGenerationTasks(1);
  queue.completeFreeGenerationTask(user.id, claimed.id, {
    status: 'completed',
    result: {
      ok: true,
      images: [{ generationId, image: `/api/generated?id=${generationId}`, size: '1024x1024', quality: 'low', downloadAllowed: true }]
    }
  });
  const reloaded = queue.getFreeGenerationTask(user.id, created.id);
  assert.equal(reloaded.status, 'completed');
  assert.equal(reloaded.results.length, 1);
  assert.equal(reloaded.results[0].generationId, generationId);
  assert.equal(reloaded.results[0].fileSize, storedFileSize);
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

test('prompt-only batch tasks retain their batch order without requiring references', () => {
  const user = createTestUser('queue-batch-text-only');
  const batchId = `text-batch-${Date.now()}`;
  const tasks = queue.createFreeGenerationTasks(user.id, [0, 1, 2].map((index) => ({
    ...taskRequest(100 + index),
    batchId,
    batchIndex: index,
    references: []
  })));
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks.map((task) => task.taskMode), ['single', 'single', 'single']);
  assert.deepEqual(tasks.map((task) => task.batchId), [batchId, batchId, batchId]);
  assert.deepEqual(tasks.map((task) => task.batchIndex), [0, 1, 2]);
  const stored = queue.getFreeGenerationTask(user.id, tasks[1].id, { includeRequest: true });
  assert.equal(stored.request.batchId, batchId);
  assert.equal(stored.request.batchIndex, 1);
  assert.deepEqual(stored.request.references, []);
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
