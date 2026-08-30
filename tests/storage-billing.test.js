import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-storage-billing-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
process.env.PROVIDER_CONFIG_SECRET = 'storage-billing-test-secret';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const db = await import('../api/_lib/local-db.js');
const billing = await import('../api/_lib/storage-billing.js');
const {
  STORAGE_BILLING_BYTES_PER_GB,
  storageBillingRunPhase,
  storageCreditsForBytes
} = await import('../shared/storage-billing.js');

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function addOwnedAsset(userId, assetId, bytes) {
  const timestamp = new Date().toISOString();
  const storagePath = `assets/${userId}/${assetId}/original.png`;
  db.getDb().prepare(`
    INSERT INTO assets
      (id, owner_user_id, name, media_type, original_storage_path, mime_type, file_size, created_at, updated_at)
    VALUES (?, ?, ?, 'image', ?, 'image/png', ?, ?, ?)
  `).run(assetId, userId, assetId, storagePath, bytes, timestamp, timestamp);
  db.getDb().prepare(`
    INSERT INTO asset_variants
      (id, asset_id, variant_type, storage_path, mime_type, file_size, status, created_at, updated_at)
    VALUES (?, ?, 'original', ?, 'image/png', ?, 'ready', ?, ?)
  `).run(`original-${assetId}`, assetId, storagePath, bytes, timestamp, timestamp);
}

function setAssetBytes(assetId, bytes) {
  db.getDb().prepare(`UPDATE assets SET file_size = ?, updated_at = ? WHERE id = ?`)
    .run(bytes, new Date().toISOString(), assetId);
  db.getDb().prepare(`UPDATE asset_variants SET file_size = ?, updated_at = ? WHERE asset_id = ?`)
    .run(bytes, new Date().toISOString(), assetId);
}

test('daily storage billing charges owners only and is idempotent for the run date', async () => {
  const owner = db.createUser({ email: 'storage-owner@example.com', password: 'testing-1234', initialCredits: 1000 });
  const viewer = db.createUser({ email: 'storage-viewer@example.com', password: 'testing-1234', initialCredits: 1000 });
  addOwnedAsset(owner.id, 'owned-half-gb', STORAGE_BILLING_BYTES_PER_GB / 2);
  db.getDb().prepare(`
    INSERT INTO asset_permissions (asset_id, principal_type, principal_id, permission, created_at)
    VALUES ('owned-half-gb', 'user', ?, 'view', ?)
  `).run(viewer.id, new Date().toISOString());

  const result = await billing.runStorageBillingBatch({
    runDate: '2026-08-01',
    measuredAt: '2026-08-01T00:00:00.000Z',
    repairMetadata: false
  });
  assert.equal(result.status, 'completed');
  assert.equal(db.getUserById(owner.id).creditBalance, 850);
  assert.equal(db.getUserById(viewer.id).creditBalance, 1000);
  assert.equal(billing.getOwnedAssetStorageUsage(viewer.id).ownedBytes, 0);

  const ownerUsage = db.getDb().prepare(`
    SELECT * FROM storage_billing_daily_usage WHERE user_id = ? AND usage_date = '2026-08-01'
  `).get(owner.id);
  const viewerUsage = db.getDb().prepare(`
    SELECT * FROM storage_billing_daily_usage WHERE user_id = ? AND usage_date = '2026-08-01'
  `).get(viewer.id);
  assert.equal(ownerUsage.incremental_credits, 150);
  assert.equal(ownerUsage.run_phase, 'month_start');
  assert.equal(viewerUsage.owned_bytes, 0);
  assert.equal(viewerUsage.incremental_credits, 0);

  const ledger = db.listCreditLedger(owner.id, 10).find((entry) => entry.type === 'storage');
  assert.equal(ledger.amount, -150);
  assert.equal(ledger.source, 'storage_billing');
  assert.equal(JSON.parse(ledger.metadata).labelZh, '存储消耗');

  const duplicate = await billing.runStorageBillingBatch({
    runDate: '2026-08-01',
    measuredAt: '2026-08-01T01:00:00.000Z',
    repairMetadata: false
  });
  assert.equal(duplicate.status, 'completed');
  assert.equal(db.listCreditLedger(owner.id, 10).filter((entry) => entry.type === 'storage').length, 1);
});

test('sub-credit growth is carried forward without advancing the billed peak', () => {
  const user = db.createUser({ email: 'storage-increment@example.com', password: 'testing-1234', initialCredits: 100 });
  addOwnedAsset(user.id, 'incremental-asset', 1024 * 1024);

  const first = billing.billUserStorageForDate({
    userId: user.id,
    runDate: '2026-08-02',
    ownedBytes: 1024 * 1024,
    ownedAssetCount: 1,
    measuredAt: '2026-08-02T00:00:00.000Z',
    unitPriceCentsPerGb: 300
  });
  assert.equal(first.status, 'below_minimum');
  assert.equal(first.billedPeakBytes, 0);

  setAssetBytes('incremental-asset', 4 * 1024 * 1024);
  const second = billing.billUserStorageForDate({
    userId: user.id,
    runDate: '2026-08-03',
    ownedBytes: 4 * 1024 * 1024,
    ownedAssetCount: 1,
    measuredAt: '2026-08-03T00:00:00.000Z'
  });
  assert.equal(second.status, 'charged');
  assert.equal(second.chargedCredits, 1);
  assert.equal(second.billedPeakBytes, 4 * 1024 * 1024);

  setAssetBytes('incremental-asset', 8 * 1024 * 1024);
  const third = billing.billUserStorageForDate({
    userId: user.id,
    runDate: '2026-08-04',
    ownedBytes: 8 * 1024 * 1024,
    ownedAssetCount: 1,
    measuredAt: '2026-08-04T00:00:00.000Z'
  });
  assert.equal(third.status, 'charged');
  assert.equal(third.chargedCredits, 1);
  assert.equal(db.getUserById(user.id).creditBalance, 98);

  const duplicate = billing.billUserStorageForDate({
    userId: user.id,
    runDate: '2026-08-04',
    ownedBytes: 8 * 1024 * 1024,
    ownedAssetCount: 1
  });
  assert.equal(duplicate.status, 'already_processed');
});

