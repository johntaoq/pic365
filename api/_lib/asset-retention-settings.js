import { getDb } from './local-db.js';
import { normalizeAssetRetentionDays } from '../../shared/asset-retention.js';

export function getAssetRetentionSettings(userId) {
  const row = getDb().prepare('SELECT retention_days, updated_at FROM user_asset_retention_settings WHERE user_id = ?').get(userId);
  return { retentionDays: normalizeAssetRetentionDays(row?.retention_days), updatedAt: row?.updated_at || null };
}

export function saveAssetRetentionSettings(userId, value) {
  const days = normalizeAssetRetentionDays(value);
  getDb().prepare(`
    INSERT INTO user_asset_retention_settings (user_id, retention_days, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET retention_days = excluded.retention_days, updated_at = excluded.updated_at
  `).run(userId, days, new Date().toISOString());
  return getAssetRetentionSettings(userId);
}
