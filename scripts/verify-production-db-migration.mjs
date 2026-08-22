import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const sourcePath = path.resolve(process.argv[2] || '');
const migratedPath = path.resolve(process.argv[3] || '');

if (!sourcePath || !migratedPath || sourcePath === migratedPath) {
  throw new Error('Usage: node scripts/verify-production-db-migration.mjs SOURCE_DB MIGRATED_COPY');
}
if (!fs.existsSync(sourcePath)) throw new Error(`Source database not found: ${sourcePath}`);
fs.mkdirSync(path.dirname(migratedPath), { recursive: true });
fs.copyFileSync(sourcePath, migratedPath);

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function databaseChecks(db) {
  const quickCheck = db.prepare('PRAGMA quick_check').all().map((row) => Object.values(row)[0]);
  const foreignKeyErrors = db.prepare('PRAGMA foreign_key_check').all();
  return { quickCheck, foreignKeyErrors: foreignKeyErrors.length };
}

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map((row) => row.name);
}

function tableColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all()
    .sort((left, right) => Number(left.cid) - Number(right.cid));
}

function updateValue(hash, value) {
  if (value == null) {
    hash.update('N;');
    return;
  }
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    hash.update(`B${bytes.length}:`);
    hash.update(bytes);
    hash.update(';');
    return;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    hash.update(`D${String(value)};`);
    return;
  }
  const text = String(value);
  hash.update(`S${Buffer.byteLength(text)}:${text};`);
}

function tableFingerprint(db, tableName, originalColumns = null) {
  const columns = originalColumns || tableColumns(db, tableName).map((column) => column.name);
  const currentColumns = new Set(tableColumns(db, tableName).map((column) => column.name));
  const missingColumns = columns.filter((column) => !currentColumns.has(column));
  if (missingColumns.length) throw new Error(`${tableName} lost columns: ${missingColumns.join(', ')}`);
  const tableInfo = tableColumns(db, tableName);
  const primaryKeyColumns = tableInfo.filter((column) => Number(column.pk) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk)).map((column) => column.name);
  const selected = columns.map(quoteIdentifier).join(', ');
  const orderBy = primaryKeyColumns.length
    ? primaryKeyColumns.map(quoteIdentifier).join(', ')
    : 'rowid';
  const statement = db.prepare(`SELECT ${selected} FROM ${quoteIdentifier(tableName)} ORDER BY ${orderBy}`);
  const hash = createHash('sha256');
  let count = 0;
  for (const row of statement.iterate()) {
    count += 1;
    for (const column of columns) updateValue(hash, row[column]);
    hash.update('\n');
  }
  return { columns, count, sha256: hash.digest('hex') };
}

function scalar(db, sql) {
  const row = db.prepare(sql).get();
  return row ? Object.values(row)[0] : null;
}

function criticalSummary(db) {
  const tables = new Set(tableNames(db));
  const value = (table, sql, fallback = 0) => tables.has(table) ? Number(scalar(db, sql) || 0) : fallback;
  const digest = (table, sql) => {
    if (!tables.has(table)) return '';
    const hash = createHash('sha256');
    for (const row of db.prepare(sql).iterate()) {
      for (const cell of Object.values(row)) updateValue(hash, cell);
      hash.update('\n');
    }
    return hash.digest('hex');
  };
  return {
    users: value('users', 'SELECT COUNT(*) FROM users'),
    creditBalanceTotal: value('users', 'SELECT COALESCE(SUM(credit_balance), 0) FROM users'),
    passwordDigest: digest('users', 'SELECT id, password_hash FROM users ORDER BY id'),
    userProfileDigest: digest('users', 'SELECT id, email, full_name, avatar_url, role, status, credit_balance, created_at, updated_at FROM users ORDER BY id'),
    sessions: value('sessions', 'SELECT COUNT(*) FROM sessions'),
    creditLedgerRows: value('credit_ledger', 'SELECT COUNT(*) FROM credit_ledger'),
    creditLedgerNet: value('credit_ledger', 'SELECT COALESCE(SUM(amount), 0) FROM credit_ledger'),
    creditReservations: value('credit_reservations', 'SELECT COUNT(*) FROM credit_reservations'),
    activeReservations: value('credit_reservations', "SELECT COUNT(*) FROM credit_reservations WHERE status IN ('reserved', 'processing')"),
    generations: value('generations', 'SELECT COUNT(*) FROM generations'),
    activeGenerationTasks: value('generation_tasks', "SELECT COUNT(*) FROM generation_tasks WHERE status IN ('queued', 'processing', 'running')"),
    ecommerceProjects: value('ecommerce_projects', 'SELECT COUNT(*) FROM ecommerce_projects'),
    mediaAssets: value('media_assets', 'SELECT COUNT(*) FROM media_assets'),
    paymentOrders: value('payment_orders', 'SELECT COUNT(*) FROM payment_orders'),
    providerRows: value('image_provider_configs', 'SELECT COUNT(*) FROM image_provider_configs'),
    providerCipherDigest: digest('image_provider_configs', 'SELECT id, api_key_encrypted FROM image_provider_configs ORDER BY id')
  };
}

