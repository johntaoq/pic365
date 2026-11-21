import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-credit-ledger-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.SESSION_SECRET = 'credit-ledger-test-secret';
process.env.SUPER_ADMIN_EMAILS = 'ledger-root@example.com';

const [db, { default: adminLedgerHandler }, { default: userLedgerHandler }] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/admin/credit-ledger.js'),
  import('../api/billing/history.js')
]);
const { creditLedgerPaginationItems } = await import('../shared/credit-ledger.js');

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, req = {}) {
  let statusCode = 200;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, ...req }, res))
    .then(() => ({ statusCode, payload }));
}

function headers(userId) {
  const session = db.createSession(userId);
  return { cookie: `member_session=${encodeURIComponent(session.token)}` };
}

const root = db.createUser({ email: 'ledger-root@example.com', password: 'testing-1234', fullName: 'Ledger root' });
const accountant = db.createUser({ email: 'ledger-accountant@example.com', password: 'testing-1234', fullName: 'Ledger accountant' });
const operations = db.createUser({ email: 'ledger-operations@example.com', password: 'testing-1234', fullName: 'Ledger operations' });
const member = db.createUser({ email: 'ledger-member@example.com', password: 'testing-1234', fullName: 'Ledger member' });
const other = db.createUser({ email: 'ledger-other@example.com', password: 'testing-1234', fullName: 'Other member' });
db.getDb().prepare("UPDATE users SET role = 'accountant' WHERE id = ?").run(accountant.id);
db.getDb().prepare("UPDATE users SET role = 'operations' WHERE id = ?").run(operations.id);
db.getDb().prepare('UPDATE users SET credit_balance = 200 WHERE id = ?').run(member.id);
db.getDb().prepare('UPDATE users SET credit_balance = 300 WHERE id = ?').run(other.id);

