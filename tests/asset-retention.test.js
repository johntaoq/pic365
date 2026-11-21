import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  assetRetentionCutoff, assetRetentionNightWindow, normalizeAssetRetentionDays
} from '../shared/asset-retention.js';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-asset-retention-'));
process.env.APP_DB_PATH = path.join(temporary, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(temporary, 'storage');
process.env.ASSET_VARIANT_REPAIR_ENABLED = 'false';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;
const db = await import('../api/_lib/local-db.js');
const media = await import('../api/_lib/media-assets.js');
const storage = await import('../api/_lib/storage.js');
const retention = await import('../api/_lib/asset-retention.js');
const settings = await import('../api/_lib/asset-retention-settings.js');
const { default: settingsHandler } = await import('../api/asset-retention.js');
const { default: generatedHandler } = await import('../api/generated.js');
const { generatedThumbnailStoragePath } = await import('../shared/image-thumbnails.js');
const worker = await import('../server/asset-retention-worker.js');
const mediaWorker = await import('../server/media-processing-worker.js');

after(async () => {
  await worker.stopAssetRetentionWorker();
  await mediaWorker.stopMediaProcessingWorker();
  db.getDb().close();
  fs.rmSync(temporary, { recursive: true, force: true });
});

function user() {
  return db.createUser({ email: `retention-${randomUUID()}@example.com`, password: 'test-password', initialCredits: 500 });
}

async function asset(owner, createdAt, { id = randomUUID(), deleted = false, storagePath, variant = true } = {}) {
  const originalPath = storagePath || `assets/${owner.id}/${id}/original.png`;
  await storage.persistStoredImage({ storagePath: originalPath, bytes: Buffer.from('original'), contentType: 'image/png' });
  db.getDb().prepare(`INSERT INTO assets
    (id, owner_user_id, name, media_type, original_storage_path, mime_type, file_size, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, 'image', ?, 'image/png', 8, ?, ?, ?)`)
    .run(id, owner.id, id, originalPath, createdAt, createdAt, deleted ? createdAt : null);
  db.getDb().prepare(`INSERT INTO asset_variants
    (id, asset_id, variant_type, storage_path, mime_type, file_size, created_at, updated_at)
    VALUES (?, ?, 'original', ?, 'image/png', 8, ?, ?)`)
    .run(`original-${id}`, id, originalPath, createdAt, createdAt);
  if (variant) {
    const previewPath = `assets/${owner.id}/${id}/preview.webp`;
    await storage.persistStoredImage({ storagePath: previewPath, bytes: Buffer.from('preview'), contentType: 'image/webp' });
    db.getDb().prepare(`INSERT INTO asset_variants
      (id, asset_id, variant_type, storage_path, mime_type, file_size, created_at, updated_at)
      VALUES (?, ?, 'preview', ?, 'image/webp', 7, ?, ?)`)
      .run(`preview-${id}`, id, previewPath, createdAt, createdAt);
  }
  return { id, path: originalPath };
}

async function invoke(handler, owner, { method = 'GET', body, query = {} } = {}) {
  let status = 200;
  let payload;
  const session = owner ? db.createSession(owner.id) : null;
  const headers = {};
  await handler({ method, body, query, headers: session ? { cookie: `member_session=${session.token}` } : {} }, {
    status(value) { status = value; return this; },
    setHeader(name, value) { headers[name] = value; },
    json(value) { payload = value; }, end() {}
  });
  return { status, payload, headers };
}

test('retention defaults to thirty days and uses a Beijing overnight window', () => {
  for (const value of [undefined, null, '', '  ']) assert.equal(normalizeAssetRetentionDays(value), 30);
  assert.equal(normalizeAssetRetentionDays('365'), 365);
  for (const value of [0, -1, 1.5, 'abc', true, [], 36501]) assert.throws(() => normalizeAssetRetentionDays(value));
  assert.equal(assetRetentionCutoff(30, '2026-10-11T00:00:00.000Z'), '2026-09-11T00:00:00.000Z');
  assert.equal(assetRetentionNightWindow('2026-10-10T17:59:59.000Z'), '');
  assert.equal(assetRetentionNightWindow('2026-10-10T18:00:00.000Z'), '2026-10-11');
  assert.equal(assetRetentionNightWindow('2026-10-10T21:59:59.000Z'), '2026-10-11');
  assert.equal(assetRetentionNightWindow('2026-10-10T22:00:00.000Z'), '');
});

test('retention settings persist per account, reset on blank and reject invalid or foreign changes', async () => {
  const owner = user();
  const other = user();
  assert.equal((await invoke(settingsHandler, null)).status, 401);
  assert.equal((await invoke(settingsHandler, owner)).payload.settings.retentionDays, 30);
  assert.equal(db.getUserProfile(owner.id).assetRetentionDays, 30);
  const saved = await invoke(settingsHandler, owner, { method: 'PATCH', body: { retentionDays: '90' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.payload.settings.retentionDays, 90);
  assert.equal(db.getUserProfile(owner.id).assetRetentionDays, 90);
  assert.equal((await invoke(settingsHandler, other)).payload.settings.retentionDays, 30);
  for (const body of [{}, { retentionDays: 0 }, { retentionDays: 3.5 }, { retentionDays: 'wrong' }]) {
    assert.equal((await invoke(settingsHandler, owner, { method: 'PATCH', body })).status, 400);
  }
  assert.equal((await invoke(settingsHandler, owner, { method: 'PATCH', body: { userId: other.id, retentionDays: 1 } })).status, 403);
  const reset = await invoke(settingsHandler, owner, { method: 'PATCH', body: { retentionDays: '' } });
  assert.equal(reset.payload.settings.retentionDays, 30);
  assert.equal((await invoke(settingsHandler, owner, { method: 'POST', body: {} })).status, 405);
});

test('dry-run never deletes files or inserts cleanup batches', async () => {
  const owner = user();
  const old = await asset(owner, '2020-01-01T00:00:00.000Z');
  const before = db.getDb().prepare('SELECT COUNT(*) AS count FROM asset_retention_batches').get().count;
  const result = await retention.runAssetRetentionBatch({ at: '2026-10-11T00:00:00.000Z', userId: owner.id, dryRun: true,
    deleteFile() { throw new Error('must not delete'); }, checkStorage() { throw new Error('must not access cloud'); }
  });
  assert.equal(result.deleted, 1);
  assert.ok(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT, old.path)));
  assert.ok(media.getAccessibleAsset(owner.id, old.id));
  assert.equal(db.getDb().prepare('SELECT COUNT(*) AS count FROM asset_retention_batches').get().count, before);
  db.getDb().prepare('DELETE FROM assets WHERE id = ?').run(old.id);
});

test('expiration honors owner preferences and removes originals, variants and trash without moving to trash', async () => {
  const owner = user();
  const shorter = user();
  const longer = user();
  settings.saveAssetRetentionSettings(shorter.id, 7);
  settings.saveAssetRetentionSettings(longer.id, 90);
  const expired = await asset(owner, '2026-09-11T00:00:00.000Z');
  const trash = await asset(owner, '2026-09-10 23:59:59', { deleted: true });
  const fresh = await asset(owner, '2026-09-11T00:00:00.001Z');
  const customExpired = await asset(shorter, '2026-10-01T00:00:00.000Z');
  const protectedAsset = await asset(longer, '2026-09-01T00:00:00.000Z');
  const result = await retention.runAssetRetentionBatch({ at: '2026-10-11T00:00:00.000Z' });
  assert.equal(result.status, 'completed');
  for (const removed of [expired, trash, customExpired]) {
    assert.equal(media.getAccessibleAsset(owner.id, removed.id), null);
    assert.equal(db.getDb().prepare('SELECT id FROM assets WHERE id = ?').get(removed.id), undefined);
    assert.equal(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT, removed.path)), false);
    assert.equal(db.getDb().prepare('SELECT COUNT(*) AS count FROM asset_variants WHERE asset_id = ?').get(removed.id).count, 0);
  }
  assert.ok(media.getAccessibleAsset(owner.id, fresh.id));
  assert.ok(media.getAccessibleAsset(longer.id, protectedAsset.id));
  assert.equal(media.listAssets(owner.id, { deleted: true }).totalCount, 0);
  const paths = [];
  const again = await retention.runAssetRetentionBatch({ at: '2026-10-11T02:00:00.000Z', deleteFile(p) { paths.push(p); } });
  assert.equal(again.status, 'already_run');
  assert.equal(paths.length, 0);
});

