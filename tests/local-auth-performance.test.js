import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-auth-performance-'));
process.env.APP_DB_PATH = path.join(directory, 'app.sqlite');
const db = await import('../api/_lib/local-db.js');
const { authenticateRequest, INTERNAL_AUTH_CONTEXT } = await import('../api/_lib/local-auth.js');
const user = db.createUser({ email: 'lazy-profile@example.com', password: 'testing-1234', fullName: 'Profile test' });
const session = db.createSession(user.id);
const request = () => ({ headers: { authorization: `Bearer ${session.token}` } });
after(() => { db.getDb().close(); fs.rmSync(directory, { recursive: true, force: true }); });

test('authentication does not query usage or ledger until profile is requested, then loads only once', () => {
  const connection = db.getDb();
  const prepare = connection.prepare;
  const queries = [];
  connection.prepare = function (sql) { queries.push(sql); return prepare.call(this, sql); };
  try {
    const auth = authenticateRequest(request());
    assert.equal(auth.user.id, user.id);
    assert.equal(queries.length, 1);
    assert.equal(queries.some((sql) => /credit_ledger|generations/.test(sql)), false);
    assert.equal(auth.profile.id, user.id);
    assert.equal(queries.some((sql) => /credit_ledger/.test(sql)), true);
    const queryCount = queries.length;
    assert.equal(auth.profile, auth.profile);
    assert.equal(queries.length, queryCount);
  } finally { connection.prepare = prepare; }
});

test('role, balance, disabled accounts and revoked sessions are checked on every new request', () => {
  const connection = db.getDb();
  connection.prepare("UPDATE users SET role = 'accountant', credit_balance = 77 WHERE id = ?").run(user.id);
  const auth = authenticateRequest(request());
  assert.equal(auth.user.role, 'accountant');
  assert.equal(auth.profile.creditBalance, 77);
  connection.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(user.id);
  assert.equal(authenticateRequest(request()).status, 401);
  assert.equal(authenticateRequest({ [INTERNAL_AUTH_CONTEXT]: { userId: user.id } }).status, 401);
  connection.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(user.id);
  db.deleteSession(session.token);
  assert.equal(authenticateRequest(request()).status, 401);
});
