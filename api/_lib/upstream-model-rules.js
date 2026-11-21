import { normalizeUpstreamImageCost } from '../../shared/image-pricing.js';
import { validateTextPrices } from '../../shared/upstream-pricing.js';

export function getModelRule(db, kind, model) {
  const row = db.prepare('SELECT * FROM upstream_model_rules WHERE kind = ? AND model = ?').get(kind, String(model || '').trim());
  if (!row) return null;
  return { ...JSON.parse(row.config_json), kind: row.kind, model: row.model, updatedAt: row.updated_at };
}

export function listModelRules(db) {
  return db.prepare('SELECT kind, model FROM upstream_model_rules ORDER BY kind, model').all()
    .map((row) => getModelRule(db, row.kind, row.model));
}

export function saveModelRule(db, values) {
  const model = String(values.model || '').trim();
  if (!['text', 'image'].includes(values.kind) || !model || model.length > 160) {
    throw Object.assign(new Error('INVALID_MODEL_RULE'), { code: 'INVALID_MODEL_RULE' });
  }
  const previous = getModelRule(db, values.kind, model);
  const config = { ...previous, ...values, model };
  if (config.kind === 'text') {
    config.pricing = validateTextPrices(config.pricing);
    config.magicEnabled = config.magicEnabled !== false;
    config.assistantEnabled = config.assistantEnabled !== false;
  } else {
    if (config.upstreamBaseUrl) {
      let url;
      try { url = new URL(config.upstreamBaseUrl); } catch { throw Object.assign(new Error('INVALID_UPSTREAM_URL'), { code: 'INVALID_UPSTREAM_URL' }); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw Object.assign(new Error('INVALID_UPSTREAM_URL'), { code: 'INVALID_UPSTREAM_URL' });
      }
      config.upstreamBaseUrl = url.href.replace(/\/+$/, '').replace(/\/v1$/i, '');
    }
    for (const key of ['imageTextInputRmb', 'imageInput', 'fixedPriceRmb', 'referenceTokenBudget']) {
      if (config[key] != null && (!Number.isFinite(Number(config[key])) || Number(config[key]) < 0)) {
        throw Object.assign(new Error('INVALID_MODEL_PRICE'), { code: 'INVALID_MODEL_PRICE' });
      }
    }
    if (config.pricing) config.pricing = validateTextPrices(config.pricing);
    config.referenceTokenBudget = Math.max(1, Math.min(1_000_000, Math.round(Number(config.referenceTokenBudget) || 4096)));
    const cost = config.imagePricingConfig || {};
    const valuesToCheck = [cost.fixedPriceRmb, cost.actualCostRatio, ...Object.values(cost.qualityPricesRmb || {}),
      ...Object.entries(cost.formula || {}).filter(([key]) => key !== 'qualityFactors').map(([, value]) => value),
      ...Object.values(cost.formula?.qualityFactors || {})].filter((value) => value != null);
    if (valuesToCheck.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      throw Object.assign(new Error('INVALID_MODEL_PRICE'), { code: 'INVALID_MODEL_PRICE' });
    }
    config.imagePricingConfig = normalizeUpstreamImageCost(cost, model);
    const inputPrice = Number(config.imageTextInputRmb ?? config.pricing?.input ?? 0);
    if (!Number.isFinite(inputPrice) || inputPrice < 0 || (config.includeImageText && inputPrice <= 0)) {
      throw Object.assign(new Error('INVALID_MODEL_PRICE'), { code: 'INVALID_MODEL_PRICE' });
    }
    config.imageTextInputRmb = inputPrice;
    // Migrate the legacy global checkbox once; new billing switches are per channel.
    if (Object.hasOwn(config, 'includeImageText')) {
      for (const row of db.prepare('SELECT id, pricing_config FROM image_provider_configs WHERE model = ?').all(model)) {
        const pricing = JSON.parse(row.pricing_config || '{}');
        if (!Object.hasOwn(pricing, 'chargeTextTokens')) {
          db.prepare('UPDATE image_provider_configs SET pricing_config = ? WHERE id = ?')
            .run(JSON.stringify({ ...pricing, chargeTextTokens: config.includeImageText === true, chargeReferenceTokens: false }), row.id);
        }
      }
      delete config.includeImageText;
    }
    if (config.pricingSchemaVersion === 2) {
      delete config.imagePricingConfig;
      delete config.providerId;
      if (config.unit !== 'image') delete config.fixedPriceRmb;
    }
  }
  delete config.updatedAt;
  db.prepare(`
    INSERT INTO upstream_model_rules (kind, model, config_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(kind, model) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at
  `).run(config.kind, model, JSON.stringify(config), new Date().toISOString());
  if (config.kind === 'text') {
    if (config.magicEnabled) {
      // A single system-selected model serves every Magic action. Keep the
      // persisted rules and channel flags in sync when administrators switch it.
      for (const row of db.prepare("SELECT model, config_json FROM upstream_model_rules WHERE kind = 'text' AND model != ?").all(model)) {
        const other = JSON.parse(row.config_json);
        if (other.magicEnabled !== false) {
          db.prepare("UPDATE upstream_model_rules SET config_json = ?, updated_at = ? WHERE kind = 'text' AND model = ?")
            .run(JSON.stringify({ ...other, magicEnabled: false }), new Date().toISOString(), row.model);
        }
      }
      db.prepare('UPDATE chat_provider_configs SET magic_enabled = 0 WHERE model != ?').run(model);
    }
    db.prepare('UPDATE chat_provider_configs SET magic_enabled = ?, assistant_enabled = ? WHERE model = ?')
      .run(config.magicEnabled ? 1 : 0, config.assistantEnabled ? 1 : 0, model);
  }
  return getModelRule(db, config.kind, model);
}

export function ensureTextModelRule(db, provider) {
  return getModelRule(db, 'text', provider.model) || saveModelRule(db, {
    kind: 'text', model: provider.model, pricing: provider.pricing,
    magicEnabled: provider.magicEnabled, assistantEnabled: provider.assistantEnabled,
    pricingSource: provider.pricingSource || 'manual',
    priceSyncedAt: provider.priceSyncedAt || '', exchangeRate: provider.exchangeRate || 7
  });
}
