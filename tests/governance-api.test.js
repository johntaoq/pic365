import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-governance-api-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.PROVIDER_CONFIG_SECRET = 'governance-api-provider-secret';
process.env.SESSION_SECRET = 'governance-api-session-secret';
process.env.SUPER_ADMIN_EMAILS = 'root-governance-api@example.com';

const [
  db,
  { default: menuHandler },
  { default: globalSettingsHandler },
  { default: usersHandler },
  { default: editUserHandler },
  { default: adjustCreditsHandler },
  { default: redemptionCodesHandler },
  { default: revealCodeHandler },
  { default: redeemHandler },
  { default: financeReportHandler },
  { default: auditHandler },
  { default: providersHandler }
] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/menu-settings.js'),
  import('../api/admin/global-settings.js'),
  import('../api/admin/users.js'),
  import('../api/admin/users/edit.js'),
  import('../api/admin/credits/adjust.js'),
  import('../api/admin/redemption-codes.js'),
  import('../api/admin/redemption-codes/reveal.js'),
  import('../api/billing/redeem.js'),
  import('../api/admin/finance-report.js'),
  import('../api/admin/audit.js'),
  import('../api/admin/image-providers.js')
]);

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, req = {}) {
  let statusCode = 200;
  let payload;
  const headers = new Map();
  const res = {
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, ...req }, res))
    .then(() => ({ statusCode, payload, headers }));
}

function sessionHeaders(userId) {
  const session = db.createSession(userId);
  return { cookie: `member_session=${encodeURIComponent(session.token)}` };
}

const root = db.createUser({ email: 'root-governance-api@example.com', password: 'testing-1234', fullName: 'Root API' });
const accountant = db.createUser({ email: 'accountant-api@example.com', password: 'testing-1234', fullName: 'Accountant API' });
const operations = db.createUser({ email: 'operations-api@example.com', password: 'testing-1234', fullName: 'Operations API' });
const member = db.createUser({ email: 'member-governance-api@example.com', password: 'testing-1234', fullName: 'Member API' });
db.getDb().prepare("UPDATE users SET role = 'accountant' WHERE id = ?").run(accountant.id);
db.getDb().prepare("UPDATE users SET role = 'operations' WHERE id = ?").run(operations.id);
db.getDb().prepare('UPDATE users SET credit_balance = 100 WHERE id = ?').run(member.id);

const rootHeaders = sessionHeaders(root.id);
const accountantHeaders = sessionHeaders(accountant.id);
const operationsHeaders = sessionHeaders(operations.id);
const memberHeaders = sessionHeaders(member.id);

test('menu preferences are user-owned and global switches are super-admin only', async () => {
  const anonymous = await invoke(menuHandler);
  assert.equal(anonymous.statusCode, 200);
  assert.deepEqual(anonymous.payload.menu.effective, { ecommerce: true, templates: true, cases: true, api: true });

  const personal = await invoke(menuHandler, {
    method: 'PATCH', headers: memberHeaders,
    body: { hideEcommerce: true, hideTemplates: true, hideCases: false, hideApi: false }
  });
  assert.equal(personal.statusCode, 200);
  assert.equal(personal.payload.menu.effective.ecommerce, false);
  assert.equal(personal.payload.menu.effective.templates, false);

  const forbidden = await invoke(globalSettingsHandler, {
    method: 'PATCH', headers: accountantHeaders,
    body: { templates: false, cases: false, api: false }
  });
  assert.equal(forbidden.statusCode, 403);

  const global = await invoke(globalSettingsHandler, {
    method: 'PATCH', headers: rootHeaders,
    body: { templates: true, cases: false, api: true }
  });
  assert.equal(global.statusCode, 200);
  const effective = await invoke(menuHandler, { headers: memberHeaders });
  assert.deepEqual(effective.payload.menu.effective, { ecommerce: false, templates: false, cases: false, api: true });
});

