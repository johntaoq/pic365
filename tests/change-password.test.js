import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-change-password-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.SESSION_SECRET = 'change-password-test-secret';

const [db, { default: handler }] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/auth/change-password.js')
]);

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke({ token, body }) {
  let statusCode = 200;
  let payload;
  const headers = {};
  const res = {
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(handler({
    method: 'POST',
    headers: { cookie: `member_session=${encodeURIComponent(token)}`, 'user-agent': 'change-password-test' },
    socket: { remoteAddress: '127.0.0.1' },
    body
  }, res)).then(() => ({ statusCode, payload, headers }));
}

test('a user changes their password after double entry and keeps only the current session', async () => {
  const user = db.createUser({ email: 'self-change@example.com', password: 'old-password-123', fullName: 'Self Change' });
  const currentSession = db.createSession(user.id);
  const otherSession = db.createSession(user.id);

  const mismatch = await invoke({
    token: currentSession.token,
    body: { currentPassword: 'old-password-123', newPassword: 'new-password-456', confirmPassword: 'different-password' }
  });
  assert.equal(mismatch.statusCode, 400);
  assert.equal(mismatch.payload.error, 'PASSWORD_MISMATCH');

  const wrongCurrent = await invoke({
    token: currentSession.token,
    body: { currentPassword: 'wrong-password', newPassword: 'new-password-456', confirmPassword: 'new-password-456' }
  });
  assert.equal(wrongCurrent.statusCode, 403);
  assert.equal(wrongCurrent.payload.error, 'INVALID_CURRENT_PASSWORD');

  const changed = await invoke({
    token: currentSession.token,
    body: { currentPassword: 'old-password-123', newPassword: 'new-password-456', confirmPassword: 'new-password-456' }
  });
  assert.equal(changed.statusCode, 200);
  assert.equal(changed.payload.ok, true);
  assert.equal(changed.payload.otherSessionsRevoked, true);
  assert.equal(db.verifyPassword('old-password-123', db.getUserByEmail(user.email).password_hash), false);
  assert.equal(db.verifyPassword('new-password-456', db.getUserByEmail(user.email).password_hash), true);
  assert.ok(db.getUserBySessionToken(currentSession.token));
  assert.equal(db.getUserBySessionToken(otherSession.token), null);

  const audit = db.getDb().prepare(`
    SELECT action, target_user_id, ip_address, user_agent FROM audit_events
    WHERE action = 'password_changed' ORDER BY created_at DESC LIMIT 1
  `).get();
  assert.deepEqual({ ...audit }, {
    action: 'password_changed',
    target_user_id: user.id,
    ip_address: '127.0.0.1',
    user_agent: 'change-password-test'
  });
});
