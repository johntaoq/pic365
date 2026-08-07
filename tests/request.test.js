import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';

import { setSessionCookie } from '../api/_lib/local-auth.js';
import { readJsonBody } from '../api/_lib/request.js';

test('readJsonBody accepts parsed and streamed JSON within the limit', async () => {
  const parsed = await readJsonBody({ headers: {}, body: { hello: 'world' } }, { maxBytes: 100 });
  assert.deepEqual(parsed, { hello: 'world' });

  const streamed = Readable.from(['{"slotId":"main-square"}']);
  streamed.headers = {};
  assert.deepEqual(await readJsonBody(streamed, { maxBytes: 100 }), { slotId: 'main-square' });
});

test('readJsonBody rejects bodies larger than the configured limit', async () => {
  const streamed = Readable.from(['{"value":"', 'x'.repeat(80), '"}']);
  streamed.headers = {};
  await assert.rejects(
    () => readJsonBody(streamed, { maxBytes: 32 }),
    (error) => error?.code === 'REQUEST_BODY_TOO_LARGE' && error?.status === 413
  );
});

test('production session cookies are always secure and http-only', () => {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let cookie = '';
  setSessionCookie({ headers: {} }, { setHeader: (_name, value) => { cookie = value; } }, 'test-token');
  if (previousEnvironment == null) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
});
