import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-generated-thumbnail-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'generated');
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const [localDb, { default: generatedHandler }] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/generated.js')
]);

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
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
  return Promise.resolve(generatedHandler({
    method: 'GET',
    query,
    headers: { authorization: `Bearer ${token}`, ...headers }
  }, res)).then(() => ({ statusCode, headers: responseHeaders, body }));
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