test('expired generation paths are cleared while billing history remains and generated endpoints return 404', async () => {
  const owner = user();
  const generationId = randomUUID();
  const storagePath = `${owner.id}/${generationId}.png`;
  const original = await asset(owner, '2026-09-01T00:00:00.000Z', { id: `generation-${generationId}`, storagePath });
  const thumbnail = generatedThumbnailStoragePath(storagePath);
  await storage.persistStoredImage({ storagePath: thumbnail, bytes: Buffer.from('thumbnail') });
  db.getDb().prepare(`INSERT INTO generations
    (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at)
    VALUES (?, ?, 'p', 'test', '1024x1024', 'low', 'test', 'succeeded', ?, '2026-09-01T00:00:00.000Z')`)
    .run(generationId, owner.id, storagePath);
  db.getDb().prepare("UPDATE assets SET source_table = 'generations', source_id = ? WHERE id = ?").run(generationId, original.id);
  const taskId = randomUUID();
  db.getDb().prepare(`INSERT INTO free_generation_tasks (id, user_id, status, result_json, created_at, updated_at)
    VALUES (?, ?, 'completed', ?, '2026-09-01', '2026-09-01')`)
    .run(taskId, owner.id, JSON.stringify({ items: [{ generationId, image: `/api/generated?id=${generationId}` }], creditsCharged: 5 }));
  const credits = db.getUserById(owner.id).creditBalance;
  const result = await retention.runAssetRetentionBatch({ at: '2026-10-12T00:00:00.000Z' });
  assert.equal(result.status, 'completed');
  assert.equal(db.getDb().prepare('SELECT storage_path FROM generations WHERE id = ?').get(generationId).storage_path, null);
  assert.equal(db.listGenerations(owner.id).length, 0);
  assert.equal(db.getUserById(owner.id).creditBalance, credits);
  assert.equal(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT, thumbnail)), false);
  const task = JSON.parse(db.getDb().prepare('SELECT result_json FROM free_generation_tasks WHERE id = ?').get(taskId).result_json);
  assert.deepEqual(task.items, []);
  assert.equal(task.creditsCharged, 5);
  assert.equal((await invoke(generatedHandler, owner, { query: { id: generationId } })).status, 404);
});

