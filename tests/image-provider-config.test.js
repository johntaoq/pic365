import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-provider-config-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.PROVIDER_CONFIG_SECRET = 'provider-config-test-secret';

const db = await import('../api/_lib/local-db.js');

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('image provider keys are encrypted and named configs can be selected', () => {
  const saved = db.saveImageProviderConfig({
    name: 'Gemini Banana',
    providerType: 'openai-compatible',
    baseUrl: 'https://images.example.com',
    apiKey: 'secret-provider-key',
    model: 'banana-2-image',
    pricingStrategy: 'fixed-quality',
    pricingConfig: {
      strategy: 'fixed-quality',
      priceStepRmb: 0.1,
      minimumChargeRmb: 0.2,
      maximumChargeRmb: 20,
      qualityPricesRmb: { low: 0.4, medium: 0.8, high: 1.6 }
    },
    enabled: true,
    isDefault: true
  });
  assert.equal(saved.name, 'Gemini Banana');
  assert.notEqual(saved.apiKeyMasked, 'secret-provider-key');
  const raw = db.getDb().prepare('SELECT api_key_encrypted FROM image_provider_configs WHERE id = ?').get(saved.id);
  assert.ok(raw.api_key_encrypted.startsWith('v1.'));
  assert.equal(raw.api_key_encrypted.includes('secret-provider-key'), false);
  const selected = db.getImageProviderConfig(saved.id);
  assert.equal(selected.apiKey, 'secret-provider-key');
  assert.equal(selected.model, 'banana-2-image');
  assert.equal(selected.pricingStrategy, 'fixed-quality');
  assert.equal(selected.pricingConfig.qualityPricesRmb.high, 1.6);
  assert.equal(db.listImageProviderConfigs()[0].name, 'Gemini Banana');
});

test('blank key updates preserve the encrypted provider key', () => {
  const current = db.listImageProviderConfigs({ admin: true })[0];
  db.saveImageProviderConfig({ ...current, name: 'Gemini Banana Pro', apiKey: '' });
  assert.equal(db.getImageProviderConfig(current.id).apiKey, 'secret-provider-key');
});
