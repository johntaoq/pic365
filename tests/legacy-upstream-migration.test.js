import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { migrateLegacyUpstreamModelRules } from '../api/_lib/legacy-upstream-migration.js';

function legacyDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, value_json TEXT, updated_by TEXT, updated_at TEXT);
    CREATE TABLE upstream_model_rules (kind TEXT, model TEXT, config_json TEXT, updated_at TEXT, PRIMARY KEY (kind, model));
    CREATE TABLE chat_provider_configs (
      id TEXT PRIMARY KEY, model TEXT, system_prompt TEXT, api_key_encrypted TEXT,
      enabled INTEGER, is_default INTEGER, created_at TEXT, base_url TEXT,
      input_price_microyuan INTEGER, output_price_microyuan INTEGER,
      cache_read_price_microyuan INTEGER, cache_write_price_microyuan INTEGER,
      exchange_rate_micros INTEGER, pricing_source TEXT, pricing_version TEXT,
      price_synced_at TEXT, magic_enabled INTEGER DEFAULT 1, assistant_enabled INTEGER DEFAULT 1
    );
    CREATE TABLE image_provider_configs (
      id TEXT PRIMARY KEY, model TEXT, base_url TEXT, enabled INTEGER,
      is_default INTEGER, sort_order INTEGER, created_at TEXT, pricing_config TEXT
    );
  `);
  const chat = db.prepare(`INSERT INTO chat_provider_configs
    (id, model, system_prompt, api_key_encrypted, enabled, is_default, created_at,
      base_url, input_price_microyuan, output_price_microyuan, cache_read_price_microyuan,
      cache_write_price_microyuan, exchange_rate_micros, pricing_source, pricing_version, price_synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'https://example.invalid', ?, ?, ?, ?, 7000000, 'synced', 'v1', '2026-09-23T00:00:00Z')`);
  chat.run('default', 'gpt-6-luna', 'Old system prompt', 'encrypted-secret', 1, 1,
    '2026-09-01', 1000000, 3500000, 70000, 875000);
  chat.run('duplicate', 'gpt-6-luna', 'Other prompt', 'encrypted-secret-2', 0, 0,
    '2026-09-02', 9000000, 9000000, 9000000, 9000000);
  chat.run('secondary', 'gpt-6-other', 'Secondary prompt', 'encrypted-secret-3', 1, 0,
    '2026-09-03', 2000000, 3000000, 100000, 800000);
  const image = db.prepare(`INSERT INTO image_provider_configs
    (id, model, base_url, enabled, is_default, sort_order, created_at, pricing_config)
    VALUES (?, ?, 'https://example.invalid/v1', 1, ?, ?, '2026-09-01', ?)`);
  image.run('retail-1', 'gpt-image-2', 1, 0, '{"fixedPriceRmb":0.2}');
  image.run('retail-2', 'gpt-image-2', 0, 1, '{"fixedPriceRmb":0.5}');
  image.run('flare', 'gpt-image-2.5-flare', 0, 2, '{"referenceImagePriceRmb":0.015}');
  return db;
}

test('legacy channels seed one rule per model and preserve distinct retail prices and prompts', () => {
  const db = legacyDb();
  try {
    const beforeImage = db.prepare('SELECT id, pricing_config FROM image_provider_configs ORDER BY id').all();
    const beforeText = db.prepare('SELECT id, input_price_microyuan, system_prompt, api_key_encrypted FROM chat_provider_configs ORDER BY id').all();
    migrateLegacyUpstreamModelRules(db);
    const rules = db.prepare('SELECT kind, model, config_json, updated_at FROM upstream_model_rules ORDER BY kind, model').all();
    assert.equal(rules.length, 4);
    const text = JSON.parse(rules.find((row) => row.kind === 'text' && row.model === 'gpt-6-luna').config_json);
    assert.deepEqual(text.pricing, { input: 1, output: 3.5, cacheRead: 0.07, cacheWrite: 0.875 });
    assert.equal(text.magicEnabled, true);
    assert.equal(text.assistantEnabled, true);
    assert.equal(text.pricingSource, 'synced');
    assert.ok(!JSON.stringify(rules).includes('encrypted-secret'));
    assert.equal(JSON.parse(rules.find((row) => row.model === 'gpt-6-other').config_json).magicEnabled, false);
    const flags = db.prepare('SELECT id, magic_enabled, assistant_enabled FROM chat_provider_configs ORDER BY id').all();
    assert.deepEqual(flags.map(({ magic_enabled }) => magic_enabled), [1, 1, 0]);
    const image = JSON.parse(rules.find((row) => row.kind === 'image' && row.model === 'gpt-image-2').config_json);
    assert.equal(image.pricingSource, 'unconfigured');
    assert.equal(image.pricing.input, 0);
    assert.equal(image.upstreamBaseUrl, 'https://example.invalid');
    assert.deepEqual(db.prepare('SELECT id, pricing_config FROM image_provider_configs ORDER BY id').all(), beforeImage);
    assert.deepEqual(db.prepare('SELECT id, input_price_microyuan, system_prompt, api_key_encrypted FROM chat_provider_configs ORDER BY id').all(), beforeText);
    assert.deepEqual(JSON.parse(db.prepare("SELECT value_json FROM app_settings WHERE setting_key = 'chat_assistant_settings'").get().value_json), {
      systemPrompt: 'Old system prompt', defaultProviderId: 'default'
    });
    migrateLegacyUpstreamModelRules(db);
    assert.deepEqual(db.prepare('SELECT kind, model, config_json, updated_at FROM upstream_model_rules ORDER BY kind, model').all(), rules);
  } finally {
    db.close();
  }
});

test('migration never replaces an existing upstream rule or assistant setting', () => {
  const db = legacyDb();
  try {
    const custom = JSON.stringify({ kind: 'text', model: 'gpt-6-luna', pricing: {
      input: 7, output: 8, cacheRead: 1, cacheWrite: 2
    }, magicEnabled: false, assistantEnabled: true });
    db.prepare('INSERT INTO upstream_model_rules VALUES (?, ?, ?, ?)').run('text', 'gpt-6-luna', custom, 'older');
    db.prepare('INSERT INTO app_settings VALUES (?, ?, NULL, ?)').run(
      'chat_assistant_settings', '{"systemPrompt":"Custom prompt","defaultProviderId":"secondary"}', 'older');
    migrateLegacyUpstreamModelRules(db);
    assert.equal(db.prepare("SELECT config_json FROM upstream_model_rules WHERE kind='text' AND model='gpt-6-luna'").get().config_json, custom);
    assert.equal(JSON.parse(db.prepare("SELECT value_json FROM app_settings WHERE setting_key='chat_assistant_settings'").get().value_json).systemPrompt, 'Custom prompt');
    assert.equal(db.prepare("SELECT magic_enabled FROM chat_provider_configs WHERE id='default'").get().magic_enabled, 0);
  } finally {
    db.close();
  }
});
