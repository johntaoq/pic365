import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-guest-api-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
process.env.GUEST_USAGE_SECRET = 'guest-test-secret';
process.env.AI_API_KEY = 'guest-image-provider-key';
process.env.AI_BASE_URL = 'https://provider.example';
process.env.AI_IMAGE_MODEL = 'gpt-image-2';

const previousFetch = globalThis.fetch;

const [{ default: handler }, db] = await Promise.all([
  import('../api/generate-image.js'),
  import('../api/_lib/local-db.js')
]);

after(() => {
  globalThis.fetch = previousFetch;
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(headers) {
  let statusCode = 200;
  let payload;
  const res = {
    writableEnded: false,
    once() {},
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; this.writableEnded = true; return value; }
  };
  return Promise.resolve(handler({ method: 'GET', headers, query: {}, socket: { remoteAddress: '127.0.0.1' }, once() {} }, res))
    .then(() => ({ statusCode, payload }));
}

function invokePost(headers, body) {
  let statusCode = 200;
  let payload;
  const responseHeaders = {};
  const res = {
    writableEnded: false,
    once() {},
    setHeader(name, value) { responseHeaders[String(name).toLowerCase()] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; this.writableEnded = true; return value; }
  };
  return Promise.resolve(handler({ method: 'POST', headers, body, query: {}, socket: { remoteAddress: '127.0.0.1' }, once() {} }, res))
    .then(() => ({ statusCode, payload, headers: responseHeaders }));
}

test('server-side guest usage allows three images and trusts proxy real IP over spoofed forwarding', async () => {
  const userAgent = 'pic365-guest-test';
  const realIp = '203.0.113.7';
  const fingerprint = createHash('sha256')
    .update(`${process.env.GUEST_USAGE_SECRET}\n${realIp}\n${userAgent}`)
    .digest('hex');
  db.claimGuestGenerationUsage(fingerprint, { limit: 3 });

  const result = await invoke({
    'x-real-ip': realIp,
    'x-forwarded-for': '198.51.100.99, 10.0.0.4',
    'user-agent': userAgent
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.guestAllowed, true);
  assert.equal(result.payload.guestFreeUsed, false);
  assert.equal(result.payload.guestGenerationsUsed, 1);
  assert.equal(result.payload.guestGenerationsRemaining, 2);

  db.claimGuestGenerationUsage(fingerprint, { limit: 3 });
  db.claimGuestGenerationUsage(fingerprint, { limit: 3 });
  const exhausted = await invoke({
    'x-real-ip': realIp,
    'x-forwarded-for': '198.51.100.99, 10.0.0.4',
    'user-agent': userAgent
  });
  assert.equal(exhausted.payload.guestAllowed, false);
  assert.equal(exhausted.payload.guestFreeUsed, true);
  assert.equal(exhausted.payload.guestGenerationsUsed, 3);
  assert.equal(exhausted.payload.guestGenerationsRemaining, 0);
});

test('guest generation returns a visible compact image with a verified www.pic365.org watermark', async () => {
  const source = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#244466' } }).png().toBuffer();
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://provider.example/v1/images/generations');
    return new Response(JSON.stringify({ data: [{ b64_json: source.toString('base64') }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  const result = await invokePost({
    'x-real-ip': '203.0.113.8',
    'user-agent': 'pic365-guest-watermark-test'
  }, { prompt: 'a blue product photo' });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.guest, true);
  assert.equal(result.payload.watermarked, true);
  assert.equal(result.payload.watermark.text, 'www.pic365.org');
  assert.equal(result.payload.contentType, 'image/webp');
  assert.match(result.payload.image, /^data:image\/webp;base64,/);
  const bytes = Buffer.from(result.payload.image.split(',')[1], 'base64');
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  assert.ok(bytes.length < 4 * 1024 * 1024);
});
