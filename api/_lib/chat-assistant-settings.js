import { createHash, randomUUID } from 'node:crypto';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';
import { DEFAULT_SYSTEM_PROMPT, getChatProviderConfig, listChatProviderConfigs } from './chat-engine.js';
import { getDb, getUserById, filterProvidersForUser } from './local-db.js';
import { requirePermission } from './governance.js';
import { saveModelRule } from './upstream-model-rules.js';

const SETTING_KEY = 'chat_assistant_settings';
export const CHAT_SYSTEM_PROMPT_MAX_LENGTH = 8000;
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }); };

export function getAdminChatSettings() {
  const providers = listChatProviderConfigs({ admin: true });
  const row = getDb().prepare('SELECT value_json, updated_at FROM app_settings WHERE setting_key = ?').get(SETTING_KEY);
  let stored = {};
  try { stored = JSON.parse(row?.value_json || '{}'); } catch { /* Preserve legacy settings until first save. */ }
  const eligible = providers.filter((p) => p.enabled && p.hasApiKey && p.assistantEnabled);
  const defaultProvider = eligible.find((p) => p.id === stored.defaultProviderId) || eligible[0];
  // Migrate the old assistant prompt, not an unrelated magic-only provider's prompt.
  const legacy = eligible.find((p) => p.isDefault) || eligible[0]
    || providers.find((p) => p.assistantEnabled && p.isDefault) || providers.find((p) => p.assistantEnabled);
  const settings = {
    systemPrompt: typeof stored.systemPrompt === 'string' ? stored.systemPrompt : legacy?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    maxPromptLength: CHAT_SYSTEM_PROMPT_MAX_LENGTH,
    defaultProviderId: defaultProvider?.id || '',
    allowedModels: [...new Set(providers.filter((p) => p.assistantEnabled).map((p) => p.model))],
    providers: providers.map(({ id, name, model, enabled, hasApiKey, assistantEnabled }) => ({
      id, name, model, enabled, hasApiKey, assistantEnabled
    })),
    updatedAt: row?.updated_at || null
  };
  settings.revision = createHash('sha256').update(JSON.stringify(settings)).digest('hex');
  return settings;
}

export function saveAdminChatSettings(actorUserId, values = {}) {
  requirePermission(getUserById(actorUserId), ADMIN_PERMISSIONS.MANAGE_GLOBAL_SETTINGS);
  const before = getAdminChatSettings();
  if (values.revision && values.revision !== before.revision) fail('CHAT_SETTINGS_CHANGED', 409);
  const systemPrompt = typeof values.systemPrompt === 'string' ? values.systemPrompt.trim() : '';
  if (!systemPrompt || systemPrompt.length > CHAT_SYSTEM_PROMPT_MAX_LENGTH) fail('INVALID_CHAT_SYSTEM_PROMPT');
  if (!Array.isArray(values.allowedModels) || values.allowedModels.some((model) =>
    typeof model !== 'string' || !before.providers.some((p) => p.model === model))) fail('INVALID_CHAT_MODEL_RANGE');
  const allowedModels = [...new Set(values.allowedModels)];
  const available = before.providers.filter((p) => p.enabled && p.hasApiKey && allowedModels.includes(p.model));
  const defaultProviderId = typeof values.defaultProviderId === 'string' ? values.defaultProviderId : '';
  if (available.length ? !available.some((p) => p.id === defaultProviderId) : defaultProviderId !== '') {
    fail('INVALID_CHAT_DEFAULT_MODEL');
  }
  const db = getDb();
  const updatedAt = new Date().toISOString();
  const next = { systemPrompt, defaultProviderId };
  db.exec('BEGIN IMMEDIATE');
  try {
    // The upstream "Assistant" checkbox is the single source of the allowed model range.
    for (const model of new Set(before.providers.map((p) => p.model))) {
      saveModelRule(db, { kind: 'text', model, assistantEnabled: allowedModels.includes(model) });
    }
    db.prepare(`INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
      .run(SETTING_KEY, JSON.stringify(next), actorUserId, updatedAt);
    db.prepare(`INSERT INTO app_setting_audit (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), SETTING_KEY,
      JSON.stringify({ systemPrompt: before.systemPrompt, defaultProviderId: before.defaultProviderId, allowedModels: before.allowedModels }),
      JSON.stringify({ ...next, allowedModels }), actorUserId, updatedAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getAdminChatSettings();
}

export function getUserChatSettings(userId) {
  const settings = getAdminChatSettings();
  const allowed = settings.providers.filter((p) => p.enabled && p.hasApiKey && p.assistantEnabled);
  const providers = filterProvidersForUser(allowed, userId, 'chat').map(({ id, name }) => ({ id, name }));
  const defaultProviderId = providers.find((p) => p.id === settings.defaultProviderId)?.id || providers[0]?.id || '';
  const storedId = getDb().prepare('SELECT chat_provider_id FROM user_ui_preferences WHERE user_id = ?').get(userId)?.chat_provider_id || '';
  const preferredProviderId = providers.some((p) => p.id === storedId) ? storedId : '';
  return {
    providers, defaultProviderId, preferredProviderId,
    effectiveProviderId: preferredProviderId || defaultProviderId,
    followsDefault: !preferredProviderId,
    unavailablePreference: Boolean(storedId && !preferredProviderId)
  };
}

export function saveUserChatSettings(userId, values = {}) {
  if (!getUserById(userId)) fail('AUTH_REQUIRED', 401);
  const providerId = values.providerId;
  const settings = getUserChatSettings(userId);
  if (typeof providerId !== 'string' || (providerId && !settings.providers.some((p) => p.id === providerId))) {
    fail('CHAT_MODEL_NOT_AVAILABLE', 403);
  }
  // Updating only this column preserves the account's other interface preferences.
  getDb().prepare(`INSERT INTO user_ui_preferences (user_id, chat_provider_id, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET chat_provider_id=excluded.chat_provider_id, updated_at=excluded.updated_at`)
    .run(userId, providerId, new Date().toISOString());
  return getUserChatSettings(userId);
}

export function resolveChatAssistantProvider(userId, requestedId = '') {
  const settings = getUserChatSettings(userId);
  if (requestedId && !settings.providers.some((p) => p.id === requestedId)) fail('CHAT_MODEL_NOT_AVAILABLE', 403);
  const id = requestedId || settings.effectiveProviderId;
  if (!id) fail('CHAT_PROVIDER_NOT_CONFIGURED', 503);
  const provider = getChatProviderConfig(id, { userId, purpose: 'assistant', includeSecret: true });
  if (!provider) fail('CHAT_MODEL_NOT_AVAILABLE', 403);
  return { ...provider, systemPrompt: getAdminChatSettings().systemPrompt };
}
