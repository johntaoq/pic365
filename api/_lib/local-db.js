import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  defaultImagePricingConfigForModel,
  normalizeImagePricingConfig,
  normalizeImagePromotionConfig
} from '../../shared/image-pricing.js';
import { normalizeRechargeConfig } from '../../shared/recharge-config.js';
import {
  ADMIN_PERMISSIONS,
  isAdministrativeRole,
  normalizeUserRole,
  permissionsForRole,
  roleHasPermission,
  USER_ROLES
} from '../../shared/admin-permissions.js';
import { decryptProviderSecret, encryptProviderSecret, maskProviderSecret } from './provider-secrets.js';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'app.sqlite');
const PASSWORD_SCHEME = 'scrypt-v1';
const STARTUP_RECOVERY_PATHS_KEY = Symbol.for('pic365.local-db-startup-recovery-paths');

let database;

function claimStartupRecovery(databasePath) {
  if (!globalThis[STARTUP_RECOVERY_PATHS_KEY]) {
    globalThis[STARTUP_RECOVERY_PATHS_KEY] = new Set();
  }
  const recoveredPaths = globalThis[STARTUP_RECOVERY_PATHS_KEY];
  if (recoveredPaths.has(databasePath)) return false;
  recoveredPaths.add(databasePath);
  return true;
}

function now() {
  return new Date().toISOString();
}

function getDatabasePath() {
  return path.resolve(process.env.APP_DB_PATH || DEFAULT_DB_PATH);
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function mediaMimeTypeFromPath(storagePath, fallback = 'application/octet-stream') {
  const extension = path.extname(String(storagePath || '')).slice(1).toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'mp4' || extension === 'm4v') return 'video/mp4';
  if (extension === 'webm') return 'video/webm';
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'm4a') return 'audio/mp4';
  if (extension === 'ogg' || extension === 'oga') return 'audio/ogg';
  return fallback;
}

function mediaTypeFromMime(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  if (value.startsWith('video/')) return 'video';
  if (value.startsWith('audio/')) return 'audio';
  return 'image';
}

function dimensionsFromSize(size) {
  const match = String(size || '').match(/^(\d+)x(\d+)$/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 0, height: 0 };
}

function insertOriginalAssetVariant(db, { assetId, storagePath, mimeType, fileSize = 0, width = 0, height = 0, durationMs = 0, createdAt }) {
  db.prepare(`
    INSERT INTO asset_variants
      (id, asset_id, variant_type, storage_path, mime_type, file_size, width, height, duration_ms, status, created_at, updated_at)
    VALUES (?, ?, 'original', ?, ?, ?, ?, ?, ?, 'ready', ?, ?)
    ON CONFLICT(asset_id, variant_type) DO UPDATE SET
      storage_path = excluded.storage_path,
      mime_type = excluded.mime_type,
      file_size = CASE WHEN excluded.file_size > 0 THEN excluded.file_size ELSE asset_variants.file_size END,
      width = CASE WHEN excluded.width > 0 THEN excluded.width ELSE asset_variants.width END,
      height = CASE WHEN excluded.height > 0 THEN excluded.height ELSE asset_variants.height END,
      duration_ms = CASE WHEN excluded.duration_ms > 0 THEN excluded.duration_ms ELSE asset_variants.duration_ms END,
      status = 'ready',
      updated_at = excluded.updated_at
  `).run(`original-${assetId}`, assetId, storagePath, mimeType, fileSize, width, height, durationMs, createdAt, createdAt);
}

