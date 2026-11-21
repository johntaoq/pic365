import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';
import { generatedThumbnailStoragePath } from '../shared/image-thumbnails.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-variant-repair-'));
process.env.APP_DB_PATH = path.join(directory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(directory, 'storage');
process.env.ASSET_VARIANT_REPAIR_ENABLED = 'false';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;
const db = await import('../api/_lib/local-db.js');
const media = await import('../api/_lib/media-assets.js');
const storage = await import('../api/_lib/storage.js');
const worker = await import('../server/media-processing-worker.js');
const { default: fileHandler } = await import('../api/assets/file.js');
const owner = db.createUser({ email: 'variant-owner@example.com', password: 'testing-1234', fullName: 'Variant owner' });
const stranger = db.createUser({ email: 'variant-stranger@example.com', password: 'testing-1234', fullName: 'Variant stranger' });

after(async () => {
  await worker.stopMediaProcessingWorker();
  db.getDb().close();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function seed({ missingOriginal = false, deleted = false } = {}) {
  const id = randomUUID();
  const storagePath = `${owner.id}/${id}.png`;
  const bytes = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#20a090' } }).png().toBuffer();
  if (!missingOriginal) await storage.persistStoredImage({ storagePath, bytes, contentType: 'image/png' });
  const timestamp = new Date().toISOString();
  db.getDb().prepare(`INSERT INTO assets (id, owner_user_id, name, media_type, source_type, status,
    original_storage_path, mime_type, file_size, source_table, source_id, metadata_json, deleted_at, created_at, updated_at)
    VALUES (?, ?, 'Legacy image', 'image', 'generated', 'ready', ?, 'image/png', ?, 'generations', ?, ?, ?, ?, ?)`)
    .run(id, owner.id, storagePath, bytes.length, id, JSON.stringify({ watermarked: true }), deleted ? timestamp : null, timestamp, timestamp);
  db.getDb().prepare(`INSERT INTO asset_variants (id,asset_id,variant_type,storage_path,mime_type,file_size,status,created_at,updated_at)
    VALUES (?,?,'original',?,'image/png',?,'ready',?,?)`).run(randomUUID(), id, storagePath, bytes.length, timestamp, timestamp);
  return { id, storagePath, bytes };
}

async function runJob(assetId) {
  const jobs = media.claimAssetProcessingJobs(4);
  const job = jobs.find((j) => j.assetId === assetId);
  assert.ok(job);
  await media.processAssetProcessingJob(job);
  return media.getAccessibleAsset(owner.id, assetId);
}

test('legacy images use small variant URLs, queue once and preserve the original and watermark metadata', async () => {
  const source = await seed();
  const before = media.getAccessibleAsset(owner.id, source.id);
  assert.match(before.thumbnailUrl, /variant=thumbnail/);
  assert.match(before.previewUrl, /variant=preview/);
  assert.match(before.downloadUrl, /variant=original.*download=1/);
  assert.equal(media.queueImageVariantRepair(stranger.id, source.id), '');
  const job = media.queueImageVariantRepair(owner.id, source.id);
  assert.equal(media.queueImageVariantRepair(owner.id, source.id), job);
  const asset = await runJob(source.id);
  assert.equal(asset.metadata.watermarked, true);
  const thumbnail = asset.variants.find((v) => v.type === 'thumbnail');
  const preview = asset.variants.find((v) => v.type === 'preview');
  const thumbMeta = await sharp((await storage.readStoredFile(thumbnail.storagePath)).bytes).metadata();
  const previewMeta = await sharp((await storage.readStoredFile(preview.storagePath)).bytes).metadata();
  assert.equal(thumbMeta.width, 480);
  assert.equal(previewMeta.width, 1600);
  assert.equal(createHash('sha256').update((await storage.readStoredFile(source.storagePath)).bytes).digest('hex'),
    createHash('sha256').update(source.bytes).digest('hex'));
  assert.equal(media.queueImageVariantRepair(owner.id, source.id), '');
});

test('existing canonical files and generated thumbnails are registered without downloading or recreating the original', async () => {
  const source = await seed({ missingOriginal: true });
  const thumbnailPath = generatedThumbnailStoragePath(source.storagePath);
  const previewPath = `assets/${owner.id}/${source.id}/preview.webp`;
  const thumbnail = await sharp(source.bytes).resize(480).webp().toBuffer();
  const preview = await sharp(source.bytes).resize(1600).webp().toBuffer();
  await storage.persistStoredImage({ storagePath: thumbnailPath, bytes: thumbnail });
  await storage.persistStoredImage({ storagePath: previewPath, bytes: preview });
  media.queueImageVariantRepair(owner.id, source.id);
  const asset = await runJob(source.id);
  assert.equal(asset.variants.find((v) => v.type === 'thumbnail').storagePath, thumbnailPath);
  assert.equal(asset.variants.find((v) => v.type === 'preview').fileSize, preview.length);
  assert.deepEqual((await storage.readStoredFile(previewPath)).bytes, preview);
  assert.equal(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT, source.storagePath)), false);
});

test('background discovery is bounded, skips trash and does not repeatedly enqueue failed repairs', async () => {
  const trashed = await seed({ deleted: true });
  const sources = [];
  for (let i = 0; i < 10; i += 1) sources.push(await seed());
  assert.equal(media.queueMissingImageVariants(100), 4);
  assert.equal(media.queueMissingImageVariants(100), 4);
  assert.equal(media.queueMissingImageVariants(100), 0);
  assert.equal(db.getDb().prepare('SELECT COUNT(*) n FROM asset_processing_jobs WHERE asset_id = ?').get(trashed.id).n, 0);
  const pending = db.getDb().prepare("SELECT id FROM asset_processing_jobs WHERE status = 'queued'").all();
  for (const job of pending) media.failAssetProcessingJob(job.id, 'TEST_FAILURE');
  assert.equal(media.queueMissingImageVariants(100), 2);
  for (const job of db.getDb().prepare("SELECT id FROM asset_processing_jobs WHERE status = 'queued'").all()) media.failAssetProcessingJob(job.id, 'TEST_FAILURE');
  assert.equal(media.queueMissingImageVariants(100), 0);
});

test('simultaneous thumbnail and preview requests share the durable worker queue', async () => {
  const source = await seed();
  const session = db.createSession(owner.id);
  async function invoke(variant) {
    let body;
    const headers = {};
    let status = 200;
    const res = { setHeader(k, v) { headers[k] = v; }, status(v) { status = v; return this; },
      json(v) { body = v; }, end(v) { body = v; } };
    await fileHandler({ method: 'GET', query: { id: source.id, variant }, headers: { authorization: `Bearer ${session.token}` } }, res);
    return { status, headers, body };
  }
  const [thumb, preview] = await Promise.all([invoke('thumbnail'), invoke('preview')]);
  assert.equal(thumb.status, 200);
  assert.equal(preview.status, 200);
  assert.equal(thumb.headers['Content-Type'], 'image/webp');
  assert.equal((await sharp(thumb.body).metadata()).width, 480);
  assert.equal(db.getDb().prepare("SELECT COUNT(*) n FROM asset_processing_jobs WHERE asset_id = ? AND job_type = 'image-variants'").get(source.id).n, 1);
  await worker.stopMediaProcessingWorker();
});
