import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { installCreditLedgerAuditTrigger } from '../api/_lib/audit-actors.js';
import { auditActorLabel } from '../shared/audit-actor-label.js';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-audit-actors-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.SUPER_ADMIN_EMAILS = 'audit-root@example.com';
const dbModule = await import('../api/_lib/local-db.js');
const { insertAuditEvent, listAuditEventsForUser, adjustManagedUserCredits } = await import('../api/_lib/governance.js');
const { default: auditHandler } = await import('../api/admin/audit.js');
const db = dbModule.getDb();
const root = dbModule.createUser({ email: 'audit-root@example.com', password: 'test-123456', fullName: '审计管理员' });
const member = dbModule.createUser({ email: 'audit-member@example.com', password: 'test-123456', fullName: '创作者' });
const accountant = dbModule.createUser({ email: 'audit-finance@example.com', password: 'test-123456', fullName: '财务操作员' });
db.prepare("UPDATE users SET role = 'accountant' WHERE id = ?").run(accountant.id);
db.prepare('UPDATE users SET credit_balance = 1000 WHERE id = ?').run(member.id);

after(() => {
  db.close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function postLedger({ userId = member.id, type = 'generation', source = 'generation_reservation', metadata = {} } = {}) {
  const id = randomUUID();
  db.prepare(`INSERT INTO credit_ledger (id, user_id, amount, type, source, metadata, created_at)
    VALUES (?, ?, -1, ?, ?, ?, ?)`).run(id, userId, type, source,
    typeof metadata === 'string' ? metadata : JSON.stringify(metadata), new Date().toISOString());
  return id;
}

function auditFor(ledgerId) {
  return listAuditEventsForUser(root.id, { limit: 500 }).find((row) => row.entityId === ledgerId && row.action === 'credit_ledger_posted');
}

function rawAudit(ledgerId) {
  return db.prepare('SELECT * FROM audit_events WHERE credit_ledger_id = ?').get(ledgerId);
}

function withLegacyTrigger(run) {
  db.exec(`DROP TRIGGER credit_ledger_audit_insert;
    CREATE TRIGGER credit_ledger_audit_insert AFTER INSERT ON credit_ledger BEGIN
      INSERT INTO audit_events (id, category, action, actor_type, actor_user_id,
        actor_name_snapshot, actor_email_snapshot, target_user_id, entity_type, entity_id,
        credit_ledger_id, credit_delta, reason, created_at)
      VALUES (lower(hex(randomblob(16))), 'credits', 'credit_ledger_posted',
        CASE WHEN json_extract(NEW.metadata, '$.adminUserId') IS NOT NULL THEN 'user' ELSE 'system' END,
        json_extract(NEW.metadata, '$.adminUserId'),
        COALESCE(json_extract(NEW.metadata, '$.actorName'), ''),
        COALESCE(json_extract(NEW.metadata, '$.actorEmail'), ''),
        NEW.user_id, 'credit_ledger', NEW.id, NEW.id, NEW.amount, NEW.source, NEW.created_at);
    END;`);
  try { return run(); } finally { installCreditLedgerAuditTrigger(db); }
}

test('user charges persist the initiating username and role, not blank system actors', () => {
  for (const [type, source] of [
    ['generation', 'generation_reservation'], ['ai_video', 'video_generation'],
    ['ai_chat', 'chat_actual_usage'], ['ai_tool', 'ai_magic_prompt'],
    ['redemption', 'free_code'], ['group_transfer', 'group_funding']
  ]) {
    const id = postLedger({ type, source });
    const row = rawAudit(id);
    assert.equal(row.actor_type, 'user');
    assert.equal(row.actor_user_id, member.id);
    assert.equal(row.actor_name_snapshot, member.fullName);
    assert.equal(row.actor_role, 'user');
    assert.equal(auditFor(id).actorName, member.fullName);
  }
});

test('automatic billing, refunds, grants and payment callbacks display system', () => {
  for (const [type, source] of [
    ['storage', 'storage_billing'], ['refund', 'generation_release'],
    ['refund', 'generation_recovery'], ['refund', 'reservation_settlement_refund'],
    ['refund', 'ai_tool_refund'], ['signup_bonus', 'email_signup_bonus'],
    ['purchase', 'stripe_checkout']
  ]) {
    // Group storage billing includes a charged user's actorUserId; it is not
    // proof that the user manually triggered this automatic action.
    const id = postLedger({ type, source, metadata: { actorUserId: member.id, groupId: 'group-example' } });
    assert.equal(rawAudit(id).actor_type, 'system');
    assert.equal(rawAudit(id).actor_name_snapshot, 'system');
    assert.equal(auditFor(id).actorUserId, '');
    assert.deepEqual(auditActorLabel(auditFor(id)), { name: 'system', detail: '系统自动' });
  }
});

test('admin and accountant adjustments attribute the operator rather than the affected user', () => {
  const id = postLedger({ type: 'adjustment', source: 'admin_adjustment', metadata: { adminUserId: root.id } });
  assert.equal(auditFor(id).actorName, root.fullName);
  assert.equal(auditFor(id).actorRole, 'super_admin');
  const result = adjustManagedUserCredits({
    actorUserId: accountant.id, targetUserId: member.id, amount: 2,
    reasonCode: 'gift', details: 'Audit attribution test', requestId: randomUUID()
  });
  assert.ok(result);
  const adjusted = listAuditEventsForUser(root.id).find((row) => row.action === 'credit_adjustment');
  assert.equal(adjusted.actorUserId, accountant.id);
  assert.equal(auditFor(adjusted.entityId).actorName, accountant.fullName);
  assert.equal(auditFor(adjusted.entityId).actorRole, 'accountant');
});

test('group charge attributes requester, and explicit system actions clear account identity', () => {
  const id = postLedger({ userId: root.id, metadata: { actorUserId: member.id, groupId: 'shared-budget' } });
  assert.equal(auditFor(id).targetUserId, root.id);
  assert.equal(auditFor(id).actorUserId, member.id);
  const systemId = postLedger({ metadata: { actorType: 'system', actorUserId: member.id } });
  assert.equal(auditFor(systemId).actorName, 'system');
  assert.equal(auditFor(systemId).actorUserId, '');
});

test('legacy misclassified records are resolved without rewriting immutable history', () => {
  const ids = withLegacyTrigger(() => [
    postLedger(),
    postLedger({ type: 'storage', source: 'storage_billing', metadata: { actorUserId: member.id } }),
    postLedger({ type: 'adjustment', source: 'admin_adjustment', metadata: { actorUserId: accountant.id } }),
    postLedger({ type: 'adjustment', source: 'admin_adjustment', metadata: { adminUserId: root.id } }),
    postLedger({ userId: root.id, metadata: { actorUserId: member.id } })
  ]);
  const before = ids.map(rawAudit);
  assert.deepEqual(ids.map((id) => auditFor(id).actorName), [
    member.fullName, 'system', accountant.fullName, root.fullName, member.fullName
  ]);
  assert.deepEqual(ids.map(rawAudit), before);
  assert.throws(() => db.prepare("UPDATE audit_events SET actor_name_snapshot = 'changed' WHERE id = ?").run(before[0].id), /AUDIT_EVENTS_IMMUTABLE/);
  assert.throws(() => db.prepare('DELETE FROM audit_events WHERE id = ?').run(before[0].id), /AUDIT_EVENTS_IMMUTABLE/);
});

test('existing snapshots survive renames, while missing historical names resolve from linked accounts', () => {
  const beforeRename = postLedger();
  const legacyId = withLegacyTrigger(() => postLedger());
  db.prepare("UPDATE users SET full_name = '新用户名' WHERE id = ?").run(member.id);
  try {
    assert.equal(auditFor(beforeRename).actorName, member.fullName);
    assert.equal(auditFor(legacyId).actorName, '新用户名');
  } finally {
    db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(member.fullName, member.id);
  }
});

test('unidentified history is not mislabeled as system or the account owner', () => {
  const id = withLegacyTrigger(() => postLedger({ type: 'adjustment', source: 'unrecorded_import' }));
  assert.equal(auditFor(id).actorType, 'unknown');
  assert.equal(auditFor(id).actorUserId, '');
  assert.deepEqual(auditActorLabel(auditFor(id)), { name: '未知操作员', detail: '历史记录未记录身份' });
  const invalidMetadata = postLedger({ metadata: '{invalid' });
  assert.equal(auditFor(invalidMetadata).actorName, member.fullName);
  const deletedActor = postLedger({ metadata: { actorUserId: 'deleted-account-id' } });
  assert.equal(auditFor(deletedActor).actorName, 'deleted-account-id');
});

test('direct audit writes populate names from accounts and preserve explicit snapshots', () => {
  const id = insertAuditEvent({ category: 'users', action: 'test_user_action', actorUserId: member.id });
  const snapshotId = insertAuditEvent({ category: 'users', action: 'test_snapshot', actorUserId: member.id, actorName: '操作时用户名' });
  const systemId = insertAuditEvent({ category: 'operations', action: 'test_system', actorType: 'system', actorUserId: member.id });
  const rows = listAuditEventsForUser(root.id);
  assert.equal(rows.find((row) => row.id === id).actorName, member.fullName);
  assert.equal(rows.find((row) => row.id === snapshotId).actorName, '操作时用户名');
  assert.equal(rows.find((row) => row.id === systemId).actorName, 'system');
  assert.equal(rows.find((row) => row.id === systemId).actorUserId, '');
});

test('settings audit displays automatic system actions and actual admin identities', () => {
  for (const [userId, expectedName] of [[null, 'system'], [root.id, root.fullName]]) {
    const key = `audit-test-${randomUUID()}`;
    db.prepare(`INSERT INTO app_setting_audit (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, '{}', '{}', ?, ?)`).run(randomUUID(), key, userId, new Date().toISOString());
    const row = listAuditEventsForUser(root.id).find((event) => event.entityId === key);
    assert.equal(row.actorName, expectedName);
  }
});

test('trigger migration is idempotent and appends exactly one event per ledger row', () => {
  installCreditLedgerAuditTrigger(db);
  const schemaBefore = db.prepare('PRAGMA schema_version').get().schema_version;
  installCreditLedgerAuditTrigger(db);
  assert.equal(db.prepare('PRAGMA schema_version').get().schema_version, schemaBefore);
  const id = postLedger();
  assert.equal(db.prepare('SELECT COUNT(*) count FROM audit_events WHERE credit_ledger_id = ?').get(id).count, 1);
});

test('audit API exposes resolved actors while preserving authentication and finance scope', async () => {
  async function request(userId, query = {}) {
    const headers = userId ? { cookie: `member_session=${dbModule.createSession(userId).token}` } : {};
    let status = 200;
    let body;
    await auditHandler({ method: 'GET', headers, query }, {
      setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; }
    });
    return { status, body };
  }
  const id = withLegacyTrigger(() => postLedger());
  const rootResponse = await request(root.id, { category: 'credits' });
  assert.equal(rootResponse.status, 200);
  const actor = rootResponse.body.events.find((event) => event.entityId === id);
  assert.equal(actor.actorType, 'user');
  assert.equal(actor.actorName, member.fullName);
  assert.equal((await request()).status, 401);
  assert.equal((await request(member.id)).status, 403);
  assert.equal((await request(accountant.id, { category: 'settings' })).status, 403);
  assert.ok((await request(accountant.id)).body.events.every((event) => ['credits', 'redemption', 'finance'].includes(event.category)));
});

test('actor labels never show blanks and keep ordinary usernames named system distinguishable', () => {
  assert.equal(auditActorLabel({ actorType: 'user', actorName: 'system', actorRole: 'user' }).detail, '普通用户');
  assert.equal(auditActorLabel({ actorType: 'user', actorEmail: 'user@example.com' }).name, 'user@example.com');
  assert.equal(auditActorLabel({ actorType: 'user', actorUserId: 'missing-user-id' }).name, 'missing-user-id');
  assert.equal(auditActorLabel({}, 'en').name, 'Unknown actor');
});