test('failed deletions stay retryable, hidden from trash, and retry only unfinished files', async () => {
  const owner = user();
  const expired = await asset(owner, '2020-01-01T00:00:00.000Z', { deleted: true });
  const previewPath = `assets/${owner.id}/${expired.id}/preview.webp`;
  const first = await retention.runAssetRetentionBatch({ at: '2026-10-13T00:00:00.000Z', deleteFile: async (storagePath) => {
    if (storagePath === previewPath) throw Object.assign(new Error('temporary'), { code: 'STORAGE_UNAVAILABLE' });
    await storage.deleteStoredFilePermanently(storagePath);
  } });
  assert.equal(first.status, 'partial');
  assert.equal(first.failed, 1);
  assert.ok(db.getDb().prepare('SELECT id FROM assets WHERE id = ?').get(expired.id));
  assert.equal(media.listAssets(owner.id, { deleted: true }).totalCount, 0);
  assert.equal(media.getAccessibleAsset(owner.id, expired.id), null);
  assert.equal(await media.permanentlyDeleteAsset(owner.id, expired.id), false);
  assert.ok(db.getDb().prepare('SELECT asset_id FROM asset_retention_deletions WHERE asset_id = ?').get(expired.id));
  const removed = [];
  const retry = await retention.runAssetRetentionBatch({ at: '2026-10-13T00:05:00.000Z', deleteFile: async (storagePath) => {
    removed.push(storagePath); await storage.deleteStoredFilePermanently(storagePath);
  } });
  assert.equal(retry.status, 'completed');
  assert.deepEqual(removed, [previewPath]);
  assert.equal(db.getDb().prepare('SELECT id FROM assets WHERE id = ?').get(expired.id), undefined);
});

