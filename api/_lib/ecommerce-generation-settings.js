import { randomUUID } from 'node:crypto';

import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';
import {
  DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT,
  ECOMMERCE_GENERATION_SYSTEM_PROMPT_MAX_LENGTH,
  normalizeEcommerceGenerationSystemPrompt
} from '../../shared/ecommerce-generation-system-prompt.js';
import { getDb, getUserById } from './local-db.js';
import { requirePermission } from './governance.js';

export const ECOMMERCE_GENERATION_SYSTEM_PROMPT_SETTING_KEY = 'ecommerce_generation_system_prompt';

function now() {
  return new Date().toISOString();
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getEcommerceGenerationSystemPromptSettings() {
  const row = getDb().prepare(`
    SELECT value_json, updated_at
    FROM app_settings
    WHERE setting_key = ?
  `).get(ECOMMERCE_GENERATION_SYSTEM_PROMPT_SETTING_KEY);
  const value = parseJson(row?.value_json);
  const prompt = normalizeEcommerceGenerationSystemPrompt(value.prompt);
  return {
    prompt,
    defaultPrompt: DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT,
    isDefault: prompt === DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT,
    updatedAt: row?.updated_at || null
  };
}

export function updateEcommerceGenerationSystemPromptSettings(actorUserId, values = {}) {
  const actor = requirePermission(getUserById(actorUserId), ADMIN_PERMISSIONS.MANAGE_GLOBAL_SETTINGS);
  const rawPrompt = String(values.prompt || '').trim();
  if (rawPrompt.length > ECOMMERCE_GENERATION_SYSTEM_PROMPT_MAX_LENGTH) {
    throw Object.assign(new Error('ECOMMERCE_SYSTEM_PROMPT_TOO_LONG'), { code: 'ECOMMERCE_SYSTEM_PROMPT_TOO_LONG' });
  }
  const previous = getEcommerceGenerationSystemPromptSettings();
  const next = { prompt: normalizeEcommerceGenerationSystemPrompt(rawPrompt) };
  const updatedAt = now();
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(ECOMMERCE_GENERATION_SYSTEM_PROMPT_SETTING_KEY, JSON.stringify(next), actor.id, updatedAt);
    db.prepare(`
      INSERT INTO app_setting_audit
        (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      ECOMMERCE_GENERATION_SYSTEM_PROMPT_SETTING_KEY,
      JSON.stringify({ prompt: previous.prompt }),
      JSON.stringify(next),
      actor.id,
      updatedAt
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getEcommerceGenerationSystemPromptSettings();
}