test('super administrators are measured without creating a storage charge', () => {
  const user = db.createUser({ email: 'storage-admin@example.com', password: 'testing-1234', initialCredits: 1000 });
  db.getDb().prepare(`UPDATE users SET role = 'super_admin' WHERE id = ?`).run(user.id);
  addOwnedAsset(user.id, 'admin-storage-asset', STORAGE_BILLING_BYTES_PER_GB);

  const result = billing.billUserStorageForDate({
    userId: user.id,
    runDate: '2026-08-08',
    ownedBytes: STORAGE_BILLING_BYTES_PER_GB,
    ownedAssetCount: 1,
    measuredAt: '2026-08-08T00:00:00.000Z',
    unitPriceCentsPerGb: 300
  });

  assert.equal(result.status, 'exempt');
  assert.equal(result.chargedCredits, 0);
  assert.equal(result.billedPeakBytes, 0);
  assert.equal(db.getUserById(user.id).creditBalance, 1000);
  assert.equal(db.getDb().prepare(`SELECT COUNT(*) AS count FROM storage_billing_charges WHERE user_id = ?`).get(user.id).count, 0);
  assert.equal(db.listCreditLedger(user.id, 10).filter((entry) => entry.type === 'storage').length, 0);

  const usage = db.getDb().prepare(`
    SELECT result_status, incremental_credits, balance_before, balance_after, charge_id
    FROM storage_billing_daily_usage
    WHERE user_id = ? AND usage_date = '2026-08-08'
  `).get(user.id);
  assert.equal(usage.result_status, 'exempt');
  assert.equal(usage.incremental_credits, 0);
  assert.equal(usage.balance_before, 1000);
  assert.equal(usage.balance_after, 1000);
  assert.equal(usage.charge_id, null);
});

test('monthly price is snapshotted and insufficient balances do not advance the billed peak', () => {
  const user = db.createUser({ email: 'storage-price@example.com', password: 'testing-1234', initialCredits: 2000 });
  addOwnedAsset(user.id, 'price-asset', STORAGE_BILLING_BYTES_PER_GB);
  const august = billing.billUserStorageForDate({
    userId: user.id,
    runDate: '2026-08-05',
    ownedBytes: STORAGE_BILLING_BYTES_PER_GB,
    ownedAssetCount: 1,
    measuredAt: '2026-08-05T00:00:00.000Z',
    unitPriceCentsPerGb: 300
  });
  assert.equal(august.chargedCredits, 300);

  billing.updateStorageBillingConfig({ enabled: true, unitPriceCentsPerGb: 500 });
  const augustGrowth = billing.billUserStorageForDate({
    userId: user.id,
    runDate: '2026-08-06',
    ownedBytes: STORAGE_BILLING_BYTES_PER_GB * 2,
    ownedAssetCount: 1,
    measuredAt: '2026-08-06T00:00:00.000Z'
  });
  assert.equal(augustGrowth.unitPriceCentsPerGb, 300);
  assert.equal(augustGrowth.chargedCredits, 300);

  const september = billing.billUserStorageForDate({
    userId: user.id,
    runDate: '2026-09-01',
    ownedBytes: STORAGE_BILLING_BYTES_PER_GB * 2,
    ownedAssetCount: 1,
    measuredAt: '2026-09-01T00:00:00.000Z'
  });
  assert.equal(september.unitPriceCentsPerGb, 500);
  assert.equal(september.chargedCredits, 1000);

  const noBalance = db.createUser({ email: 'storage-empty@example.com', password: 'testing-1234', initialCredits: 0 });
  const insufficient = billing.billUserStorageForDate({
    userId: noBalance.id,
    runDate: '2026-08-07',
    ownedBytes: 4 * 1024 * 1024,
    ownedAssetCount: 1,
    measuredAt: '2026-08-07T00:00:00.000Z',
    unitPriceCentsPerGb: 300
  });
  assert.equal(insufficient.status, 'insufficient_credits');
  assert.equal(insufficient.billedPeakBytes, 0);
});

test('storage billing phases and exact credit steps follow the calendar contract', () => {
  assert.equal(storageBillingRunPhase('2026-08-01'), 'month_start');
  assert.equal(storageBillingRunPhase('2026-08-15'), 'month_mid');
  assert.equal(storageBillingRunPhase('2026-08-31'), 'month_end');
  assert.equal(storageBillingRunPhase('2026-08-17'), 'daily');
  assert.equal(storageCreditsForBytes(STORAGE_BILLING_BYTES_PER_GB, 300), 300);
  assert.equal(storageCreditsForBytes(1024 * 1024, 300), 0);
});
