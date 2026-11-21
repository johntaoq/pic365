import { randomUUID } from 'node:crypto';
import { getDb } from './local-db.js';
import { checkPermanentStorageDeletion, deleteStoredFilePermanently } from './storage.js';
import {
  assetRetentionCutoff, assetRetentionDateParts, normalizeAssetRetentionDays
} from '../../shared/asset-retention.js';
import { generatedThumbnailStoragePath } from '../../shared/image-thumbnails.js';

const LEASE_MS = 15 * 60_000;

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function safeStoragePath(value, userId) {
  const name = String(value || '');
  if (!name || name.includes('\\') || name.split('/').some((part) => !part || part === '.' || part === '..')) return false;
  return name.startsWith(`${userId}/`) || name.startsWith(`assets/${userId}/`)
    || name.startsWith(`projects/${userId}/`) || name.startsWith(`thumbnails/v1/${userId}/`);
}

function buildManifest(db, asset) {
  const generations = db.prepare(`
    SELECT id, storage_path FROM generations WHERE user_id = ? AND (
      (id = ? AND ? = 'generations') OR storage_path = ?
    )
  `).all(asset.owner_user_id, asset.source_id, asset.source_table, asset.original_storage_path);
  const projectAssets = db.prepare(`
    SELECT id, project_id, user_id FROM ecommerce_project_assets WHERE
      media_asset_id = ? OR (user_id = ? AND (
        storage_path = ? OR (id = ? AND ? = 'ecommerce_project_assets')
      ))
  `).all(asset.id, asset.owner_user_id, asset.original_storage_path, asset.source_id, asset.source_table);
  const files = new Map();
  function add(storagePath, bytes = 0) {
    if (!storagePath) return;
    if (!safeStoragePath(storagePath, asset.owner_user_id)) {
      throw Object.assign(new Error('RETENTION_STORAGE_PATH_NOT_OWNED'), { code: 'RETENTION_STORAGE_PATH_NOT_OWNED' });
    }
    files.set(storagePath, Math.max(files.get(storagePath) || 0, Number(bytes) || 0));
  }
  add(asset.original_storage_path, asset.file_size);
  for (const variant of db.prepare('SELECT storage_path, file_size FROM asset_variants WHERE asset_id = ?').all(asset.id)) {
    add(variant.storage_path, variant.file_size);
  }
  for (const generation of generations) {
    add(generation.storage_path);
    add(generatedThumbnailStoragePath(generation.storage_path));
  }
  return {
    assetId: asset.id, userId: asset.owner_user_id,
    generationIds: generations.map((row) => row.id),
    projectAssetIds: projectAssets.map((row) => row.id),
    files: [...files].map(([storagePath, bytes]) => ({ storagePath, bytes }))
  };
}

function inUse(db, manifest) {
  // A running request may already have read its input. Do not delete or detach it mid-task.
  if (db.prepare(`
    WITH consumers AS (
      SELECT ? AS user_id
      UNION SELECT principal_id FROM asset_permissions WHERE asset_id = ? AND principal_type = 'user'
      UNION SELECT member.user_id FROM asset_permissions permission
        JOIN team_members member ON member.team_id = permission.principal_id
        WHERE permission.asset_id = ? AND permission.principal_type = 'team'
      UNION SELECT user_id FROM ecommerce_project_assets WHERE media_asset_id = ?
    )
    SELECT 1 FROM free_generation_tasks WHERE user_id IN consumers AND status IN ('queued', 'running', 'cancelling')
    UNION ALL SELECT 1 FROM video_generation_tasks WHERE user_id IN consumers AND status IN ('queued', 'running', 'cancelling')
    UNION ALL SELECT 1 FROM ecommerce_generation_tasks WHERE user_id IN consumers AND status IN ('queued', 'running', 'cancelling')
    UNION ALL SELECT 1 FROM generations WHERE user_id IN consumers AND status = 'processing'
    UNION ALL SELECT 1 FROM asset_processing_jobs WHERE asset_id = ? AND status IN ('queued', 'running')
    LIMIT 1
  `).get(manifest.userId, manifest.assetId, manifest.assetId, manifest.assetId, manifest.assetId)) return true;
  const generationIds = new Set(manifest.generationIds);
  const projectAssetIds = new Set(manifest.projectAssetIds);
  for (const { storagePath } of manifest.files) {
    if (db.prepare(`
      SELECT 1 FROM assets WHERE id != ? AND original_storage_path = ?
      UNION ALL SELECT 1 FROM asset_variants WHERE asset_id != ? AND storage_path = ? LIMIT 1
    `).get(manifest.assetId, storagePath, manifest.assetId, storagePath)) return true;
    if (db.prepare('SELECT id FROM generations WHERE storage_path = ?').all(storagePath).some((row) => !generationIds.has(row.id))) return true;
    if (db.prepare('SELECT id FROM ecommerce_project_assets WHERE storage_path = ?').all(storagePath).some((row) => !projectAssetIds.has(row.id))) return true;
  }
  return false;
}

