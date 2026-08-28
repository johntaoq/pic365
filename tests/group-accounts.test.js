import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-groups-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.SESSION_SECRET = 'group-account-test-secret';
process.env.PROVIDER_CONFIG_SECRET = 'group-account-provider-secret';
process.env.CHAT_PROVIDER_API_KEY = 'sk-group-test';
process.env.CHAT_PROVIDER_BASE_URL = 'https://provider.example.invalid';
delete process.env.SUPER_ADMIN_EMAILS;

const [db, chat] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/chat-engine.js')
]);

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function user(email, credits = 0) {
  return db.createUser({ email, password: 'testing-1234', fullName: email.split('@')[0], initialCredits: credits });
}

test('group invitation, funding and member budgets keep one backed wallet', () => {
  const admin = user('group-admin@example.com', 1200);
  const member = user('group-member@example.com');
  db.createGroupAccount(admin.id, 'Pic365 集团');
  db.fundGroupAccount(admin.id, 1000, 'fund-once');
  db.fundGroupAccount(admin.id, 1000, 'fund-once');
  assert.equal(db.getUserProfile(admin.id).personalCreditBalance, 200);
  assert.equal(db.getGroupAccountSummary(admin.id).membership.balance, 1000);

  const invited = db.inviteGroupMember(admin.id, member.email);
  const invitation = invited.membership.outgoingInvitations[0];
  db.respondGroupInvitation(member.id, invitation.id, true);
  db.adjustGroupMemberBudget(admin.id, member.id, 400, 'budget-member-400');

  const adminSummary = db.getGroupAccountSummary(admin.id, { includeMembers: true }).membership;
  const memberSummary = db.getGroupAccountSummary(member.id).membership;
  assert.equal(adminSummary.adminAvailable, 600);
  assert.equal(adminSummary.allocatedBudget, 400);
  assert.equal(memberSummary.available, 400);
  assert.equal(db.getUserProfile(member.id).creditBalance, 400);
  assert.throws(() => db.adjustGroupMemberBudget(admin.id, member.id, 601, 'overallocate'), /GROUP_BALANCE_REQUIRED/);
});

test('member and administrator reservations cannot race or overdraw the group wallet', () => {
  const admin = db.getUserByEmail('group-admin@example.com');
  const member = db.getUserByEmail('group-member@example.com');
  const memberReservation = db.reserveCredit(member.id, { amount: 300, prompt: 'member image', requestKey: 'member-image-1' });
  assert.equal(memberReservation.billingScope, 'group');
  assert.equal(db.getGroupAccountSummary(member.id).membership.available, 100);

  const adminReservation = db.reserveCredit(admin.id, { amount: 600, prompt: 'admin image', requestKey: 'admin-image-1' });
  assert.throws(() => db.reserveCredit(admin.id, { amount: 1, prompt: 'overdraw' }), /GROUP_BALANCE_REQUIRED/);
  assert.throws(() => db.reserveCredit(member.id, { amount: 101, prompt: 'member over budget' }), /GROUP_BUDGET_REQUIRED/);

  db.completeCreditReservation(memberReservation.reservationId);
  assert.equal(db.getGroupAccountSummary(admin.id).membership.balance, 700);
  db.releaseCreditReservation(adminReservation.reservationId, 'TEST_RELEASE');
  const summary = db.getGroupAccountSummary(admin.id, { includeMembers: true }).membership;
  assert.equal(summary.balance, 700);
  assert.equal(summary.adminAvailable, 600);
  assert.equal(summary.members.find((item) => item.userId === member.id).spent, 300);
  assert.equal(db.listCreditLedger(member.id, 10).filter((row) => row.type === 'generation').length, 1);
});

test('unknown group charges fall back to the administrator and remain auditable', () => {
  const admin = db.getUserByEmail('group-admin@example.com');
  const outsider = user('group-outsider@example.com', 10);
  const groupId = db.getGroupAccountSummary(admin.id).membership.id;
  const reservation = db.reserveCreditCenti(outsider.id, {
    amountCenti: 5_000,
    source: 'group_background_cost',
    requestKey: 'background-cost-1',
    fallbackGroupId: groupId,
    metadata: { reason: 'unattributed' }
  });
  assert.equal(reservation.chargedUserId, admin.id);
  db.settleCreditReservation(reservation.reservationId, 4_250);
  const summary = db.getGroupAccountSummary(admin.id, { includeMembers: true }).membership;
  assert.equal(summary.balance, 657.5);
  const charge = summary.ledger.find((row) => row.referenceId === reservation.reservationId);
  assert.equal(charge.amount, -42.5);
  assert.equal(charge.chargedEmail, admin.email);
  assert.equal(db.getUserProfile(outsider.id).personalCreditBalance, 10);
});

test('leaving members cannot spend and unfinished reservations release to the administrator', () => {
  const admin = db.getUserByEmail('group-admin@example.com');
  const member = db.getUserByEmail('group-member@example.com');
  db.adjustGroupMemberBudget(admin.id, member.id, 50, 'budget-member-plus-50');
  const reservation = db.reserveCredit(member.id, { amount: 50, prompt: 'leaving image', requestKey: 'leaving-image' });
  db.leaveGroupAccount(member.id);
  assert.equal(db.getGroupAccountSummary(member.id).membership.status, 'leaving');
  assert.throws(() => db.reserveCredit(member.id, { amount: 1, prompt: 'blocked' }), /GROUP_ACCESS_SUSPENDED/);
  db.releaseCreditReservation(reservation.reservationId, 'MEMBER_LEFT');
  assert.equal(db.getGroupAccountSummary(member.id).membership, null);
  assert.equal(db.getGroupAccountSummary(admin.id).membership.adminAvailable, 657.5);
});

