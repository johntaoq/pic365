import assert from 'node:assert/strict';
import test from 'node:test';

import { orderImageProviders, resolveImageProviderId } from '../shared/image-provider-selection.js';

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

test('available providers are stably ordered with the default provider first', () => {
  const unordered = [
    { id: 'banana-provider', isDefault: false },
    { id: 'default-provider', isDefault: true },
    { id: 'mai-provider', isDefault: false },
    { isDefault: false }
  ];
  assert.deepEqual(
    orderImageProviders(unordered).map((provider) => provider.id),
    ['default-provider', 'banana-provider', 'mai-provider']
  );
  assert.equal(resolveImageProviderId(unordered, ''), 'default-provider');
  assert.equal(resolveImageProviderId(unordered, 'mai-provider'), 'mai-provider');
});
