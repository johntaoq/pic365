import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

import { decryptProviderSecret, encryptProviderSecret } from '../api/_lib/provider-secrets.js';

if (!process.env.PROVIDER_CONFIG_SECRET) {
  throw new Error('Set PROVIDER_CONFIG_SECRET to the new secret before running this script.');
}
if (!process.env.PROVIDER_CONFIG_SECRET_PREVIOUS) {
  throw new Error('Set PROVIDER_CONFIG_SECRET_PREVIOUS to the old secret before running this script.');
}

const databasePath = path.resolve(process.env.APP_DB_PATH || path.join(process.cwd(), 'data', 'app.sqlite'));
const db = new DatabaseSync(databasePath);
db.exec('BEGIN IMMEDIATE');
try {
  const rows = db.prepare('SELECT id, api_key_encrypted FROM image_provider_configs').all();
  const update = db.prepare('UPDATE image_provider_configs SET api_key_encrypted = ?, updated_at = ? WHERE id = ?');
  const updatedAt = new Date().toISOString();
  for (const row of rows) {
    const plainText = decryptProviderSecret(row.api_key_encrypted);
    update.run(encryptProviderSecret(plainText), updatedAt, row.id);
  }
  db.exec('COMMIT');
  console.log(`Re-encrypted ${rows.length} provider configuration(s).`);
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}
