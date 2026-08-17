import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveImageProviderId } from '../shared/image-provider-selection.js';

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