function ensureGenerationMediaAsset(db, generation) {
  if (!generation?.id || !generation?.user_id || generation.status !== 'succeeded' || !generation.storage_path) return '';
  const assetId = `generation-${generation.id}`;
  const mimeType = generation.mime_type || mediaMimeTypeFromPath(generation.storage_path, 'image/png');
  const fileSize = Math.max(0, Number(generation.file_size || 0));
  const { width, height } = dimensionsFromSize(generation.size);
  const createdAt = generation.created_at || now();
  const metadata = {
    generationId: generation.id,
    projectId: generation.project_id || '',
    slotId: generation.slot_id || '',
    model: generation.model || '',
    provider: generation.provider || '',
    size: generation.size || '',
    quality: generation.quality || ''
  };
  db.prepare(`
    INSERT OR IGNORE INTO assets
      (id, owner_user_id, name, media_type, source_type, status, original_storage_path, mime_type,
       file_size, width, height, duration_ms, prompt, source_table, source_id, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, 'image', 'generated', 'ready', ?, ?, ?, ?, ?, 0, ?, 'generations', ?, ?, ?, ?)
  `).run(
    assetId,
    generation.user_id,
    `AI-${String(generation.id).slice(0, 8)}`,
    generation.storage_path,
    mimeType,
    fileSize,
    width,
    height,
    generation.prompt || '',
    generation.id,
    JSON.stringify(metadata),
    createdAt,
    generation.completed_at || createdAt
  );
  db.prepare(`
    UPDATE assets SET
      original_storage_path = ?,
      mime_type = ?,
      file_size = CASE WHEN ? > 0 THEN ? ELSE file_size END,
      width = CASE WHEN ? > 0 THEN ? ELSE width END,
      height = CASE WHEN ? > 0 THEN ? ELSE height END,
      metadata_json = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    generation.storage_path,
    mimeType,
    fileSize,
    fileSize,
    width,
    width,
    height,
    height,
    JSON.stringify(metadata),
    generation.completed_at || createdAt,
    assetId
  );
  insertOriginalAssetVariant(db, {
    assetId,
    storagePath: generation.storage_path,
    mimeType,
    fileSize,
    width,
    height,
    createdAt
  });
  if (generation.project_id) {
    db.prepare(`
      INSERT OR IGNORE INTO asset_project_links (asset_id, project_id, role, created_at)
      VALUES (?, ?, 'generated', ?)
    `).run(assetId, generation.project_id, createdAt);
  }
  return assetId;
}

function ensureEcommerceMediaAsset(db, ecommerceAsset) {
  if (!ecommerceAsset?.id || !ecommerceAsset?.user_id || !ecommerceAsset.storage_path) return '';
  const assetId = ecommerceAsset.media_asset_id || `ecommerce-${ecommerceAsset.id}`;
  const mimeType = ecommerceAsset.mime_type || mediaMimeTypeFromPath(ecommerceAsset.storage_path, 'image/png');
  const createdAt = ecommerceAsset.created_at || now();
  db.prepare(`
    INSERT OR IGNORE INTO assets
      (id, owner_user_id, name, media_type, source_type, status, original_storage_path, mime_type,
       file_size, width, height, duration_ms, source_table, source_id, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'upload', 'ready', ?, ?, ?, 0, 0, 0, 'ecommerce_project_assets', ?, ?, ?, ?)
  `).run(
    assetId,
    ecommerceAsset.user_id,
    ecommerceAsset.file_name || `asset-${String(ecommerceAsset.id).slice(0, 8)}`,
    mediaTypeFromMime(mimeType),
    ecommerceAsset.storage_path,
    mimeType,
    Number(ecommerceAsset.file_size || 0),
    ecommerceAsset.id,
    JSON.stringify({
      projectId: ecommerceAsset.project_id || '',
      assetType: ecommerceAsset.asset_type || 'reference',
      purpose: ecommerceAsset.purpose || ''
    }),
    createdAt,
    createdAt
  );
  insertOriginalAssetVariant(db, {
    assetId,
    storagePath: ecommerceAsset.storage_path,
    mimeType,
    fileSize: Number(ecommerceAsset.file_size || 0),
    createdAt
  });
  db.prepare('UPDATE ecommerce_project_assets SET media_asset_id = ? WHERE id = ? AND media_asset_id IS NULL').run(assetId, ecommerceAsset.id);
  if (ecommerceAsset.project_id) {
    db.prepare(`
      INSERT OR IGNORE INTO asset_project_links (asset_id, project_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `).run(assetId, ecommerceAsset.project_id, ecommerceAsset.asset_type || 'reference', createdAt);
  }
  return assetId;
}

function migrateUnifiedMediaAssets(db) {
  const generations = db.prepare(`
    SELECT generation.*
    FROM generations generation
    LEFT JOIN assets asset
      ON asset.source_table = 'generations' AND asset.source_id = generation.id
    WHERE generation.status = 'succeeded'
      AND generation.storage_path IS NOT NULL
      AND TRIM(generation.storage_path) != ''
      AND asset.id IS NULL
  `).all();
  for (const generation of generations) ensureGenerationMediaAsset(db, generation);

  const ecommerceAssets = db.prepare(`
    SELECT project_asset.*
    FROM ecommerce_project_assets project_asset
    LEFT JOIN assets asset ON asset.id = project_asset.media_asset_id
    WHERE project_asset.media_asset_id IS NULL OR asset.id IS NULL
  `).all();
  for (const ecommerceAsset of ecommerceAssets) ensureEcommerceMediaAsset(db, ecommerceAsset);
}

export function reconcileInterruptedGenerationState(db, errorCode = 'SERVER_RESTARTED') {
  if (!db) return { releasedReservations: 0, interruptedGenerations: 0, interruptedTasks: 0, interruptedFreeTasks: 0 };
  const completedAt = now();
  let releasedReservations = 0;
  let interruptedGenerations = 0;
  let interruptedTasks = 0;
  let interruptedFreeTasks = 0;

  db.exec('BEGIN IMMEDIATE');
  try {
    const generationResult = db.prepare(`
      UPDATE generations
      SET status = 'failed', error_code = ?, completed_at = ?
      WHERE status = 'processing'
    `).run(errorCode, completedAt);
    interruptedGenerations = Number(generationResult.changes || 0);

    const taskResult = db.prepare(`
      UPDATE ecommerce_generation_tasks
      SET status = 'interrupted', error_code = ?, cancel_requested = 1, updated_at = ?, completed_at = ?
      WHERE status IN ('running', 'cancelling')
    `).run(errorCode, completedAt, completedAt);
    interruptedTasks = Number(taskResult.changes || 0);

    const freeTaskResult = db.prepare(`
      UPDATE free_generation_tasks
      SET status = 'interrupted', error_code = ?, cancel_requested = 1, updated_at = ?, completed_at = ?
      WHERE status IN ('running', 'cancelling')
    `).run(errorCode, completedAt, completedAt);
    interruptedFreeTasks = Number(freeTaskResult.changes || 0);

    const reservations = db.prepare(`
      SELECT r.id, r.user_id, r.amount, u.role
      FROM credit_reservations r
      JOIN users u ON u.id = r.user_id
      WHERE r.status = 'reserved'
    `).all();
    const refundUser = db.prepare(`
      UPDATE users SET credit_balance = credit_balance + ?, updated_at = ? WHERE id = ?
    `);
    const insertRefund = db.prepare(`
      INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
      VALUES (?, ?, ?, 'refund', 'generation_recovery', ?, ?, ?)
    `);
    const releaseReservation = db.prepare(`
      UPDATE credit_reservations
      SET status = 'released', error_code = ?, completed_at = ?
      WHERE id = ? AND status = 'reserved'
    `);

    for (const reservation of reservations) {
      const amount = Number(reservation.amount || 0);
      if (reservation.role !== 'super_admin' && amount > 0) {
        refundUser.run(amount, completedAt, reservation.user_id);
        insertRefund.run(
          randomUUID(),
          reservation.user_id,
          amount,
          reservation.id,
          JSON.stringify({ errorCode, recoveredAt: completedAt }),
          completedAt
        );
      }
      const result = releaseReservation.run(errorCode, completedAt, reservation.id);
      releasedReservations += Number(result.changes || 0);
    }

    db.exec('COMMIT');
    return { releasedReservations, interruptedGenerations, interruptedTasks, interruptedFreeTasks };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function migrate(db, { recoverInterrupted = true } = {}) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      credit_balance INTEGER NOT NULL DEFAULT 0 CHECK (credit_balance >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ecommerce_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_name TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      industry_id TEXT NOT NULL,
      subcategory_id TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL,
      brand_name TEXT NOT NULL DEFAULT '',
      target_audience TEXT NOT NULL DEFAULT '',
      core_user TEXT NOT NULL DEFAULT '',
      core_scenario TEXT NOT NULL DEFAULT '',
      selling_points TEXT NOT NULL DEFAULT '[]',
      specifications TEXT NOT NULL DEFAULT '',
      prohibited_content TEXT NOT NULL DEFAULT '',
      ai_brief_originals TEXT NOT NULL DEFAULT '{}',
      identity_spec TEXT NOT NULL DEFAULT '{}',
      auto_analysis_fingerprint TEXT NOT NULL DEFAULT '',
      auto_analysis_status TEXT NOT NULL DEFAULT '',
      auto_analysis_updated_at TEXT,
      template_id TEXT NOT NULL DEFAULT '',
      visual_style_id TEXT NOT NULL DEFAULT 'clean-commercial',
      image_quality TEXT NOT NULL DEFAULT 'low',
      selected_slots TEXT NOT NULL DEFAULT '[]',
      master_asset_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS image_provider_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      model TEXT NOT NULL,
      pricing_strategy TEXT NOT NULL DEFAULT 'pixel-quality-formula',
      pricing_config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_provider_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      model TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      max_output_tokens INTEGER NOT NULL DEFAULT 2048,
      input_price_microyuan INTEGER NOT NULL DEFAULT 7000000,
      output_price_microyuan INTEGER NOT NULL DEFAULT 42000000,
      cache_read_price_microyuan INTEGER NOT NULL DEFAULT 700000,
      cache_write_price_microyuan INTEGER NOT NULL DEFAULT 8750000,
      exchange_rate_micros INTEGER NOT NULL DEFAULT 7000000,
      pricing_source TEXT NOT NULL DEFAULT 'manual',
      pricing_version TEXT NOT NULL DEFAULT '',
      price_synced_at TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      usage_json TEXT NOT NULL DEFAULT '{}',
      charged_credit_centi INTEGER NOT NULL DEFAULT 0,
      sequence INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_usage_records (
      id TEXT PRIMARY KEY,
      client_request_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      assistant_message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      calculated_credit_centi INTEGER NOT NULL DEFAULT 0,
      charged_credit_centi INTEGER NOT NULL DEFAULT 0,
      pricing_json TEXT NOT NULL DEFAULT '{}',
      upstream_request_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'register',
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      reference_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_reservations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      generation_id TEXT,
      amount INTEGER NOT NULL DEFAULT 1 CHECK (amount >= 0),
      status TEXT NOT NULL DEFAULT 'reserved',
      case_id INTEGER,
      prompt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      error_code TEXT
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reservation_id TEXT REFERENCES credit_reservations(id),
      case_id INTEGER,
      project_id TEXT REFERENCES ecommerce_projects(id) ON DELETE SET NULL,
      slot_id TEXT,
      version_number INTEGER NOT NULL DEFAULT 1,
      prompt TEXT NOT NULL,
      model TEXT NOT NULL,
      size TEXT NOT NULL,
      quality TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      provider_request_id TEXT,
      storage_path TEXT,
      output_url TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT '',
      error_code TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ecommerce_project_outputs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ecommerce_projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot_id TEXT NOT NULL,
      generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      prompt TEXT NOT NULL DEFAULT '',
      version_number INTEGER NOT NULL DEFAULT 1,
      locked INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      consistency_status TEXT NOT NULL DEFAULT 'unchecked',
      consistency_score INTEGER,
      consistency_issues TEXT NOT NULL DEFAULT '[]',
      consistency_summary TEXT NOT NULL DEFAULT '',
      checked_at TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ecommerce_project_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ecommerce_projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      media_asset_id TEXT,
      asset_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_collections (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      collection_type TEXT NOT NULL DEFAULT 'folder',
      color TEXT NOT NULL DEFAULT '#5eead4',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'upload',
      status TEXT NOT NULL DEFAULT 'ready',
      original_storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      favorite INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'private',
      source_table TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_user_metadata (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, asset_id)
    );

    CREATE TABLE IF NOT EXISTS asset_collection_memberships (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES asset_collections(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, asset_id, collection_id)
    );

    CREATE TABLE IF NOT EXISTS asset_variants (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      variant_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(asset_id, variant_type)
    );

    CREATE TABLE IF NOT EXISTS asset_project_links (
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES ecommerce_projects(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'reference',
      created_at TEXT NOT NULL,
      PRIMARY KEY (asset_id, project_id, role)
    );

    CREATE TABLE IF NOT EXISTS asset_relations (
      source_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      target_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL DEFAULT 'derived',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      PRIMARY KEY (source_asset_id, target_asset_id, relation_type)
    );

    CREATE TABLE IF NOT EXISTS asset_tags (
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (asset_id, tag)
    );

    CREATE TABLE IF NOT EXISTS asset_processing_jobs (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL,
      PRIMARY KEY (team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS asset_permissions (
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      principal_type TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'view',
      created_at TEXT NOT NULL,
      PRIMARY KEY (asset_id, principal_type, principal_id)
    );

    CREATE TABLE IF NOT EXISTS asset_usage (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      context_type TEXT NOT NULL DEFAULT '',
      context_id TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ecommerce_generation_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES ecommerce_projects(id) ON DELETE CASCADE,
      slot_id TEXT NOT NULL,
      generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      quality TEXT NOT NULL DEFAULT 'medium',
      attempts INTEGER NOT NULL DEFAULT 0,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      request_json TEXT NOT NULL DEFAULT '{}',
      error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS free_generation_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued',
      prompt TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '1024x1024',
      quality TEXT NOT NULL DEFAULT 'medium',
      image_count INTEGER NOT NULL DEFAULT 1,
      provider_id TEXT NOT NULL DEFAULT '',
      request_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      error_code TEXT,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS prompt_audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT NOT NULL DEFAULT '',
      generation_id TEXT UNIQUE REFERENCES generations(id) ON DELETE SET NULL,
      client_task_id TEXT NOT NULL DEFAULT '',
      task_mode TEXT NOT NULL DEFAULT 'single',
      source_name TEXT NOT NULL DEFAULT '',
      user_prompt TEXT NOT NULL DEFAULT '',
      effective_prompt TEXT NOT NULL DEFAULT '',
      provider_id TEXT NOT NULL DEFAULT '',
      provider_name TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '1024x1024',
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      quality TEXT NOT NULL DEFAULT 'medium',
      reference_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_audit_logs_created
      ON prompt_audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prompt_audit_logs_user
      ON prompt_audit_logs(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ecommerce_delivery_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ecommerce_projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot_id TEXT NOT NULL,
      source_generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
      document_type TEXT NOT NULL DEFAULT 'benefit',
      target_width INTEGER NOT NULL DEFAULT 1024,
      target_height INTEGER NOT NULL DEFAULT 1024,
      output_format TEXT NOT NULL DEFAULT 'png',
      theme_id TEXT NOT NULL DEFAULT 'minimal-light',
      layout_id TEXT NOT NULL DEFAULT 'bottom-left',
      safe_area INTEGER NOT NULL DEFAULT 1,
      include_in_export INTEGER NOT NULL DEFAULT 1,
      module_order INTEGER NOT NULL DEFAULT 0,
      content_json TEXT NOT NULL DEFAULT '{}',
      advanced_json TEXT NOT NULL DEFAULT '{}',
      validation_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ecommerce_user_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      platform_id TEXT NOT NULL,
      industry_id TEXT NOT NULL,
      project_config TEXT NOT NULL DEFAULT '{}',
      delivery_config TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      case_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, case_id)
    );

    CREATE TABLE IF NOT EXISTS credit_products (
      id TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      description_en TEXT NOT NULL DEFAULT '',
      description_zh TEXT NOT NULL DEFAULT '',
      credits INTEGER NOT NULL CHECK (credits > 0),
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'cny',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES credit_products(id),
      status TEXT NOT NULL DEFAULT 'created',
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      credits INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      provider_order_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      processed_at TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (provider, event_id)
    );

    CREATE TABLE IF NOT EXISTS watcha_accounts (
      watcha_user_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      email TEXT,
      nickname TEXT,
      avatar_url TEXT,
      access_token_expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guest_generation_usage (
      fingerprint TEXT PRIMARY KEY,
      used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL DEFAULT '{}',
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_setting_audit (
      id TEXT PRIMARY KEY,
      setting_key TEXT NOT NULL,
      previous_value_json TEXT NOT NULL DEFAULT '{}',
      next_value_json TEXT NOT NULL DEFAULT '{}',
      updated_by TEXT,
      created_at TEXT NOT NULL
    );

      CREATE TABLE IF NOT EXISTS user_ui_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        hide_ecommerce INTEGER NOT NULL DEFAULT 0,
        hide_templates INTEGER NOT NULL DEFAULT 0,
        hide_cases INTEGER NOT NULL DEFAULT 0,
        hide_api INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

    CREATE TABLE IF NOT EXISTS redemption_code_batches (
      id TEXT PRIMARY KEY,
      batch_number TEXT NOT NULL UNIQUE,
      code_type TEXT NOT NULL CHECK (code_type IN ('free', 'paid')),
      face_value_cents INTEGER NOT NULL CHECK (face_value_cents > 0),
      credits_per_yuan INTEGER NOT NULL CHECK (credits_per_yuan > 0),
      credits_per_code INTEGER NOT NULL CHECK (credits_per_code > 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      free_purpose TEXT NOT NULL DEFAULT '',
      paid_source TEXT NOT NULL DEFAULT '',
      source_detail TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      payment_confirmed INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
      created_by TEXT NOT NULL REFERENCES users(id),
      operator_name_snapshot TEXT NOT NULL DEFAULT '',
      operator_email_snapshot TEXT NOT NULL DEFAULT '',
      operator_role_snapshot TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS redemption_codes (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES redemption_code_batches(id),
      code_hash TEXT NOT NULL UNIQUE,
      code_ciphertext TEXT NOT NULL,
      code_masked TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'voided', 'expired')),
      redeemed_by TEXT REFERENCES users(id),
      redeemed_at TEXT,
      voided_by TEXT REFERENCES users(id),
      voided_at TEXT,
      void_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL DEFAULT 'success',
      actor_type TEXT NOT NULL DEFAULT 'user',
      actor_user_id TEXT,
      actor_role TEXT NOT NULL DEFAULT '',
      actor_name_snapshot TEXT NOT NULL DEFAULT '',
      actor_email_snapshot TEXT NOT NULL DEFAULT '',
      target_user_id TEXT,
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      credit_ledger_id TEXT,
      credit_delta INTEGER,
      balance_before INTEGER,
      balance_after INTEGER,
      amount_cents INTEGER,
      reason TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      before_json TEXT NOT NULL DEFAULT '{}',
      after_json TEXT NOT NULL DEFAULT '{}',
      request_id TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TRIGGER IF NOT EXISTS audit_events_block_update
    BEFORE UPDATE ON audit_events
    BEGIN
      SELECT RAISE(ABORT, 'AUDIT_EVENTS_IMMUTABLE');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_events_block_delete
    BEFORE DELETE ON audit_events
    BEGIN
      SELECT RAISE(ABORT, 'AUDIT_EVENTS_IMMUTABLE');
    END;

    CREATE TRIGGER IF NOT EXISTS credit_ledger_block_update
    BEFORE UPDATE ON credit_ledger
    BEGIN
      SELECT RAISE(ABORT, 'CREDIT_LEDGER_IMMUTABLE');
    END;

    CREATE TRIGGER IF NOT EXISTS credit_ledger_block_delete
    BEFORE DELETE ON credit_ledger
    BEGIN
      SELECT RAISE(ABORT, 'CREDIT_LEDGER_IMMUTABLE');
    END;

    CREATE TRIGGER IF NOT EXISTS credit_ledger_audit_insert
    AFTER INSERT ON credit_ledger
    BEGIN
      INSERT INTO audit_events
        (id, category, action, result, actor_type, actor_user_id, actor_role,
         actor_name_snapshot, actor_email_snapshot, target_user_id, entity_type, entity_id,
         credit_ledger_id, credit_delta, reason, after_json, created_at)
      VALUES
        (lower(hex(randomblob(16))), 'credits', 'credit_ledger_posted', 'success',
         CASE WHEN json_extract(NEW.metadata, '$.adminUserId') IS NOT NULL THEN 'user' ELSE 'system' END,
         json_extract(NEW.metadata, '$.adminUserId'),
         COALESCE((SELECT role FROM users WHERE id = json_extract(NEW.metadata, '$.adminUserId')), ''),
         COALESCE(json_extract(NEW.metadata, '$.actorName'), ''),
         COALESCE(json_extract(NEW.metadata, '$.actorEmail'), ''),
         NEW.user_id, 'credit_ledger', NEW.id, NEW.id, NEW.amount,
         NEW.source,
         json_object('type', NEW.type, 'source', NEW.source, 'referenceId', NEW.reference_id),
         NEW.created_at);
    END;

    CREATE TRIGGER IF NOT EXISTS app_setting_audit_to_event
    AFTER INSERT ON app_setting_audit
    BEGIN
      INSERT INTO audit_events
        (id, category, action, result, actor_type, actor_user_id, actor_role,
         actor_name_snapshot, actor_email_snapshot, entity_type, entity_id,
         before_json, after_json, created_at)
      VALUES
        (lower(hex(randomblob(16))), 'settings', 'app_setting_updated', 'success',
         CASE WHEN NEW.updated_by IS NULL THEN 'system' ELSE 'user' END,
         NEW.updated_by,
         COALESCE((SELECT role FROM users WHERE id = NEW.updated_by), ''),
         COALESCE((SELECT full_name FROM users WHERE id = NEW.updated_by), ''),
         COALESCE((SELECT email FROM users WHERE id = NEW.updated_by), ''),
         'app_setting', NEW.setting_key,
         NEW.previous_value_json, NEW.next_value_json, NEW.created_at);
    END;

    CREATE TABLE IF NOT EXISTS admin_alerts (
      id TEXT PRIMARY KEY,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      dedupe_key TEXT NOT NULL UNIQUE,
      message TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open',
      occurrences INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      acknowledged_at TEXT,
      acknowledged_by TEXT
    );

    CREATE TABLE IF NOT EXISTS storage_billing_months (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      billing_month TEXT NOT NULL,
      unit_price_cents_per_gb INTEGER NOT NULL,
      billed_peak_bytes INTEGER NOT NULL DEFAULT 0,
      charged_credits INTEGER NOT NULL DEFAULT 0,
      last_run_date TEXT,
      last_charged_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, billing_month)
    );

    CREATE TABLE IF NOT EXISTS storage_billing_daily_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      usage_date TEXT NOT NULL,
      billing_month TEXT NOT NULL,
      run_phase TEXT NOT NULL DEFAULT 'daily',
      owned_bytes INTEGER NOT NULL DEFAULT 0,
      owned_asset_count INTEGER NOT NULL DEFAULT 0,
      result_status TEXT NOT NULL DEFAULT 'measured',
      incremental_credits INTEGER NOT NULL DEFAULT 0,
      balance_before INTEGER,
      balance_after INTEGER,
      charge_id TEXT,
      measured_at TEXT NOT NULL,
      PRIMARY KEY (user_id, usage_date)
    );

    CREATE TABLE IF NOT EXISTS storage_billing_charges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      billing_month TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      previous_billed_bytes INTEGER NOT NULL DEFAULT 0,
      billed_peak_bytes INTEGER NOT NULL DEFAULT 0,
      incremental_bytes INTEGER NOT NULL DEFAULT 0,
      unit_price_cents_per_gb INTEGER NOT NULL,
      credits INTEGER NOT NULL,
      ledger_id TEXT NOT NULL,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, usage_date)
    );

    CREATE TABLE IF NOT EXISTS storage_billing_batches (
      run_date TEXT PRIMARY KEY,
      run_phase TEXT NOT NULL DEFAULT 'daily',
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      user_count INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,
      charged_users INTEGER NOT NULL DEFAULT 0,
      charged_credits INTEGER NOT NULL DEFAULT 0,
      insufficient_users INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      error_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS email_verification_email_created_idx
      ON email_verification_codes(email, purpose, created_at DESC);
    CREATE INDEX IF NOT EXISTS email_verification_expiry_idx
      ON email_verification_codes(expires_at, consumed_at);
    CREATE INDEX IF NOT EXISTS generations_user_created_idx ON generations(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ecommerce_projects_user_updated_idx ON ecommerce_projects(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS ecommerce_outputs_project_slot_idx ON ecommerce_project_outputs(project_id, slot_id, version_number DESC);
    CREATE INDEX IF NOT EXISTS ecommerce_assets_project_created_idx ON ecommerce_project_assets(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS assets_owner_created_idx ON assets(owner_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS assets_owner_media_idx ON assets(owner_user_id, media_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS assets_owner_source_idx ON assets(owner_user_id, source_type, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS assets_owner_source_unique_idx ON assets(owner_user_id, source_table, source_id) WHERE source_table != '' AND source_id != '';
    CREATE INDEX IF NOT EXISTS assets_deleted_idx ON assets(owner_user_id, deleted_at);
    CREATE INDEX IF NOT EXISTS asset_user_metadata_favorite_idx ON asset_user_metadata(user_id, favorite, updated_at DESC);
    CREATE INDEX IF NOT EXISTS asset_collection_memberships_user_collection_idx ON asset_collection_memberships(user_id, collection_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS asset_collection_memberships_asset_idx ON asset_collection_memberships(asset_id, user_id);
    CREATE INDEX IF NOT EXISTS asset_links_project_idx ON asset_project_links(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS asset_jobs_asset_status_idx ON asset_processing_jobs(asset_id, status);
    CREATE INDEX IF NOT EXISTS asset_usage_asset_created_idx ON asset_usage(asset_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ecommerce_tasks_project_created_idx ON ecommerce_generation_tasks(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ecommerce_tasks_user_status_idx ON ecommerce_generation_tasks(user_id, status);
    CREATE INDEX IF NOT EXISTS free_tasks_user_created_idx ON free_generation_tasks(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS free_tasks_status_created_idx ON free_generation_tasks(status, created_at ASC);
    CREATE UNIQUE INDEX IF NOT EXISTS ecommerce_delivery_project_slot_unique_idx ON ecommerce_delivery_documents(project_id, slot_id);
    CREATE INDEX IF NOT EXISTS ecommerce_delivery_project_order_idx ON ecommerce_delivery_documents(project_id, module_order ASC);
    CREATE INDEX IF NOT EXISTS ecommerce_user_templates_user_updated_idx ON ecommerce_user_templates(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS ledger_user_created_idx ON credit_ledger(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ledger_type_created_idx ON credit_ledger(type, created_at DESC);
    CREATE INDEX IF NOT EXISTS chat_provider_default_idx ON chat_provider_configs(enabled, is_default, created_at);
    CREATE INDEX IF NOT EXISTS chat_conversations_user_updated_idx ON chat_conversations(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS chat_messages_conversation_created_idx ON chat_messages(conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS chat_usage_user_created_idx ON chat_usage_records(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS reservations_user_status_idx ON credit_reservations(user_id, status);
    CREATE INDEX IF NOT EXISTS generations_status_created_idx ON generations(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS storage_billing_daily_month_idx ON storage_billing_daily_usage(billing_month, usage_date);
    CREATE INDEX IF NOT EXISTS storage_billing_charges_user_month_idx ON storage_billing_charges(user_id, billing_month, created_at DESC);
    CREATE INDEX IF NOT EXISTS storage_billing_batches_status_idx ON storage_billing_batches(status, run_date DESC);
    CREATE INDEX IF NOT EXISTS redemption_codes_batch_status_idx ON redemption_codes(batch_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS redemption_codes_redeemed_user_idx ON redemption_codes(redeemed_by, redeemed_at DESC);
    CREATE INDEX IF NOT EXISTS audit_events_category_created_idx ON audit_events(category, created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx ON audit_events(actor_user_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS audit_credit_adjustment_request_idx
      ON audit_events(request_id)
      WHERE action = 'credit_adjustment' AND result = 'success' AND request_id != '';
  `);

  ensureColumn(db, 'generations', 'project_id', 'TEXT');
  ensureColumn(db, 'guest_generation_usage', 'usage_count', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'user_ui_preferences', 'hide_ecommerce', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'users', 'admin_note', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'users', 'last_login_at', 'TEXT');
  ensureColumn(db, 'generations', 'slot_id', 'TEXT');
  ensureColumn(db, 'generations', 'version_number', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'generations', 'archived_at', 'TEXT');
  ensureColumn(db, 'generations', 'history_hidden_at', 'TEXT');
  ensureColumn(db, 'generations', 'file_size', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'generations', 'mime_type', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_projects', 'master_asset_id', 'TEXT');
  ensureColumn(db, 'ecommerce_projects', 'subcategory_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_projects', 'core_user', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_projects', 'core_scenario', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_projects', 'image_provider_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_projects', 'image_quality', "TEXT NOT NULL DEFAULT 'low'");
  ensureColumn(db, 'image_provider_configs', 'pricing_strategy', "TEXT NOT NULL DEFAULT 'pixel-quality-formula'");
  ensureColumn(db, 'image_provider_configs', 'pricing_config', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'redemption_codes', 'disabled_by', 'TEXT');
  ensureColumn(db, 'redemption_codes', 'disabled_at', 'TEXT');
  db.prepare(`
    INSERT OR IGNORE INTO asset_user_metadata
      (user_id, asset_id, favorite, created_at, updated_at)
    SELECT owner_user_id, id, favorite, created_at, updated_at
    FROM assets
    WHERE favorite = 1
  `).run();
  const providersWithoutPricing = db.prepare(`
    SELECT id, model FROM image_provider_configs
    WHERE pricing_config IS NULL OR TRIM(pricing_config) = '' OR TRIM(pricing_config) = '{}'
  `).all();
  const persistProviderPricing = db.prepare(`
    UPDATE image_provider_configs SET pricing_strategy = ?, pricing_config = ?, updated_at = ? WHERE id = ?
  `);
  for (const provider of providersWithoutPricing) {
    const pricing = defaultImagePricingConfigForModel(provider.model);
    persistProviderPricing.run(pricing.strategy, JSON.stringify(pricing), now(), provider.id);
  }
  db.prepare(`
    UPDATE ecommerce_projects
    SET core_user = target_audience
    WHERE core_user = '' AND core_scenario = '' AND target_audience != ''
  `).run();
  ensureColumn(db, 'ecommerce_projects', 'ai_brief_originals', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'ecommerce_projects', 'identity_spec', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'ecommerce_projects', 'auto_analysis_fingerprint', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_projects', 'auto_analysis_status', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_projects', 'auto_analysis_updated_at', 'TEXT');
  ensureColumn(db, 'ecommerce_projects', 'template_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_project_assets', 'purpose', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_project_assets', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'ecommerce_project_assets', 'media_asset_id', 'TEXT');
  ensureColumn(db, 'ecommerce_project_outputs', 'locked', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'ecommerce_project_outputs', 'locked_at', 'TEXT');
  ensureColumn(db, 'ecommerce_project_outputs', 'active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'ecommerce_project_outputs', 'consistency_status', "TEXT NOT NULL DEFAULT 'unchecked'");
  ensureColumn(db, 'ecommerce_project_outputs', 'consistency_score', 'INTEGER');
  ensureColumn(db, 'ecommerce_project_outputs', 'consistency_issues', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'ecommerce_project_outputs', 'consistency_summary', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_project_outputs', 'checked_at', 'TEXT');
  ensureColumn(db, 'free_generation_tasks', 'task_mode', "TEXT NOT NULL DEFAULT 'single'");
  ensureColumn(db, 'free_generation_tasks', 'batch_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'free_generation_tasks', 'batch_index', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'free_generation_tasks', 'source_name', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'free_generation_tasks', 'source_width', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'free_generation_tasks', 'source_height', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'free_generation_tasks', 'source_thumbnail', "TEXT NOT NULL DEFAULT ''");
  db.exec('CREATE INDEX IF NOT EXISTS generations_project_slot_idx ON generations(project_id, slot_id, created_at DESC)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ecommerce_outputs_project_slot_unique_idx ON ecommerce_project_outputs(project_id, slot_id)');

  migrateUnifiedMediaAssets(db);

  if (recoverInterrupted) {
    reconcileInterruptedGenerationState(db);
    db.prepare(`
      UPDATE asset_processing_jobs
      SET status = 'queued', progress = 5, error_code = NULL, updated_at = ?, completed_at = NULL
      WHERE status = 'running'
    `).run(now());
  }

  const ecommerceBackfillKey = 'migration:ecommerce-output-backfill:v1';
  if (!db.prepare('SELECT 1 FROM app_settings WHERE setting_key = ?').get(ecommerceBackfillKey)) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const assetProjects = db.prepare('SELECT DISTINCT project_id FROM ecommerce_project_assets').all();
      const updateAssetOrder = db.prepare('UPDATE ecommerce_project_assets SET sort_order = ? WHERE id = ?');
      for (const { project_id: projectId } of assetProjects) {
        const projectAssets = db.prepare(`
          SELECT id FROM ecommerce_project_assets WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC, id ASC
        `).all(projectId);
        projectAssets.forEach((asset, index) => updateAssetOrder.run(index + 1, asset.id));
      }

      const projectRows = db.prepare('SELECT id, user_id, selected_slots FROM ecommerce_projects WHERE status != ?').all('deleted');
      const insertOutput = db.prepare(`
        INSERT OR IGNORE INTO ecommerce_project_outputs
          (id, project_id, user_id, slot_id, status, version_number, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'planned', 0, '{}', ?, ?)
      `);
      for (const project of projectRows) {
        let slotIds = [];
        try {
          const parsed = JSON.parse(project.selected_slots || '[]');
          if (Array.isArray(parsed)) slotIds = parsed;
        } catch {
          slotIds = [];
        }
        for (const slotId of slotIds) {
          const createdAt = now();
          insertOutput.run(randomUUID(), project.id, project.user_id, String(slotId), createdAt, createdAt);
        }
      }

      const emptyOutputs = db.prepare(`
        SELECT id, user_id, project_id, slot_id FROM ecommerce_project_outputs WHERE generation_id IS NULL
      `).all();
      const latestSucceededGeneration = db.prepare(`
        SELECT id, version_number, prompt FROM generations
        WHERE user_id = ? AND project_id = ? AND slot_id = ? AND status = 'succeeded' AND archived_at IS NULL
        ORDER BY version_number DESC, created_at DESC LIMIT 1
      `);
      const selectOutputGeneration = db.prepare(`
        UPDATE ecommerce_project_outputs
        SET generation_id = ?, version_number = ?, prompt = ?, status = 'selected', updated_at = ?
        WHERE id = ?
      `);
      for (const output of emptyOutputs) {
        const generation = latestSucceededGeneration.get(output.user_id, output.project_id, output.slot_id);
        if (generation) {
          selectOutputGeneration.run(generation.id, Number(generation.version_number || 1), generation.prompt || '', now(), output.id);
        }
      }
      db.prepare(`
        INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
        VALUES (?, '{"completed":true}', NULL, ?)
      `).run(ecommerceBackfillKey, now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const productCount = db.prepare('SELECT COUNT(*) AS count FROM credit_products').get().count;
  if (Number(productCount) === 0) {
    const createdAt = now();
    const insert = db.prepare(`
      INSERT INTO credit_products
        (id, name_en, name_zh, description_en, description_zh, credits, amount_cents, currency, active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);
    insert.run('pack_100', '100 Credits', '100 积分', 'For prompt testing and small image batches.', '适合提示词测试和小批量生图。', 100, 990, 'cny', 10, createdAt, createdAt);
    insert.run('pack_500', '500 Credits', '500 积分', 'For regular creative work and visual iterations.', '适合日常创作和视觉迭代。', 500, 3990, 'cny', 20, createdAt, createdAt);
    insert.run('pack_2000', '2,000 Credits', '2,000 积分', 'For frequent generation and content production.', '适合高频生图和内容生产。', 2000, 12990, 'cny', 30, createdAt, createdAt);
  }

  syncConfiguredSuperAdmins(db);
}

export function getDb() {
  if (database) return database;
  const databasePath = getDatabasePath();
  ensureParentDirectory(databasePath);
  database = new DatabaseSync(databasePath);
  database.exec('PRAGMA busy_timeout = 5000;');
  migrate(database, { recoverInterrupted: claimStartupRecovery(databasePath) });
  return database;
}

const IMAGE_PROMOTION_SETTING_KEY = 'image_promotion';
const ADMIN_NOTIFICATION_SETTING_KEY = 'admin_notifications';
const RECHARGE_CONFIG_SETTING_KEY = 'recharge_config';
const PROMPT_LOGGING_SETTING_KEY = 'prompt_logging';

function parseJsonSetting(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getPromptLoggingConfig() {
  const row = getDb().prepare(`
    SELECT value_json, updated_at FROM app_settings WHERE setting_key = ?
  `).get(PROMPT_LOGGING_SETTING_KEY);
  const value = parseJsonSetting(row?.value_json);
  return {
    enabled: Boolean(value.enabled),
    updatedAt: row?.updated_at || null
  };
}

export function updatePromptLoggingConfig(values, adminUserId = null) {
  const db = getDb();
  const previous = getPromptLoggingConfig();
  const next = { enabled: Boolean(values?.enabled) };
  const updatedAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(PROMPT_LOGGING_SETTING_KEY, JSON.stringify(next), adminUserId, updatedAt);
    db.prepare(`
      INSERT INTO app_setting_audit
        (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      PROMPT_LOGGING_SETTING_KEY,
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
  return getPromptLoggingConfig();
}

export function recordPromptAuditLog(values = {}) {
  if (!getPromptLoggingConfig().enabled) return null;
  const parsedSize = String(values.size || '').match(/^(\d+)x(\d+)$/i);
  const id = randomUUID();
  const createdAt = now();
  try {
    getDb().prepare(`
      INSERT INTO prompt_audit_logs
        (id, user_id, user_email, generation_id, client_task_id, task_mode, source_name,
         user_prompt, effective_prompt, provider_id, provider_name, model, size, width, height,
         quality, reference_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      values.userId || null,
      String(values.userEmail || '').slice(0, 320),
      values.generationId || null,
      String(values.clientTaskId || '').slice(0, 160),
      values.taskMode === 'batch-repair' ? 'batch-repair' : 'single',
      String(values.sourceName || '').slice(0, 240),
      String(values.userPrompt || '').slice(0, 12_000),
      String(values.effectivePrompt || values.userPrompt || '').slice(0, 24_000),
      String(values.providerId || '').slice(0, 160),
      String(values.providerName || '').slice(0, 160),
      String(values.model || '').slice(0, 160),
      String(values.size || '1024x1024').slice(0, 40),
      Number(parsedSize?.[1] || 0),
      Number(parsedSize?.[2] || 0),
      String(values.quality || 'medium').slice(0, 20),
      Math.max(0, Math.min(20, Math.round(Number(values.referenceCount) || 0))),
      createdAt
    );
    return id;
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed: prompt_audit_logs.generation_id')) return null;
    throw error;
  }
}

export function listPromptAuditLogs({ limit = 100, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || 100)));
  const safeOffset = Math.max(0, Math.round(Number(offset) || 0));
  return getDb().prepare(`
    SELECT id, user_id, user_email, generation_id, client_task_id, task_mode, source_name,
           user_prompt, effective_prompt, provider_id, provider_name, model, size, width, height,
           quality, reference_count, created_at
    FROM prompt_audit_logs
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(safeLimit, safeOffset).map((row) => ({
    id: row.id,
    userId: row.user_id || '',
    userEmail: row.user_email || '',
    generationId: row.generation_id || '',
    clientTaskId: row.client_task_id || '',
    taskMode: row.task_mode || 'single',
    sourceName: row.source_name || '',
    userPrompt: row.user_prompt || '',
    effectivePrompt: row.effective_prompt || '',
    providerId: row.provider_id || '',
    providerName: row.provider_name || '',
    model: row.model || '',
    size: row.size || '1024x1024',
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    quality: row.quality || 'medium',
    referenceCount: Number(row.reference_count || 0),
    createdAt: row.created_at || ''
  }));
}

export function getImagePromotionConfig() {
  const row = getDb().prepare(`
    SELECT value_json, updated_at FROM app_settings WHERE setting_key = ?
  `).get(IMAGE_PROMOTION_SETTING_KEY);
  return normalizeImagePromotionConfig({
    ...parseJsonSetting(row?.value_json),
    updatedAt: row?.updated_at || null
  });
}

export function updateImagePromotionConfig(values, adminUserId = null) {
  const db = getDb();
  const previous = getImagePromotionConfig();
  const next = normalizeImagePromotionConfig(values);
  if (next.startsAt && next.endsAt && Date.parse(next.endsAt) <= Date.parse(next.startsAt)) {
    const error = new Error('INVALID_PROMOTION_RANGE');
    error.code = 'INVALID_PROMOTION_RANGE';
    throw error;
  }
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
    `).run(IMAGE_PROMOTION_SETTING_KEY, JSON.stringify(storedNext), adminUserId, updatedAt);
    db.prepare(`
      INSERT INTO app_setting_audit
        (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      IMAGE_PROMOTION_SETTING_KEY,
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
  return getImagePromotionConfig();
}

export function getRechargeConfig() {
  const row = getDb().prepare(`
    SELECT value_json, updated_at FROM app_settings WHERE setting_key = ?
  `).get(RECHARGE_CONFIG_SETTING_KEY);
  return normalizeRechargeConfig({
    ...parseJsonSetting(row?.value_json),
    updatedAt: row?.updated_at || null
  });
}

export function updateRechargeConfig(values, adminUserId = null) {
  const db = getDb();
  const previous = getRechargeConfig();
  const next = normalizeRechargeConfig(values);
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
    `).run(RECHARGE_CONFIG_SETTING_KEY, JSON.stringify(storedNext), adminUserId, updatedAt);
    db.prepare(`
      INSERT INTO app_setting_audit
        (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      RECHARGE_CONFIG_SETTING_KEY,
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
  return getRechargeConfig();
}

function normalizeAdminNotificationConfig(value = {}) {
  const audience = ['all', 'signed-in', 'members'].includes(value.audience) ? value.audience : 'all';
  return {
    siteNoticeEnabled: Boolean(value.siteNoticeEnabled),
    siteNoticeTitle: String(value.siteNoticeTitle || '').trim().slice(0, 120),
    siteNoticeBody: String(value.siteNoticeBody || '').trim().slice(0, 5000),
    siteNoticeFormat: ['markdown', 'html'].includes(value.siteNoticeFormat) ? value.siteNoticeFormat : 'markdown',
    siteNoticePlacement: ['banner', 'modal'].includes(value.siteNoticePlacement) ? value.siteNoticePlacement : 'banner',
    audience,
    notifyGenerationFailure: value.notifyGenerationFailure !== false,
    notifyLowCredits: value.notifyLowCredits !== false,
    lowCreditThreshold: Math.max(0, Math.min(100000, Math.round(Number(value.lowCreditThreshold) || 20))),
    notifyChannelFailure: value.notifyChannelFailure !== false,
    updatedAt: value.updatedAt || null
  };
}

export function getAdminNotificationConfig() {
  const row = getDb().prepare(`
    SELECT value_json, updated_at FROM app_settings WHERE setting_key = ?
  `).get(ADMIN_NOTIFICATION_SETTING_KEY);
  return normalizeAdminNotificationConfig({
    ...parseJsonSetting(row?.value_json),
    updatedAt: row?.updated_at || null
  });
}

export function updateAdminNotificationConfig(values, adminUserId = null) {
  const db = getDb();
  const previous = getAdminNotificationConfig();
  const next = normalizeAdminNotificationConfig(values);
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
    `).run(ADMIN_NOTIFICATION_SETTING_KEY, JSON.stringify(storedNext), adminUserId, updatedAt);
    db.prepare(`
      INSERT INTO app_setting_audit
        (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), ADMIN_NOTIFICATION_SETTING_KEY, JSON.stringify(previous), JSON.stringify({ ...next, updatedAt }), adminUserId, updatedAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getAdminNotificationConfig();
}

export function recordAdminAlert({ type, severity = 'warning', dedupeKey, message, metadata = {} }) {
  const key = String(dedupeKey || `${type}:${message}`).slice(0, 240);
  const timestamp = now();
  getDb().prepare(`
    INSERT INTO admin_alerts
      (id, alert_type, severity, dedupe_key, message, metadata_json, status, occurrences, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', 1, ?, ?)
    ON CONFLICT(dedupe_key) DO UPDATE SET
      severity = excluded.severity,
      message = excluded.message,
      metadata_json = excluded.metadata_json,
      status = 'open',
      occurrences = admin_alerts.occurrences + 1,
      last_seen_at = excluded.last_seen_at,
      acknowledged_at = NULL,
      acknowledged_by = NULL
  `).run(randomUUID(), String(type || 'system').slice(0, 60), severity === 'critical' ? 'critical' : severity === 'info' ? 'info' : 'warning', key, String(message || '').slice(0, 500), JSON.stringify(metadata || {}), timestamp, timestamp);
}

export function listAdminAlerts(limit = 50, status = 'open') {
  const rows = getDb().prepare(`
    SELECT * FROM admin_alerts
    WHERE (? = '' OR status = ?)
    ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_seen_at DESC
    LIMIT ?
  `).all(status, status, Math.max(1, Math.min(Number(limit) || 50, 200)));
  return rows.map((row) => ({
    id: row.id,
    type: row.alert_type,
    severity: row.severity,
    message: row.message,
    metadata: parseJsonObject(row.metadata_json),
    status: row.status,
    occurrences: Number(row.occurrences || 1),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    acknowledgedAt: row.acknowledged_at || ''
  }));
}

export function acknowledgeAdminAlert(alertId, adminUserId) {
  const timestamp = now();
  const result = getDb().prepare(`
    UPDATE admin_alerts SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ? WHERE id = ?
  `).run(timestamp, adminUserId, alertId);
  return Boolean(result.changes);
}

export function monitorLowCreditBalance(userId) {
  const config = getAdminNotificationConfig();
  if (!config.notifyLowCredits) return;
  const user = getUserById(userId);
  if (!user || user.isSuperAdmin || Number(user.creditBalance) > Number(config.lowCreditThreshold)) return;
  recordAdminAlert({
    type: 'low-credits',
    severity: 'info',
    dedupeKey: `low-credits:${userId}`,
    message: `User credit balance is ${Number(user.creditBalance || 0)}.`,
    metadata: { userId, email: user.email, creditBalance: Number(user.creditBalance || 0), threshold: config.lowCreditThreshold }
  });
}

export function recordGenerationFailureAlert({ userId, generationId = '', providerName = '', providerModel = '', errorCode = 'GENERATION_FAILED' }) {
  const config = getAdminNotificationConfig();
  if (config.notifyGenerationFailure) {
    recordAdminAlert({
      type: 'generation-failure',
      severity: 'warning',
      dedupeKey: `generation-failure:${providerName}:${providerModel}:${errorCode}`,
      message: `Image generation failed: ${errorCode}.`,
      metadata: { userId, generationId, providerName, providerModel, errorCode }
    });
  }
  if (config.notifyChannelFailure && ['IMAGE_PROVIDER_UNAVAILABLE', 'IMAGE_PROVIDER_AUTH_FAILED', 'IMAGE_PROVIDER_BALANCE_ERROR', 'IMAGE_PROVIDER_TIMEOUT', 'UPSTREAM_BUSY'].includes(errorCode)) {
    recordAdminAlert({
      type: 'channel-failure',
      severity: ['IMAGE_PROVIDER_AUTH_FAILED', 'IMAGE_PROVIDER_BALANCE_ERROR'].includes(errorCode) ? 'critical' : 'warning',
      dedupeKey: `channel-failure:${providerName}:${providerModel}:${errorCode}`,
      message: `${providerName || 'Image provider'} ${providerModel || ''} channel error: ${errorCode}.`.trim(),
      metadata: { providerName, providerModel, errorCode }
    });
  }
}

export function hashSessionToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `${PASSWORD_SCHEME}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyPassword(password, encoded) {
  const [scheme, saltText, hashText] = String(encoded || '').split('$');
  if (scheme !== PASSWORD_SCHEME || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, 'base64url');
    const actual = scryptSync(String(password), Buffer.from(saltText, 'base64url'), expected.length, {
      N: 16384,
      r: 8,
      p: 1
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function getConfiguredSuperAdminEmails() {
  return [...new Set(
    String(process.env.SUPER_ADMIN_EMAILS || '')
      .split(/[;,\n]/)
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  )];
}

function syncConfiguredSuperAdmins(db = getDb()) {
  const emails = getConfiguredSuperAdminEmails();
  if (!emails.length) return 0;
  const updatedAt = now();
  const promote = db.prepare(`
    UPDATE users
    SET role = 'super_admin', updated_at = ?
    WHERE lower(email) = ? AND role != 'super_admin'
  `);
  return emails.reduce((count, email) => count + Number(promote.run(updatedAt, email).changes || 0), 0);
}

export function promoteSuperAdminByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const error = new Error('INVALID_EMAIL');
    error.code = 'INVALID_EMAIL';
    throw error;
  }
  const result = getDb().prepare(`
    UPDATE users
    SET role = 'super_admin', updated_at = ?
    WHERE lower(email) = ?
  `).run(now(), normalizedEmail);
  if (!result.changes) {
    const error = new Error('USER_NOT_FOUND');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  return getUserById(getUserByEmail(normalizedEmail).id);
}

export function normalizeUser(row) {
  if (!row) return null;
  const role = normalizeUserRole(row.role);
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name || '',
    avatarUrl: row.avatar_url || '',
    role,
    isSuperAdmin: role === USER_ROLES.SUPER_ADMIN,
    canAccessAdmin: isAdministrativeRole(role),
    adminPermissions: permissionsForRole(role),
    status: row.status || 'active',
    creditBalance: Number(row.credit_balance || 0),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    lastLoginAt: row.last_login_at || ''
  };
}

export function getUserById(userId) {
  return normalizeUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId));
}

export function getUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email));
}

export function getUserBySessionToken(token) {
  if (!token) return null;
  const row = getDb().prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
  `).get(hashSessionToken(token), now());
  return normalizeUser(row);
}

export function createUser({
  email,
  password,
  fullName = '',
  initialCredits = 0,
  initialCreditSource = 'signup_bonus'
}) {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);
  const createdAt = now();
  const userId = randomUUID();
  const role = getConfiguredSuperAdminEmails().includes(normalizedEmail) ? 'super_admin' : 'user';
  const grantedCredits = Math.max(0, Math.min(1_000_000, Math.round(Number(initialCredits) || 0)));
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, credit_balance, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      normalizedEmail,
      hashPassword(password),
      String(fullName || '').trim().slice(0, 80),
      role,
      grantedCredits,
      createdAt,
      createdAt
    );
    if (grantedCredits > 0) {
      db.prepare(`
        INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
        VALUES (?, ?, ?, 'signup_bonus', ?, ?, ?, ?)
      `).run(
        randomUUID(),
        userId,
        grantedCredits,
        String(initialCreditSource || 'signup_bonus').trim().slice(0, 80),
        userId,
        JSON.stringify({ grantedCredits }),
        createdAt
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getUserById(userId);
}

export function createSession(userId, days = 30) {
  const token = createSessionToken();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  getDb().prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(hashSessionToken(token), userId, expiresAt, createdAt);
  return { token, expiresAt };
}

export function deleteSession(token) {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token));
}

export function getUserUsage(userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total_generations,
      COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) AS succeeded_generations,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_generations
    FROM generations
    WHERE user_id = ?
  `).get(userId);
  const ledger = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN l.type = 'generation' THEN -l.amount ELSE 0 END), 0) AS total_generation_credits,
      COALESCE(SUM(CASE WHEN l.type = 'purchase' AND l.amount > 0 THEN l.amount ELSE 0 END), 0) AS purchased_credits
    FROM credit_ledger l
    WHERE l.user_id = ?
      AND (
        l.type = 'purchase'
        OR (
          l.type = 'generation'
          AND l.amount < 0
          AND NOT EXISTS (
            SELECT 1 FROM credit_ledger refund
            WHERE refund.user_id = l.user_id
              AND refund.type = 'refund'
              AND refund.reference_id = l.reference_id
          )
        )
      )
  `).get(userId);
  return {
    totalGenerations: Number(row?.total_generations || 0),
    totalGenerationCredits: Number(ledger?.total_generation_credits || 0),
    purchasedCredits: Number(ledger?.purchased_credits || 0),
    succeededGenerations: Number(row?.succeeded_generations || 0),
    failedGenerations: Number(row?.failed_generations || 0)
  };
}

export function getUserProfile(userId) {
  const user = getUserById(userId);
  if (!user) return null;
  const recentTransactions = listCreditLedger(userId, 30).map((row) => {
    const metadata = parseJsonObject(row.metadata);
    return {
      id: row.id,
      amount: Number(row.amount || 0),
      type: row.type || '',
      source: row.source || '',
      referenceId: row.reference_id || '',
      caseId: Number(row.case_id || metadata.caseId || 0) || null,
      metadata,
      createdAt: row.created_at || ''
    };
  });
  return {
    ...user,
    usage: getUserUsage(userId),
    recentTransactions,
    freeUsed: false,
    freeGenerationsUsed: 0
  };
}

export function reserveCredit(userId, { caseId = null, prompt = '', generationId = null, amount = 1, metadata = {} } = {}) {
  const db = getDb();
  const reservationId = randomUUID();
  const createdAt = now();
  const creditAmount = Math.max(1, Math.min(100000, Math.round(Number(amount) || 1)));
  const ledgerMetadata = JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {});
  db.exec('BEGIN IMMEDIATE');
  try {
    const user = db.prepare('SELECT id, role, credit_balance FROM users WHERE id = ? AND status = ?').get(userId, 'active');
    if (!user || (user.role !== 'super_admin' && Number(user.credit_balance) < creditAmount)) {
      const error = new Error('CREDITS_REQUIRED');
      error.code = 'CREDITS_REQUIRED';
      throw error;
    }
    if (user.role !== 'super_admin') {
      db.prepare('UPDATE users SET credit_balance = credit_balance - ?, updated_at = ? WHERE id = ? AND credit_balance >= ?')
        .run(creditAmount, createdAt, userId, creditAmount);
    }
    db.prepare(`
      INSERT INTO credit_reservations (id, user_id, generation_id, amount, status, case_id, prompt, created_at)
      VALUES (?, ?, ?, ?, 'reserved', ?, ?, ?)
    `).run(reservationId, userId, generationId, creditAmount, caseId, prompt, createdAt);
    if (user.role !== 'super_admin') {
      db.prepare(`
        INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
        VALUES (?, ?, ?, 'generation', 'generation_reservation', ?, ?, ?)
      `).run(randomUUID(), userId, -creditAmount, reservationId, ledgerMetadata, createdAt);
    }
    db.exec('COMMIT');
    if (user.role !== 'super_admin') monitorLowCreditBalance(userId);
    return {
      reservationId,
      creditAmount: user.role === 'super_admin' ? 0 : creditAmount,
      creditBalance: Number(getUserById(userId)?.creditBalance || 0)
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function completeCreditReservation(reservationId) {
  getDb().prepare(`
    UPDATE credit_reservations
    SET status = 'succeeded', completed_at = ?
    WHERE id = ? AND status = 'reserved'
  `).run(now(), reservationId);
}

export function releaseCreditReservation(reservationId, errorCode = 'GENERATION_FAILED') {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const reservation = db.prepare(`
      SELECT r.*, u.role
      FROM credit_reservations r
      JOIN users u ON u.id = r.user_id
      WHERE r.id = ? AND r.status = 'reserved'
    `).get(reservationId);
    if (!reservation) {
      db.exec('COMMIT');
      return;
    }
    if (reservation.role !== 'super_admin' && Number(reservation.amount) > 0) {
      db.prepare('UPDATE users SET credit_balance = credit_balance + ?, updated_at = ? WHERE id = ?').run(reservation.amount, now(), reservation.user_id);
      db.prepare(`
        INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
        VALUES (?, ?, ?, 'refund', 'generation_release', ?, ?, ?)
      `).run(randomUUID(), reservation.user_id, reservation.amount, reservation.id, JSON.stringify({ errorCode }), now());
    }
    db.prepare(`
      UPDATE credit_reservations SET status = 'released', error_code = ?, completed_at = ? WHERE id = ?
    `).run(errorCode, now(), reservation.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function createGeneration({ userId, reservationId, caseId, projectId = null, slotId = null, prompt, model, size, quality, provider }) {
  const id = randomUUID();
  const createdAt = now();
  const db = getDb();
  const versionNumber = projectId && slotId
    ? Number(db.prepare(`
      SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
      FROM generations WHERE user_id = ? AND project_id = ? AND slot_id = ?
    `).get(userId, projectId, slotId)?.next_version || 1)
    : 1;
  db.prepare(`
    INSERT INTO generations
      (id, user_id, reservation_id, case_id, project_id, slot_id, version_number, prompt, model, size, quality, provider, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?)
  `).run(id, userId, reservationId, caseId, projectId, slotId, versionNumber, prompt, model, size, quality, provider, createdAt);
  db.prepare('UPDATE credit_reservations SET generation_id = ? WHERE id = ?').run(id, reservationId);
  return id;
}

export function updateGeneration(id, updates) {
  const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const columns = entries.map(([key]) => `${key} = ?`).join(', ');
  const db = getDb();
  db.prepare(`UPDATE generations SET ${columns} WHERE id = ?`).run(...entries.map(([, value]) => value), id);
  const generation = db.prepare('SELECT * FROM generations WHERE id = ?').get(id);
  ensureGenerationMediaAsset(db, generation);
}

export function listGenerations(userId, limit = 30, offset = 0) {
  return getDb().prepare(`
    SELECT id, project_id, slot_id, version_number, prompt, model, size, quality, status, storage_path, output_url, file_size, mime_type, error_code, archived_at, history_hidden_at, created_at, completed_at
    FROM generations
    WHERE user_id = ? AND archived_at IS NULL AND history_hidden_at IS NULL AND status = 'succeeded' AND storage_path IS NOT NULL
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

export function hideGenerationFromHistory(userId, generationId) {
  const result = getDb().prepare(`
    UPDATE generations
    SET history_hidden_at = ?
    WHERE id = ? AND user_id = ? AND history_hidden_at IS NULL
      AND status = 'succeeded' AND storage_path IS NOT NULL
  `).run(now(), generationId, userId);
  return Number(result.changes || 0);
}

export function clearGenerationHistory(userId) {
  const result = getDb().prepare(`
    UPDATE generations
    SET history_hidden_at = ?
    WHERE user_id = ? AND history_hidden_at IS NULL
      AND status = 'succeeded' AND storage_path IS NOT NULL
  `).run(now(), userId);
  return Number(result.changes || 0);
}

export function getGeneration(userId, generationId) {
  return getDb().prepare(`
    SELECT id, project_id, slot_id, version_number, prompt, model, size, quality, status,
      storage_path, output_url, file_size, mime_type, error_code, archived_at, created_at, completed_at
    FROM generations WHERE id = ? AND user_id = ?
  `).get(generationId, userId);
}

export function listEcommerceProjectGenerations(userId, projectId, limit = 200) {
  return getDb().prepare(`
    SELECT id, project_id, slot_id, version_number, prompt, model, size, quality, status,
      storage_path, output_url, file_size, mime_type, error_code, archived_at, created_at, completed_at
    FROM generations
    WHERE user_id = ? AND project_id = ? AND archived_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, projectId, Math.max(1, Math.min(Number(limit) || 200, 500)));
}

export function listCreditProducts() {
  return getDb().prepare(`
    SELECT * FROM credit_products WHERE active = 1 ORDER BY sort_order ASC
  `).all();
}

export function getCreditProduct(productId) {
  return getDb().prepare('SELECT * FROM credit_products WHERE id = ? AND active = 1').get(productId);
}

export function createLocalPaymentOrder(userId, product, provider = 'stripe') {
  const db = getDb();
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`
    INSERT INTO payment_orders
      (id, user_id, product_id, status, amount_cents, currency, credits, provider, metadata, created_at)
    VALUES (?, ?, ?, 'created', ?, ?, ?, ?, '{}', ?)
  `).run(id, userId, product.id, Number(product.amount_cents || 0), product.currency || 'cny', Number(product.credits || 0), provider, createdAt);
  return db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(id);
}

export function markLocalPaymentCheckoutCreated(orderId, { providerOrderId, metadata = {} } = {}) {
  const db = getDb();
  db.prepare(`
    UPDATE payment_orders SET status = 'checkout_created', provider_order_id = ?, metadata = ? WHERE id = ?
  `).run(String(providerOrderId || ''), JSON.stringify(metadata || {}), orderId);
  return db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId);
}

export function markLocalPaymentOrderFailed(orderId, errorCode = 'CHECKOUT_FAILED') {
  const db = getDb();
  const order = db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId);
  if (!order || order.status === 'completed') return order || null;
  db.prepare(`
    UPDATE payment_orders SET status = 'failed', metadata = ? WHERE id = ?
  `).run(JSON.stringify({ ...parseJsonObject(order.metadata), errorCode: String(errorCode || 'CHECKOUT_FAILED').slice(0, 120) }), orderId);
  return db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId);
}

export function completeLocalPaymentOrder({
  provider = 'stripe',
  providerOrderId,
  eventId,
  payloadHash = '',
  amountCents = null,
  currency = '',
  metadata = {}
}) {
  const db = getDb();
  const processedAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    const eventResult = db.prepare(`
      INSERT INTO payment_events (provider, event_id, payload_hash, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provider, event_id) DO NOTHING
    `).run(provider, eventId, payloadHash, processedAt);
    if (!eventResult.changes) {
      const duplicate = db.prepare('SELECT * FROM payment_orders WHERE provider = ? AND provider_order_id = ?').get(provider, providerOrderId);
      db.exec('COMMIT');
      return { order: duplicate || null, duplicate: true };
    }
    const order = db.prepare('SELECT * FROM payment_orders WHERE provider = ? AND provider_order_id = ?').get(provider, providerOrderId);
    if (!order) throw Object.assign(new Error('PAYMENT_ORDER_NOT_FOUND'), { code: 'PAYMENT_ORDER_NOT_FOUND' });
    if (amountCents !== null && Number.isFinite(Number(amountCents)) && Number(amountCents) !== Number(order.amount_cents)) {
      throw Object.assign(new Error('PAYMENT_AMOUNT_MISMATCH'), { code: 'PAYMENT_AMOUNT_MISMATCH' });
    }
    if (currency && String(currency).toLowerCase() !== String(order.currency).toLowerCase()) {
      throw Object.assign(new Error('PAYMENT_CURRENCY_MISMATCH'), { code: 'PAYMENT_CURRENCY_MISMATCH' });
    }
    if (order.status !== 'completed') {
      db.prepare('UPDATE users SET credit_balance = credit_balance + ?, updated_at = ? WHERE id = ?')
        .run(Number(order.credits || 0), processedAt, order.user_id);
      db.prepare(`
        INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
        VALUES (?, ?, ?, 'purchase', ?, ?, ?, ?)
      `).run(randomUUID(), order.user_id, Number(order.credits || 0), `${provider}_checkout`, order.id, JSON.stringify({ productId: order.product_id, providerOrderId, ...metadata }), processedAt);
      db.prepare(`UPDATE payment_orders SET status = 'completed', completed_at = ?, metadata = ? WHERE id = ?`)
        .run(processedAt, JSON.stringify({ ...parseJsonObject(order.metadata), ...metadata }), order.id);
    }
    db.prepare('UPDATE payment_events SET processed_at = ? WHERE provider = ? AND event_id = ?').run(processedAt, provider, eventId);
    const completed = db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(order.id);
    db.exec('COMMIT');
    return { order: completed, duplicate: order.status === 'completed' };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function listPaymentOrders(userId, limit = 30) {
  return getDb().prepare(`
    SELECT * FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, Math.max(1, Math.min(Number(limit) || 30, 100)));
}

export function getOrCreateWatchaUser(watchaUser, token = {}) {
  const db = getDb();
  const watchaUserId = String(watchaUser?.userId || '').trim();
  if (!watchaUserId) throw Object.assign(new Error('WATCHA_USER_REQUIRED'), { code: 'WATCHA_USER_REQUIRED' });
  const linked = db.prepare(`
    SELECT user.* FROM watcha_accounts account JOIN users user ON user.id = account.user_id
    WHERE account.watcha_user_id = ?
  `).get(watchaUserId);
  let user = linked ? normalizeUser(linked) : null;
  const email = normalizeEmail(watchaUser?.email || `watcha-${watchaUserId.replace(/[^a-zA-Z0-9_-]/g, '')}@accounts.pic365.org`);
  if (!user) {
    user = getUserByEmail(email) || createUser({
      email,
      password: `${randomUUID()}-${randomUUID()}`,
      fullName: watchaUser?.nickname || `Watcha ${watchaUserId}`,
      initialCredits: getRechargeConfig().signupBonusCredits,
      initialCreditSource: 'watcha_signup_bonus'
    });
  }
  const updatedAt = now();
  db.prepare(`
    UPDATE users SET full_name = CASE WHEN ? != '' THEN ? ELSE full_name END,
      avatar_url = CASE WHEN ? != '' THEN ? ELSE avatar_url END, updated_at = ? WHERE id = ?
  `).run(watchaUser?.nickname || '', watchaUser?.nickname || '', watchaUser?.avatarUrl || '', watchaUser?.avatarUrl || '', updatedAt, user.id);
  const expiresIn = Number(token?.expires_in || 0);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  db.prepare(`
    INSERT INTO watcha_accounts
      (watcha_user_id, user_id, email, nickname, avatar_url, access_token_expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(watcha_user_id) DO UPDATE SET user_id = excluded.user_id, email = excluded.email,
      nickname = excluded.nickname, avatar_url = excluded.avatar_url,
      access_token_expires_at = excluded.access_token_expires_at, updated_at = excluded.updated_at
  `).run(watchaUserId, user.id, watchaUser?.email || null, watchaUser?.nickname || null, watchaUser?.avatarUrl || null, expiresAt, updatedAt, updatedAt);
  return getUserById(user.id);
}

export function hasGuestGenerationUsage(fingerprint) {
  return getGuestGenerationUsageCount(fingerprint) > 0;
}

export function getGuestGenerationUsageCount(fingerprint) {
  if (!fingerprint) return 0;
  const row = getDb().prepare('SELECT usage_count FROM guest_generation_usage WHERE fingerprint = ?').get(fingerprint);
  return Math.max(0, Number(row?.usage_count || 0));
}

export function recordGuestGenerationUsage(fingerprint) {
  if (!fingerprint) return false;
  return Boolean(getDb().prepare(`
    INSERT INTO guest_generation_usage (fingerprint, used_at, usage_count) VALUES (?, ?, 1)
    ON CONFLICT(fingerprint) DO NOTHING
  `).run(fingerprint, now()).changes);
}

export function claimGuestGenerationUsage(fingerprint, { limit = 1, minimumUsed = 0 } = {}) {
  if (!fingerprint) return { claimed: false, count: 0 };
  const normalizedLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 1)));
  const normalizedMinimum = Math.max(0, Math.min(normalizedLimit, Math.floor(Number(minimumUsed) || 0)));
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT usage_count FROM guest_generation_usage WHERE fingerprint = ?').get(fingerprint);
    if (!existing) {
      db.prepare('INSERT INTO guest_generation_usage (fingerprint, used_at, usage_count) VALUES (?, ?, ?)')
        .run(fingerprint, now(), normalizedMinimum);
    } else if (Number(existing.usage_count || 0) < normalizedMinimum) {
      db.prepare('UPDATE guest_generation_usage SET usage_count = ?, used_at = ? WHERE fingerprint = ?')
        .run(normalizedMinimum, now(), fingerprint);
    }
    const result = db.prepare(`
      UPDATE guest_generation_usage
      SET usage_count = usage_count + 1, used_at = ?
      WHERE fingerprint = ? AND usage_count < ?
    `).run(now(), fingerprint, normalizedLimit);
    const count = getGuestGenerationUsageCount(fingerprint);
    db.exec('COMMIT');
    return { claimed: Boolean(result.changes), count };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function releaseGuestGenerationUsage(fingerprint) {
  if (!fingerprint) return 0;
  const db = getDb();
  db.prepare(`
    UPDATE guest_generation_usage
    SET usage_count = MAX(0, usage_count - 1), used_at = ?
    WHERE fingerprint = ? AND usage_count > 0
  `).run(now(), fingerprint);
  return getGuestGenerationUsageCount(fingerprint);
}

export function listCreditLedger(userId, limit = 30) {
  return getDb().prepare(`
    SELECT l.id, l.amount, l.type, l.source, l.reference_id, l.metadata, l.created_at,
      reservation.case_id
    FROM credit_ledger l
    LEFT JOIN credit_reservations reservation ON reservation.id = l.reference_id
    WHERE l.user_id = ?
    ORDER BY l.created_at DESC
    LIMIT ?
  `).all(userId, Math.max(1, Math.min(Number(limit) || 30, 500)));
}

export function chargeAiToolCredit(userId, { source = 'ai_magic', amount = 1, metadata = {}, referenceId = null } = {}) {
  const creditAmount = Math.round(Number(amount));
  if (!userId || !Number.isFinite(creditAmount) || creditAmount <= 0 || creditAmount > 100) {
    const error = new Error('INVALID_AI_TOOL_CHARGE');
    error.code = 'INVALID_AI_TOOL_CHARGE';
    throw error;
  }
  const db = getDb();
  const createdAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    const user = db.prepare('SELECT id, credit_balance FROM users WHERE id = ? AND status = ?').get(userId, 'active');
    if (!user || Number(user.credit_balance) + 1e-9 < creditAmount) {
      const error = new Error('CREDITS_REQUIRED');
      error.code = 'CREDITS_REQUIRED';
      throw error;
    }
    const result = db.prepare(`
      UPDATE users SET credit_balance = ROUND(credit_balance - ?, 1), updated_at = ?
      WHERE id = ? AND credit_balance + 0.0000001 >= ?
    `).run(creditAmount, createdAt, userId, creditAmount);
    if (!result.changes) {
      const error = new Error('CREDITS_REQUIRED');
      error.code = 'CREDITS_REQUIRED';
      throw error;
    }
    db.prepare(`
      INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
      VALUES (?, ?, ?, 'ai_tool', ?, ?, ?, ?)
    `).run(
      randomUUID(),
      userId,
      -creditAmount,
      String(source || 'ai_magic').slice(0, 80),
      referenceId ? String(referenceId).slice(0, 160) : null,
      JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {}),
      createdAt
    );
    db.exec('COMMIT');
    monitorLowCreditBalance(userId);
    return getUserProfile(userId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function refundAiToolCredit(userId, { referenceId, errorCode = 'AI_TOOL_FAILED', metadata = {} } = {}) {
  const normalizedReferenceId = String(referenceId || '').trim().slice(0, 160);
  if (!userId || !normalizedReferenceId) {
    const error = new Error('INVALID_AI_TOOL_REFUND');
    error.code = 'INVALID_AI_TOOL_REFUND';
    throw error;
  }
  const db = getDb();
  const createdAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    const charge = db.prepare(`
      SELECT amount, source FROM credit_ledger
      WHERE user_id = ? AND reference_id = ? AND type = 'ai_tool'
      ORDER BY created_at DESC LIMIT 1
    `).get(userId, normalizedReferenceId);
    const existingRefund = db.prepare(`
      SELECT id FROM credit_ledger
      WHERE user_id = ? AND reference_id = ? AND type = 'refund' AND source = 'ai_tool_refund'
      LIMIT 1
    `).get(userId, normalizedReferenceId);
    if (!charge || existingRefund) {
      db.exec('COMMIT');
      return getUserProfile(userId);
    }
    const creditAmount = Math.abs(Number(charge.amount) || 0);
    if (creditAmount > 0) {
      db.prepare('UPDATE users SET credit_balance = ROUND(credit_balance + ?, 1), updated_at = ? WHERE id = ?')
        .run(creditAmount, createdAt, userId);
      db.prepare(`
        INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
        VALUES (?, ?, ?, 'refund', 'ai_tool_refund', ?, ?, ?)
      `).run(
        randomUUID(),
        userId,
        creditAmount,
        normalizedReferenceId,
        JSON.stringify({
          originalSource: charge.source,
          errorCode: String(errorCode || 'AI_TOOL_FAILED').slice(0, 120),
          ...(metadata && typeof metadata === 'object' ? metadata : {})
        }),
        createdAt
      );
    }
    db.exec('COMMIT');
    return getUserProfile(userId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function addFavorite(userId, caseId) {
  getDb().prepare(`
    INSERT OR IGNORE INTO favorites (user_id, case_id, created_at) VALUES (?, ?, ?)
  `).run(userId, caseId, now());
  return getDb().prepare('SELECT user_id, case_id, created_at FROM favorites WHERE user_id = ? AND case_id = ?').get(userId, caseId);
}

export function removeFavorite(userId, caseId) {
  getDb().prepare('DELETE FROM favorites WHERE user_id = ? AND case_id = ?').run(userId, caseId);
}

export function listFavorites(userId) {
  return getDb().prepare('SELECT user_id, case_id, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

export function isAdminUser(userId) {
  return getUserById(userId)?.canAccessAdmin === true;
}

export function listAdminUsers(limit = 100) {
  const rows = getDb().prepare(`
    SELECT
      u.*,
      (SELECT COUNT(*) FROM generations g WHERE g.user_id = u.id) AS total_generations,
      (SELECT COUNT(*) FROM generations g WHERE g.user_id = u.id AND g.status = 'succeeded') AS succeeded_generations,
      (SELECT COUNT(*) FROM generations g WHERE g.user_id = u.id AND g.status = 'failed') AS failed_generations,
      (
        SELECT COALESCE(SUM(-l.amount), 0)
        FROM credit_ledger l
        WHERE l.user_id = u.id
          AND l.type = 'generation'
          AND l.amount < 0
          AND NOT EXISTS (
            SELECT 1 FROM credit_ledger refund
            WHERE refund.user_id = l.user_id
              AND refund.type = 'refund'
              AND refund.reference_id = l.reference_id
          )
      ) AS total_generation_credits,
      (
        SELECT COALESCE(SUM(l.amount), 0)
        FROM credit_ledger l
        WHERE l.user_id = u.id AND l.type = 'purchase' AND l.amount > 0
      ) AS purchased_credits,
      (SELECT g.created_at FROM generations g WHERE g.user_id = u.id ORDER BY g.created_at DESC LIMIT 1) AS last_generation_at,
      (SELECT g.case_id FROM generations g WHERE g.user_id = u.id ORDER BY g.created_at DESC LIMIT 1) AS last_generation_case_id
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(Number(limit) || 100, 500)));

  return rows.map((row) => ({
    ...normalizeUser(row),
    adminNote: row.admin_note || '',
    freeGenerationsUsed: null,
    freeUsed: null,
    usage: {
      totalGenerations: Number(row.total_generations || 0),
      succeededGenerations: Number(row.succeeded_generations || 0),
      failedGenerations: Number(row.failed_generations || 0),
      totalGenerationCredits: Number(row.total_generation_credits || 0),
      purchasedCredits: Number(row.purchased_credits || 0),
      lastGenerationAt: row.last_generation_at || '',
      lastGenerationCaseId: Number(row.last_generation_case_id || 0) || null
    }
  }));
}

export function adjustUserCredits({ adminUserId, userId, amount, reason = '', password = '' }) {
  const normalizedAmount = Number(amount);
  const nextPassword = String(password || '');
  const passwordChanged = Boolean(nextPassword);
  if (
    !adminUserId ||
    !userId ||
    !Number.isInteger(normalizedAmount) ||
    Math.abs(normalizedAmount) > 1000000 ||
    (!normalizedAmount && !passwordChanged)
  ) {
    const error = new Error('INVALID_CREDIT_ADJUSTMENT');
    error.code = 'INVALID_CREDIT_ADJUSTMENT';
    throw error;
  }
  if (passwordChanged && (nextPassword.length < 8 || nextPassword.length > 128)) {
    const error = new Error('INVALID_PASSWORD');
    error.code = 'INVALID_PASSWORD';
    throw error;
  }

  const db = getDb();
  const createdAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    const admin = db.prepare(`
      SELECT id FROM users WHERE id = ? AND role = 'super_admin' AND status = 'active'
    `).get(adminUserId);
    if (!admin) {
      const error = new Error('FORBIDDEN');
      error.code = 'FORBIDDEN';
      throw error;
    }

    const target = db.prepare('SELECT id, credit_balance FROM users WHERE id = ?').get(userId);
    if (!target) {
      const error = new Error('USER_NOT_FOUND');
      error.code = 'USER_NOT_FOUND';
      throw error;
    }
    const previousBalance = Number(target.credit_balance || 0);
    const nextBalance = previousBalance + normalizedAmount;
    if (nextBalance < 0) {
      const error = new Error('CREDITS_INSUFFICIENT');
      error.code = 'CREDITS_INSUFFICIENT';
      throw error;
    }

    if (normalizedAmount) {
      db.prepare('UPDATE users SET credit_balance = ?, updated_at = ? WHERE id = ?')
        .run(nextBalance, createdAt, userId);
      db.prepare(`
        INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
        VALUES (?, ?, ?, 'adjustment', 'admin_adjustment', NULL, ?, ?)
      `).run(
        randomUUID(),
        userId,
        normalizedAmount,
        JSON.stringify({
          reason: String(reason || '').trim().slice(0, 240),
          adminUserId,
          previousBalance,
          nextBalance
        }),
        createdAt
      );
    }
    if (passwordChanged) {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(hashPassword(nextPassword), createdAt, userId);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    }
    db.exec('COMMIT');
    return getUserProfile(userId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getAdminBusinessMetrics({ startAt, endAt }) {
  return getDb().prepare(`
    WITH params AS (SELECT ? AS start_at, ? AS end_at)
    SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM users WHERE created_at >= params.start_at AND created_at < params.end_at) AS range_users,
      (SELECT COUNT(*) FROM users WHERE role = 'super_admin') AS super_admins,
      (SELECT COALESCE(SUM(credit_balance), 0) FROM users) AS total_credit_balance,
      (SELECT COUNT(*) FROM generations) AS total_generations,
      (SELECT COUNT(*) FROM generations WHERE created_at >= params.start_at AND created_at < params.end_at) AS range_generations,
      (SELECT COUNT(*) FROM generations WHERE status = 'succeeded') AS succeeded_generations,
      (SELECT COUNT(*) FROM generations WHERE status = 'failed') AS failed_generations,
      (SELECT COUNT(*) FROM generations WHERE status NOT IN ('succeeded', 'failed', 'cancelled')) AS pending_generations,
      (SELECT COUNT(*) FROM generations WHERE status = 'succeeded' AND created_at >= params.start_at AND created_at < params.end_at) AS range_succeeded_generations,
      (SELECT COUNT(*) FROM generations WHERE status = 'failed' AND created_at >= params.start_at AND created_at < params.end_at) AS range_failed_generations,
      (
        SELECT COALESCE(SUM(-l.amount), 0) FROM credit_ledger l
        WHERE l.type = 'generation' AND l.amount < 0
          AND NOT EXISTS (
            SELECT 1 FROM credit_ledger refund
            WHERE refund.user_id = l.user_id
              AND refund.type = 'refund'
              AND refund.reference_id = l.reference_id
          )
      ) AS total_generation_credits,
      (
        SELECT COALESCE(SUM(-l.amount), 0) FROM credit_ledger l
        WHERE l.type = 'generation' AND l.amount < 0
          AND l.created_at >= params.start_at AND l.created_at < params.end_at
          AND NOT EXISTS (
            SELECT 1 FROM credit_ledger refund
            WHERE refund.user_id = l.user_id
              AND refund.type = 'refund'
              AND refund.reference_id = l.reference_id
          )
      ) AS range_generation_credits,
      (
        SELECT COALESCE(SUM(l.amount), 0) FROM credit_ledger l
        WHERE l.type = 'purchase' AND l.amount > 0
      ) AS purchased_credits
    FROM params
  `).get(startAt, endAt);
}

export function listAdminBusinessDailyMetrics({ startAt, endAt }) {
  return getDb().prepare(`
    WITH RECURSIVE dates(metric_date) AS (
      SELECT date(?)
      UNION ALL
      SELECT date(metric_date, '+1 day')
      FROM dates
      WHERE metric_date < date(?, '-1 day')
    )
    SELECT
      metric_date AS date,
      (SELECT COUNT(*) FROM users u WHERE date(u.created_at) = metric_date) AS registrations,
      (SELECT COUNT(*) FROM generations g WHERE date(g.created_at) = metric_date) AS generations,
      (SELECT COUNT(*) FROM generations g WHERE date(g.created_at) = metric_date AND g.status = 'succeeded') AS succeeded_generations,
      (SELECT COUNT(*) FROM generations g WHERE date(g.created_at) = metric_date AND g.status = 'failed') AS failed_generations,
      (
        SELECT COALESCE(SUM(-l.amount), 0) FROM credit_ledger l
        WHERE date(l.created_at) = metric_date
          AND l.type = 'generation'
          AND l.amount < 0
          AND NOT EXISTS (
            SELECT 1 FROM credit_ledger refund
            WHERE refund.user_id = l.user_id
              AND refund.type = 'refund'
              AND refund.reference_id = l.reference_id
          )
      ) AS credits_consumed
    FROM dates
    ORDER BY metric_date ASC
  `).all(startAt, endAt);
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeEcommerceProject(row) {
  if (!row) return null;
  const coreUser = row.core_user || '';
  const coreScenario = row.core_scenario || '';
  return {
    id: row.id,
    userId: row.user_id,
    projectName: row.project_name || '',
    platformId: row.platform_id || '',
    industryId: row.industry_id || '',
    subcategoryId: row.subcategory_id || '',
    productName: row.product_name || '',
    brandName: row.brand_name || '',
    coreUser,
    coreScenario,
    targetAudience: row.target_audience || [coreUser, coreScenario].filter(Boolean).join('\n'),
    sellingPoints: parseJsonArray(row.selling_points),
    specifications: row.specifications || '',
    prohibitedContent: row.prohibited_content || '',
    aiBriefOriginals: parseJsonObject(row.ai_brief_originals),
    identitySpec: parseJsonObject(row.identity_spec),
    autoAnalysisFingerprint: row.auto_analysis_fingerprint || '',
    autoAnalysisStatus: row.auto_analysis_status || '',
    autoAnalysisUpdatedAt: row.auto_analysis_updated_at || '',
    templateId: row.template_id || '',
    visualStyleId: row.visual_style_id || 'clean-commercial',
    imageProviderId: row.image_provider_id || '',
    imageQuality: ['low', 'medium', 'high'].includes(row.image_quality) ? row.image_quality : 'low',
    selectedSlots: parseJsonArray(row.selected_slots),
    masterAssetId: row.master_asset_id || '',
    status: row.status || 'draft',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function resolveProjectAudience(values) {
  const hasCoreUser = Object.prototype.hasOwnProperty.call(values, 'coreUser');
  const hasCoreScenario = Object.prototype.hasOwnProperty.call(values, 'coreScenario');
  const coreUser = hasCoreUser ? String(values.coreUser || '') : String(values.targetAudience || '');
  const coreScenario = hasCoreScenario ? String(values.coreScenario || '') : '';
  return {
    coreUser,
    coreScenario,
    targetAudience: hasCoreUser || hasCoreScenario
      ? [coreUser, coreScenario].filter(Boolean).join('\n')
      : String(values.targetAudience || '')
  };
}

export function listEcommerceProjects(userId, limit = 50) {
  return getDb().prepare(`
    SELECT * FROM ecommerce_projects
    WHERE user_id = ? AND status != 'deleted'
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(userId, Math.max(1, Math.min(Number(limit) || 50, 100))).map(normalizeEcommerceProject);
}

export function getEcommerceProject(userId, projectId) {
  return normalizeEcommerceProject(getDb().prepare(`
    SELECT * FROM ecommerce_projects WHERE id = ? AND user_id = ? AND status != 'deleted'
  `).get(projectId, userId));
}

export function createEcommerceProject(userId, values) {
  const id = randomUUID();
  const createdAt = now();
  const audience = resolveProjectAudience(values);
  getDb().prepare(`
    INSERT INTO ecommerce_projects (
      id, user_id, project_name, platform_id, industry_id, subcategory_id, product_name, brand_name,
      target_audience, core_user, core_scenario, selling_points, specifications, prohibited_content, ai_brief_originals, identity_spec, template_id,
      visual_style_id, image_provider_id, image_quality, selected_slots, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
  `).run(
    id,
    userId,
    values.projectName,
    values.platformId,
    values.industryId,
    values.subcategoryId || '',
    values.productName,
    values.brandName,
    audience.targetAudience,
    audience.coreUser,
    audience.coreScenario,
    JSON.stringify(values.sellingPoints || []),
    values.specifications,
    values.prohibitedContent,
    JSON.stringify(values.aiBriefOriginals || {}),
    JSON.stringify(values.identitySpec || {}),
    values.templateId || '',
    values.visualStyleId,
    values.imageProviderId || '',
    ['low', 'medium', 'high'].includes(values.imageQuality) ? values.imageQuality : 'low',
    JSON.stringify(values.selectedSlots || []),
    createdAt,
    createdAt
  );
  return getEcommerceProject(userId, id);
}

export function updateEcommerceProject(userId, projectId, values) {
  if (!getEcommerceProject(userId, projectId)) return null;
  const audience = resolveProjectAudience(values);
  getDb().prepare(`
    UPDATE ecommerce_projects SET
      project_name = ?, platform_id = ?, industry_id = ?, subcategory_id = ?, product_name = ?, brand_name = ?,
      target_audience = ?, core_user = ?, core_scenario = ?, selling_points = ?, specifications = ?, prohibited_content = ?,
      ai_brief_originals = ?, identity_spec = ?, template_id = ?, visual_style_id = ?, image_provider_id = ?, image_quality = ?, selected_slots = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    values.projectName,
    values.platformId,
    values.industryId,
    values.subcategoryId || '',
    values.productName,
    values.brandName,
    audience.targetAudience,
    audience.coreUser,
    audience.coreScenario,
    JSON.stringify(values.sellingPoints || []),
    values.specifications,
    values.prohibitedContent,
    JSON.stringify(values.aiBriefOriginals || {}),
    JSON.stringify(values.identitySpec || {}),
    values.templateId || '',
    values.visualStyleId,
    values.imageProviderId || '',
    ['low', 'medium', 'high'].includes(values.imageQuality) ? values.imageQuality : 'low',
    JSON.stringify(values.selectedSlots || []),
    now(),
    projectId,
    userId
  );
  return getEcommerceProject(userId, projectId);
}

export function saveEcommerceProjectAutomaticAnalysis(userId, projectId, values = {}) {
  const coreUser = String(values.coreUser || '').trim().slice(0, 1000);
  const coreScenario = String(values.coreScenario || '').trim().slice(0, 1000);
  const sellingPoints = Array.isArray(values.sellingPoints)
    ? values.sellingPoints.map((item) => String(item || '').trim().slice(0, 160)).filter(Boolean).slice(0, 12)
    : [];
  const identitySpec = values.identitySpec && typeof values.identitySpec === 'object' && !Array.isArray(values.identitySpec)
    ? values.identitySpec
    : {};
  const aiBriefOriginals = values.aiBriefOriginals && typeof values.aiBriefOriginals === 'object' && !Array.isArray(values.aiBriefOriginals)
    ? values.aiBriefOriginals
    : {};
  const updatedAt = now();
  const result = getDb().prepare(`
    UPDATE ecommerce_projects SET
      target_audience = ?, core_user = ?, core_scenario = ?, selling_points = ?,
      identity_spec = ?, ai_brief_originals = ?, auto_analysis_fingerprint = ?,
      auto_analysis_status = ?, auto_analysis_updated_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND status != 'deleted'
  `).run(
    [coreUser, coreScenario].filter(Boolean).join('\n'),
    coreUser,
    coreScenario,
    JSON.stringify(sellingPoints),
    JSON.stringify(identitySpec),
    JSON.stringify(aiBriefOriginals),
    String(values.fingerprint || '').slice(0, 128),
    String(values.status || 'completed').slice(0, 24),
    updatedAt,
    updatedAt,
    projectId,
    userId
  );
  return result.changes ? getEcommerceProject(userId, projectId) : null;
}

export function markEcommerceProjectAutomaticAnalysis(userId, projectId, values = {}) {
  const updatedAt = now();
  const result = getDb().prepare(`
    UPDATE ecommerce_projects SET
      auto_analysis_fingerprint = ?, auto_analysis_status = ?, auto_analysis_updated_at = ?
    WHERE id = ? AND user_id = ? AND status != 'deleted'
  `).run(
    String(values.fingerprint || '').slice(0, 128),
    String(values.status || '').slice(0, 24),
    updatedAt,
    projectId,
    userId
  );
  return result.changes ? getEcommerceProject(userId, projectId) : null;
}

export function setEcommerceProjectImageProvider(userId, projectId, providerId) {
  const result = getDb().prepare(`
    UPDATE ecommerce_projects
    SET image_provider_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND status != 'deleted'
  `).run(String(providerId || '').trim(), now(), projectId, userId);
  return result.changes ? getEcommerceProject(userId, projectId) : null;
}

export function deleteEcommerceProject(userId, projectId) {
  const project = getEcommerceProject(userId, projectId);
  if (!project) return null;
  const db = getDb();
  const linkedAssets = db.prepare(`
    SELECT id, media_asset_id FROM ecommerce_project_assets
    WHERE project_id = ? AND user_id = ? AND media_asset_id IS NOT NULL
  `).all(projectId, userId);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const linkedAsset of linkedAssets) {
      db.prepare(`
        UPDATE assets SET source_table = '', source_id = '', updated_at = ?
        WHERE id = ? AND source_table = 'ecommerce_project_assets' AND source_id = ?
      `).run(now(), linkedAsset.media_asset_id, linkedAsset.id);
    }
    db.prepare('DELETE FROM ecommerce_projects WHERE id = ? AND user_id = ?').run(projectId, userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return project;
}

function normalizeProviderRow(row, includeSecret = false) {
  if (!row) return null;
  let storedPricing = {};
  try { storedPricing = JSON.parse(row.pricing_config || '{}'); } catch { storedPricing = {}; }
  const hasStoredPricing = storedPricing && typeof storedPricing === 'object' && Object.keys(storedPricing).length > 0;
  const pricing = normalizeImagePricingConfig(storedPricing, {
    model: row.model,
    strategy: hasStoredPricing ? (row.pricing_strategy || storedPricing.strategy) : ''
  });
  const result = {
    id: row.id,
    name: row.name,
    providerType: row.provider_type || 'openai-compatible',
    baseUrl: row.base_url,
    model: row.model,
    pricingStrategy: pricing.strategy,
    pricingConfig: pricing,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    hasApiKey: Boolean(row.api_key_encrypted),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (includeSecret) {
    result.apiKey = decryptProviderSecret(row.api_key_encrypted);
  } else {
    let rawKey = '';
    try { rawKey = decryptProviderSecret(row.api_key_encrypted); } catch { rawKey = ''; }
    result.apiKeyMasked = maskProviderSecret(rawKey);
  }
  return result;
}

export function ensureDefaultImageProviderConfig() {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM image_provider_configs LIMIT 1').get();
  if (existing) return;
  const apiKey = process.env.AI_API_KEY || process.env.UNIKEYX_API_KEY || '';
  if (!apiKey) return;
  const createdAt = now();
  const model = process.env.AI_IMAGE_MODEL || 'gpt-image-2';
  const pricing = defaultImagePricingConfigForModel(model);
  db.prepare(`INSERT INTO image_provider_configs
    (id, name, provider_type, base_url, api_key_encrypted, model, pricing_strategy, pricing_config, enabled, is_default, created_at, updated_at)
    VALUES (?, ?, 'openai-compatible', ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
    .run(randomUUID(), process.env.AI_PROVIDER_NAME || 'GPT Image 2', process.env.AI_BASE_URL || process.env.UNIKEYX_BASE_URL || 'https://www.unikeyx.com', encryptProviderSecret(apiKey), model, pricing.strategy, JSON.stringify(pricing), createdAt, createdAt);
}

export function listImageProviderConfigs({ admin = false } = {}) {
  ensureDefaultImageProviderConfig();
  const rows = getDb().prepare(`SELECT * FROM image_provider_configs ${admin ? '' : 'WHERE enabled = 1'} ORDER BY is_default DESC, created_at ASC`).all();
  return rows.map((row) => {
    const normalized = normalizeProviderRow(row);
    return admin ? normalized : ({
      id: normalized.id,
      name: normalized.name,
      providerType: normalized.providerType,
      model: normalized.model,
      pricingStrategy: normalized.pricingStrategy,
      isDefault: normalized.isDefault
    });
  });
}

export function getImageProviderConfig(providerId = '', { includeSecret = true } = {}) {
  ensureDefaultImageProviderConfig();
  const db = getDb();
  const row = providerId
    ? db.prepare('SELECT * FROM image_provider_configs WHERE id = ? AND enabled = 1').get(providerId)
    : db.prepare('SELECT * FROM image_provider_configs WHERE enabled = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1').get();
  return normalizeProviderRow(row, includeSecret);
}

export function saveImageProviderConfig(values) {
  const db = getDb();
  const id = String(values.id || randomUUID());
  const existing = db.prepare('SELECT * FROM image_provider_configs WHERE id = ?').get(id);
  const apiKeyEncrypted = values.apiKey ? encryptProviderSecret(values.apiKey) : existing?.api_key_encrypted || '';
  if (!apiKeyEncrypted) throw Object.assign(new Error('API_KEY_REQUIRED'), { code: 'API_KEY_REQUIRED' });
  const pricing = normalizeImagePricingConfig(values.pricingConfig, {
    model: values.model,
    strategy: values.pricingStrategy
  });
  const updatedAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (values.isDefault) db.prepare('UPDATE image_provider_configs SET is_default = 0').run();
    db.prepare(`INSERT INTO image_provider_configs
      (id, name, provider_type, base_url, api_key_encrypted, model, pricing_strategy, pricing_config, enabled, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, provider_type=excluded.provider_type,
      base_url=excluded.base_url, api_key_encrypted=excluded.api_key_encrypted, model=excluded.model,
      pricing_strategy=excluded.pricing_strategy, pricing_config=excluded.pricing_config,
      enabled=excluded.enabled, is_default=excluded.is_default, updated_at=excluded.updated_at`)
      .run(id, values.name, values.providerType || 'openai-compatible', values.baseUrl, apiKeyEncrypted, values.model, pricing.strategy, JSON.stringify(pricing), values.enabled === false ? 0 : 1, values.isDefault ? 1 : 0, existing?.created_at || updatedAt, updatedAt);
    const defaultRow = db.prepare('SELECT id FROM image_provider_configs WHERE enabled = 1 AND is_default = 1 LIMIT 1').get();
    if (!defaultRow) db.prepare('UPDATE image_provider_configs SET is_default = 1 WHERE id = (SELECT id FROM image_provider_configs WHERE enabled = 1 ORDER BY created_at ASC LIMIT 1)').run();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return normalizeProviderRow(db.prepare('SELECT * FROM image_provider_configs WHERE id = ?').get(id));
}

export function deleteImageProviderConfig(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM image_provider_configs WHERE id = ?').get(id);
  if (!row) return null;
  const referenced = db.prepare('SELECT COUNT(*) AS count FROM ecommerce_projects WHERE image_provider_id = ?').get(id)?.count || 0;
  if (referenced) throw Object.assign(new Error('PROVIDER_IN_USE'), { code: 'PROVIDER_IN_USE' });
  const enabledCount = db.prepare('SELECT COUNT(*) AS count FROM image_provider_configs WHERE enabled = 1').get()?.count || 0;
  if (row.enabled && enabledCount <= 1) throw Object.assign(new Error('LAST_PROVIDER_REQUIRED'), { code: 'LAST_PROVIDER_REQUIRED' });
  db.prepare('DELETE FROM image_provider_configs WHERE id = ?').run(id);
  if (row.is_default) db.prepare('UPDATE image_provider_configs SET is_default = 1 WHERE id = (SELECT id FROM image_provider_configs WHERE enabled = 1 ORDER BY created_at ASC LIMIT 1)').run();
  return normalizeProviderRow(row);
}

function canAccessUnifiedMediaAsset(db, userId, mediaAssetId) {
  if (!mediaAssetId) return true;
  return Boolean(db.prepare(`
    SELECT 1
    FROM assets asset
    WHERE asset.id = ?
      AND asset.deleted_at IS NULL
      AND (
        asset.owner_user_id = ?
        OR EXISTS (
          SELECT 1 FROM asset_permissions permission
          WHERE permission.asset_id = asset.id
            AND permission.principal_type = 'user'
            AND permission.principal_id = ?
        )
        OR EXISTS (
          SELECT 1
          FROM asset_permissions permission
          JOIN team_members member ON member.team_id = permission.principal_id
          WHERE permission.asset_id = asset.id
            AND permission.principal_type = 'team'
            AND member.user_id = ?
        )
      )
  `).get(mediaAssetId, userId, userId, userId));
}

export function normalizeEcommerceProjectAsset(row, { available = true } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    mediaAssetId: row.media_asset_id || '',
    assetType: row.asset_type || 'product',
    fileName: row.file_name || '',
    mimeType: row.mime_type || 'image/png',
    fileSize: Number(row.file_size || 0),
    storagePath: row.storage_path || '',
    purpose: row.purpose || '',
    sortOrder: Number(row.sort_order || 0),
    available: Boolean(available),
    unavailableReason: available ? '' : 'ASSET_ACCESS_REVOKED',
    createdAt: row.created_at || ''
  };
}

export function createEcommerceProjectAsset(userId, values) {
  const id = values.id || randomUUID();
  const createdAt = now();
  const db = getDb();
  db.prepare(`
    INSERT INTO ecommerce_project_assets
      (id, project_id, user_id, media_asset_id, asset_type, file_name, mime_type, file_size, storage_path, purpose, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    values.projectId,
    userId,
    values.mediaAssetId || null,
    values.assetType,
    values.fileName,
    values.mimeType,
    values.fileSize,
    values.storagePath,
    values.purpose || '',
    Number(values.sortOrder || 0),
    createdAt
  );
  ensureEcommerceMediaAsset(db, db.prepare('SELECT * FROM ecommerce_project_assets WHERE id = ?').get(id));
  if (values.assetType === 'product') ensureEcommerceProjectMasterAsset(userId, values.projectId);
  return getEcommerceProjectAsset(userId, id);
}

export function getEcommerceProjectAsset(userId, assetId, { includeUnavailable = false } = {}) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM ecommerce_project_assets WHERE id = ? AND user_id = ?
  `).get(assetId, userId);
  if (!row) return null;
  const available = canAccessUnifiedMediaAsset(db, userId, row.media_asset_id);
  if (!available && !includeUnavailable) return null;
  return normalizeEcommerceProjectAsset(row, { available });
}

export function listEcommerceProjectAssets(userId, projectId, { includeUnavailable = false } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM ecommerce_project_assets
    WHERE user_id = ? AND project_id = ?
    ORDER BY sort_order ASC, created_at ASC, id ASC
  `).all(userId, projectId)
    .map((row) => {
      const available = canAccessUnifiedMediaAsset(db, userId, row.media_asset_id);
      return normalizeEcommerceProjectAsset(row, { available });
    })
    .filter((asset) => includeUnavailable || asset.available);
}

export function deleteEcommerceProjectAsset(userId, assetId) {
  const db = getDb();
  const asset = getEcommerceProjectAsset(userId, assetId, { includeUnavailable: true });
  if (!asset) return null;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE ecommerce_projects SET master_asset_id = NULL, updated_at = ?
      WHERE id = ? AND user_id = ? AND master_asset_id = ?
    `).run(now(), asset.projectId, userId, assetId);
    if (asset.mediaAssetId) {
      db.prepare('DELETE FROM asset_project_links WHERE asset_id = ? AND project_id = ?')
        .run(asset.mediaAssetId, asset.projectId);
      db.prepare(`
        UPDATE assets SET source_table = '', source_id = '', updated_at = ?
        WHERE id = ? AND source_table = 'ecommerce_project_assets' AND source_id = ?
      `).run(now(), asset.mediaAssetId, asset.id);
    }
    db.prepare('DELETE FROM ecommerce_project_assets WHERE id = ? AND user_id = ?').run(assetId, userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  ensureEcommerceProjectMasterAsset(userId, asset.projectId);
  return asset;
}

export function ensureEcommerceProjectMasterAsset(userId, projectId) {
  const project = getEcommerceProject(userId, projectId);
  if (!project) return null;
  const currentMaster = project.masterAssetId
    ? getEcommerceProjectAsset(userId, project.masterAssetId)
    : null;
  if (
    currentMaster
    && currentMaster.projectId === projectId
    && currentMaster.assetType === 'product'
    && currentMaster.available !== false
  ) {
    return project;
  }

  const nextMaster = listEcommerceProjectAssets(userId, projectId)
    .find((asset) => asset.assetType === 'product' && asset.available !== false);
  const nextMasterId = nextMaster?.id || '';
  if ((project.masterAssetId || '') === nextMasterId) return project;
  getDb().prepare(`
    UPDATE ecommerce_projects SET master_asset_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(nextMasterId || null, now(), projectId, userId);
  return getEcommerceProject(userId, projectId);
}

export function setEcommerceProjectMasterAsset(userId, projectId, assetId) {
  const project = getEcommerceProject(userId, projectId);
  const asset = getEcommerceProjectAsset(userId, assetId);
  if (!project || !asset || asset.projectId !== projectId || asset.assetType !== 'product') return null;
  getDb().prepare(`
    UPDATE ecommerce_projects SET master_asset_id = ?, updated_at = ? WHERE id = ? AND user_id = ?
  `).run(assetId, now(), projectId, userId);
  return getEcommerceProject(userId, projectId);
}
