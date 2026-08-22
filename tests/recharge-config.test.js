import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import {
  calculateRechargeCredits,
  normalizeRechargeConfig,
  quoteCustomRecharge
} from '../shared/recharge-config.js';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-recharge-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.SUPER_ADMIN_EMAILS = 'recharge-admin@example.com';

const [
  localDb,
  emailVerification,
  { default: registerHandler },
  { default: loginHandler },
  { default: rechargeAdminHandler },
  { default: catalogHandler }
] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/email-verification.js'),
  import('../api/auth/register.js'),
  import('../api/auth/login.js'),
  import('../api/admin/recharge.js'),
  import('../api/billing/catalog.js')
]);

after(() => {
  localDb.getDb().close();
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
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, ...req }, res))
    .then(() => ({ statusCode, payload, headers }));
}

test('default recharge plan matches the requested fixed packs and custom bonus', () => {
  const config = normalizeRechargeConfig();
  assert.equal(config.signupBonusCredits, 60);
  assert.equal(config.creditsPerYuan, 100);
  assert.deepEqual(config.packs.map((pack) => [pack.amountCents, pack.credits]), [
    [1000, 1000],
    [2000, 2020],
    [3000, 3050],
    [5000, 5200],
    [10000, 11000]
  ]);
  assert.deepEqual(calculateRechargeCredits(3000, 1.666667), {
    amountCents: 3000,
    baseCredits: 3000,
    bonusCredits: 50,
    credits: 3050,
    bonusPercent: 1.666667
  });
  assert.equal(quoteCustomRecharge(1000, config).credits, 1000);
  assert.equal(quoteCustomRecharge(2000, config).credits, 2020);
  assert.equal(quoteCustomRecharge(10001, config).requiresContact, true);
});

test('admin recharge configuration is persisted, audited, and exposed without enabling checkout', async () => {
  const admin = localDb.createUser({ email: 'recharge-admin@example.com', password: 'testing-1234' });
  const session = localDb.createSession(admin.id);
  const headers = { cookie: `member_session=${encodeURIComponent(session.token)}` };
  const update = await invoke(rechargeAdminHandler, {
    method: 'PATCH',
    headers,
    body: {
      signupBonusCredits: 60,
      packs: [
        { id: 'starter', amountCents: 1200, bonusPercent: 2, enabled: true },
        { id: 'hidden', amountCents: 3000, bonusPercent: 3, enabled: false }
      ],
      custom: {
        enabled: true,
        minimumAmountCents: 1000,
        bonusThresholdCents: 2000,
        bonusPercent: 1,
        maximumSelfServiceAmountCents: 10000,
        contactMessageZh: '超过100元请联系客服和销售。',
        contactMessageEn: 'Contact sales over ¥100.'
      }
    }
  });
  assert.equal(update.statusCode, 200);
  assert.equal(update.payload.recharge.packs[0].credits, 1224);
  assert.equal(localDb.getDb().prepare('SELECT COUNT(*) AS count FROM app_setting_audit WHERE setting_key = ?').get('recharge_config').count, 1);

  const catalog = await invoke(catalogHandler);
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.payload.checkoutAvailable, false);
  assert.equal(catalog.payload.paymentInterfaceReady, false);
  assert.equal(catalog.payload.packs.length, 1);
  assert.equal(catalog.payload.packs[0].credits, 1224);
});

test('a real registration receives the configured bonus once and later sign-ins do not repeat it', async () => {
  localDb.updateRechargeConfig(normalizeRechargeConfig(), null);
  const verification = await emailVerification.issueRegistrationVerificationCode('welcome@example.com');
  const registration = await invoke(registerHandler, {
    method: 'POST',
    body: { email: 'welcome@example.com', password: 'testing-1234', fullName: 'Welcome', verificationCode: verification.previewCode }
  });
  assert.equal(registration.statusCode, 201);
  assert.equal(registration.payload.user.creditBalance, 60);
  const user = localDb.getUserByEmail('welcome@example.com');
  assert.equal(localDb.listCreditLedger(user.id, 10).filter((entry) => entry.type === 'signup_bonus').length, 1);

  const login = await invoke(loginHandler, {
    method: 'POST',
    body: { email: 'welcome@example.com', password: 'testing-1234' }
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.payload.user.creditBalance, 60);
  assert.equal(localDb.listCreditLedger(user.id, 10).filter((entry) => entry.type === 'signup_bonus').length, 1);
});