test('in-flight processing and shared non-expired file references prevent destructive cleanup', async () => {
  const owner = user();
  const old = await asset(owner, '2020-01-01T00:00:00.000Z');
  const recent = await asset(owner, '2026-10-11T00:00:00.000Z', { storagePath: old.path });
  const processing = await asset(owner, '2020-01-01T00:00:00.000Z');
  db.getDb().prepare(`INSERT INTO asset_processing_jobs (id, asset_id, job_type, status, created_at, updated_at)
    VALUES (?, ?, 'test', 'running', '2026-10-11', '2026-10-11')`).run(randomUUID(), processing.id);
  const paths = [];
  const result = await retention.runAssetRetentionBatch({ at: '2026-10-14T00:00:00.000Z', deleteFile(p) { paths.push(p); } });
  assert.equal(result.status, 'completed');
  assert.equal(result.skipped, 2);
  assert.ok(media.getAccessibleAsset(owner.id, recent.id));
  assert.ok(media.getAccessibleAsset(owner.id, old.id));
  assert.ok(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT, old.path)));
  assert.ok(!paths.includes(old.path));
  db.getDb().prepare('DELETE FROM assets WHERE owner_user_id = ?').run(owner.id);
});

test('storage safety check failure prevents all deletions and preserves records', async () => {
  const owner = user();
  const old = await asset(owner, '2020-01-01T00:00:00.000Z');
  const paths = [];
  const result = await retention.runAssetRetentionBatch({ at: '2026-10-15T00:00:00.000Z', deleteFile(p) { paths.push(p); },
    checkStorage() { throw Object.assign(new Error('soft-delete enabled'), { code: 'STORAGE_SOFT_DELETE_ENABLED' }); }
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.errors[0].code, 'STORAGE_SOFT_DELETE_ENABLED');
  assert.equal(paths.length, 0);
  assert.ok(media.getAccessibleAsset(owner.id, old.id));
  db.getDb().prepare('DELETE FROM assets WHERE id = ?').run(old.id);
});

test('thumbnail rendering holds a processing lock and expired thumbnails are deleted afterwards', async () => {
  const owner = user();
  const generationId = randomUUID();
  const stored = await asset(owner, '2020-01-01T00:00:00.000Z', { storagePath: `${owner.id}/${generationId}.png`, variant: false });
  const png = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#6389ac' } }).png().toBuffer();
  await storage.persistStoredImage({ storagePath: stored.path, bytes: png, contentType: 'image/png' });
  db.getDb().prepare(`INSERT INTO generations (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at)
    VALUES (?, ?, 'test', 'test', '1024x1024', 'low', 'test', 'succeeded', ?, '2020-01-01')`).run(generationId, owner.id, stored.path);
  db.getDb().prepare("UPDATE assets SET source_table = 'generations', source_id = ? WHERE id = ?").run(generationId, stored.id);
  const rendering = invoke(generatedHandler, owner, { query: { id: generationId, variant: 'thumb' } });
  assert.equal(db.getDb().prepare("SELECT COUNT(*) AS count FROM asset_processing_jobs WHERE asset_id = ? AND status IN ('queued', 'running')").get(stored.id).count, 1);
  const whileRendering = await retention.runAssetRetentionBatch({ at: '2026-10-16T00:00:00.000Z' });
  assert.equal(whileRendering.skipped, 1);
  assert.equal((await rendering).status, 200);
  const thumbnailPath = media.getAccessibleAsset(owner.id, stored.id).variants.find((variant) => variant.type === 'thumbnail').storagePath;
  assert.equal(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT, thumbnailPath)), true);
  const afterRendering = await retention.runAssetRetentionBatch({ at: '2026-10-17T00:00:00.000Z' });
  assert.equal(afterRendering.status, 'completed');
  assert.equal(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT, thumbnailPath)), false);
});

