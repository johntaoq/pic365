import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-password-reset-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.EMAIL_VERIFICATION_SECRET = 'password-reset-test-secret';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.SMTP_FROM = '';

const [
  db,
  emailVerification,
  { default: sendResetCodeHandler },
  { default: resetPasswordHandler }
] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/email-verification.js'),
  import('../api/auth/send-password-reset-code.js'),
  import('../api/auth/reset-password.js')
]);

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, req = {}) {
  let statusCode = 200;
  let payload;
  const headers = {};
  const res = {
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, socket: { remoteAddress: '127.0.0.1' }, ...req }, res))
    .then(() => ({ statusCode, payload, headers }));
}

test('password reset code changes the password, revokes sessions, and is single use', async () => {
  const email = 'reset-member@example.com';
  const user = db.createUser({ email, password: 'old-password-123', fullName: 'Reset Member' });
  const session = db.createSession(user.id);
  assert.ok(db.getUserBySessionToken(session.token));

  const issued = await emailVerification.issuePasswordResetVerificationCode(email, { language: 'zh' });
  assert.match(issued.previewCode, /^\d{6}$/);
  const stored = db.getDb().prepare(`
    SELECT code_hash FROM email_verification_codes WHERE email = ? AND purpose = 'password_reset'
  `).get(email);
  assert.ok(stored.code_hash);
  assert.equal(stored.code_hash.includes(issued.previewCode), false);

  assert.throws(
    () => emailVerification.resetPasswordWithVerificationCode(email, '000000', 'new-password-456'),
    (error) => error?.code === 'INVALID_VERIFICATION_CODE'
  );
  assert.equal(db.verifyPassword('old-password-123', db.getUserByEmail(email).password_hash), true);

  const resetUser = emailVerification.resetPasswordWithVerificationCode(
    email,
    issued.previewCode,
    'new-password-456',
    { ipAddress: '127.0.0.1', userAgent: 'password-reset-test' }
  );
  assert.equal(resetUser.id, user.id);
  assert.equal(db.verifyPassword('old-password-123', db.getUserByEmail(email).password_hash), false);
  assert.equal(db.verifyPassword('new-password-456', db.getUserByEmail(email).password_hash), true);
  assert.equal(db.getUserBySessionToken(session.token), null);
  assert.throws(
    () => emailVerification.resetPasswordWithVerificationCode(email, issued.previewCode, 'another-password-789'),
    (error) => error?.code === 'INVALID_VERIFICATION_CODE'
  );

  const audit = db.getDb().prepare(`
    SELECT action, target_user_id, ip_address, user_agent FROM audit_events
    WHERE action = 'password_reset' ORDER BY created_at DESC LIMIT 1
  `).get();
  assert.deepEqual({ ...audit }, {
    action: 'password_reset',
    target_user_id: user.id,
    ip_address: '127.0.0.1',
    user_agent: 'password-reset-test'
  });
});

test('reset-code request does not reveal whether an account exists', async () => {
  const knownEmail = 'known-reset@example.com';
  db.createUser({ email: knownEmail, password: 'testing-1234', fullName: 'Known Reset' });

  const known = await invoke(sendResetCodeHandler, {
    method: 'POST',
    body: { email: knownEmail, language: 'en' },
    socket: { remoteAddress: '127.0.0.2' }
  });
  const unknown = await invoke(sendResetCodeHandler, {
    method: 'POST',
    body: { email: 'unknown-reset@example.com', language: 'en' },
    socket: { remoteAddress: '127.0.0.3' }
  });
  assert.equal(known.statusCode, 200);
  assert.equal(unknown.statusCode, 200);
  assert.equal(known.payload.ok, true);
  assert.equal(unknown.payload.ok, true);
  assert.equal(Object.hasOwn(unknown.payload, 'accountExists'), false);
  assert.equal(Object.hasOwn(unknown.payload, 'previewCode'), false);
  assert.match(known.payload.previewCode, /^\d{6}$/);
});

test('reset endpoint rejects a bad code and accepts a valid code', async () => {
  const email = 'endpoint-reset@example.com';
  db.createUser({ email, password: 'endpoint-old-password', fullName: 'Endpoint Reset' });
  const issued = await emailVerification.issuePasswordResetVerificationCode(email, { language: 'en' });

  const invalid = await invoke(resetPasswordHandler, {
    method: 'POST',
    body: { email, password: 'endpoint-new-password', verificationCode: '111111' },
    socket: { remoteAddress: '127.0.0.4' }
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.payload.error, 'INVALID_VERIFICATION_CODE');

  const valid = await invoke(resetPasswordHandler, {
    method: 'POST',
    body: { email, password: 'endpoint-new-password', verificationCode: issued.previewCode },
    headers: { 'user-agent': 'endpoint-reset-test' },
    socket: { remoteAddress: '127.0.0.5' }
  });
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.payload.ok, true);
  assert.equal(db.verifyPassword('endpoint-new-password', db.getUserByEmail(email).password_hash), true);
});
