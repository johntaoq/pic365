import assert from 'node:assert/strict';
import test from 'node:test';

process.env.PROVIDER_CONFIG_SECRET = 'old-provider-secret';
delete process.env.PROVIDER_CONFIG_SECRET_PREVIOUS;

const secrets = await import('../api/_lib/provider-secrets.js');

test('provider secrets decrypt with a previous key and re-encrypt with the current key', () => {
  const oldCiphertext = secrets.encryptProviderSecret('sk-provider-private');
  process.env.PROVIDER_CONFIG_SECRET = 'new-provider-secret';
  process.env.PROVIDER_CONFIG_SECRET_PREVIOUS = 'old-provider-secret';
  assert.equal(secrets.decryptProviderSecret(oldCiphertext), 'sk-provider-private');

  const newCiphertext = secrets.encryptProviderSecret(secrets.decryptProviderSecret(oldCiphertext));
  process.env.PROVIDER_CONFIG_SECRET_PREVIOUS = '';
  assert.equal(secrets.decryptProviderSecret(newCiphertext), 'sk-provider-private');
  assert.throws(() => secrets.decryptProviderSecret(oldCiphertext), /INVALID_PROVIDER_SECRET/);
  assert.equal(secrets.maskProviderSecret('sk-provider-private').includes('provider-private'), false);
});