test('cleanup detaches ecommerce and canvas images and hides video results without deleting billing rows', async () => {
  const owner = user();
  const sharedUser = user();
  const generationId = randomUUID();
  const expired = await asset(owner, '2020-01-01T00:00:00.000Z', { storagePath: `${owner.id}/${generationId}.png` });
  const sql = db.getDb();
  sql.prepare(`INSERT INTO generations (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at)
    VALUES (?, ?, 'test', 'test', '1024x1024', 'low', 'test', 'succeeded', ?, '2020-01-01')`).run(generationId, owner.id, expired.path);
  sql.prepare("UPDATE assets SET source_table = 'generations', source_id = ? WHERE id = ?").run(generationId, expired.id);
  const projectId = randomUUID();
  const projectAssetId = randomUUID();
  sql.prepare(`INSERT INTO ecommerce_projects (id, user_id, project_name, platform_id, industry_id, product_name, created_at, updated_at, master_asset_id)
    VALUES (?, ?, 'test', 'test', 'test', 'test', '2020-01-01', '2020-01-01', ?)`).run(projectId, sharedUser.id, projectAssetId);
  sql.prepare(`INSERT INTO ecommerce_project_assets (id, project_id, user_id, media_asset_id, asset_type, file_name, mime_type, storage_path, created_at)
    VALUES (?, ?, ?, ?, 'reference', 'test.png', 'image/png', ?, '2020-01-01')`).run(projectAssetId, projectId, sharedUser.id, expired.id, expired.path);
  const outputId = randomUUID();
  sql.prepare(`INSERT INTO ecommerce_project_outputs (id, project_id, user_id, slot_id, generation_id, status, locked, created_at, updated_at)
    VALUES (?, ?, ?, 'hero', ?, 'succeeded', 1, '2020-01-01', '2020-01-01')`).run(outputId, projectId, sharedUser.id, generationId);
  const canvasId = randomUUID();
  const nodeId = randomUUID();
  const childId = randomUUID();
  sql.prepare(`INSERT INTO infinite_canvas_projects (id, user_id, adopted_node_id, created_at, updated_at)
    VALUES (?, ?, ?, '2020-01-01', '2020-01-01')`).run(canvasId, sharedUser.id, nodeId);
  sql.prepare(`INSERT INTO infinite_canvas_nodes (id, project_id, user_id, node_type, asset_id, generation_id, created_at, updated_at)
    VALUES (?, ?, ?, 'image', ?, ?, '2020-01-01', '2020-01-01')`).run(nodeId, canvasId, sharedUser.id, expired.id, generationId);
  sql.prepare(`INSERT INTO infinite_canvas_nodes (id, project_id, user_id, node_type, parent_node_id, created_at, updated_at)
    VALUES (?, ?, ?, 'idea', ?, '2020-01-01', '2020-01-01')`).run(childId, canvasId, sharedUser.id, nodeId);
  sql.prepare(`INSERT INTO infinite_canvas_edges (id, project_id, source_node_id, target_node_id, created_at)
    VALUES (?, ?, ?, ?, '2020-01-01')`).run(randomUUID(), canvasId, nodeId, childId);
  const taskId = randomUUID();
  const videoId = randomUUID();
  sql.prepare(`INSERT INTO video_generation_tasks (id, user_id, status, result_json, created_at, updated_at)
    VALUES (?, ?, 'completed', ?, '2020-01-01', '2020-01-01')`).run(taskId, owner.id, JSON.stringify({ assetId: expired.id, videoUrl: '/api/assets/item' }));
  sql.prepare(`INSERT INTO video_generations (id, user_id, task_id, asset_id, status, credits_centi, created_at)
    VALUES (?, ?, ?, ?, 'succeeded', 100, '2020-01-01')`).run(videoId, owner.id, taskId, expired.id);
  const result = await retention.runAssetRetentionBatch({ at: '2026-10-18T00:00:00.000Z' });
  assert.equal(result.status, 'completed');
  assert.equal(sql.prepare('SELECT id FROM ecommerce_project_assets WHERE id = ?').get(projectAssetId), undefined);
  assert.equal(sql.prepare('SELECT master_asset_id FROM ecommerce_projects WHERE id = ?').get(projectId).master_asset_id, null);
  const output = sql.prepare('SELECT generation_id, status, active, locked FROM ecommerce_project_outputs WHERE id = ?').get(outputId);
  assert.equal(output.generation_id, null);
  assert.equal(output.status, 'planned');
  assert.equal(output.active, 0);
  assert.equal(output.locked, 0);
  const canvas = sql.prepare('SELECT adopted_node_id, revision FROM infinite_canvas_projects WHERE id = ?').get(canvasId);
  assert.equal(canvas.adopted_node_id, null);
  assert.equal(canvas.revision, 2);
  assert.equal(sql.prepare('SELECT id FROM infinite_canvas_nodes WHERE id = ?').get(nodeId), undefined);
  assert.equal(sql.prepare('SELECT parent_node_id FROM infinite_canvas_nodes WHERE id = ?').get(childId).parent_node_id, null);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM infinite_canvas_edges WHERE project_id = ?').get(canvasId).count, 0);
  const videoTask = sql.prepare('SELECT result_json, deleted_at FROM video_generation_tasks WHERE id = ?').get(taskId);
  assert.equal(videoTask.result_json, '{}');
  assert.ok(videoTask.deleted_at);
  const video = sql.prepare('SELECT asset_id, credits_centi FROM video_generations WHERE id = ?').get(videoId);
  assert.equal(video.asset_id, null);
  assert.equal(video.credits_centi, 100);
});