db.getDb().prepare(`
  INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('voice-ledger', member.id, -12.5, 'ai_voice', 'voice_generation', 'voice-task-1', JSON.stringify({ model: 'future-voice-1', voice: 'warm', audioDurationSeconds: 30 }), '2026-09-06T01:00:00.000Z');
db.getDb().prepare(`
  INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('gift-ledger', member.id, 5, 'grant', 'activity_gift', 'gift-1', '{}', '2026-09-06T01:30:00.000Z');
db.getDb().prepare('UPDATE users SET credit_balance = 192.5 WHERE id = ?').run(member.id);
db.getDb().prepare(`
  INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('purchase-ledger', other.id, 100, 'purchase', 'test_checkout', 'order-1', '{}', '2026-09-06T02:00:00.000Z');
for (let index = 0; index < 11; index += 1) {
  db.getDb().prepare(`
    INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
    VALUES (?, ?, 1, 'grant', 'pagination_test', ?, '{}', ?)
  `).run(`pagination-ledger-${index}`, other.id, `pagination-${index}`, `2026-09-06T02:${String(index + 1).padStart(2, '0')}:00.000Z`);
}

test('voice charges are an independent filterable billing category', () => {
  const result = db.listCreditLedgerPage({ userId: member.id, category: 'ai_voice' });
  assert.equal(result.pagination.total, 1);
  assert.equal(result.items[0].category, 'ai_voice');
  assert.equal(result.items[0].detail.model, 'future-voice-1');
  assert.equal(result.items[0].detail.audioDurationSeconds, 30);
  assert.equal(result.items[0].balanceAfter, 187.5);
});

test('ledger pagination keeps nearby pages and exposes a scrollable jump position', () => {
  assert.deepEqual(creditLedgerPaginationItems(1, 127), [1, 2, 3, 4, 'jump', 126, 127]);
  assert.deepEqual(creditLedgerPaginationItems(64, 127), [1, 'jump-left', 63, 64, 65, 'jump-right', 127]);
  assert.deepEqual(creditLedgerPaginationItems(127, 127), [1, 2, 'jump', 124, 125, 126, 127]);
});

test('ledger page size controls item count and total pages', () => {
  const first = db.listCreditLedgerPage({ userId: other.id, page: 1, pageSize: 10 });
  const second = db.listCreditLedgerPage({ userId: other.id, page: 2, pageSize: 10 });
  assert.equal(first.items.length, 10);
  assert.equal(first.pagination.total, 12);
  assert.equal(first.pagination.pages, 2);
  assert.equal(second.items.length, 2);
});

test('accountants and super administrators can inspect the platform ledger, operations cannot', async () => {
  const accountantResult = await invoke(adminLedgerHandler, { headers: headers(accountant.id) });
  assert.equal(accountantResult.statusCode, 200);
  assert.equal(accountantResult.payload.ledger.pagination.total >= 2, true);
  assert.equal(accountantResult.payload.ledger.items.some((item) => item.userEmail === member.email), true);

  const rootResult = await invoke(adminLedgerHandler, { headers: headers(root.id), query: { category: 'ai_voice' } });
  assert.equal(rootResult.statusCode, 200);
  assert.equal(rootResult.payload.ledger.items.every((item) => item.category === 'ai_voice'), true);

  const forbidden = await invoke(adminLedgerHandler, { headers: headers(operations.id) });
  assert.equal(forbidden.statusCode, 403);
});

test('ordinary users can only retrieve their own detailed ledger', async () => {
  const result = await invoke(userLedgerHandler, { headers: headers(member.id) });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ledger.pagination.total, 2);
  assert.equal(result.payload.ledger.items.every((item) => item.userEmail === member.email), true);
  assert.equal(result.payload.ledger.items.some((item) => item.userEmail === other.email), false);
  assert.equal(result.payload.ledger.items[0].detail.prompt, '');
  assert.equal(result.payload.ledger.items[0].userAdminNote, '');
  assert.equal(result.payload.ledger.items[0].requesterEmail, '');
});

test('filtered balances include newer rows outside the filter and equal timestamps remain stable across pages', () => {
  const user = db.createUser({ email: 'ledger-order@example.com', password: 'testing-1234', fullName: 'Ordering' });
  const insert = db.getDb().prepare(`INSERT INTO credit_ledger (id,user_id,amount,type,source,metadata,created_at)
    VALUES (?, ?, ?, ?, 'ordering', '{}', '2026-09-08T01:00:00.000Z')`);
  insert.run('order-a', user.id, -5, 'generation');
  insert.run('order-b', user.id, -3, 'generation');
  insert.run('order-c', user.id, 2, 'grant');
  db.getDb().prepare('UPDATE users SET credit_balance = 94 WHERE id = ?').run(user.id);
  const result = db.listCreditLedgerPage({ userId: user.id, category: 'ai_image' });
  assert.deepEqual(result.items.map((item) => item.id), ['order-b', 'order-a']);
  assert.equal(result.items[0].balanceAfter, 92);
  assert.equal(result.items[1].balanceAfter, 95);
  assert.equal(result.items[1].balanceBefore, 100);
});

test('multiple matching tasks or audit rows cannot duplicate a ledger page, and exact references win', () => {
  const connection = db.getDb();
  const reference = 'ledger-exact-reference';
  const timestamp = '2026-09-09T01:00:00.000Z';
  const reservation = connection.prepare(`INSERT INTO credit_reservations (id,user_id,prompt,metadata_json,created_at)
    VALUES (?, ?, '', ?, ?)`);
  reservation.run(reference, member.id, '{}', timestamp);
  reservation.run('ledger-other-reservation', member.id, JSON.stringify({ externalReferenceId: reference }), timestamp);
  const generation = connection.prepare(`INSERT INTO generations
    (id,user_id,reservation_id,prompt,model,size,quality,provider,status,created_at)
    VALUES (?, ?, ?, '', ?, '1024x1024', 'low', 'test', 'succeeded', ?)`);
  generation.run(reference, member.id, reference, 'exact-model', timestamp);
  generation.run('ledger-other-generation', member.id, reference, 'other-model', timestamp);
  connection.prepare(`INSERT INTO credit_ledger (id,user_id,amount,type,source,reference_id,metadata,created_at)
    VALUES ('ledger-unique-row', ?, -1, 'generation', 'test_image', ?, '{}', ?)`)
    .run(member.id, reference, timestamp);
  const audit = connection.prepare(`INSERT INTO audit_events
    (id,category,action,credit_ledger_id,balance_before,balance_after,created_at)
    VALUES (?, 'credits', 'balance_test', 'ledger-unique-row', 20, 19, ?)`);
  audit.run('ledger-audit-a', timestamp);
  audit.run('ledger-audit-b', timestamp);
  const result = db.listCreditLedgerPage({ includeAllUsers: true, search: reference, pageSize: 10 });
  assert.equal(result.pagination.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].detail.model, 'exact-model');
  assert.equal(result.items[0].balanceAfter, 19);
});
