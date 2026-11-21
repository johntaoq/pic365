import { getDb } from './local-db.js';
import { prepareEcommerceLayoutWatermark } from './ecommerce-layout-watermark.js';
import {
  activeEcommerceWatermarkSettings,
  normalizeEcommerceWatermarkSettings
} from '../../shared/ecommerce-layout-watermark.js';

export function getEcommerceWatermarkSettings(userId) {
  const row = getDb().prepare(
    'SELECT settings_json FROM user_ecommerce_watermark_settings WHERE user_id = ?'
  ).get(userId);
  return normalizeEcommerceWatermarkSettings(row ? JSON.parse(row.settings_json) : {});
}

export async function saveEcommerceWatermarkSettings(userId, value) {
  const settings = normalizeEcommerceWatermarkSettings(value);
  if (settings.text.trim()) {
    await prepareEcommerceLayoutWatermark({
      angle: settings.angle, columns: settings.columns,
      text: settings.text, textImageDataUrl: settings.textImageDataUrl
    });
  }
  if (settings.imageDataUrl) {
    await prepareEcommerceLayoutWatermark({
      angle: settings.angle, columns: settings.columns, imageDataUrl: settings.imageDataUrl
    });
  }
  getDb().prepare(`INSERT INTO user_ecommerce_watermark_settings (user_id, settings_json, updated_at)
    VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
    settings_json = excluded.settings_json, updated_at = excluded.updated_at`
  ).run(userId, JSON.stringify(settings), new Date().toISOString());
  return settings;
}

export async function prepareUserEcommerceWatermark(userId) {
  return prepareEcommerceLayoutWatermark(activeEcommerceWatermarkSettings(
    getEcommerceWatermarkSettings(userId)
  ));
}
