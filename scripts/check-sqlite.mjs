import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = path.resolve(process.argv[2] || 'data/app.sqlite');
const database = new DatabaseSync(databasePath, { readOnly: true });

try {
  const quickCheck = database.prepare('PRAGMA quick_check').all();
  const result = quickCheck.map((row) => Object.values(row)[0]);
  process.stdout.write(`${JSON.stringify({ databasePath, quickCheck: result })}\n`);
  if (result.length !== 1 || result[0] !== 'ok') process.exitCode = 1;
} finally {
  database.close();
}
