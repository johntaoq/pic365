import { createHash } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = path.resolve(process.argv[2] || process.env.APP_DB_PATH || 'data/app.sqlite');
const database = new DatabaseSync(databasePath, { readOnly: true });

function scalar(sql, fallback = 0) {
  const row = database.prepare(sql).get();
  return row ? Object.values(row)[0] : fallback;
}

function tableExists(name) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function digest(sql) {
  const hash = createHash('sha256');
  for (const row of database.prepare(sql).iterate()) {
    for (const value of Object.values(row)) hash.update(`${value == null ? '<null>' : String(value)}\u0000`);
    hash.update('\n');
  }
  return hash.digest('hex');
}

const configuredEmails = [...new Set(String(process.env.SUPER_ADMIN_EMAILS || '')
  .split(/[;,\n]/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
let configuredMatches = 0;
let configuredWouldPromote = 0;
for (const email of configuredEmails) {
  const row = database.prepare('SELECT role FROM users WHERE lower(email) = ?').get(email);
  if (row) configuredMatches += 1;
  if (row && row.role !== 'super_admin') configuredWouldPromote += 1;
}

const result = {
  databasePath,
  quickCheck: database.prepare('PRAGMA quick_check').all().map((row) => Object.values(row)[0]),
  foreignKeyErrors: database.prepare('PRAGMA foreign_key_check').all().length,
  users: Number(scalar('SELECT COUNT(*) FROM users')),
  totalCredits: Number(scalar('SELECT COALESCE(SUM(credit_balance), 0) FROM users')),
  superAdmins: Number(scalar("SELECT COUNT(*) FROM users WHERE role = 'super_admin'")),
  passwordDigest: digest('SELECT id, password_hash FROM users ORDER BY id'),
  userProfileDigest: digest('SELECT id, email, full_name, avatar_url, role, status, credit_balance, created_at, updated_at FROM users ORDER BY id'),
  creditLedgerRows: tableExists('credit_ledger') ? Number(scalar('SELECT COUNT(*) FROM credit_ledger')) : 0,
  creditLedgerNet: tableExists('credit_ledger') ? Number(scalar('SELECT COALESCE(SUM(amount), 0) FROM credit_ledger')) : 0,
  activeReservations: tableExists('credit_reservations') ? Number(scalar("SELECT COUNT(*) FROM credit_reservations WHERE status IN ('reserved', 'processing')")) : 0,
  activeGenerationTasks: tableExists('generation_tasks') ? Number(scalar("SELECT COUNT(*) FROM generation_tasks WHERE status IN ('queued', 'processing', 'running')")) : 0,
  configuredSuperAdminCount: configuredEmails.length,
  configuredSuperAdminMatches: configuredMatches,
  configuredSuperAdminsWouldPromote: configuredWouldPromote
};

database.close();
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.quickCheck.length !== 1 || result.quickCheck[0] !== 'ok' || result.foreignKeyErrors || result.activeReservations || result.activeGenerationTasks || result.configuredSuperAdminsWouldPromote) {
  process.exitCode = 1;
}
