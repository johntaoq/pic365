import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-generated-thumbnail-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'generated');
process.env.ASSET_VARIANT_REPAIR_ENABLED = 'false';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const [localDb, { default: generatedHandler }] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/generated.js')
]);
const media = await import('../api/_lib/media-assets.js');
const worker = await import('../server/media-processing-worker.js');

after(async () => {
  await worker.stopMediaProcessingWorker();
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('generated results reuse shared thumbnail and preview variants, including the legacy alias', async () => {
  const user = localDb.createUser({ email: 'preview@example.com', password: 'testing-1234', fullName: 'Preview' });
  const session = localDb.createSession(user.id);
  const id = 'preview-generation';
  const storagePath = `${user.id}/${id}.png`;
  const file = path.join(process.env.LOCAL_STORAGE_ROOT, storagePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#308a80' } }).png().toFile(file);
  const original = fs.readFileSync(file);
  localDb.getDb().prepare(`INSERT INTO generations (id,user_id,prompt,model,size,quality,provider,status,storage_path,created_at)
    VALUES (?,?,'preview test','test','1920x1080','low','test','succeeded',?,datetime('now'))`).run(id,user.id,storagePath);
  localDb.updateGeneration(id, { file_size: original.length });
  const asset = localDb.getDb().prepare("SELECT id FROM assets WHERE source_table='generations' AND source_id=?").get(id);
  const [thumb, preview] = await Promise.all([
    invoke({ id, variant: 'thumbnail', v: 'v3' }, session.token),
    invoke({ id, variant: 'preview', v: 'v3' }, session.token)
  ]);
  for (const response of [thumb, preview]) {
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'image/webp');
  }
  assert.equal((await sharp(thumb.body).metadata()).width, 480);
  assert.equal((await sharp(preview.body).metadata()).width, 1600);
  assert.equal(localDb.getDb().prepare("SELECT COUNT(*) n FROM asset_processing_jobs WHERE asset_id=? AND job_type='image-variants'").get(asset.id).n, 1);
  assert.equal(localDb.getDb().prepare("SELECT COUNT(*) n FROM asset_processing_jobs WHERE asset_id=? AND job_type='generated-thumbnail'").get(asset.id).n, 0);
  assert.deepEqual((await invoke({ id }, session.token)).body, original);
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), createHash('sha256').update(original).digest('hex'));

  // Ready variants remain usable without reading or reconstructing the original.
  fs.unlinkSync(file);
  assert.deepEqual((await invoke({ id, variant: 'thumb' }, session.token)).body, thumb.body);
  assert.deepEqual((await invoke({ id, variant: 'preview' }, session.token)).body, preview.body);
  const stranger = localDb.createUser({ email: 'preview-stranger@example.com', password: 'testing-1234', fullName: 'Stranger' });
  assert.equal((await invoke({ id, variant: 'preview' }, localDb.createSession(stranger.id).token)).statusCode, 404);
  assert.equal(media.getAccessibleAsset(user.id, asset.id).variants.filter((v) => ['thumbnail','preview'].includes(v.type)).length, 2);
});

function invoke(query, token, headers = {}) {
  let statusCode = 200;
  let body;
  const responseHeaders = {};
  const res = {
    setHeader(name, value) {
      responseHeaders[String(name).toLowerCase()] = value;
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
  // IncomingMessage exposes headers through its prototype, not object spread.
  const request = Object.assign(Object.create({ method: 'GET', headers: { authorization: `Bearer ${token}`, ...headers } }), { query });
  return Promise.resolve(generatedHandler(request, res)).then(() => ({ statusCode, headers: responseHeaders, body }));
}

test('generated image API creates and reuses a persistent 480px WebP thumbnail', async () => {
  const user = localDb.createUser({ email: 'thumb@example.com', password: 'testing-1234', fullName: 'Thumb' });
  const session = localDb.createSession(user.id);
  const generationId = 'thumbnail-generation';
  const storagePath = `${user.id}/${generationId}.png`;
  const sourcePath = path.join(process.env.LOCAL_STORAGE_ROOT, storagePath);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  await sharp({
    create: { width: 1600, height: 900, channels: 3, background: { r: 35, g: 140, b: 220 } }
  }).png().toFile(sourcePath);
  localDb.getDb().prepare(`
    INSERT INTO generations (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at, completed_at)
    VALUES (?, ?, 'thumbnail test', 'gpt-image-2', '1600x900', 'medium', 'test', 'succeeded', ?, datetime('now'), datetime('now'))
  `).run(generationId, user.id, storagePath);

  const first = await invoke({ id: generationId, variant: 'thumb' }, session.token);
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers['content-type'], 'image/webp');
  assert.match(first.headers['cache-control'], /31536000/);
  const metadata = await sharp(first.body).metadata();
  assert.equal(metadata.width, 480);
  assert.equal(metadata.height, 270);
  assert.equal(fs.existsSync(path.join(process.env.LOCAL_STORAGE_ROOT, 'thumbnails/v1', user.id, `${generationId}.webp`)), true);

  const cached = await invoke(
    { id: generationId, variant: 'thumb' },
    session.token,
    { 'if-none-match': first.headers.etag }
  );
  assert.equal(cached.statusCode, 304);
});
