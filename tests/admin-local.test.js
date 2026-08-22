import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'awesome-gpt-image-admin-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.SUPER_ADMIN_EMAILS = 'admin@example.com';

const [localDb, { default: usersHandler }, { default: adjustHandler }, { default: editUserHandler }, { default: metricsHandler }, { default: notificationsHandler }, { default: siteNoticeHandler }] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/admin/users.js'),
  import('../api/admin/credits/adjust.js'),
  import('../api/admin/users/edit.js'),
  import('../api/admin/metrics.js'),
  import('../api/admin/notifications.js'),
  import('../api/site-notice.js')
]);

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, req) {
  let statusCode = 200;
  let payload;
  const headers = {};
  const res = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return value;
    }
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, ...req }, res))
    .then(() => ({ statusCode, payload, headers }));
}

function seedGeneration(userId, { amount, status, prompt }) {
  const reservation = localDb.reserveCredit(userId, {
    prompt,
    amount,
    metadata: { size: '1024x1024', quality: 'low' }
  });
  const generationId = localDb.createGeneration({
    userId,
    reservationId: reservation.reservationId,
    caseId: null,
    prompt,
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'low',
    provider: 'test'
  });
  localDb.updateGeneration(generationId, {
    status,
    completed_at: new Date().toISOString()
  });
  if (status === 'succeeded') localDb.completeCreditReservation(reservation.reservationId);
  else localDb.releaseCreditReservation(reservation.reservationId, 'TEST_FAILURE');
  return generationId;
}

const admin = localDb.createUser({
  email: 'admin@example.com',
  password: 'testing-1234',
  fullName: 'Admin'
});
const member = localDb.createUser({
  email: 'member@example.com',
  password: 'testing-1234',
  fullName: 'Member'
});
localDb.getDb().prepare('UPDATE users SET credit_balance = 1000 WHERE id = ?').run(member.id);

test('configured email becomes a super admin without auto-promoting other users', () => {
  assert.equal(admin.isSuperAdmin, true);
  assert.equal(member.isSuperAdmin, false);
});

test('admin credit adjustment is atomic, audited, and cannot overdraw', () => {
  const credited = localDb.adjustUserCredits({
    adminUserId: admin.id,
    userId: member.id,
    amount: 200,
    reason: 'P0 test credit'
  });
  assert.equal(credited.creditBalance, 1200);

  const debited = localDb.adjustUserCredits({
    adminUserId: admin.id,
    userId: member.id,
    amount: -50,
    reason: 'P0 test correction'
  });
  assert.equal(debited.creditBalance, 1150);
  assert.throws(
    () => localDb.adjustUserCredits({ adminUserId: admin.id, userId: member.id, amount: -2000 }),
    (error) => error?.code === 'CREDITS_INSUFFICIENT'
  );
  assert.throws(
    () => localDb.adjustUserCredits({ adminUserId: member.id, userId: admin.id, amount: 1 }),
    (error) => error?.code === 'FORBIDDEN'
  );

  const audit = localDb.listCreditLedger(member.id, 10).filter((row) => row.type === 'adjustment');
  assert.equal(audit.length, 2);
  assert.equal(JSON.parse(audit[0].metadata).adminUserId, admin.id);
});

test('usage and admin summaries count successful net image credits, not image count', () => {
  localDb.getDb().prepare(`
    INSERT INTO credit_ledger (id, user_id, amount, type, source, metadata, created_at)
    VALUES (?, ?, 300, 'purchase', 'test_purchase', '{}', ?)
  `).run('purchase-ledger-test', member.id, new Date().toISOString());
  seedGeneration(member.id, { amount: 120, status: 'succeeded', prompt: 'successful image' });
  seedGeneration(member.id, { amount: 80, status: 'failed', prompt: 'failed image' });

  const profile = localDb.getUserProfile(member.id);
  assert.equal(profile.usage.totalGenerations, 2);
  assert.equal(profile.usage.succeededGenerations, 1);
  assert.equal(profile.usage.failedGenerations, 1);
  assert.equal(profile.usage.totalGenerationCredits, 120);
  assert.equal(profile.usage.purchasedCredits, 300);
  assert.ok(profile.recentTransactions.some((transaction) => transaction.type === 'generation'));
  assert.ok(profile.recentTransactions.some((transaction) => transaction.type === 'refund'));

  const summary = localDb.listAdminUsers().find((user) => user.id === member.id);
  assert.equal(summary.usage.totalGenerationCredits, 120);
  assert.equal(summary.usage.purchasedCredits, 300);
});

test('admin metrics include a complete daily row and net credit consumption', () => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const metrics = localDb.getAdminBusinessMetrics({
    startAt: start.toISOString(),
    endAt: end.toISOString()
  });
  assert.equal(Number(metrics.total_users), 2);
  assert.equal(Number(metrics.super_admins), 1);
  assert.equal(Number(metrics.total_generations), 2);
  assert.equal(Number(metrics.total_generation_credits), 120);

  const daily = localDb.listAdminBusinessDailyMetrics({
    startAt: start.toISOString(),
    endAt: end.toISOString()
  });
  assert.equal(daily.length, 1);
  assert.equal(Number(daily[0].generations), 2);
  assert.equal(Number(daily[0].credits_consumed), 120);
});

