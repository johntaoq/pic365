import path from 'node:path';
import { pathToFileURL } from 'node:url';

const apply = process.argv.includes('--apply');
const concurrency = Math.max(1, Math.min(8, Number(process.env.ASSET_SIZE_AUDIT_CONCURRENCY || 4)));
const appRoot = process.env.PIC365_APP_ROOT || process.cwd();
const moduleUrl = (relativePath) => pathToFileURL(path.join(appRoot, relativePath)).href;

const [{ getDb }, { getStoredFileInfo }] = await Promise.all([
  import(moduleUrl('api/_lib/local-db.js')),
  import(moduleUrl('api/_lib/storage.js'))
]);

const db = getDb();
const rows = db.prepare(`
  SELECT
    asset.id,
    asset.media_type,
    asset.original_storage_path,
    asset.file_size,
    asset.mime_type,
    original.file_size AS variant_file_size
  FROM assets asset
  LEFT JOIN asset_variants original
    ON original.asset_id = asset.id AND original.variant_type = 'original'
  ORDER BY asset.id
`).all();

const comparable = rows.filter((row) => String(row.original_storage_path || '').trim());
const totals = {
  image: 0,
  video: 0,
  audio: 0,
  other: 0
};
const mismatches = [];
const missing = [];
const errors = [];
let cursor = 0;

const workers = Array.from({ length: Math.min(concurrency, Math.max(1, comparable.length)) }, async () => {
  while (cursor < comparable.length) {
    const row = comparable[cursor];
    cursor += 1;
    try {
      const info = await getStoredFileInfo(row.original_storage_path);
      const actualBytes = Math.max(0, Number(info?.byteLength || 0));
      const mediaType = Object.hasOwn(totals, row.media_type) ? row.media_type : 'other';
      totals[mediaType] += actualBytes;
      const assetBytes = Math.max(0, Number(row.file_size || 0));
      const variantBytes = row.variant_file_size == null ? null : Math.max(0, Number(row.variant_file_size || 0));
      if (actualBytes !== assetBytes || (variantBytes != null && actualBytes !== variantBytes)) {
        mismatches.push({
          id: row.id,
          actualBytes,
          assetBytes,
          variantBytes,
          contentType: info?.contentType || row.mime_type || 'application/octet-stream'
        });
      }
    } catch (error) {
      const status = Number(error?.statusCode || error?.status || 0);
      const entry = { id: row.id, code: String(error?.code || error?.name || 'STORAGE_READ_FAILED'), status };
      if (status === 404 || entry.code === 'BlobNotFound' || entry.code === 'ENOENT') missing.push(entry);
      else errors.push(entry);
    }
  }
});

await Promise.all(workers);

let repairedCount = 0;
if (apply && mismatches.length) {
  const updateAsset = db.prepare(`
    UPDATE assets
    SET file_size = ?, mime_type = ?, updated_at = ?
    WHERE id = ?
  `);
  const updateVariant = db.prepare(`
    UPDATE asset_variants
    SET file_size = ?, mime_type = ?, updated_at = ?
    WHERE asset_id = ? AND variant_type = 'original'
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    const timestamp = new Date().toISOString();
    for (const entry of mismatches) {
      updateAsset.run(entry.actualBytes, entry.contentType, timestamp, entry.id);
      updateVariant.run(entry.actualBytes, entry.contentType, timestamp, entry.id);
      repairedCount += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const databaseTotals = db.prepare(`
  SELECT
    COUNT(*) AS total_count,
    COALESCE(SUM(file_size), 0) AS total_bytes,
    COALESCE(SUM(CASE WHEN media_type = 'image' THEN file_size ELSE 0 END), 0) AS image_bytes,
    COALESCE(SUM(CASE WHEN media_type = 'video' THEN file_size ELSE 0 END), 0) AS video_bytes,
    COALESCE(SUM(CASE WHEN media_type = 'audio' THEN file_size ELSE 0 END), 0) AS audio_bytes
  FROM assets
`).get();

const actualTotalBytes = Object.values(totals).reduce((sum, value) => sum + value, 0);
const report = {
  apply,
  records: rows.length,
  comparableRecords: comparable.length,
  withoutStoragePath: rows.length - comparable.length,
  checked: comparable.length - missing.length - errors.length,
  mismatchCount: mismatches.length,
  repairedCount,
  missingCount: missing.length,
  errorCount: errors.length,
  actualBytes: {
    total: actualTotalBytes,
    ...totals
  },
  databaseBytes: {
    total: Number(databaseTotals.total_bytes || 0),
    image: Number(databaseTotals.image_bytes || 0),
    video: Number(databaseTotals.video_bytes || 0),
    audio: Number(databaseTotals.audio_bytes || 0)
  },
  databaseMatchesStorage: missing.length === 0
    && errors.length === 0
    && Number(databaseTotals.total_bytes || 0) === actualTotalBytes
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (missing.length || errors.length || (!apply && mismatches.length)) process.exitCode = 2;
