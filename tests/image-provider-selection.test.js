import assert from 'node:assert/strict';
import test from 'node:test';

import { orderImageProviders, resolveEcommerceProjectImageProviderId, resolveImageProviderId } from '../shared/image-provider-selection.js';

const providers = [
  { id: 'default-provider', isDefault: true },
  { id: 'second-provider', isDefault: false }
];

test('provider selection preserves a valid project provider', () => {
  assert.equal(resolveImageProviderId(providers, 'second-provider'), 'second-provider');
});

test('provider selection repairs empty or unavailable legacy project providers', () => {
  assert.equal(resolveImageProviderId(providers, ''), 'default-provider');
  assert.equal(resolveImageProviderId(providers, 'disabled-provider'), 'default-provider');
  assert.equal(resolveImageProviderId([], 'disabled-provider'), '');
});

test('a saved ecommerce project keeps its channel even when the channel disappears', () => {
  assert.equal(resolveEcommerceProjectImageProviderId(providers, 'deleted-provider'), 'deleted-provider');
  assert.equal(resolveEcommerceProjectImageProviderId([], 'second-provider'), 'second-provider');
  assert.equal(resolveEcommerceProjectImageProviderId(providers, 'second-provider'), 'second-provider');
  assert.equal(resolveEcommerceProjectImageProviderId(providers, ''), 'default-provider');
});

test('available providers follow the administrator order without moving the default service', () => {
  const unordered = [
    { id: 'banana-provider', isDefault: false, sortOrder: 2 },
    { id: 'default-provider', isDefault: true, sortOrder: 1 },
    { id: 'mai-provider', isDefault: false, sortOrder: 0 },
    { isDefault: false }
  ];
  assert.deepEqual(
    orderImageProviders(unordered).map((provider) => provider.id),
    ['mai-provider', 'default-provider', 'banana-provider']
  );
  assert.equal(resolveImageProviderId(unordered, ''), 'default-provider');
  assert.equal(resolveImageProviderId(unordered, 'mai-provider'), 'mai-provider');
});
