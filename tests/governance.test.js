import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-governance-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.PROVIDER_CONFIG_SECRET = 'governance-test-secret';
process.env.SUPER_ADMIN_EMAILS = 'root-governance@example.com';

const db = await import('../api/_lib/local-db.js');
const governance = await import('../api/_lib/governance.js');
const { ADMIN_PERMISSIONS, roleHasPermission } = await import('../shared/admin-permissions.js');

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

const root = db.createUser({ email: 'root-governance@example.com', password: 'testing-1234', fullName: 'Root Admin' });
const accountant = db.createUser({ email: 'accountant@example.com', password: 'testing-1234', fullName: 'Accountant One' });
const operations = db.createUser({ email: 'operations@example.com', password: 'testing-1234', fullName: 'Operations One' });
const member = db.createUser({ email: 'member-governance@example.com', password: 'testing-1234', fullName: 'Member One' });
db.getDb().prepare("UPDATE users SET role = 'accountant' WHERE id = ?").run(accountant.id);
db.getDb().prepare("UPDATE users SET role = 'operations' WHERE id = ?").run(operations.id);
db.getDb().prepare('UPDATE users SET credit_balance = 100 WHERE id = ?').run(member.id);

test('accountant and operations are parallel least-privilege roles', () => {
  const currentAccountant = db.getUserById(accountant.id);
  const currentOperations = db.getUserById(operations.id);
  assert.equal(roleHasPermission(currentAccountant.role, ADMIN_PERMISSIONS.ADJUST_CREDITS), true);
  assert.equal(roleHasPermission(currentAccountant.role, ADMIN_PERMISSIONS.VIEW_USERS), false);
  assert.equal(roleHasPermission(currentAccountant.role, ADMIN_PERMISSIONS.EDIT_USER_NOTE), false);
  assert.equal(roleHasPermission(currentAccountant.role, ADMIN_PERMISSIONS.MANAGE_CHANNELS), false);
  assert.equal(roleHasPermission(currentOperations.role, ADMIN_PERMISSIONS.MANAGE_CHANNELS), true);
  assert.equal(roleHasPermission(currentOperations.role, ADMIN_PERMISSIONS.ADJUST_CREDITS), false);
  assert.equal(db.getUserById(root.id).adminPermissions.length, Object.values(ADMIN_PERMISSIONS).length);
});

test('global menu settings override and preserve personal preferences', () => {
  governance.updateUserMenuPreferences(member.id, { hideEcommerce: true, hideTemplates: true, hideCases: false, hideApi: false });
  governance.updateGlobalMenuSettings(root.id, { templates: false, cases: true, api: false });
  const hidden = governance.getEffectiveMenuSettings(member.id);
  assert.deepEqual(hidden.effective, { ecommerce: false, templates: false, cases: true, api: false });
  assert.equal(hidden.personal.hideEcommerce, true);
  assert.equal(hidden.personal.hideTemplates, true);
  governance.updateGlobalMenuSettings(root.id, { templates: true, cases: true, api: true });
  const reopened = governance.getEffectiveMenuSettings(member.id);
  assert.deepEqual(reopened.effective, { ecommerce: false, templates: false, cases: true, api: true });
});

test('accountants cannot enter user management or edit user profiles', () => {
  assert.throws(
    () => governance.editManagedUser({ actorUserId: accountant.id, targetUserId: member.id, adminNote: '重点测试客户' }),
    (error) => error?.code === 'FORBIDDEN'
  );
  assert.throws(
    () => governance.editManagedUser({ actorUserId: accountant.id, targetUserId: member.id, adminNote: '重点测试客户', password: 'replacement-1234' }),
    (error) => error?.code === 'FORBIDDEN'
  );
  assert.throws(
    () => governance.editManagedUser({ actorUserId: accountant.id, targetUserId: operations.id, adminNote: 'should fail' }),
    (error) => error?.code === 'FORBIDDEN'
  );
  const rootNote = governance.editManagedUser({
    actorUserId: root.id,
    targetUserId: member.id,
    adminNote: '重点测试客户'
  });
  assert.equal(rootNote.changed, true);
  const passwordHashBeforeBlankSubmit = db.getUserByEmail(member.email).password_hash;
  const sessionBeforeBlankSubmit = db.createSession(member.id);
  const blankPassword = governance.editManagedUser({
    actorUserId: root.id,
    targetUserId: member.id,
    adminNote: '重点测试客户',
    password: ''
  });
  assert.equal(blankPassword.changed, false);
  assert.equal(db.getUserByEmail(member.email).password_hash, passwordHashBeforeBlankSubmit);
  assert.ok(db.getUserBySessionToken(sessionBeforeBlankSubmit.token));
  const reset = governance.editManagedUser({ actorUserId: root.id, targetUserId: member.id, adminNote: '重点测试客户', password: 'replacement-1234' });
  assert.equal(reset.changed, true);
  assert.equal(db.verifyPassword('replacement-1234', db.getUserByEmail(member.email).password_hash), true);
  assert.equal(db.getUserBySessionToken(sessionBeforeBlankSubmit.token), null);
});