test('group financial ledger is immutable', () => {
  const admin = db.getUserByEmail('group-admin@example.com');
  const groupId = db.getGroupAccountSummary(admin.id).membership.id;
  const ledger = db.getDb().prepare('SELECT id FROM group_credit_ledger WHERE group_id = ? LIMIT 1').get(groupId);
  assert.throws(() => db.getDb().prepare('UPDATE group_credit_ledger SET amount_centi = 0 WHERE id = ?').run(ledger.id), /GROUP_CREDIT_LEDGER_IMMUTABLE/);
  assert.throws(() => db.getDb().prepare('DELETE FROM group_credit_ledger WHERE id = ?').run(ledger.id), /GROUP_CREDIT_LEDGER_IMMUTABLE/);
});

test('group chat reserves a maximum and settles only actual token usage', () => {
  const admin = user('chat-group-admin@example.com', 100);
  const member = user('chat-group-member@example.com');
  db.createGroupAccount(admin.id, 'Chat Group');
  db.fundGroupAccount(admin.id, 100, 'chat-group-fund');
  const invitation = db.inviteGroupMember(admin.id, member.email).membership.outgoingInvitations[0];
  db.respondGroupInvitation(member.id, invitation.id, true);
  db.adjustGroupMemberBudget(admin.id, member.id, 20, 'chat-member-budget');
  const provider = {
    id: 'chat-test-provider',
    model: 'gpt-5.6-luna',
    maxOutputTokens: 100,
    pricing: { input: 7, output: 42, cacheRead: 0.7, cacheWrite: 8.75 }
  };
  const reservation = chat.reserveChatCreditCapacity(member.id, {
    text: '测试集团聊天预留',
    imageCount: 0,
    provider,
    clientRequestId: 'group-chat-once'
  });
  const reserved = reservation.creditAmount;
  assert.ok(reserved > 0);
  const conversation = chat.getOrCreateChatConversation(member.id);
  const result = chat.commitChatExchange({
    userId: member.id,
    conversationId: conversation.id,
    clientRequestId: 'group-chat-once',
    userText: '你好',
    assistantText: '你好。',
    provider,
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    reservationId: reservation.reservationId
  });
  assert.equal(result.message.chargedCredits, 0.03);
  const memberSummary = db.getGroupAccountSummary(member.id).membership;
  assert.equal(memberSummary.reserved, 0);
  assert.equal(memberSummary.available, 19.97);
  assert.equal(memberSummary.balance, 99.97);
});

test('administrator transfer requires the current password and the successor confirmation', () => {
  const admin = user('transfer-admin@example.com', 50);
  const member = user('transfer-member@example.com');
  db.createGroupAccount(admin.id, 'Transfer Group');
  db.fundGroupAccount(admin.id, 50, 'transfer-fund');
  const invitation = db.inviteGroupMember(admin.id, member.email).membership.outgoingInvitations[0];
  db.respondGroupInvitation(member.id, invitation.id, true);
  assert.throws(() => db.requestGroupAdminTransfer(admin.id, member.id, 'wrong-password'), /INVALID_CURRENT_PASSWORD/);
  const requested = db.requestGroupAdminTransfer(admin.id, member.id, 'testing-1234');
  const pending = db.getGroupAccountSummary(member.id).membership.pendingAdminTransfer;
  assert.equal(pending.id, requested.transferId);
  db.respondGroupAdminTransfer(member.id, requested.transferId, true);
  assert.equal(db.getGroupAccountSummary(member.id).membership.role, 'admin');
  assert.equal(db.getGroupAccountSummary(admin.id).membership.role, 'member');
  assert.equal(db.getDb().prepare("SELECT COUNT(*) AS count FROM group_memberships WHERE group_id = ? AND role = 'admin' AND status = 'active'").get(db.getGroupAccountSummary(member.id).membership.id).count, 1);
});

test('rapid reservations cannot exceed backed member budgets or the group balance', () => {
  const admin = user('race-admin@example.com', 1000);
  const first = user('race-first@example.com');
  const second = user('race-second@example.com');
  db.createGroupAccount(admin.id, 'Race Group');
  db.fundGroupAccount(admin.id, 1000, 'race-fund');
  for (const member of [first, second]) {
    const invitation = db.inviteGroupMember(admin.id, member.email).membership.outgoingInvitations.find((item) => item.email === member.email);
    db.respondGroupInvitation(member.id, invitation.id, true);
    db.adjustGroupMemberBudget(admin.id, member.id, 400, `race-budget-${member.id}`);
  }
  const reservations = [];
  for (let index = 0; index < 40; index += 1) {
    reservations.push(db.reserveCredit(first.id, { amount: 10, prompt: 'race', requestKey: `race-first-${index}` }));
    reservations.push(db.reserveCredit(second.id, { amount: 10, prompt: 'race', requestKey: `race-second-${index}` }));
  }
  const adminReservations = [];
  for (let index = 0; index < 20; index += 1) {
    adminReservations.push(db.reserveCredit(admin.id, { amount: 10, prompt: 'race-admin', requestKey: `race-admin-${index}` }));
  }
  assert.throws(() => db.reserveCredit(admin.id, { amount: 1, prompt: 'one too many' }), /GROUP_BALANCE_REQUIRED/);
  assert.throws(() => db.reserveCredit(first.id, { amount: 1, prompt: 'member over budget' }), /GROUP_BUDGET_REQUIRED/);
  [...reservations, ...adminReservations].forEach((reservation) => db.completeCreditReservation(reservation.reservationId));
  const summary = db.getGroupAccountSummary(admin.id).membership;
  assert.equal(summary.balance, 0);
  assert.equal(summary.totalReserved, 0);
  assert.equal(summary.adminAvailable, 0);
});