test('concurrent nightly batches share one lease and never delete a file twice', async () => {
  const owner = user();
  const expired = await asset(owner, '2020-01-01T00:00:00.000Z', { variant: false });
  let release;
  const storageReady = new Promise((resolve) => { release = resolve; });
  const paths = [];
  const first = retention.runAssetRetentionBatch({ at: '2026-10-19T00:00:00.000Z', checkStorage: () => storageReady,
    deleteFile: async (storagePath) => { paths.push(storagePath); await storage.deleteStoredFilePermanently(storagePath); }
  });
  const second = await retention.runAssetRetentionBatch({ at: '2026-10-19T00:01:00.000Z' });
  assert.equal(second.status, 'already_run');
  release();
  assert.equal((await first).status, 'completed');
  assert.deepEqual(paths, [expired.path]);
});

test('unsafe storage paths are rejected without deleting another account file', async () => {
  const owner = user();
  const other = user();
  const stored = await asset(other, '2026-10-11T00:00:00.000Z');
  const id = randomUUID();
  db.getDb().prepare(`INSERT INTO assets (id, owner_user_id, name, media_type, mime_type, original_storage_path, created_at, updated_at)
    VALUES (?, ?, 'bad path', 'image', 'image/png', ?, '2020-01-01', '2020-01-01')`).run(id, owner.id, stored.path);
  const result = await retention.runAssetRetentionBatch({ at: '2026-10-20T00:00:00.000Z' });
  assert.equal(result.status, 'partial');
  assert.equal(result.errors[0].code, 'RETENTION_STORAGE_PATH_NOT_OWNED');
  assert.equal(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT, stored.path)), true);
  assert.equal(db.getDb().prepare('SELECT id FROM assets WHERE id = ?').get(id).id, id);
  db.getDb().prepare('DELETE FROM assets WHERE id = ?').run(id);
});