function finalizeDeletion(db, manifest, timestamp) {
  const generationIds = new Set(manifest.generationIds);
  for (const row of db.prepare('SELECT id, result_json FROM free_generation_tasks WHERE user_id = ?').all(manifest.userId)) {
    const result = parseJson(row.result_json, {});
    if (!Array.isArray(result.items)) continue;
    const items = result.items.filter((item) => !generationIds.has(item.generationId));
    if (items.length === result.items.length) continue;
    db.prepare('UPDATE free_generation_tasks SET result_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify({ ...result, items }), timestamp, row.id);
  }
  for (const id of manifest.generationIds) {
    // Preserve billing/audit history, but remove all paths that could recreate the asset at startup.
    db.prepare(`
      UPDATE generations SET storage_path = NULL, output_url = NULL, file_size = 0,
        archived_at = COALESCE(archived_at, ?), history_hidden_at = COALESCE(history_hidden_at, ?)
      WHERE id = ? AND user_id = ?
    `).run(timestamp, timestamp, id, manifest.userId);
    db.prepare(`
      UPDATE ecommerce_project_outputs SET generation_id = NULL, status = 'planned', active = 0,
        locked = 0, locked_at = NULL, updated_at = ? WHERE generation_id = ?
    `).run(timestamp, id);
  }
  for (const id of manifest.projectAssetIds) {
    db.prepare('UPDATE ecommerce_projects SET master_asset_id = NULL, updated_at = ? WHERE master_asset_id = ?').run(timestamp, id);
    db.prepare('DELETE FROM ecommerce_project_assets WHERE id = ?').run(id);
  }
  const videoRows = db.prepare('SELECT task_id FROM video_generations WHERE asset_id = ?').all(manifest.assetId);
  for (const row of videoRows) {
    db.prepare('UPDATE video_generation_tasks SET result_json = ?, deleted_at = ?, updated_at = ? WHERE id = ?')
      .run('{}', timestamp, timestamp, row.task_id);
  }
  const nodes = db.prepare('SELECT id, project_id FROM infinite_canvas_nodes WHERE asset_id = ?').all(manifest.assetId);
  for (const id of manifest.generationIds) {
    nodes.push(...db.prepare('SELECT id, project_id FROM infinite_canvas_nodes WHERE generation_id = ?').all(id));
  }
  const uniqueNodes = [...new Map(nodes.map((node) => [node.id, node])).values()];
  for (const node of uniqueNodes) {
    db.prepare('UPDATE infinite_canvas_projects SET adopted_node_id = NULL WHERE adopted_node_id = ?').run(node.id);
    db.prepare('UPDATE infinite_canvas_nodes SET parent_node_id = NULL WHERE parent_node_id = ?').run(node.id);
    db.prepare('DELETE FROM infinite_canvas_nodes WHERE id = ?').run(node.id);
  }
  for (const projectId of new Set(uniqueNodes.map((node) => node.project_id))) {
    db.prepare('UPDATE infinite_canvas_projects SET revision = revision + 1, updated_at = ? WHERE id = ?').run(timestamp, projectId);
  }
  db.prepare('DELETE FROM assets WHERE id = ? AND owner_user_id = ?').run(manifest.assetId, manifest.userId);
}

export function getLatestAssetRetentionBatch() {
  const row = getDb().prepare('SELECT * FROM asset_retention_batches ORDER BY run_date DESC LIMIT 1').get();
  return row ? {
    runDate: row.run_date, status: row.status, startedAt: row.started_at,
    updatedAt: row.updated_at, completedAt: row.completed_at, ...parseJson(row.result_json, {})
  } : null;
}

function claimBatch(db, runDate, timestamp) {
  const lease = randomUUID();
  const claimed = db.prepare(`
    INSERT INTO asset_retention_batches (run_date, lease_id, status, started_at, updated_at)
    VALUES (?, ?, 'running', ?, ?)
    ON CONFLICT(run_date) DO UPDATE SET lease_id = excluded.lease_id, status = 'running', updated_at = excluded.updated_at
    WHERE asset_retention_batches.status != 'completed' AND (
      asset_retention_batches.status != 'running' OR asset_retention_batches.updated_at < ?
    )
  `).run(runDate, lease, timestamp, timestamp, new Date(Date.parse(timestamp) - LEASE_MS).toISOString());
  return claimed.changes ? lease : '';
}

export async function runAssetRetentionBatch({
  at = new Date(), runDate = assetRetentionDateParts(at).date, dryRun = false,
  userId = '', deleteFile = deleteStoredFilePermanently, checkStorage = checkPermanentStorageDeletion
} = {}) {
  const timestamp = new Date(at).toISOString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) throw new Error('INVALID_ASSET_RETENTION_DATE');
  if (userId && !dryRun) throw new Error('SCOPED_RETENTION_REQUIRES_DRY_RUN');
  const db = getDb();
  const result = { runDate, status: 'completed', examined: 0, deleted: 0, skipped: 0, failed: 0, freedBytes: 0, errors: [] };
  const lease = dryRun ? '' : claimBatch(db, runDate, new Date().toISOString());
  if (!dryRun && !lease) return { ...result, status: 'already_run' };
  function requireLease() {
    if (!dryRun && !db.prepare("SELECT 1 FROM asset_retention_batches WHERE run_date = ? AND lease_id = ? AND status = 'running'").get(runDate, lease)) {
      throw Object.assign(new Error('ASSET_RETENTION_LEASE_LOST'), { code: 'ASSET_RETENTION_LEASE_LOST' });
    }
  }
  const heartbeat = dryRun ? null : setInterval(() => {
    db.prepare('UPDATE asset_retention_batches SET updated_at = ? WHERE run_date = ? AND lease_id = ?')
      .run(new Date().toISOString(), runDate, lease);
  }, 30_000);
  heartbeat?.unref?.();
  try {
    if (!dryRun) await checkStorage();
    const users = db.prepare(`
      SELECT user.id, settings.retention_days FROM users user
      LEFT JOIN user_asset_retention_settings settings ON settings.user_id = user.id
      WHERE (? = '' OR user.id = ?)
    `).all(userId, userId);
    for (const user of users) {
      const cutoff = assetRetentionCutoff(normalizeAssetRetentionDays(user.retention_days), at);
      const assets = db.prepare(`
        SELECT asset.* FROM assets asset LEFT JOIN asset_retention_deletions deletion ON deletion.asset_id = asset.id
        WHERE asset.owner_user_id = ? AND (
          julianday(asset.created_at) <= julianday(?) OR deletion.asset_id IS NOT NULL
        ) ORDER BY asset.created_at ASC, asset.id ASC
      `).all(user.id, cutoff);
      for (const asset of assets) {
        requireLease();
        result.examined += 1;
        try {
          const job = db.prepare('SELECT * FROM asset_retention_deletions WHERE asset_id = ?').get(asset.id);
          const manifest = job ? parseJson(job.manifest_json, null) : buildManifest(db, asset);
          if (!manifest) throw new Error('RETENTION_MANIFEST_INVALID');
          if (inUse(db, manifest)) { result.skipped += 1; continue; }
          if (dryRun) { result.deleted += 1; result.freedBytes += manifest.files.reduce((sum, file) => sum + file.bytes, 0); continue; }
          const deletedPaths = new Set(parseJson(job?.deleted_paths_json, []));
          db.exec('BEGIN IMMEDIATE');
          try {
            const setting = db.prepare('SELECT retention_days FROM user_asset_retention_settings WHERE user_id = ?').get(user.id);
            const currentAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(asset.id);
            const currentCutoff = assetRetentionCutoff(setting?.retention_days, at);
            if (!currentAsset || (!job && Date.parse(currentAsset.created_at) > Date.parse(currentCutoff)) || inUse(db, manifest)) {
              db.exec('ROLLBACK');
              result.skipped += 1;
              continue;
            }
            db.prepare(`
              INSERT OR IGNORE INTO asset_retention_deletions (asset_id, owner_user_id, manifest_json, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(asset.id, user.id, JSON.stringify(manifest), timestamp, timestamp);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          for (const file of manifest.files) {
            if (deletedPaths.has(file.storagePath)) continue;
            // Check again after each network round trip, as tasks can arrive while a batch runs.
            requireLease();
            if (inUse(db, manifest)) throw Object.assign(new Error('ASSET_IN_USE'), { code: 'ASSET_IN_USE' });
            await deleteFile(file.storagePath);
            requireLease();
            deletedPaths.add(file.storagePath);
            db.prepare(`
              UPDATE asset_retention_deletions SET deleted_paths_json = ?, error_code = '', updated_at = ? WHERE asset_id = ?
            `).run(JSON.stringify([...deletedPaths]), new Date().toISOString(), asset.id);
            result.freedBytes += file.bytes;
          }
          db.exec('BEGIN IMMEDIATE');
          try {
            requireLease();
            if (inUse(db, manifest)) throw Object.assign(new Error('ASSET_IN_USE'), { code: 'ASSET_IN_USE' });
            finalizeDeletion(db, manifest, timestamp);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          result.deleted += 1;
        } catch (error) {
          if (error.code === 'ASSET_RETENTION_LEASE_LOST') throw error;
          result.failed += 1;
          const code = String(error.code || 'ASSET_RETENTION_DELETE_FAILED').slice(0, 100);
          if (result.errors.length < 20) result.errors.push({ assetId: asset.id, code });
          if (!dryRun) db.prepare('UPDATE asset_retention_deletions SET error_code = ?, updated_at = ? WHERE asset_id = ?')
            .run(code, new Date().toISOString(), asset.id);
        }
      }
    }
    if (result.failed) result.status = 'partial';
  } catch (error) {
    result.status = 'failed';
    result.errors.push({ code: error.code || 'ASSET_RETENTION_BATCH_FAILED' });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (!dryRun) db.prepare(`
      UPDATE asset_retention_batches SET status = ?, result_json = ?, updated_at = ?, completed_at = ?
      WHERE run_date = ? AND lease_id = ?
    `).run(result.status, JSON.stringify(result), new Date().toISOString(), new Date().toISOString(), runDate, lease);
  }
  return { ...result, dryRun };
}
