import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-email-registration-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.EMAIL_VERIFICATION_SECRET = 'email-registration-test-secret';
process.env.SUPER_ADMIN_EMAILS = 'registration-admin@example.com';

const [db, emailVerification, registrationPolicy, governance, { default: registerHandler }] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/email-verification.js'),
  import('../api/_lib/registration-policy.js'),
  import('../api/_lib/governance.js'),
  import('../api/auth/register.js')
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
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, socket: {}, ...req }, res))
    .then(() => ({ statusCode, payload, headers }));
}

test('registration requires a valid single-use email verification code', async () => {
  const email = 'verified@example.com';
  const issued = await emailVerification.issueRegistrationVerificationCode(email, { language: 'en' });
  assert.match(issued.previewCode, /^\d{6}$/);
  const stored = db.getDb().prepare('SELECT code_hash FROM email_verification_codes WHERE email = ?').get(email);
  assert.ok(stored.code_hash);
  assert.equal(stored.code_hash.includes(issued.previewCode), false);

  const invalid = await invoke(registerHandler, {
    method: 'POST',
    body: { email, password: 'testing-1234', fullName: 'Verified', verificationCode: '000000' }
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.payload.error, 'INVALID_VERIFICATION_CODE');

  const registered = await invoke(registerHandler, {
    method: 'POST',
    body: { email, password: 'testing-1234', fullName: 'Verified', verificationCode: issued.previewCode }
  });
  assert.equal(registered.statusCode, 201);
  assert.equal(registered.payload.user.email, email);
  assert.ok(registered.headers['set-cookie']);

  assert.throws(
    () => emailVerification.consumeRegistrationVerificationCode(email, issued.previewCode),
    (error) => error?.code === 'INVALID_VERIFICATION_CODE'
  );
});

test('domain denylist wins and non-empty allowlist restricts registration', () => {
  const admin = db.createUser({ email: 'registration-admin@example.com', password: 'testing-1234' });
  const updated = governance.updateRegistrationEmailPolicy(admin.id, {
    enabled: true,
    allowlist: ['example.com', '*.trusted.example'],
    denylist: ['blocked.example', '*.blocked.example']
  });
  assert.deepEqual(updated.allowlist, ['*.trusted.example', 'example.com']);
  assert.equal(registrationPolicy.evaluateRegistrationEmailDomain('person@example.com').allowed, true);
  assert.equal(registrationPolicy.evaluateRegistrationEmailDomain('person@team.trusted.example').allowed, true);
  assert.equal(registrationPolicy.evaluateRegistrationEmailDomain('person@trusted.example').allowed, false);
  assert.equal(registrationPolicy.evaluateRegistrationEmailDomain('person@other.example').code, 'EMAIL_DOMAIN_NOT_ALLOWED');
  assert.equal(registrationPolicy.evaluateRegistrationEmailDomain('person@blocked.example').code, 'EMAIL_DOMAIN_BLOCKED');
});
