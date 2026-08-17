import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-storage-range-'));
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const storage = await import('../api/_lib/storage.js');
const { parseByteRange } = await import('../api/assets/file.js');

after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }));

test('local storage reads only the requested byte range and exposes stream metadata', async () => {
  const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz', 'utf8');
  await storage.persistStoredImage({ storagePath: 'ranges/sample.bin', bytes, contentType: 'application/octet-stream' });
  const info = await storage.getStoredFileInfo('ranges/sample.bin');
  assert.equal(info.byteLength, bytes.length);
  const range = await storage.readStoredFileRange('ranges/sample.bin', { offset: 10, count: 8 });
  assert.equal(range.toString('utf8'), 'abcdefgh');
  const stream = await storage.openStoredFileStream('ranges/sample.bin', { offset: 2, count: 4 });
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  assert.equal(Buffer.concat(chunks).toString('utf8'), '2345');
});

test('HTTP byte ranges handle suffixes and reject unsatisfiable positions', () => {
  assert.deepEqual(parseByteRange('bytes=5-9', 20), { start: 5, end: 9 });
  assert.deepEqual(parseByteRange('bytes=8-', 20), { start: 8, end: 19 });
  assert.deepEqual(parseByteRange('bytes=-5', 20), { start: 15, end: 19 });
  assert.deepEqual(parseByteRange('bytes=30-', 20), { invalid: true });
  assert.deepEqual(parseByteRange('bytes=9-4', 20), { invalid: true });
});
