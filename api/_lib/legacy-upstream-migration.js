import { priceMicrosToRmb } from '../../shared/chat-billing.js';

const MIGRATION_KEY = 'migration:legacy-upstream-model-rules:v1';
const ASSISTANT_SETTINGS_KEY = 'chat_assistant_settings';
const EMPTY_PRICING = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

// The channel tables remain the source of credentials and downstream selling
// prices. Only model-level upstream metadata is copied into the new table.
export function migrateLegacyUpstreamModelRules(db) {
  if (db.prepare('SELECT 1 FROM app_settings WHERE setting_key = ?').get(MIGRATION_KEY)) return;

  const createdAt = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const textChannels = db.prepare(`
      SELECT id, model, system_prompt, api_key_encrypted, enabled, is_default,
        base_url, input_price_microyuan, output_price_microyuan,
        cache_read_price_microyuan, cache_write_price_microyuan,
        exchange_rate_micros, pricing_source, pricing_version, price_synced_at
      FROM chat_provider_configs
      ORDER BY enabled DESC, is_default DESC, created_at ASC, id ASC
    `).all();
    const textModels = new Set();
    const chosenMagicModel = textChannels.find((channel) => channel.enabled && channel.api_key_encrypted && channel.model?.trim())?.model
      || textChannels.find((channel) => channel.model?.trim())?.model || '';
    const insert = db.prepare(`
      INSERT OR IGNORE INTO upstream_model_rules (kind, model, config_json, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const channel of textChannels) {
      const model = String(channel.model || '').trim();
      if (!model || textModels.has(model)) continue;
      textModels.add(model);
      insert.run('text', model, JSON.stringify({
        kind: 'text', model,
        pricing: {
          input: priceMicrosToRmb(channel.input_price_microyuan),
          output: priceMicrosToRmb(channel.output_price_microyuan),
          cacheRead: priceMicrosToRmb(channel.cache_read_price_microyuan),
          cacheWrite: priceMicrosToRmb(channel.cache_write_price_microyuan)
        },
        magicEnabled: model === chosenMagicModel,
        assistantEnabled: true,
        pricingSource: channel.pricing_source || 'manual',
        pricingVersion: channel.pricing_version || '',
        priceSyncedAt: channel.price_synced_at || '',
        exchangeRate: priceMicrosToRmb(channel.exchange_rate_micros) || 7
      }), createdAt);
    }
    if (chosenMagicModel) {
      // These columns were just added for legacy databases. Preserve any
      // already-configured rule instead of overwriting its choices.
      for (const channel of textChannels) {
        const rule = db.prepare("SELECT config_json FROM upstream_model_rules WHERE kind = 'text' AND model = ?")
          .get(channel.model);
        if (!rule) continue;
        const config = JSON.parse(rule.config_json);
        db.prepare('UPDATE chat_provider_configs SET magic_enabled = ?, assistant_enabled = ? WHERE id = ?')
          .run(config.magicEnabled === false ? 0 : 1, config.assistantEnabled === false ? 0 : 1, channel.id);
      }
    }

    const imageChannels = db.prepare(`
      SELECT model, base_url
      FROM image_provider_configs
      ORDER BY enabled DESC, is_default DESC, sort_order ASC, created_at ASC, id ASC
    `).all();
    const imageModels = new Set();
    for (const channel of imageChannels) {
      const model = String(channel.model || '').trim();
      if (!model || imageModels.has(model)) continue;
      imageModels.add(model);
      insert.run('image', model, JSON.stringify({
        kind: 'image', model,
        upstreamBaseUrl: String(channel.base_url || '').replace(/\/+$/, '').replace(/\/v1$/i, ''),
        pricingSchemaVersion: 2,
        unit: 'tokens',
        pricing: EMPTY_PRICING,
        imageTextInputRmb: 0,
        imageInput: 0,
        referenceTokenBudget: 4096,
        exchangeRate: 7,
        pricingSource: 'unconfigured'
      }), createdAt);
    }

    if (textChannels.length) {
      const assistant = textChannels.find((channel) => channel.enabled && channel.api_key_encrypted)
        || textChannels[0];
      // A blank legacy prompt should still use the built-in default.
      if (assistant.system_prompt?.trim()) {
        db.prepare(`
          INSERT OR IGNORE INTO app_settings (setting_key, value_json, updated_by, updated_at)
          VALUES (?, ?, NULL, ?)
        `).run(ASSISTANT_SETTINGS_KEY, JSON.stringify({
          systemPrompt: assistant.system_prompt,
          defaultProviderId: assistant.enabled && assistant.api_key_encrypted ? assistant.id : ''
        }), createdAt);
      }
    }
    db.prepare(`
      INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
      VALUES (?, ?, NULL, ?)
    `).run(MIGRATION_KEY, JSON.stringify({ completed: true, textModels: textModels.size, imageModels: imageModels.size }), createdAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
