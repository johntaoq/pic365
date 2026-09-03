import { randomUUID } from 'node:crypto';

import { defaultVideoPricingConfig, normalizeVideoPricingConfig } from '../../shared/video-pricing.js';
import { VIDEO_SIZES, videoProviderDurations } from '../../shared/video-generation.js';
import { decryptProviderSecret, encryptProviderSecret, maskProviderSecret } from './provider-secrets.js';
import { bindDefaultSystemGroupChannel, filterProvidersForUser, getDb, getImageProviderConfig, userCanAccessProvider } from './local-db.js';

function now() {
  return new Date().toISOString();
}

function clean(value, length = 500) {
  return String(value || '').trim().slice(0, length);
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function videoProviderCapabilities(provider = {}) {
  const providerType = String(provider.providerType || provider.provider_type || '').toLowerCase();
  const isBaiduKling = providerType === 'baidu-kling-video';
  return {
    durations: videoProviderDurations(provider),
    sizes: isBaiduKling ? [...VIDEO_SIZES] : VIDEO_SIZES.slice(0, 2),
    supportsImageReference: true,
    supportsNativeAudio: false,
    supportsCancellation: !isBaiduKling,
    modes: isBaiduKling ? ['std', 'pro', '4k'] : []
  };
}

export function ensureDefaultVideoProviderConfig() {
  const db = getDb();
  if (db.prepare('SELECT 1 FROM video_provider_configs LIMIT 1').get()) return;
  const imageProvider = getImageProviderConfig('', { includeSecret: false });
  if (!imageProvider) return;
  const createdAt = now();
  const pricing = defaultVideoPricingConfig();
  const providerId = randomUUID();
  db.prepare(`
    INSERT INTO video_provider_configs
      (id, name, provider_type, base_url, credential_source, image_provider_id, model,
       pricing_mode, pricing_config, enabled, is_default, created_at, updated_at)
    VALUES (?, 'Sora 2', 'openai-video-compatible', ?, 'image-provider', ?, 'sora-2', ?, ?, 1, 1, ?, ?)
  `).run(
    providerId,
    imageProvider.baseUrl || '',
    imageProvider.id,
    pricing.mode,
    JSON.stringify(pricing),
    createdAt,
    createdAt
  );
  bindDefaultSystemGroupChannel('video', providerId);
}

function normalizeProviderRow(row, { includeSecret = false } = {}) {
  if (!row) return null;
  const inheritedProvider = row.credential_source === 'image-provider'
    ? getImageProviderConfig(row.image_provider_id || '', { includeSecret })
    : null;
  const pricing = normalizeVideoPricingConfig(parseJson(row.pricing_config, {}));
  let ownApiKey = '';
  if (row.api_key_encrypted) {
    try { ownApiKey = decryptProviderSecret(row.api_key_encrypted); } catch { ownApiKey = ''; }
  }
  const resolvedApiKey = row.credential_source === 'image-provider' ? inheritedProvider?.apiKey || '' : ownApiKey;
  const resolvedApiKeyMasked = row.credential_source === 'image-provider'
    ? inheritedProvider?.apiKeyMasked || ''
    : maskProviderSecret(ownApiKey);
  const hasApiKey = row.credential_source === 'image-provider'
    ? Boolean(inheritedProvider?.hasApiKey || resolvedApiKey)
    : Boolean(ownApiKey);
  const result = {
    id: row.id,
    name: row.name,
    providerType: row.provider_type || 'openai-video-compatible',
    baseUrl: row.credential_source === 'image-provider' ? inheritedProvider?.baseUrl || row.base_url : row.base_url,
    model: row.model || 'sora-2',
    credentialSource: row.credential_source || 'image-provider',
    imageProviderId: row.image_provider_id || '',
    inheritedProviderName: inheritedProvider?.name || '',
    pricingMode: pricing.mode,
    pricingConfig: pricing,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    hasApiKey,
    apiKeyMasked: resolvedApiKeyMasked,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  result.capabilities = videoProviderCapabilities(result);
  if (includeSecret) result.apiKey = resolvedApiKey;
  return result;
}

export function listVideoProviderConfigs({ admin = false, userId = '' } = {}) {
  ensureDefaultVideoProviderConfig();
  const rows = getDb().prepare(`
    SELECT * FROM video_provider_configs
    ${admin ? '' : 'WHERE enabled = 1'}
    ORDER BY is_default DESC, created_at ASC
  `).all();
  const providers = rows.map((row) => {
    const provider = normalizeProviderRow(row, { includeSecret: false });
    const capabilities = videoProviderCapabilities(provider);
    return admin ? provider : {
      id: provider.id,
      name: provider.name,
      providerType: provider.providerType,
      model: provider.model,
      pricingMode: provider.pricingMode,
      isDefault: provider.isDefault,
      ...capabilities
    };
  });
  return admin ? providers : filterProvidersForUser(providers, userId, 'video');
}

export function getVideoProviderConfig(providerId = '', { includeSecret = true, userId = '' } = {}) {
  ensureDefaultVideoProviderConfig();
  const db = getDb();
  const rows = providerId
    ? [db.prepare('SELECT * FROM video_provider_configs WHERE id = ? AND enabled = 1').get(providerId)].filter(Boolean)
    : db.prepare('SELECT * FROM video_provider_configs WHERE enabled = 1 ORDER BY is_default DESC, created_at ASC').all();
  const row = userId ? rows.find((item) => userCanAccessProvider(userId, 'video', item.id)) : rows[0];
  return normalizeProviderRow(row, { includeSecret });
}

export function saveVideoProviderConfig(values = {}) {
  ensureDefaultVideoProviderConfig();
  const db = getDb();
  const id = clean(values.id, 80) || randomUUID();
  const existing = db.prepare('SELECT * FROM video_provider_configs WHERE id = ?').get(id);
  const credentialSource = values.credentialSource === 'manual' ? 'manual' : 'image-provider';
  const imageProvider = credentialSource === 'image-provider'
    ? getImageProviderConfig(clean(values.imageProviderId, 80), { includeSecret: false })
    : null;
  const apiKeyEncrypted = values.apiKey
    ? encryptProviderSecret(clean(values.apiKey, 1000))
    : existing?.api_key_encrypted || '';
  if (credentialSource === 'image-provider' && !imageProvider) {
    throw Object.assign(new Error('IMAGE_PROVIDER_REQUIRED'), { code: 'IMAGE_PROVIDER_REQUIRED' });
  }
  if (credentialSource === 'manual' && !apiKeyEncrypted) {
    throw Object.assign(new Error('API_KEY_REQUIRED'), { code: 'API_KEY_REQUIRED' });
  }
  const pricing = normalizeVideoPricingConfig(values.pricingConfig || parseJson(existing?.pricing_config, {}));
  const updatedAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (values.isDefault) db.prepare('UPDATE video_provider_configs SET is_default = 0').run();
    db.prepare(`
      INSERT INTO video_provider_configs
        (id, name, provider_type, base_url, api_key_encrypted, credential_source, image_provider_id,
         model, pricing_mode, pricing_config, enabled, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        provider_type = excluded.provider_type,
        base_url = excluded.base_url,
        api_key_encrypted = excluded.api_key_encrypted,
        credential_source = excluded.credential_source,
        image_provider_id = excluded.image_provider_id,
        model = excluded.model,
        pricing_mode = excluded.pricing_mode,
        pricing_config = excluded.pricing_config,
        enabled = excluded.enabled,
        is_default = excluded.is_default,
        updated_at = excluded.updated_at
    `).run(
      id,
      clean(values.name, 80) || (clean(values.providerType, 80) === 'baidu-kling-video' ? '可灵 V3' : 'Sora 2'),
      clean(values.providerType, 80) || 'openai-video-compatible',
      credentialSource === 'image-provider' ? imageProvider.baseUrl || '' : clean(values.baseUrl, 500).replace(/\/+$/, ''),
      credentialSource === 'manual' ? apiKeyEncrypted : '',
      credentialSource,
      credentialSource === 'image-provider' ? imageProvider.id : null,
      clean(values.model, 160) || 'sora-2',
      pricing.mode,
      JSON.stringify(pricing),
      values.enabled === false ? 0 : 1,
      values.isDefault ? 1 : 0,
      existing?.created_at || updatedAt,
      updatedAt
    );
    const defaultRow = db.prepare('SELECT id FROM video_provider_configs WHERE enabled = 1 AND is_default = 1 LIMIT 1').get();
    if (!defaultRow) db.prepare('UPDATE video_provider_configs SET is_default = 1 WHERE id = (SELECT id FROM video_provider_configs WHERE enabled = 1 ORDER BY created_at ASC LIMIT 1)').run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return normalizeProviderRow(db.prepare('SELECT * FROM video_provider_configs WHERE id = ?').get(id), { includeSecret: false });
}

export function updateVideoProviderPricing(providerId, pricingConfig) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM video_provider_configs WHERE id = ?').get(providerId);
  if (!existing) throw Object.assign(new Error('PROVIDER_NOT_FOUND'), { code: 'PROVIDER_NOT_FOUND' });
  const pricing = normalizeVideoPricingConfig(pricingConfig);
  db.prepare('UPDATE video_provider_configs SET pricing_mode = ?, pricing_config = ?, updated_at = ? WHERE id = ?')
    .run(pricing.mode, JSON.stringify(pricing), now(), providerId);
  return normalizeProviderRow(db.prepare('SELECT * FROM video_provider_configs WHERE id = ?').get(providerId), { includeSecret: false });
}

export function deleteVideoProviderConfig(providerId) {
  ensureDefaultVideoProviderConfig();
  const db = getDb();
  const row = db.prepare('SELECT * FROM video_provider_configs WHERE id = ?').get(providerId);
  if (!row) return null;
  const used = Number(db.prepare('SELECT COUNT(*) AS count FROM video_generation_tasks WHERE provider_id = ?').get(providerId)?.count || 0);
  if (used) throw Object.assign(new Error('PROVIDER_IN_USE'), { code: 'PROVIDER_IN_USE' });
  const enabledCount = Number(db.prepare('SELECT COUNT(*) AS count FROM video_provider_configs WHERE enabled = 1').get()?.count || 0);
  if (row.enabled && enabledCount <= 1) throw Object.assign(new Error('LAST_PROVIDER_REQUIRED'), { code: 'LAST_PROVIDER_REQUIRED' });
  db.prepare("DELETE FROM system_user_group_channels WHERE channel_type = 'video' AND channel_id = ?").run(providerId);
  db.prepare('DELETE FROM video_provider_configs WHERE id = ?').run(providerId);
  if (row.is_default) db.prepare('UPDATE video_provider_configs SET is_default = 1 WHERE id = (SELECT id FROM video_provider_configs WHERE enabled = 1 ORDER BY created_at ASC LIMIT 1)').run();
  return normalizeProviderRow(row, { includeSecret: false });
}