const sourceDb = new DatabaseSync(sourcePath, { readOnly: true });
const beforeChecks = databaseChecks(sourceDb);
const originalTables = tableNames(sourceDb);
const beforeTables = Object.fromEntries(originalTables.map((tableName) => [tableName, tableFingerprint(sourceDb, tableName)]));
const beforeCritical = criticalSummary(sourceDb);
sourceDb.close();

if (beforeChecks.quickCheck.length !== 1 || beforeChecks.quickCheck[0] !== 'ok' || beforeChecks.foreignKeyErrors !== 0) {
  throw new Error(`Source integrity failed: ${JSON.stringify(beforeChecks)}`);
}
if (beforeCritical.activeReservations || beforeCritical.activeGenerationTasks) {
  throw new Error(`Production snapshot contains active work: ${JSON.stringify({ activeReservations: beforeCritical.activeReservations, activeGenerationTasks: beforeCritical.activeGenerationTasks })}`);
}

process.env.APP_DB_PATH = migratedPath;
process.env.NODE_ENV = 'production';
process.env.SUPER_ADMIN_EMAILS = '';
process.env.PROVIDER_CONFIG_SECRET ||= 'migration-verifier-placeholder-not-used-for-decryption';
const migratedModule = await import(`../api/_lib/local-db.js?migration-verification=${Date.now()}`);
migratedModule.getDb().close();

const afterDb = new DatabaseSync(migratedPath, { readOnly: true });
const afterChecks = databaseChecks(afterDb);
const afterCritical = criticalSummary(afterDb);
const changedTables = [];
for (const tableName of originalTables) {
  const after = tableFingerprint(afterDb, tableName, beforeTables[tableName].columns);
  const before = beforeTables[tableName];
  if (before.count !== after.count || before.sha256 !== after.sha256) {
    changedTables.push({ tableName, beforeCount: before.count, afterCount: after.count, beforeSha256: before.sha256, afterSha256: after.sha256 });
  }
}
const afterTables = tableNames(afterDb);
afterDb.close();

const requiredNewTables = ['audit_events', 'redemption_code_batches', 'redemption_codes', 'user_ui_preferences'];
const missingNewTables = requiredNewTables.filter((tableName) => !afterTables.includes(tableName));
const criticalDifferences = Object.keys(beforeCritical).filter((key) => beforeCritical[key] !== afterCritical[key]);
const result = {
  sourcePath,
  migratedPath,
  beforeChecks,
  afterChecks,
  originalTableCount: originalTables.length,
  migratedTableCount: afterTables.length,
  newTables: afterTables.filter((tableName) => !originalTables.includes(tableName)),
  changedTables,
  missingNewTables,
  criticalDifferences,
  critical: afterCritical
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (
  afterChecks.quickCheck.length !== 1 || afterChecks.quickCheck[0] !== 'ok'
  || afterChecks.foreignKeyErrors !== 0
  || changedTables.length || missingNewTables.length || criticalDifferences.length
) process.exitCode = 1;