test('restarting the service releases interrupted thumbnail locks and cannot recreate expired assets', async () => {
  const owner = user();
  const remaining = await asset(owner, '2026-10-11T00:00:00.000Z');
  const sql = db.getDb();
  const runningJob = randomUUID();
  sql.prepare(`INSERT INTO asset_processing_jobs (id, asset_id, job_type, status, created_at, updated_at)
    VALUES (?, ?, 'generated-thumbnail', 'running', '2026-10-11', '2026-10-11')`).run(runningJob, remaining.id);
  const beforeCount = sql.prepare('SELECT COUNT(*) AS count FROM assets').get().count;
  const script = `const {getDb}=await import('./api/_lib/local-db.js'); const db=getDb();
    console.log(JSON.stringify({count:db.prepare('SELECT COUNT(*) AS count FROM assets').get().count,
      job:db.prepare('SELECT status, error_code FROM asset_processing_jobs WHERE id = ?').get(process.env.RETENTION_TEST_JOB)})); db.close();`;
  const restarted = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, RETENTION_TEST_JOB: runningJob }, encoding: 'utf8'
  }));
  assert.equal(restarted.count, beforeCount);
  assert.equal(restarted.job.status, 'failed');
  assert.equal(restarted.job.error_code, 'SERVER_RESTARTED');
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('production can disable legacy asset backfill without restoring deleted source assets', async () => {
  const owner = user();
  const generationId = randomUUID();
  const sql = db.getDb();
  sql.prepare(`INSERT INTO generations (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at)
    VALUES (?, ?, 'test', 'test', '1024x1024', 'low', 'test', 'succeeded', ?, '2020-01-01')`)
    .run(generationId, owner.id, `${owner.id}/${generationId}.png`);
  const beforeCount = sql.prepare('SELECT COUNT(*) AS count FROM assets').get().count;
  const script = `const {getDb}=await import('./api/_lib/local-db.js'); const db=getDb();
    console.log(JSON.stringify({count:db.prepare('SELECT COUNT(*) AS count FROM assets').get().count})); db.close();`;
  const restarted = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, UNIFIED_MEDIA_BACKFILL_ENABLED: 'false' }, encoding: 'utf8'
  }));
  assert.equal(restarted.count, beforeCount);
  assert.equal(sql.prepare('SELECT asset_id FROM asset_variants WHERE asset_id = ?').get(`generation-${generationId}`), undefined);
  sql.prepare('DELETE FROM generations WHERE id = ?').run(generationId);
});

test('retention worker runs once per Beijing night and does not clean during the day', async () => {
  const runs = [];
  const options = { latestBatch: () => null, runBatch: async (values) => { runs.push(values); return { status: 'completed' }; } };
  await worker.tickAssetRetentionWorker({ ...options, at: '2026-10-20T03:00:00.000Z' });
  assert.equal(runs.length, 0);
  await worker.tickAssetRetentionWorker({ ...options, at: '2026-10-20T18:00:00.000Z' });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runDate, '2026-10-21');
  await worker.tickAssetRetentionWorker({ ...options, at: '2026-10-20T18:01:00.000Z' });
  assert.equal(runs.length, 1);
  await worker.tickAssetRetentionWorker({ ...options, latestBatch: () => ({ runDate: '2026-10-21', status: 'completed' }), at: '2026-10-20T19:00:00.000Z' });
  assert.equal(runs.length, 1);
  process.env.ASSET_RETENTION_ENABLED = 'false';
  await worker.tickAssetRetentionWorker({ ...options, at: '2026-10-21T18:00:00.000Z' });
  assert.equal(runs.length, 1);
  delete process.env.ASSET_RETENTION_ENABLED;
});
