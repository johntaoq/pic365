import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-guest-api-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
process.env.GUEST_USAGE_SECRET = 'guest-test-secret';

const [{ default: handler }, db] = await Promise.all([
  import('../api/generate-image.js'),
  import('../api/_lib/local-db.js')
]);

after(() => {
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
