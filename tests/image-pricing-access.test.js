import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('image pricing is unavailable before profile load and for both external wallet sources', async (t) => {
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, watch: null, ws: false }
  });
  t.after(() => server.close());
  const {
    ImagePricingProvider, useImagePricingAccess, useServerImagePricing, useServerImagePricingBatch
  } = await server.ssrLoadModule('/src/image-pricing-client.jsx');

  const item = { key: 'slot', providerId: 'test-model', size: '1024x1024' };
  const requests = [];
  const price = { source: 'server', credits: 2 };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([url, options.method]);
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      ok: true,
      ...(body.items ? { quotes: body.items.map(({ key }) => ({ key, pricing: price })) } : { pricing: price })
    }));
  });

  function renderPricing(profile) {
    let result;
    function Probe() {
      result = {
        access: useImagePricingAccess(),
        single: useServerImagePricing(item),
        batch: useServerImagePricingBatch([item])
      };
      return null;
    }
    renderToStaticMarkup(createElement(ImagePricingProvider, { profile }, createElement(Probe)));
    return result;
  }

  for (const [profile, skip] of [
    [null, false],
    [{ externalWallet: { source: 'azure16', label: '99Off' } }, true],
    [{ externalWallet: { source: 'azure40', label: 'UniKeyX' } }, true]
  ]) {
    const { access, single, batch } = renderPricing(profile);
    assert.equal(access.skipImagePricing, skip);
    assert.equal(access.showImagePricing, false);
    assert.deepEqual(single, { pricing: null, loading: false, error: '' });
    assert.deepEqual(batch, { pricingByKey: {}, loading: false, error: '' });
    await assert.rejects(access.requestImagePricing(item), /PRICING_LOAD_FAILED/);
    await assert.rejects(access.requestImagePricingBatch([item]), /PRICING_LOAD_FAILED/);
    assert.deepEqual(requests, []);
  }

  const { access, single, batch } = renderPricing({ externalWallet: null, creditBalance: 20 });
  assert.equal(access.skipImagePricing, false);
  assert.equal(access.showImagePricing, true);
  assert.equal(single.loading, true);
  assert.equal(batch.loading, true);
  assert.deepEqual(await access.requestImagePricing(item), price);
  assert.deepEqual(await access.requestImagePricingBatch([item]), [{ key: item.key, pricing: price }]);
  assert.deepEqual(requests, [['/api/image-pricing', 'POST']]);
});

test('recent quotes are reused only for matching inputs in the same account and before a promotion boundary', async (t) => {
  const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, ws: false } });
  t.after(() => server.close());
  const { ImagePricingProvider, useImagePricingAccess } = await server.ssrLoadModule('/src/image-pricing-client.jsx');
  function getClient(id) {
    let client;
    function Probe() { client = useImagePricingAccess(); return null; }
    renderToStaticMarkup(createElement(ImagePricingProvider, { profile: { id } }, createElement(Probe)));
    return client;
  }
  const first = getClient('first');
  const second = getClient('second');
  const sent = [];
  let now = Date.parse('2026-11-21T10:00:00Z');
  const promotion = { enabled: true, updatedAt: new Date(now).toISOString(), endsAt: new Date(now + 1000).toISOString() };
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (url, { body }) => {
    assert.equal(url, '/api/image-pricing');
    const parsed = JSON.parse(body);
    sent.push(parsed);
    const quotes = (parsed.items || [parsed]).map((item) => ({
      key: item.key, pricing: { source: 'server', chargeTextTokens: item.providerId !== 'fixed', credits: 3 }
    }));
    return new Response(JSON.stringify({ ok: true, quotes, promotion, serverNow: new Date(now).toISOString() }));
  });
  const fixed = { providerId: 'fixed', size: '1024x1024', chargeTextTokens: false, prompt: 'text A' };
  const metered = { ...fixed, providerId: 'metered', chargeTextTokens: true };
  await first.requestImagePricing(fixed);
  await first.requestImagePricing({ ...fixed, prompt: 'text B' });
  assert.equal(sent.length, 1);
  // A stale provider hint cannot cause two different prompts to share a price.
  await first.requestImagePricing({ ...metered, chargeTextTokens: false });
  await first.requestImagePricing({ ...metered, chargeTextTokens: false, prompt: 'text B' });
  assert.equal(sent.length, 3);
  assert.equal(sent.at(-1).prompt, 'text B');
  const project = { ...metered, projectId: 'project', projectRevision: 'rev1', slotId: 'hero', key: 'hero' };
  await first.requestImagePricingBatch([project, { ...project, slotId: 'detail', key: 'detail' }]);
  const [cached] = await first.requestImagePricingBatch([project]);
  assert.equal(cached.key, 'hero');
  assert.equal(sent.length, 4);
  await first.requestImagePricing({ ...project, projectRevision: 'rev2' });
  assert.equal(sent.length, 5);
  await first.requestImagePricing({ ...fixed, referenceCount: 1 });
  assert.equal(sent.length, 6);
  await second.requestImagePricing(fixed);
  assert.equal(sent.length, 7);
  now += 1000;
  await first.requestImagePricing(fixed);
  assert.equal(sent.length, 8);
  now += 30_001;
  await first.requestImagePricing(fixed);
  assert.equal(sent.length, 9);
});
