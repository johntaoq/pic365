import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const source = path.resolve(process.argv[2] || 'data/app.sqlite');
const target = path.resolve(process.argv[3] || 'data/backups/app.sqlite');
const escapedTarget = target.replaceAll("'", "''");
const database = new DatabaseSync(source);

try {
  database.exec(`VACUUM INTO '${escapedTarget}'`);
} finally {
  database.close();
}
