import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'awesome-gpt-image-pricing-api-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.AI_API_KEY = 'pricing-api-test-key';
process.env.AI_IMAGE_MODEL = 'gpt-image-2';

const [{ default: pricingHandler }, localDb] = await Promise.all([
  import('../api/image-pricing.js'),
  import('../api/_lib/local-db.js')
]);

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

async function invoke(req) {
  let statusCode = 200;
  let payload;
  const headers = {};
  const res = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return value;
    }
  };
  await pricingHandler({ headers: {}, query: {}, ...req }, res);
  return { statusCode, payload, headers };
}

test('GET pricing defaults to 1024x1024 low and is marked as a server quote', async () => {
  const result = await invoke({ method: 'GET' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.pricing.size, '1024x1024');
  assert.equal(result.payload.pricing.quality, 'low');
  assert.equal(result.payload.pricing.credits, 20);
  assert.equal(result.payload.pricing.pricingStrategy, 'pixel-quality-formula');
  assert.equal(result.payload.pricing.source, 'server');
});

test('POST pricing returns a server quote for every requested image configuration', async () => {
  const result = await invoke({
    method: 'POST',
    body: {
      items: [
        { key: 'square', size: '1024x1024', quality: 'medium' },
        { key: 'wide', size: '1536x1024', quality: 'high' }
      ]
    }
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload.quotes.map((quote) => quote.key), ['square', 'wide']);
  assert.ok(result.payload.quotes.every((quote) => quote.pricing.source === 'server'));
  assert.ok(result.payload.quotes[1].pricing.credits > result.payload.quotes[0].pricing.credits);
});

test('auto size and quality are billed as 2048x2048 medium', async () => {
  const result = await invoke({ method: 'GET', query: { size: 'auto', quality: 'auto' } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.pricing.size, 'auto');
  assert.equal(result.payload.pricing.quality, 'auto');
  assert.equal(result.payload.pricing.billedPixels, 2048 * 2048);
  assert.equal(result.payload.pricing.billedQuality, 'medium');
  assert.equal(result.payload.pricing.credits, 80);
});

test('pricing quotes follow the selected provider rule', async () => {
  const provider = localDb.saveImageProviderConfig({
    name: 'Banana test',
    providerType: 'openai-compatible',
    baseUrl: 'https://images.example.com',
    apiKey: 'banana-test-key',
    model: 'banana-image',
    pricingStrategy: 'fixed-quality',
    pricingConfig: {
      strategy: 'fixed-quality',
      priceStepRmb: 0.1,
      minimumChargeRmb: 0.2,
      maximumChargeRmb: 10,
      qualityPricesRmb: { low: 0.4, medium: 0.8, high: 1.6 }
    },
    enabled: true,
    isDefault: false
  });
  const result = await invoke({ method: 'GET', query: { size: '2048x2048', quality: 'high', providerId: provider.id } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.pricing.providerId, provider.id);
  assert.equal(result.payload.pricing.providerName, 'Banana test');
  assert.equal(result.payload.pricing.pricingStrategy, 'fixed-quality');
  assert.equal(result.payload.pricing.credits, 160);
});

test('pricing does not require decrypting the provider API key', async () => {
  const originalSecret = process.env.PROVIDER_CONFIG_SECRET;
  process.env.PROVIDER_CONFIG_SECRET = 'pricing-encryption-key-a';
  const provider = localDb.saveImageProviderConfig({
    name: 'Pricing without secret access',
    providerType: 'openai-compatible',
    baseUrl: 'https://images.example.com',
    apiKey: 'encrypted-provider-key',
    model: 'banana-image',
    pricingStrategy: 'fixed-quality',
    pricingConfig: {
      strategy: 'fixed-quality',
      qualityPricesRmb: { low: 0.3, medium: 0.6, high: 1.2 }
    },
    enabled: true,
    isDefault: false
  });
  process.env.PROVIDER_CONFIG_SECRET = 'pricing-encryption-key-b';
  try {
    const result = await invoke({
      method: 'GET',
      query: { size: '1024x1024', quality: 'medium', providerId: provider.id }
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.pricing.providerId, provider.id);
    assert.equal(result.payload.pricing.credits, 60);
  } finally {
    if (originalSecret == null) delete process.env.PROVIDER_CONFIG_SECRET;
    else process.env.PROVIDER_CONFIG_SECRET = originalSecret;
  }
});

test('MAI provider quotes enforce the provider-specific canvas limits', async () => {
  const provider = localDb.saveImageProviderConfig({
    name: 'MAI pricing test',
    providerType: 'openai-compatible-multipart',
    baseUrl: 'https://images.example.com',
    apiKey: 'mai-pricing-test-key',
    model: 'MAI-Image-2.5',
    pricingStrategy: 'fixed-quality',
    pricingConfig: {
      strategy: 'fixed-quality',
      priceStepRmb: 0.1,
      minimumChargeRmb: 0.2,
      maximumChargeRmb: 10,
      qualityPricesRmb: { low: 0.4, medium: 0.8, high: 1.6 }
    },
    enabled: true,
    isDefault: false
  });
  const accepted = await invoke({
    method: 'GET',
    query: { size: '768x768', quality: 'medium', providerId: provider.id }
  });
  assert.equal(accepted.statusCode, 200);

  const tooLarge = await invoke({
    method: 'GET',
    query: { size: '2048x2048', quality: 'medium', providerId: provider.id }
  });
  assert.equal(tooLarge.statusCode, 400);
  assert.equal(tooLarge.payload.error, 'INVALID_SIZE');
  assert.equal(tooLarge.payload.reason, 'MAI_MAX_PIXELS');

  const auto = await invoke({
    method: 'GET',
    query: { size: 'auto', quality: 'medium', providerId: provider.id }
  });
  assert.equal(auto.statusCode, 400);
  assert.equal(auto.payload.reason, 'AUTO_SIZE_UNSUPPORTED');
});