test('credit adjustments validate direction-specific reasons, prevent self/admin changes, and are idempotent', () => {
  assert.throws(
    () => governance.adjustManagedUserCredits({ actorUserId: accountant.id, targetUserId: member.id, amount: 10, reasonCode: 'clearance', details: 'wrong direction', requestId: 'wrong-direction' }),
    (error) => error?.code === 'CREDIT_REASON_REQUIRED'
  );
  const added = governance.adjustManagedUserCredits({
    actorUserId: accountant.id, targetUserId: member.id, amount: 50,
    reasonCode: 'corporate', details: '银行回单 GOV-001', requestId: 'gov-credit-001'
  });
  assert.equal(added.user.creditBalance, 150);
  const duplicate = governance.adjustManagedUserCredits({
    actorUserId: accountant.id, targetUserId: member.id, amount: 50,
    reasonCode: 'corporate', details: '银行回单 GOV-001', requestId: 'gov-credit-001'
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.user.creditBalance, 150);
  assert.throws(
    () => governance.adjustManagedUserCredits({ actorUserId: accountant.id, targetUserId: accountant.id, amount: 1, reasonCode: 'gift', details: 'self', requestId: 'self-adjust' }),
    (error) => error?.code === 'CANNOT_ADJUST_SELF'
  );
  assert.throws(
    () => governance.adjustManagedUserCredits({ actorUserId: accountant.id, targetUserId: operations.id, amount: 1, reasonCode: 'gift', details: 'admin', requestId: 'admin-adjust' }),
    (error) => error?.code === 'FORBIDDEN'
  );
});

test('redemption codes are single-use, encrypted at rest, reveal-audited, and accountant cannot void them', () => {
  assert.throws(
    () => governance.createRedemptionCodeBatch({ actorUserId: accountant.id, codeType: 'free', faceValueCents: 1000, quantity: 1, freePurpose: 'activity', note: '' }),
    (error) => error?.code === 'FREE_CODE_NOTE_REQUIRED'
  );
  const unconfirmed = governance.createRedemptionCodeBatch({
    actorUserId: accountant.id,
    codeType: 'paid', faceValueCents: 1000, quantity: 1,
    paidSource: 'corporate', paymentConfirmed: false
  });
  assert.equal(unconfirmed.codes.length, 1);
  assert.equal(unconfirmed.batch.paymentConfirmed, false);
  const created = governance.createRedemptionCodeBatch({
    actorUserId: accountant.id,
    codeType: 'paid', faceValueCents: 1000, quantity: 2,
    paidSource: 'other', sourceDetail: '现金', paymentConfirmed: true, note: '线下收款'
  });
  assert.equal(created.codes.length, 2);
  assert.equal(created.batch.operatorName, 'Accountant One');
  const stored = db.getDb().prepare('SELECT code_hash, code_ciphertext, code_masked FROM redemption_codes WHERE batch_id = ? LIMIT 1').get(created.batch.id);
  assert.equal(stored.code_hash.includes(created.codes[0]), false);
  assert.equal(stored.code_ciphertext.includes(created.codes[0]), false);
  assert.equal(stored.code_masked.includes(created.codes[0]), false);

  const codeRow = governance.listRedemptionCodes(created.batch.id)[0];
  const revealed = governance.revealRedemptionCode({ actorUserId: accountant.id, codeId: codeRow.id });
  assert.equal(created.codes.includes(revealed.code), true);
  assert.throws(
    () => governance.voidRedemptionCode({ actorUserId: accountant.id, codeId: codeRow.id, reason: 'not allowed' }),
    (error) => error?.code === 'FORBIDDEN'
  );

  const before = db.getUserById(member.id).creditBalance;
  const redemption = governance.redeemCode({ userId: member.id, code: revealed.code, requestId: 'redeem-001' });
  assert.equal(redemption.credits, 1000);
  assert.equal(redemption.user.creditBalance, before + 1000);
  assert.throws(
    () => governance.redeemCode({ userId: member.id, code: revealed.code, requestId: 'redeem-002' }),
    (error) => error?.code === 'REDEMPTION_CODE_UNAVAILABLE'
  );
  const remainingCode = governance.listRedemptionCodes(created.batch.id).find((item) => item.status === 'available');
  assert.equal(governance.setRedemptionCodeStatus({ actorUserId: accountant.id, codeId: remainingCode.id, nextStatus: 'disabled' }).status, 'disabled');
  const disabledPlain = governance.revealRedemptionCode({ actorUserId: accountant.id, codeId: remainingCode.id });
  assert.throws(
    () => governance.redeemCode({ userId: member.id, code: disabledPlain.code, requestId: 'redeem-disabled' }),
    (error) => error?.code === 'REDEMPTION_CODE_UNAVAILABLE'
  );
  assert.equal(governance.setRedemptionCodeStatus({ actorUserId: accountant.id, codeId: remainingCode.id, nextStatus: 'available' }).status, 'available');
  assert.throws(
    () => governance.voidRedemptionCode({ actorUserId: root.id, codeId: remainingCode.id, reason: '未禁用直接作废' }),
    (error) => error?.code === 'INVALID_REDEMPTION_CODE_STATUS_TRANSITION'
  );
  assert.equal(governance.setRedemptionCodeStatus({ actorUserId: accountant.id, codeId: remainingCode.id, nextStatus: 'disabled' }).status, 'disabled');
  assert.equal(governance.voidRedemptionCode({ actorUserId: root.id, codeId: remainingCode.id }).status, 'voided');
  assert.throws(
    () => governance.setRedemptionCodeStatus({ actorUserId: root.id, codeId: remainingCode.id, nextStatus: 'available' }),
    (error) => error?.code === 'INVALID_REDEMPTION_CODE_STATUS_TRANSITION'
  );
});

test('all ledger changes and sensitive redemption actions are audited and audit records are immutable', () => {
  const financeEvents = governance.listAuditEventsForUser(accountant.id, { limit: 500 });
  assert.equal(financeEvents.some((event) => event.action === 'credit_adjustment' && event.creditDelta === 50), true);
  assert.equal(financeEvents.some((event) => event.action === 'credit_ledger_posted' && event.reason === 'paid_code'), true);
  assert.equal(financeEvents.some((event) => event.action === 'redemption_code_revealed'), true);
  assert.equal(financeEvents.every((event) => !JSON.stringify(event).includes('PIC-')), true);
  const [event] = financeEvents;
  assert.throws(() => db.getDb().prepare('DELETE FROM audit_events WHERE id = ?').run(event.id), /AUDIT_EVENTS_IMMUTABLE/);
  const ledger = db.listCreditLedger(member.id, 1)[0];
  assert.throws(() => db.getDb().prepare('UPDATE credit_ledger SET amount = 999 WHERE id = ?').run(ledger.id), /CREDIT_LEDGER_IMMUTABLE/);
});

test('audit scopes filter credits, user changes, and redemption without mixing categories', () => {
  const creditEvents = governance.listAuditEventsForUser(root.id, { scope: 'credits', limit: 500 });
  assert.equal(creditEvents.length > 0, true);
  assert.equal(creditEvents.every((event) => event.category === 'credits'), true);

  const userEvents = governance.listAuditEventsForUser(root.id, { scope: 'user-settings', limit: 500 });
  assert.equal(userEvents.some((event) => event.action === 'user_note_updated'), true);
  assert.equal(userEvents.every((event) => ['users', 'roles'].includes(event.category)), true);

  const redemptionEvents = governance.listAuditEventsForUser(root.id, { scope: 'redemption', limit: 500 });
  assert.equal(redemptionEvents.length > 0, true);
  assert.equal(redemptionEvents.every((event) => event.category === 'redemption'), true);

  assert.throws(
    () => governance.listAuditEventsForUser(accountant.id, { scope: 'user-settings' }),
    (error) => error?.code === 'FORBIDDEN'
  );
});

test('expired redemption codes persist their expired state instead of rolling it back', () => {
  const created = governance.createRedemptionCodeBatch({
    actorUserId: accountant.id,
    codeType: 'free', faceValueCents: 100, quantity: 1,
    freePurpose: 'activity', note: 'expired-code regression',
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  db.getDb().prepare('UPDATE redemption_code_batches SET expires_at = ? WHERE id = ?')
    .run(new Date(Date.now() - 60_000).toISOString(), created.batch.id);
  assert.throws(
    () => governance.redeemCode({ userId: member.id, code: created.codes[0], requestId: 'expired-code-test' }),
    (error) => error?.code === 'REDEMPTION_CODE_UNAVAILABLE'
  );
  assert.equal(governance.listRedemptionCodes(created.batch.id)[0].status, 'expired');
});

test('financial report reconciles redemption values and manual credit adjustments', () => {
  const report = governance.getFinancialGovernanceReport();
  assert.equal(report.totals.manualCreditsAdded >= 50, true);
  assert.equal(report.creditAdjustments.some((row) => row.reason === 'corporate' && row.netCredits >= 50), true);
  assert.equal(report.redemption.some((row) => row.codeType === 'paid' && row.redeemedCents >= 1000), true);
});