test('accountants receive only credit-management users and cannot edit user profiles', async () => {
  const users = await invoke(usersHandler, { headers: accountantHeaders });
  assert.equal(users.statusCode, 200);
  assert.equal(users.payload.scope, 'credit-management');
  assert.equal(users.payload.users.some((user) => user.id === member.id), true);
  assert.equal(users.payload.users.every((user) => user.role === 'user'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(users.payload.users[0], 'lastLoginAt'), false);
  const operationsUsers = await invoke(usersHandler, { headers: operationsHeaders });
  assert.equal(operationsUsers.statusCode, 403);

  const note = await invoke(editUserHandler, {
    method: 'PATCH', headers: accountantHeaders,
    body: { userId: member.id, adminNote: '重点企业客户' }
  });
  assert.equal(note.statusCode, 403);

  const passwordHashBeforeBlankSubmit = db.getUserByEmail(member.email).password_hash;
  const memberSessionToken = decodeURIComponent(memberHeaders.cookie.split('=')[1]);
  const blankPassword = await invoke(editUserHandler, {
    method: 'PATCH', headers: rootHeaders,
    body: { userId: member.id, adminNote: '重点企业客户', password: '' }
  });
  assert.equal(blankPassword.statusCode, 200);
  assert.equal(db.getUserByEmail(member.email).password_hash, passwordHashBeforeBlankSubmit);
  assert.ok(db.getUserBySessionToken(memberSessionToken));

  const password = await invoke(editUserHandler, {
    method: 'PATCH', headers: accountantHeaders,
    body: { userId: member.id, password: 'replacement-1234' }
  });
  assert.equal(password.statusCode, 403);

  const adjustment = await invoke(adjustCreditsHandler, {
    method: 'POST', headers: accountantHeaders,
    body: {
      userId: member.id, amount: 25, reasonCode: 'corporate',
      details: '对公回单 API-001', requestId: 'governance-api-credit-001'
    }
  });
  assert.equal(adjustment.statusCode, 200);
  assert.equal(adjustment.payload.user.creditBalance, 125);
});

test('accountants can issue and reveal single-use codes while only super admins can void them', async () => {
  const unconfirmed = await invoke(redemptionCodesHandler, {
    method: 'POST', headers: accountantHeaders,
    body: {
      codeType: 'paid', faceValueCents: 1000, quantity: 1,
      paidSource: 'corporate', paymentConfirmed: false
    }
  });
  assert.equal(unconfirmed.statusCode, 201);
  assert.equal(unconfirmed.payload.batch.paymentConfirmed, false);

  const created = await invoke(redemptionCodesHandler, {
    method: 'POST', headers: accountantHeaders,
    body: {
      codeType: 'paid', faceValueCents: 1000, quantity: 2,
      paidSource: 'other', sourceDetail: '现金', paymentConfirmed: true,
      note: '线下付款 API test'
    }
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.payload.codes.length, 2);
  const batchId = created.payload.batch.id;

  const listed = await invoke(redemptionCodesHandler, {
    headers: accountantHeaders, query: { batchId, codeLimit: 100 }
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.payload.codes.length, 2);
  assert.equal(listed.payload.codes[0].code, undefined);
  const flatListed = await invoke(redemptionCodesHandler, {
    headers: accountantHeaders, query: { codeLimit: 1000 }
  });
  assert.equal(flatListed.statusCode, 200);
  assert.equal(flatListed.payload.codes.some((code) => code.batchNumber === created.payload.batch.batchNumber), true);

  const revealed = await invoke(revealCodeHandler, {
    method: 'POST', headers: accountantHeaders,
    body: { codeId: listed.payload.codes[0].id }
  });
  assert.equal(revealed.statusCode, 200);
  assert.match(revealed.payload.code.code, /^PIC-/);

  const redeemed = await invoke(redeemHandler, {
    method: 'POST', headers: memberHeaders,
    body: { code: revealed.payload.code.code, requestId: 'governance-api-redeem-001' }
  });
  assert.equal(redeemed.statusCode, 200);
  assert.equal(redeemed.payload.credits, 1000);

  const repeated = await invoke(redeemHandler, {
    method: 'POST', headers: memberHeaders,
    body: { code: revealed.payload.code.code, requestId: 'governance-api-redeem-002' }
  });
  assert.equal(repeated.statusCode, 400);

  const accountantDisable = await invoke(redemptionCodesHandler, {
    method: 'PATCH', headers: accountantHeaders,
    body: { codeId: listed.payload.codes[1].id, action: 'disable' }
  });
  assert.equal(accountantDisable.statusCode, 200);
  assert.equal(accountantDisable.payload.code.status, 'disabled');

  const accountantVoid = await invoke(redemptionCodesHandler, {
    method: 'PATCH', headers: accountantHeaders,
    body: { codeId: listed.payload.codes[1].id, action: 'void' }
  });
  assert.equal(accountantVoid.statusCode, 403);
  const rootVoid = await invoke(redemptionCodesHandler, {
    method: 'PATCH', headers: rootHeaders,
    body: { codeId: listed.payload.codes[1].id, action: 'void' }
  });
  assert.equal(rootVoid.statusCode, 200);
  assert.equal(rootVoid.payload.code.status, 'voided');
  const rootReenable = await invoke(redemptionCodesHandler, {
    method: 'PATCH', headers: rootHeaders,
    body: { codeId: listed.payload.codes[1].id, action: 'enable' }
  });
  assert.equal(rootReenable.statusCode, 400);
});

test('operations can manage channels without gaining finance access or overriding pricing', async () => {
  const accountantProviders = await invoke(providersHandler, { headers: accountantHeaders });
  assert.equal(accountantProviders.statusCode, 403);
  const provider = await invoke(providersHandler, {
    method: 'POST', headers: operationsHeaders,
    body: {
      name: 'Operations test provider', providerType: 'openai-compatible',
      baseUrl: 'https://provider.example.invalid', apiKey: 'sk-operations-test',
      model: 'gpt-image-2', enabled: true, isDefault: false,
      pricingStrategy: 'fixed-image', pricingConfig: { fixedImageRmb: 999 }
    }
  });
  assert.equal(provider.statusCode, 201);
  assert.notEqual(provider.payload.provider.pricingConfig?.fixedImageRmb, 999);

  const operationsAudit = await invoke(auditHandler, { headers: operationsHeaders, query: { limit: 100 } });
  assert.equal(operationsAudit.statusCode, 200);
  assert.equal(operationsAudit.payload.events.some((event) => event.category === 'channels'), true);
  assert.equal(operationsAudit.payload.events.some((event) => event.category === 'credits'), false);

  const accountantAudit = await invoke(auditHandler, { headers: accountantHeaders, query: { limit: 100 } });
  assert.equal(accountantAudit.statusCode, 200);
  assert.equal(accountantAudit.payload.events.some((event) => event.category === 'credits'), true);
  assert.equal(accountantAudit.payload.events.some((event) => event.category === 'channels'), false);

  const userAudit = await invoke(auditHandler, { headers: rootHeaders, query: { scope: 'user-settings', limit: 100 } });
  assert.equal(userAudit.statusCode, 200);
  assert.equal(userAudit.payload.events.length > 0, true);
  assert.equal(userAudit.payload.events.every((event) => ['users', 'roles'].includes(event.category)), true);
  const accountantUserAudit = await invoke(auditHandler, { headers: accountantHeaders, query: { scope: 'user-settings', limit: 100 } });
  assert.equal(accountantUserAudit.statusCode, 403);

  const finance = await invoke(financeReportHandler, { headers: accountantHeaders });
  assert.equal(finance.statusCode, 200);
  assert.equal(finance.payload.report.totals.manualCreditsAdded, 25);
  assert.equal(finance.payload.report.totals.paidCodeRedeemedCents, 1000);
  const operationsFinance = await invoke(financeReportHandler, { headers: operationsHeaders });
  assert.equal(operationsFinance.statusCode, 403);
});
