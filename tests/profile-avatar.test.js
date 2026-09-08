import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { sanitizeAvatarUrl } from '../api/me.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the account picker ships thirty distinct animal avatars', () => {
  const avatarDir = path.join(root, 'data', 'images', 'avatars', 'animals');
  const files = fs.readdirSync(avatarDir).filter((file) => file.endsWith('.svg'));
  assert.equal(files.length, 30);
  assert.equal(new Set(files).size, 30);
});

test('profile avatar validation accepts presets and compressed custom images', () => {
  assert.equal(
    sanitizeAvatarUrl('/images/avatars/animals/fox.svg'),
    '/images/avatars/animals/fox.svg'
  );
  assert.equal(
    sanitizeAvatarUrl('data:image/webp;base64,YXZhdGFy'),
    'data:image/webp;base64,YXZhdGFy'
  );
  assert.throws(() => sanitizeAvatarUrl('javascript:alert(1)'), /INVALID_AVATAR/);
  assert.throws(() => sanitizeAvatarUrl('/images/avatars/animals/../secret.svg'), /INVALID_AVATAR/);
});
