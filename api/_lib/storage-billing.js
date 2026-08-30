import { randomUUID } from 'node:crypto';
import {
  normalizeStorageBillingConfig,
  storageBillingDateParts,
  storageBillingRunPhase,
  storageCreditsForBytes
} from '../../shared/storage-billing.js';
import { chargeCreditImmediatelyInTransaction, getDb } from './local-db.js';
import { repairMissingAssetFileMetadata } from './media-assets.js';

const STORAGE_BILLING_SETTING_KEY = 'storage_billing';
const BATCH_STALE_MS = 30 * 60 * 1000;

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function assertRunDate(value) {
  const runDate = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
    const error = new Error('INVALID_STORAGE_BILLING_DATE');
    error.code = 'INVALID_STORAGE_BILLING_DATE';
    throw error;
  }
  return runDate;
}

export function getStorageBillingConfig() {
  const row = getDb().prepare(`
    SELECT value_json, updated_at FROM app_settings WHERE setting_key = ?
  `).get(STORAGE_BILLING_SETTING_KEY);
  return normalizeStorageBillingConfig({
    ...parseJson(row?.value_json),
    updatedAt: row?.updated_at || null
  });
}

export function updateStorageBillingConfig(values, adminUserId = null) {
  const db = getDb();
  const previous = getStorageBillingConfig();
  const next = normalizeStorageBillingConfig(values);
  const updatedAt = now();
  const storedNext = { ...next, updatedAt: undefined };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(STORAGE_BILLING_SETTING_KEY, JSON.stringify(storedNext), adminUserId, updatedAt);
    db.prepare(`
      INSERT INTO app_setting_audit
        (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      STORAGE_BILLING_SETTING_KEY,
      JSON.stringify(previous),
      JSON.stringify({ ...next, updatedAt }),
      adminUserId,
      updatedAt
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getStorageBillingConfig();
}

export function getOwnedAssetStorageUsage(userId) {
  const db = getDb();
  const assetCount = Number(db.prepare(`
    SELECT COUNT(*) AS count FROM assets WHERE owner_user_id = ?
  `).get(userId)?.count || 0);
  const row = db.prepare(`
    WITH owned_files AS (
      SELECT variant.storage_path AS storage_path, MAX(variant.file_size) AS file_size
      FROM assets asset
      JOIN asset_variants variant ON variant.asset_id = asset.id
      WHERE asset.owner_user_id = ?
        AND variant.storage_path != ''
        AND variant.status = 'ready'
      GROUP BY variant.storage_path
      UNION ALL
      SELECT asset.original_storage_path AS storage_path, MAX(asset.file_size) AS file_size
      FROM assets asset
      WHERE asset.owner_user_id = ?
        AND asset.original_storage_path != ''
        AND NOT EXISTS (
          SELECT 1 FROM asset_variants variant
          WHERE variant.asset_id = asset.id
            AND variant.storage_path = asset.original_storage_path
        )
      GROUP BY asset.original_storage_path
    ), unique_files AS (
      SELECT storage_path, MAX(file_size) AS file_size
      FROM owned_files
      GROUP BY storage_path
    )
    SELECT COALESCE(SUM(file_size), 0) AS owned_bytes, COUNT(*) AS file_count
    FROM unique_files
  `).get(userId, userId);
  return {
    userId,
    ownedBytes: Math.max(0, Number(row?.owned_bytes || 0)),
    ownedAssetCount: assetCount,
    ownedFileCount: Math.max(0, Number(row?.file_count || 0))
  };
}

function ensureMonthlyState(db, userId, billingMonth, unitPriceCentsPerGb, timestamp) {
  db.prepare(`
    INSERT OR IGNORE INTO storage_billing_months
      (user_id, billing_month, unit_price_cents_per_gb, billed_peak_bytes, charged_credits, created_at, updated_at)
    VALUES (?, ?, ?, 0, 0, ?, ?)
  `).run(userId, billingMonth, unitPriceCentsPerGb, timestamp, timestamp);
  return db.prepare(`
    SELECT * FROM storage_billing_months WHERE user_id = ? AND billing_month = ?
  `).get(userId, billingMonth);
}

export function billUserStorageForDate({
  userId,
  runDate,
  ownedBytes,
  ownedAssetCount = 0,
  measuredAt = now(),
  unitPriceCentsPerGb = null
}) {
  const usageDate = assertRunDate(runDate);
  const billingMonth = usageDate.slice(0, 7);
  const runPhase = storageBillingRunPhase(usageDate);
  const bytes = Math.max(0, Math.floor(Number(ownedBytes) || 0));
  const assetCount = Math.max(0, Math.floor(Number(ownedAssetCount) || 0));
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare(`
      SELECT * FROM storage_billing_daily_usage WHERE user_id = ? AND usage_date = ?
    `).get(userId, usageDate);
    if (existing) {
      db.exec('COMMIT');
      return {
        userId,
        runDate: usageDate,
        status: 'already_processed',
        ownedBytes: Number(existing.owned_bytes || 0),
        chargedCredits: Number(existing.incremental_credits || 0)
      };
    }

    const user = db.prepare(`
      SELECT id, credit_balance FROM users WHERE id = ? AND status = 'active'
    `).get(userId);
    if (!user) {
      const error = new Error('USER_NOT_FOUND');
      error.code = 'USER_NOT_FOUND';
      throw error;
    }

    const configuredPrice = unitPriceCentsPerGb == null
      ? getStorageBillingConfig().unitPriceCentsPerGb
      : Math.max(1, Math.round(Number(unitPriceCentsPerGb) || 1));
    const monthState = ensureMonthlyState(db, userId, billingMonth, configuredPrice, measuredAt);
    const historicalPeak = Number(db.prepare(`
      SELECT COALESCE(MAX(owned_bytes), 0) AS peak
      FROM storage_billing_daily_usage
      WHERE user_id = ? AND billing_month = ?
    `).get(userId, billingMonth)?.peak || 0);
    const candidatePeak = Math.max(historicalPeak, bytes);
    const targetCredits = storageCreditsForBytes(candidatePeak, monthState.unit_price_cents_per_gb);
    const alreadyChargedCredits = Math.max(0, Number(monthState.charged_credits || 0));
    const incrementalCredits = Math.max(0, targetCredits - alreadyChargedCredits);
    let balanceBefore = Number(user.credit_balance || 0);
    let balanceAfter = balanceBefore;
    let resultStatus = 'below_minimum';
    let chargeId = null;

    if (incrementalCredits >= 1) {
      chargeId = randomUUID();
      const previousBilledBytes = Math.max(0, Number(monthState.billed_peak_bytes || 0));
      let charge;
      try {
        charge = chargeCreditImmediatelyInTransaction(db, userId, {
          amountCenti: incrementalCredits * 100,
          source: 'storage_billing',
          referenceId: chargeId,
          metadata: {
          labelZh: '存储消耗',
          labelEn: 'Storage usage',
          billingMonth,
          usageDate,
          previousBilledBytes,
          billedPeakBytes: candidatePeak,
          incrementalBytes: Math.max(0, candidatePeak - previousBilledBytes),
          unitPriceCentsPerGb: Number(monthState.unit_price_cents_per_gb),
            chargedCredits: incrementalCredits
          }
        });
      } catch (error) {
        if (['CREDITS_REQUIRED', 'GROUP_BUDGET_REQUIRED', 'GROUP_BALANCE_REQUIRED', 'GROUP_ACCESS_SUSPENDED'].includes(error?.code)) {
          resultStatus = 'insufficient_credits';
          chargeId = null;
        } else {
          throw error;
        }
      }
      if (charge) {
        balanceBefore = charge.balanceBefore;
        balanceAfter = charge.balanceAfter;
        if (charge.billingScope === 'super_admin') {
          chargeId = null;
          resultStatus = 'exempt';
          db.prepare(`
            UPDATE storage_billing_months SET last_run_date = ?, updated_at = ?
            WHERE user_id = ? AND billing_month = ?
          `).run(usageDate, measuredAt, userId, billingMonth);
        } else {
          db.prepare(`
            INSERT INTO storage_billing_charges
              (id, user_id, billing_month, usage_date, previous_billed_bytes, billed_peak_bytes,
               incremental_bytes, unit_price_cents_per_gb, credits, ledger_id, balance_before,
               balance_after, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            chargeId,
            userId,
            billingMonth,
            usageDate,
            previousBilledBytes,
            candidatePeak,
            Math.max(0, candidatePeak - previousBilledBytes),
            Number(monthState.unit_price_cents_per_gb),
            incrementalCredits,
            charge.ledgerId,
            balanceBefore,
            balanceAfter,
            measuredAt
          );
          db.prepare(`
            UPDATE storage_billing_months
            SET billed_peak_bytes = ?, charged_credits = charged_credits + ?, last_run_date = ?,
                last_charged_at = ?, updated_at = ?
            WHERE user_id = ? AND billing_month = ?
          `).run(candidatePeak, incrementalCredits, usageDate, measuredAt, measuredAt, userId, billingMonth);
          resultStatus = 'charged';
        }
      }
    } else {
      db.prepare(`
        UPDATE storage_billing_months SET last_run_date = ?, updated_at = ?
        WHERE user_id = ? AND billing_month = ?
      `).run(usageDate, measuredAt, userId, billingMonth);
    }

    db.prepare(`
      INSERT INTO storage_billing_daily_usage
        (user_id, usage_date, billing_month, run_phase, owned_bytes, owned_asset_count,
         result_status, incremental_credits, balance_before, balance_after, charge_id, measured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      usageDate,
      billingMonth,
      runPhase,
      bytes,
      assetCount,
      resultStatus,
      ['charged', 'insufficient_credits'].includes(resultStatus) ? incrementalCredits : 0,
      balanceBefore,
      balanceAfter,
      chargeId,
      measuredAt
    );
    db.exec('COMMIT');
    return {
      userId,
      runDate: usageDate,
      billingMonth,
      runPhase,
      status: resultStatus,
      ownedBytes: bytes,
      peakBytes: candidatePeak,
      billedPeakBytes: resultStatus === 'charged' ? candidatePeak : Number(monthState.billed_peak_bytes || 0),
      chargedCredits: resultStatus === 'charged' ? incrementalCredits : 0,
      pendingCredits: resultStatus === 'insufficient_credits' ? incrementalCredits : 0,
      balanceBefore,
      balanceAfter,
      unitPriceCentsPerGb: Number(monthState.unit_price_cents_per_gb)
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function claimStorageBillingBatch(runDate, runPhase, startedAt) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare(`SELECT * FROM storage_billing_batches WHERE run_date = ?`).get(runDate);
    if (existing?.status === 'completed') {
      db.exec('COMMIT');
      return { claimed: false, reason: 'completed', row: existing };
    }
    if (existing?.status === 'running' && Date.now() - Date.parse(existing.started_at) < BATCH_STALE_MS) {
      db.exec('COMMIT');
      return { claimed: false, reason: 'running', row: existing };
    }
    db.prepare(`
      INSERT INTO storage_billing_batches
        (run_date, run_phase, status, started_at, completed_at, user_count, processed_count,
         charged_users, charged_credits, insufficient_users, error_count, error_json)
      VALUES (?, ?, 'running', ?, NULL, 0, 0, 0, 0, 0, 0, '[]')
      ON CONFLICT(run_date) DO UPDATE SET
        run_phase = excluded.run_phase,
        status = 'running',
        started_at = excluded.started_at,
        completed_at = NULL,
        error_json = '[]'
    `).run(runDate, runPhase, startedAt);
    db.exec('COMMIT');
    return { claimed: true };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function finishStorageBillingBatch(runDate, summary, errors, completedAt) {
  const aggregate = getDb().prepare(`
    SELECT
      COUNT(*) AS processed_count,
      COALESCE(SUM(CASE WHEN result_status = 'charged' THEN 1 ELSE 0 END), 0) AS charged_users,
      COALESCE(SUM(CASE WHEN result_status = 'charged' THEN incremental_credits ELSE 0 END), 0) AS charged_credits,
      COALESCE(SUM(CASE WHEN result_status = 'insufficient_credits' THEN 1 ELSE 0 END), 0) AS insufficient_users
    FROM storage_billing_daily_usage WHERE usage_date = ?
  `).get(runDate);
  summary.processedCount = Number(aggregate?.processed_count || 0);
  summary.chargedUsers = Number(aggregate?.charged_users || 0);
  summary.chargedCredits = Number(aggregate?.charged_credits || 0);
  summary.insufficientUsers = Number(aggregate?.insufficient_users || 0);
  const status = errors.length ? 'partial' : 'completed';
  getDb().prepare(`
    UPDATE storage_billing_batches
    SET status = ?, completed_at = ?, user_count = ?, processed_count = ?, charged_users = ?,
        charged_credits = ?, insufficient_users = ?, error_count = ?, error_json = ?
    WHERE run_date = ?
  `).run(
    status,
    completedAt,
    summary.userCount,
    summary.processedCount,
    summary.chargedUsers,
    summary.chargedCredits,
    summary.insufficientUsers,
    errors.length,
    JSON.stringify(errors.slice(0, 100)),
    runDate
  );
  return status;
}

export async function runStorageBillingBatch({
  runDate = storageBillingDateParts().date,
  measuredAt = now(),
  repairMetadata = true
} = {}) {
  const usageDate = assertRunDate(runDate);
  const config = getStorageBillingConfig();
  if (!config.enabled || String(process.env.STORAGE_BILLING_ENABLED || '').toLowerCase() === 'false') {
    return { runDate: usageDate, status: 'disabled', userCount: 0, processedCount: 0 };
  }
  const runPhase = storageBillingRunPhase(usageDate);
  const claim = claimStorageBillingBatch(usageDate, runPhase, measuredAt);
  if (!claim.claimed) {
    return { runDate: usageDate, status: claim.reason, batch: claim.row || null };
  }

  const users = getDb().prepare(`SELECT id FROM users WHERE status = 'active' ORDER BY created_at ASC`).all();
  const summary = {
    runDate: usageDate,
    runPhase,
    status: 'running',
    userCount: users.length,
    processedCount: 0,
    chargedUsers: 0,
    chargedCredits: 0,
    insufficientUsers: 0
  };
  const errors = [];

  for (const user of users) {
    try {
      if (repairMetadata) {
        await repairMissingAssetFileMetadata(user.id, { limit: 500, concurrency: 4 });
      }
      const usage = getOwnedAssetStorageUsage(user.id);
      const result = billUserStorageForDate({
        userId: user.id,
        runDate: usageDate,
        ownedBytes: usage.ownedBytes,
        ownedAssetCount: usage.ownedAssetCount,
        measuredAt,
        unitPriceCentsPerGb: config.unitPriceCentsPerGb
      });
      if (result.status !== 'already_processed') summary.processedCount += 1;
      if (result.status === 'charged') {
        summary.chargedUsers += 1;
        summary.chargedCredits += Number(result.chargedCredits || 0);
      }
      if (result.status === 'insufficient_credits') summary.insufficientUsers += 1;
    } catch (error) {
      errors.push({ userId: user.id, code: error?.code || 'STORAGE_BILLING_USER_FAILED' });
    }
  }

  summary.status = finishStorageBillingBatch(usageDate, summary, errors, now());
  summary.errorCount = errors.length;
  return summary;
}

function normalizeBatch(row) {
  if (!row) return null;
  return {
    runDate: row.run_date,
    runPhase: row.run_phase,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at || null,
    userCount: Number(row.user_count || 0),
    processedCount: Number(row.processed_count || 0),
    chargedUsers: Number(row.charged_users || 0),
    chargedCredits: Number(row.charged_credits || 0),
    insufficientUsers: Number(row.insufficient_users || 0),
    errorCount: Number(row.error_count || 0),
    errors: parseJson(row.error_json, [])
  };
}

export function getStorageBillingBatch(runDate) {
  return normalizeBatch(getDb().prepare(`SELECT * FROM storage_billing_batches WHERE run_date = ?`).get(runDate));
}

export function getLatestStorageBillingBatch() {
  return normalizeBatch(getDb().prepare(`
    SELECT * FROM storage_billing_batches ORDER BY run_date DESC LIMIT 1
  `).get());
}

export function getStorageBillingAdminSummary(referenceDate = new Date()) {
  const parts = storageBillingDateParts(referenceDate);
  const db = getDb();
  const current = db.prepare(`
    SELECT
      COUNT(*) AS billed_users,
      COALESCE(SUM(charged_credits), 0) AS charged_credits,
      COALESCE(SUM(billed_peak_bytes), 0) AS billed_peak_bytes
    FROM storage_billing_months
    WHERE billing_month = ?
  `).get(parts.month);
  const measured = db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS measured_users,
      COALESCE(SUM(owned_bytes), 0) AS latest_measured_bytes
    FROM storage_billing_daily_usage usage
    WHERE usage.usage_date = (
      SELECT MAX(latest.usage_date) FROM storage_billing_daily_usage latest
      WHERE latest.billing_month = ?
    )
  `).get(parts.month);
  const recentBatches = db.prepare(`
    SELECT * FROM storage_billing_batches ORDER BY run_date DESC LIMIT 15
  `).all().map(normalizeBatch);
  return {
    billingMonth: parts.month,
    billedUsers: Number(current?.billed_users || 0),
    measuredUsers: Number(measured?.measured_users || 0),
    chargedCredits: Number(current?.charged_credits || 0),
    billedPeakBytes: Number(current?.billed_peak_bytes || 0),
    latestMeasuredBytes: Number(measured?.latest_measured_bytes || 0),
    latestBatch: recentBatches[0] || null,
    recentBatches
  };
}