test('local admin APIs authorize sessions and no longer depend on Supabase', async () => {
  const adminSession = localDb.createSession(admin.id);
  const memberSession = localDb.createSession(member.id);
  const adminHeaders = { cookie: `member_session=${encodeURIComponent(adminSession.token)}` };

  const usersResult = await invoke(usersHandler, { headers: adminHeaders });
  assert.equal(usersResult.statusCode, 200);
  assert.equal(usersResult.payload.ok, true);
  assert.equal(usersResult.payload.users.length, 2);

  const forbiddenResult = await invoke(usersHandler, {
    headers: { cookie: `member_session=${encodeURIComponent(memberSession.token)}` }
  });
  assert.equal(forbiddenResult.statusCode, 403);

  const adjustResult = await invoke(adjustHandler, {
    method: 'POST',
    headers: adminHeaders,
    body: {
      userId: member.id,
      amount: 25,
      reasonCode: 'manual_plus',
      details: 'API test adjustment',
      requestId: 'admin-local-api-adjustment'
    }
  });
  assert.equal(adjustResult.statusCode, 200);
  assert.equal(adjustResult.payload.user.creditBalance, 1055);
  const passwordHashBefore = localDb.getUserByEmail('member@example.com').password_hash;
  assert.equal(localDb.verifyPassword('testing-1234', passwordHashBefore), true);

  const passwordResult = await invoke(editUserHandler, {
    method: 'PATCH',
    headers: adminHeaders,
    body: { userId: member.id, password: 'replacement-1234' }
  });
  assert.equal(passwordResult.statusCode, 200);
  assert.equal(passwordResult.payload.user.creditBalance, 1055);
  const passwordHashAfter = localDb.getUserByEmail('member@example.com').password_hash;
  assert.notEqual(passwordHashAfter, passwordHashBefore);
  assert.equal(localDb.verifyPassword('testing-1234', passwordHashAfter), false);
  assert.equal(localDb.verifyPassword('replacement-1234', passwordHashAfter), true);
  assert.equal(localDb.getUserBySessionToken(memberSession.token), null);

  const invalidPasswordResult = await invoke(editUserHandler, {
    method: 'PATCH',
    headers: adminHeaders,
    body: { userId: member.id, password: 'short' }
  });
  assert.equal(invalidPasswordResult.statusCode, 400);
  assert.equal(invalidPasswordResult.payload.error, 'INVALID_PASSWORD');

  const metricsResult = await invoke(metricsHandler, {
    headers: adminHeaders,
    query: { range: 'today' }
  });
  assert.equal(metricsResult.statusCode, 200);
  assert.equal(metricsResult.payload.ok, true);
  assert.equal(metricsResult.payload.business.totals.totalCreditsConsumed, 120);
});

test('notification settings are admin-only, audited, and exposed as a safe public notice', async () => {
  const adminSession = localDb.createSession(admin.id);
  const memberSession = localDb.createSession(member.id);
  const adminHeaders = { cookie: `member_session=${encodeURIComponent(adminSession.token)}` };

  const forbiddenResult = await invoke(notificationsHandler, {
    headers: { cookie: `member_session=${encodeURIComponent(memberSession.token)}` }
  });
  assert.equal(forbiddenResult.statusCode, 403);

  const updateResult = await invoke(notificationsHandler, {
    method: 'PATCH',
    headers: adminHeaders,
    body: {
      siteNoticeEnabled: true,
      siteNoticeTitle: 'Maintenance',
      siteNoticeBody: '**Image generation** remains available during maintenance.',
      siteNoticeFormat: 'markdown',
      siteNoticePlacement: 'modal',
      audience: 'signed-in',
      notifyGenerationFailure: true,
      notifyLowCredits: true,
      lowCreditThreshold: 35,
      notifyChannelFailure: false
    }
  });
  assert.equal(updateResult.statusCode, 200);
  assert.equal(updateResult.payload.notifications.siteNoticeEnabled, true);
  assert.equal(updateResult.payload.notifications.siteNoticeFormat, 'markdown');
  assert.equal(updateResult.payload.notifications.siteNoticePlacement, 'modal');
  assert.equal(updateResult.payload.notifications.lowCreditThreshold, 35);
  assert.equal(updateResult.payload.notifications.notifyChannelFailure, false);

  const publicResult = await invoke(siteNoticeHandler, {});
  assert.equal(publicResult.statusCode, 200);
  assert.deepEqual(publicResult.payload.notice, {
    title: 'Maintenance',
    body: '**Image generation** remains available during maintenance.',
    format: 'markdown',
    placement: 'modal',
    audience: 'signed-in',
    updatedAt: updateResult.payload.notifications.updatedAt
  });

  const auditRow = localDb.getDb().prepare(`
    SELECT setting_key FROM app_setting_audit
    WHERE setting_key = 'admin_notifications'
    ORDER BY created_at DESC LIMIT 1
  `).get();
  assert.equal(auditRow.setting_key, 'admin_notifications');
});
