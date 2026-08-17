import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function configuredSecret() {
  const developmentFallback = process.env.NODE_ENV === 'production'
    ? ''
    : `pic365-local-provider-config:${process.env.APP_DB_PATH || 'data/app.sqlite'}`;
  const secret = String(process.env.PROVIDER_CONFIG_SECRET || process.env.SESSION_SECRET || developmentFallback).trim();
  if (!secret) throw new Error('PROVIDER_CONFIG_SECRET_REQUIRED');
  return secret;
}

function encryptionKey(secret = configuredSecret()) {
  return createHash('sha256').update(secret).digest();
}

function decryptionSecrets() {
  return [...new Set([
    configuredSecret(),
    ...String(process.env.PROVIDER_CONFIG_SECRET_PREVIOUS || '')
      .split(',')
      .map((secret) => secret.trim())
      .filter(Boolean)
  ])];
}

export function encryptProviderSecret(value) {
  const plainText = String(value || '');
  if (!plainText) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptProviderSecret(value) {
  const encryptedValue = String(value || '');
  if (!encryptedValue) return '';
  const [version, ivValue, tagValue, payloadValue] = encryptedValue.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !payloadValue) throw new Error('INVALID_PROVIDER_SECRET');
  let lastError;
  for (const secret of decryptionSecrets()) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivValue, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(payloadValue, 'base64url')), decipher.final()]).toString('utf8');
    } catch (error) {
      lastError = error;
    }
  }
  throw Object.assign(new Error('INVALID_PROVIDER_SECRET'), { cause: lastError });
}

export function maskProviderSecret(value) {
  const secret = String(value || '');
  if (!secret) return '';
  if (secret.length <= 8) return '•'.repeat(secret.length);
  return `${secret.slice(0, 3)}${'•'.repeat(8)}${secret.slice(-4)}`;
}
