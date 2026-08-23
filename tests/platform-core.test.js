import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-platform-core-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
process.env.PROVIDER_CONFIG_SECRET = 'platform-core-current-secret';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const db = await import('../api/_lib/local-db.js');

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('local payment completion is transactional and idempotent across repeated events', () => {
  const user = db.createUser({ email: 'buyer@example.com', password: 'testing-1234', fullName: 'Buyer' });
  const product = db.getCreditProduct('pack_100');
  const order = db.createLocalPaymentOrder(user.id, product, 'stripe');
  db.markLocalPaymentCheckoutCreated(order.id, { providerOrderId: 'cs_test_pic365' });

  const first = db.completeLocalPaymentOrder({
    provider: 'stripe',
    providerOrderId: 'cs_test_pic365',
    eventId: 'evt_first',
    payloadHash: 'hash-first'
  });
  assert.equal(first.duplicate, false);
  assert.equal(first.order.status, 'completed');
  assert.equal(db.getUserById(user.id).creditBalance, 100);

  const repeatedEvent = db.completeLocalPaymentOrder({
    provider: 'stripe',
    providerOrderId: 'cs_test_pic365',
    eventId: 'evt_first',
    payloadHash: 'hash-first'
  });
  assert.equal(repeatedEvent.duplicate, true);

  const differentEvent = db.completeLocalPaymentOrder({
    provider: 'stripe',
    providerOrderId: 'cs_test_pic365',
    eventId: 'evt_second',
    payloadHash: 'hash-second'
  });
  assert.equal(differentEvent.duplicate, true);
  assert.equal(db.getUserById(user.id).creditBalance, 100);
  assert.equal(db.listCreditLedger(user.id, 20).filter((entry) => entry.type === 'purchase').length, 1);
});

test('failed checkout orders are retained for audit without changing credits', () => {
  const user = db.createUser({ email: 'failed-checkout@example.com', password: 'testing-1234', fullName: 'Failed Checkout' });
  const order = db.createLocalPaymentOrder(user.id, db.getCreditProduct('pack_500'), 'stripe');
  const failed = db.markLocalPaymentOrderFailed(order.id, 'STRIPE_UNAVAILABLE');
  assert.equal(failed.status, 'failed');
  assert.equal(JSON.parse(failed.metadata).errorCode, 'STRIPE_UNAVAILABLE');
  assert.equal(db.getUserById(user.id).creditBalance, 0);
});

test('payment completion rejects amount or currency mismatches before granting credits', () => {
  const user = db.createUser({ email: 'mismatch@example.com', password: 'testing-1234', fullName: 'Mismatch' });
  const order = db.createLocalPaymentOrder(user.id, db.getCreditProduct('pack_100'), 'stripe');
  db.markLocalPaymentCheckoutCreated(order.id, { providerOrderId: 'cs_test_mismatch' });
  assert.throws(() => db.completeLocalPaymentOrder({
    provider: 'stripe',
    providerOrderId: 'cs_test_mismatch',
    eventId: 'evt_mismatch',
    amountCents: 1,
    currency: 'cny'
  }), (error) => error?.code === 'PAYMENT_AMOUNT_MISMATCH');
  assert.equal(db.getUserById(user.id).creditBalance, 0);
  assert.equal(db.getDb().prepare('SELECT COUNT(*) AS count FROM payment_events WHERE event_id = ?').get('evt_mismatch').count, 0);
});

test('Watcha identities link to one local user and never store access tokens', () => {
  const first = db.getOrCreateWatchaUser({
    userId: 'watcha-user-1',
    email: 'watcha@example.com',
    nickname: 'Watcha User',
    avatarUrl: 'https://example.invalid/avatar.png'
  }, { access_token: 'must-not-be-stored', expires_in: 3600 });
  const second = db.getOrCreateWatchaUser({
    userId: 'watcha-user-1',
    email: 'watcha@example.com',
    nickname: 'Updated Watcha User'
  }, { access_token: 'another-secret', expires_in: 7200 });
  assert.equal(second.id, first.id);
  assert.equal(db.getDb().prepare('SELECT COUNT(*) AS count FROM watcha_accounts').get().count, 1);
  const account = db.getDb().prepare('SELECT * FROM watcha_accounts WHERE watcha_user_id = ?').get('watcha-user-1');
  assert.equal(Object.hasOwn(account, 'access_token'), false);
  assert.equal(db.getUserById(first.id).fullName, 'Updated Watcha User');
});

test('guest usage and admin alerts are durable and deduplicated', () => {
  assert.equal(db.hasGuestGenerationUsage('fingerprint-one'), false);
  assert.equal(db.recordGuestGenerationUsage('fingerprint-one'), true);
  assert.equal(db.recordGuestGenerationUsage('fingerprint-one'), false);
  assert.equal(db.hasGuestGenerationUsage('fingerprint-one'), true);
  assert.equal(db.getGuestGenerationUsageCount('fingerprint-one'), 1);
  assert.deepEqual(db.claimGuestGenerationUsage('fingerprint-one', { limit: 3 }), { claimed: true, count: 2 });
  assert.deepEqual(db.claimGuestGenerationUsage('fingerprint-one', { limit: 3 }), { claimed: true, count: 3 });
  assert.deepEqual(db.claimGuestGenerationUsage('fingerprint-one', { limit: 3 }), { claimed: false, count: 3 });
  assert.equal(db.releaseGuestGenerationUsage('fingerprint-one'), 2);

  db.recordAdminAlert({ type: 'channel-failure', severity: 'critical', dedupeKey: 'provider:test', message: 'Provider unavailable.' });
  db.recordAdminAlert({ type: 'channel-failure', severity: 'warning', dedupeKey: 'provider:test', message: 'Provider still unavailable.' });
  const alerts = db.listAdminAlerts(20, 'open');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].occurrences, 2);
  assert.equal(alerts[0].message, 'Provider still unavailable.');
  const admin = db.createUser({ email: 'alerts-admin@example.com', password: 'testing-1234', fullName: 'Alerts Admin' });
  assert.equal(db.acknowledgeAdminAlert(alerts[0].id, admin.id), true);
  assert.equal(db.listAdminAlerts(20, 'open').length, 0);
  assert.equal(db.listAdminAlerts(20, 'acknowledged').length, 1);
});
