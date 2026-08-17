import { createHash, randomUUID } from 'node:crypto';
import {
  createEcommerceProjectAsset,
  ensureEcommerceProjectMasterAsset,
  getDb,
  getEcommerceProject,
  getUserByEmail,
  listEcommerceProjectAssets
} from './local-db.js';
import { processMediaAsset } from './media-processor.js';
import {
  deleteStoredFile,
  persistMediaAsset,
  persistStoredImage,
  readStoredFile
} from './storage.js';

export const MEDIA_TYPES = new Set(['image', 'video', 'audio']);
export const ASSET_SOURCE_TYPES = new Set(['upload', 'generated', 'imported']);
export const ASSET_VISIBILITIES = new Set(['private', 'team', 'public']);
const ECOMMERCE_ASSET_TYPES = new Set(['product', 'packaging', 'logo', 'reference']);
const MAX_ECOMMERCE_PROJECT_ASSETS = 30;

const ALLOWED_MIME_TYPES = new Map([
  ['image/jpeg', 'image'],
  ['image/png', 'image'],
  ['image/webp', 'image'],
  ['image/gif', 'image'],
  ['video/mp4', 'video'],
  ['video/webm', 'video'],
  ['video/quicktime', 'video'],
  ['audio/mpeg', 'audio'],
  ['audio/mp3', 'audio'],
  ['audio/wav', 'audio'],
  ['audio/x-wav', 'audio'],
  ['audio/mp4', 'audio'],
  ['audio/x-m4a', 'audio'],
  ['audio/ogg', 'audio']
]);

const MAX_BYTES = {
  image: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 40 * 1024 * 1024
};

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function cleanName(value, fallback = 'Untitled asset') {
  const result = String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 180);
  return result || fallback;
}

function cleanTag(value) {
  return String(value || '').replace(/[\u0000-\u001f,]/g, '').trim().slice(0, 40);
}

function variantExtension(variant) {
  if (variant.extension) return variant.extension;
  if (variant.mimeType === 'image/webp') return 'webp';
  if (variant.mimeType === 'video/mp4') return 'mp4';
  if (variant.mimeType === 'audio/mpeg') return 'mp3';
  if (variant.mimeType === 'application/json') return 'json';
  return 'bin';
}

function normalizeVariant(row) {
  return {
    id: row.id,
    type: row.variant_type,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    durationMs: Number(row.duration_ms || 0),
    status: row.status || 'ready'
  };
}

function assetFileUrl(assetId, variant = 'original', download = false) {
  const params = new URLSearchParams({ id: assetId, variant });
  if (download) params.set('download', '1');
  return `/api/assets/file?${params.toString()}`;
}

function normalizeAsset(row, { tags = [], variants = [], isSuperAdmin = false } = {}) {
  if (!row) return null;
  const metadata = parseJson(row.metadata_json, {});
  const systemPrompt = Boolean(metadata.projectId && row.source_type === 'generated');
  const variantMap = Object.fromEntries(variants.map((variant) => [variant.type, variant]));
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name || '',
    collectionId: row.collection_id || '',
    collectionName: row.collection_name || '',
    collectionType: row.collection_type || '',
    name: row.name || '',
    mediaType: row.media_type,
    sourceType: row.source_type,
    status: row.status,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    durationMs: Number(row.duration_ms || 0),
    checksum: row.checksum || '',
    prompt: systemPrompt && !isSuperAdmin ? '' : (row.prompt || ''),
    promptHidden: systemPrompt && !isSuperAdmin,
    favorite: Boolean(row.favorite),
    visibility: row.visibility || 'private',
    sourceTable: row.source_table || '',
    sourceId: row.source_id || '',
    metadata,
    tags,
    variants,
    shared: row.owner_user_id !== row.requesting_user_id,
    deletedAt: row.deleted_at || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    originalUrl: assetFileUrl(row.id, 'original'),
    downloadUrl: assetFileUrl(row.id, 'original', true),
    thumbnailUrl: assetFileUrl(row.id, variantMap.thumbnail ? 'thumbnail' : (variantMap.poster ? 'poster' : 'original')),
    previewUrl: assetFileUrl(row.id, variantMap.preview ? 'preview' : 'original'),
    posterUrl: variantMap.poster ? assetFileUrl(row.id, 'poster') : '',
    waveformUrl: variantMap.waveform ? assetFileUrl(row.id, 'waveform') : ''
  };
}

function accessibleAssetSql(alias = 'a') {
  return `(
    ${alias}.owner_user_id = @user_id
    OR EXISTS (
      SELECT 1 FROM asset_permissions permission
      WHERE permission.asset_id = ${alias}.id
        AND permission.principal_type = 'user'
        AND permission.principal_id = @user_id
    )
    OR EXISTS (
      SELECT 1
      FROM asset_permissions permission
      JOIN team_members member ON member.team_id = permission.principal_id
      WHERE permission.asset_id = ${alias}.id
        AND permission.principal_type = 'team'
        AND member.user_id = @user_id
    )
  )`;
}

function canEditAsset(db, userId, assetId) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM assets asset
    WHERE asset.id = @asset_id AND (
      asset.owner_user_id = @user_id
      OR EXISTS (
        SELECT 1 FROM asset_permissions permission
        WHERE permission.asset_id = asset.id
          AND permission.principal_type = 'user'
          AND permission.principal_id = @user_id
          AND permission.permission = 'edit'
      )
      OR EXISTS (
        SELECT 1
        FROM asset_permissions permission
        JOIN team_members member ON member.team_id = permission.principal_id
        WHERE permission.asset_id = asset.id
          AND permission.principal_type = 'team'
          AND permission.permission = 'edit'
          AND member.user_id = @user_id
          AND member.role IN ('owner', 'editor')
      )
    )
  `).get({ user_id: userId, asset_id: assetId }));
}

function listTagsAndVariants(db, assetIds) {
  if (!assetIds.length) return { tagsByAsset: new Map(), variantsByAsset: new Map() };
  const placeholders = assetIds.map(() => '?').join(',');
  const tagsByAsset = new Map();
  for (const row of db.prepare(`SELECT asset_id, tag FROM asset_tags WHERE asset_id IN (${placeholders}) ORDER BY tag`).all(...assetIds)) {
    const values = tagsByAsset.get(row.asset_id) || [];
    values.push(row.tag);
    tagsByAsset.set(row.asset_id, values);
  }
  const variantsByAsset = new Map();
  for (const row of db.prepare(`SELECT * FROM asset_variants WHERE asset_id IN (${placeholders}) ORDER BY created_at ASC`).all(...assetIds)) {
    const values = variantsByAsset.get(row.asset_id) || [];
    values.push(normalizeVariant(row));
    variantsByAsset.set(row.asset_id, values);
  }
  return { tagsByAsset, variantsByAsset };
}

export function getAccessibleAsset(userId, assetId, { includeDeleted = true, isSuperAdmin = false } = {}) {
  const db = getDb();
  const row = db.prepare(`
    SELECT a.*, owner.full_name AS owner_name, collection.name AS collection_name,
      collection.collection_type, @user_id AS requesting_user_id
    FROM assets a
    JOIN users owner ON owner.id = a.owner_user_id
    LEFT JOIN asset_collections collection ON collection.id = a.collection_id
    WHERE a.id = @asset_id AND ${accessibleAssetSql('a')}
      ${includeDeleted ? '' : 'AND a.deleted_at IS NULL'}
  `).get({ user_id: userId, asset_id: assetId });
  if (!row) return null;
  const { tagsByAsset, variantsByAsset } = listTagsAndVariants(db, [row.id]);
  return normalizeAsset(row, {
    tags: tagsByAsset.get(row.id) || [],
    variants: variantsByAsset.get(row.id) || [],
    isSuperAdmin
  });
}

export function listAssets(userId, options = {}) {
  const db = getDb();
  const limit = Math.max(1, Math.min(Number(options.limit) || 48, 100));
  const offset = Math.max(0, Number(options.offset) || 0);
  const params = {
    user_id: userId,
    limit: limit + 1,
    offset,
    query: `%${String(options.query || '').trim().toLowerCase()}%`,
    media_type: MEDIA_TYPES.has(options.mediaType) ? options.mediaType : '',
    source_type: ASSET_SOURCE_TYPES.has(options.sourceType) ? options.sourceType : '',
    collection_id: String(options.collectionId || ''),
    team_id: String(options.teamId || ''),
    collection_type: String(options.collectionType || '') === 'brand' ? 'brand' : '',
    tag: cleanTag(options.tag || ''),
    favorite: options.favorite ? 1 : 0,
    shared: options.shared ? 1 : 0,
    project: options.project ? 1 : 0
  };
  const where = [accessibleAssetSql('a')];
  if (options.deleted) where.push('a.deleted_at IS NOT NULL');
  else where.push('a.deleted_at IS NULL');
  where.push('(@media_type = \'\' OR a.media_type = @media_type)');
  where.push('(@source_type = \'\' OR a.source_type = @source_type)');
  where.push('(@favorite = 0 OR a.favorite = 1)');
  where.push('(@shared = 0 OR a.owner_user_id != @user_id)');
  where.push('(@project = 0 OR EXISTS (SELECT 1 FROM asset_project_links project_link WHERE project_link.asset_id = a.id))');
  where.push('(@collection_id = \'\' OR a.collection_id = @collection_id)');
  where.push(`(@team_id = '' OR EXISTS (
    SELECT 1
    FROM asset_permissions selected_team_permission
    JOIN team_members selected_team_member
      ON selected_team_member.team_id = selected_team_permission.principal_id
    WHERE selected_team_permission.asset_id = a.id
      AND selected_team_permission.principal_type = 'team'
      AND selected_team_permission.principal_id = @team_id
      AND selected_team_member.user_id = @user_id
  ))`);
  where.push('(@collection_type = \'\' OR collection.collection_type = @collection_type)');
  where.push('(@tag = \'\' OR EXISTS (SELECT 1 FROM asset_tags filter_tag WHERE filter_tag.asset_id = a.id AND filter_tag.tag = @tag))');
  where.push(`(@query = '%%' OR LOWER(a.name) LIKE @query OR LOWER(a.prompt) LIKE @query OR EXISTS (
      SELECT 1 FROM asset_tags search_tag WHERE search_tag.asset_id = a.id AND LOWER(search_tag.tag) LIKE @query
    ))`);
  const rows = db.prepare(`
    SELECT a.*, owner.full_name AS owner_name, collection.name AS collection_name,
      collection.collection_type, @user_id AS requesting_user_id
    FROM assets a
    JOIN users owner ON owner.id = a.owner_user_id
    LEFT JOIN asset_collections collection ON collection.id = a.collection_id
    WHERE ${where.join(' AND ')}
    ORDER BY a.favorite DESC, a.created_at DESC, a.id DESC
    LIMIT @limit OFFSET @offset
  `).all(params);
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const { tagsByAsset, variantsByAsset } = listTagsAndVariants(db, pageRows.map((row) => row.id));
  return {
    assets: pageRows.map((row) => normalizeAsset(row, {
      tags: tagsByAsset.get(row.id) || [],
      variants: variantsByAsset.get(row.id) || [],
      isSuperAdmin: Boolean(options.isSuperAdmin)
    })),
    hasMore,
    nextOffset: offset + pageRows.length
  };
}

export function getAssetStats(userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total_count,
      COALESCE(SUM(file_size), 0) AS total_bytes,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL THEN file_size ELSE 0 END), 0) AS active_bytes,
      COALESCE(SUM(CASE WHEN deleted_at IS NOT NULL THEN file_size ELSE 0 END), 0) AS trash_bytes,
      COALESCE(SUM(CASE WHEN media_type = 'image' THEN 1 ELSE 0 END), 0) AS image_count,
      COALESCE(SUM(CASE WHEN media_type = 'video' THEN 1 ELSE 0 END), 0) AS video_count,
      COALESCE(SUM(CASE WHEN media_type = 'audio' THEN 1 ELSE 0 END), 0) AS audio_count,
      COALESCE(SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS deleted_count
    FROM assets WHERE owner_user_id = ?
  `).get(userId);
  const accessible = db.prepare(`
    SELECT COUNT(*) AS count FROM assets a
    WHERE a.deleted_at IS NULL AND ${accessibleAssetSql('a')}
  `).get({ user_id: userId });
  const quotaBytes = Math.max(1024 * 1024, Number(process.env.ASSET_QUOTA_BYTES || 10 * 1024 * 1024 * 1024));
  return {
    totalCount: Number(row.total_count || 0),
    totalBytes: Number(row.total_bytes || 0),
    activeBytes: Number(row.active_bytes || 0),
    trashBytes: Number(row.trash_bytes || 0),
    imageCount: Number(row.image_count || 0),
    videoCount: Number(row.video_count || 0),
    audioCount: Number(row.audio_count || 0),
    deletedCount: Number(row.deleted_count || 0),
    accessibleCount: Number(accessible?.count || 0),
    quotaBytes
  };
}

function insertVariant(db, assetId, variant, createdAt = now()) {
  const id = `${variant.type}-${assetId}`;
  db.prepare(`
    INSERT INTO asset_variants
      (id, asset_id, variant_type, storage_path, mime_type, file_size, width, height, duration_ms, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)
    ON CONFLICT(asset_id, variant_type) DO UPDATE SET
      storage_path = excluded.storage_path,
      mime_type = excluded.mime_type,
      file_size = excluded.file_size,
      width = excluded.width,
      height = excluded.height,
      duration_ms = excluded.duration_ms,
      status = 'ready',
      updated_at = excluded.updated_at
  `).run(
    id,
    assetId,
    variant.type,
    variant.storagePath,
    variant.mimeType,
    Number(variant.fileSize || 0),
    Number(variant.width || 0),
    Number(variant.height || 0),
    Number(variant.durationMs || 0),
    createdAt,
    createdAt
  );
}

async function processAndPersistAssetVariants({ db, asset, bytes, jobId, metadata = {} }) {
  db.prepare(`UPDATE asset_processing_jobs SET status = 'running', progress = 15, updated_at = ? WHERE id = ?`).run(now(), jobId);
  try {
    const processed = await processMediaAsset({ bytes, mimeType: asset.mime_type, mediaType: asset.media_type });
    for (const variant of processed.variants || []) {
      const storagePath = `assets/${asset.owner_user_id}/${asset.id}/${variant.type}.${variantExtension(variant)}`;
      const stored = await persistStoredImage({ storagePath, bytes: variant.bytes, contentType: variant.mimeType });
      insertVariant(db, asset.id, {
        ...variant,
        storagePath: stored.storagePath,
        fileSize: stored.byteLength,
        width: variant.width || processed.width,
        height: variant.height || processed.height,
        durationMs: variant.durationMs || processed.durationMs
      }, asset.created_at || now());
    }
    const nextMetadata = { ...(metadata || {}), ...(processed.metadata || {}) };
    db.prepare(`
      UPDATE assets SET status = 'ready', width = ?, height = ?, duration_ms = ?, metadata_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      Number(processed.width || 0),
      Number(processed.height || 0),
      Number(processed.durationMs || 0),
      JSON.stringify(nextMetadata),
      now(),
      asset.id
    );
    db.prepare(`UPDATE asset_processing_jobs SET status = 'succeeded', progress = 100, updated_at = ?, completed_at = ? WHERE id = ?`).run(now(), now(), jobId);
  } catch (error) {
    const processingError = typeof error?.code === 'string'
      ? error.code
      : String(error?.message || 'PROCESSING_FAILED').split('\n')[0].slice(0, 120);
    db.prepare(`UPDATE assets SET status = 'ready', metadata_json = ?, updated_at = ? WHERE id = ?`).run(
      JSON.stringify({ ...(metadata || {}), processingWarning: processingError }),
      now(),
      asset.id
    );
    db.prepare(`UPDATE asset_processing_jobs SET status = 'failed', error_code = ?, updated_at = ?, completed_at = ? WHERE id = ?`).run(
      processingError, now(), now(), jobId
    );
  }
  return getAccessibleAsset(asset.owner_user_id, asset.id, { includeDeleted: false });
}

export async function createUploadedAsset(userId, { bytes, mimeType, fileName, sourceType = 'upload', collectionId = '', tags = [], metadata = {} }) {
  const normalizedMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const mediaType = ALLOWED_MIME_TYPES.get(normalizedMime);
  if (!mediaType) throw Object.assign(new Error('UNSUPPORTED_MEDIA_TYPE'), { code: 'UNSUPPORTED_MEDIA_TYPE' });
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!payload.length || payload.length > MAX_BYTES[mediaType]) {
    throw Object.assign(new Error('ASSET_TOO_LARGE'), { code: 'ASSET_TOO_LARGE' });
  }
  const stats = getAssetStats(userId);
  if (stats.totalBytes + payload.length > stats.quotaBytes) {
    throw Object.assign(new Error('ASSET_QUOTA_EXCEEDED'), { code: 'ASSET_QUOTA_EXCEEDED' });
  }
  const db = getDb();
  const assetId = randomUUID();
  const createdAt = now();
  const checksum = createHash('sha256').update(payload).digest('hex');
  if (collectionId) {
    const collection = db.prepare('SELECT id FROM asset_collections WHERE id = ? AND owner_user_id = ?').get(collectionId, userId);
    if (!collection) throw Object.assign(new Error('COLLECTION_NOT_FOUND'), { code: 'COLLECTION_NOT_FOUND' });
  }
  db.prepare(`
    INSERT INTO assets
      (id, owner_user_id, collection_id, name, media_type, source_type, status, original_storage_path,
       mime_type, file_size, checksum, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'processing', '', ?, ?, ?, ?, ?, ?)
  `).run(
    assetId,
    userId,
    collectionId || null,
    cleanName(fileName),
    mediaType,
    ASSET_SOURCE_TYPES.has(sourceType) ? sourceType : 'upload',
    normalizedMime,
    payload.length,
    checksum,
    JSON.stringify(metadata || {}),
    createdAt,
    createdAt
  );
  const jobId = randomUUID();
  db.prepare(`
    INSERT INTO asset_processing_jobs (id, asset_id, job_type, status, progress, created_at, updated_at)
    VALUES (?, ?, 'prepare-media', 'queued', 5, ?, ?)
  `).run(jobId, assetId, createdAt, createdAt);
  let original;
  try {
    original = await persistMediaAsset({ userId, assetId, bytes: payload, contentType: normalizedMime, fileName });
    insertVariant(db, assetId, {
      type: 'original',
      storagePath: original.storagePath,
      mimeType: normalizedMime,
      fileSize: payload.length
    }, createdAt);
    db.prepare(`
      UPDATE assets SET original_storage_path = ?, metadata_json = ?, updated_at = ? WHERE id = ?
    `).run(
      original.storagePath,
      JSON.stringify(metadata || {}),
      now(),
      assetId
    );
    if (mediaType === 'image' || process.env.ASSET_PROCESSING_INLINE === '1') {
      await processAndPersistAssetVariants({
        db,
        asset: db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId),
        bytes: payload,
        jobId,
        metadata
      });
    }
  } catch (error) {
    const processingError = typeof error?.code === 'string'
      ? error.code
      : String(error?.message || 'PROCESSING_FAILED').split('\n')[0].slice(0, 120);
    db.prepare(`UPDATE assets SET status = ?, original_storage_path = ?, metadata_json = ?, updated_at = ? WHERE id = ?`).run(
      original?.storagePath ? 'ready' : 'failed',
      original?.storagePath || '',
      JSON.stringify({ ...(metadata || {}), processingWarning: processingError }),
      now(),
      assetId
    );
    db.prepare(`UPDATE asset_processing_jobs SET status = 'failed', error_code = ?, updated_at = ?, completed_at = ? WHERE id = ?`).run(
      processingError, now(), now(), jobId
    );
    if (!original?.storagePath) {
      db.prepare('DELETE FROM assets WHERE id = ?').run(assetId);
      throw error;
    }
  }
  replaceAssetTags(userId, assetId, tags);
  recordAssetUsage(userId, assetId, 'upload');
  return getAccessibleAsset(userId, assetId, { includeDeleted: false });
}

export function claimAssetProcessingJobs(limit = 1) {
  const db = getDb();
  const timestamp = now();
  const claimed = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    const rows = db.prepare(`
      SELECT job.*, asset.owner_user_id, asset.original_storage_path, asset.mime_type, asset.media_type,
        asset.metadata_json, asset.created_at AS asset_created_at
      FROM asset_processing_jobs job JOIN assets asset ON asset.id = job.asset_id
      WHERE job.status = 'queued' AND asset.deleted_at IS NULL AND asset.original_storage_path != ''
      ORDER BY job.created_at ASC LIMIT ?
    `).all(Math.max(1, Math.min(Number(limit) || 1, 4)));
    const claim = db.prepare(`
      UPDATE asset_processing_jobs SET status = 'running', progress = 10, updated_at = ?
      WHERE id = ? AND status = 'queued'
    `);
    for (const row of rows) {
      if (!claim.run(timestamp, row.id).changes) continue;
      claimed.push({
        id: row.id,
        assetId: row.asset_id,
        userId: row.owner_user_id,
        storagePath: row.original_storage_path,
        mimeType: row.mime_type,
        mediaType: row.media_type,
        metadata: parseJson(row.metadata_json, {}),
        createdAt: row.asset_created_at
      });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return claimed;
}

export async function processAssetProcessingJob(job) {
  const stored = await readStoredFile(job.storagePath);
  if (!stored?.bytes?.length) throw Object.assign(new Error('ASSET_FILE_NOT_FOUND'), { code: 'ASSET_FILE_NOT_FOUND' });
  return processAndPersistAssetVariants({
    db: getDb(),
    asset: {
      id: job.assetId,
      owner_user_id: job.userId,
      mime_type: job.mimeType,
      media_type: job.mediaType,
      created_at: job.createdAt
    },
    bytes: stored.bytes,
    jobId: job.id,
    metadata: job.metadata
  });
}

export function failAssetProcessingJob(jobId, errorCode = 'PROCESSING_FAILED') {
  const db = getDb();
  const timestamp = now();
  const job = db.prepare('SELECT asset_id FROM asset_processing_jobs WHERE id = ?').get(jobId);
  if (!job) return false;
  db.prepare(`UPDATE asset_processing_jobs SET status = 'failed', error_code = ?, updated_at = ?, completed_at = ? WHERE id = ?`)
    .run(String(errorCode || 'PROCESSING_FAILED').slice(0, 120), timestamp, timestamp, jobId);
  db.prepare(`UPDATE assets SET status = 'ready', updated_at = ? WHERE id = ? AND original_storage_path != ''`).run(timestamp, job.asset_id);
  return true;
}

export async function ensureImageVariants(userId, assetId) {
  const asset = getAccessibleAsset(userId, assetId, { includeDeleted: false });
  if (!asset || asset.mediaType !== 'image') return asset;
  const existing = new Set(asset.variants.map((variant) => variant.type));
  if (existing.has('thumbnail') && existing.has('preview')) return asset;
  const original = await readStoredFile(asset.metadata?.storagePath || getDb().prepare('SELECT original_storage_path FROM assets WHERE id = ?').get(assetId)?.original_storage_path);
  if (!original?.bytes?.length) return asset;
  const processed = await processMediaAsset({ bytes: original.bytes, mimeType: asset.mimeType, mediaType: 'image' });
  const db = getDb();
  for (const variant of processed.variants || []) {
    if (existing.has(variant.type)) continue;
    const storagePath = `assets/${asset.ownerUserId}/${asset.id}/${variant.type}.${variantExtension(variant)}`;
    const stored = await persistStoredImage({ storagePath, bytes: variant.bytes, contentType: variant.mimeType });
    insertVariant(db, asset.id, { ...variant, storagePath: stored.storagePath, fileSize: stored.byteLength });
  }
  db.prepare('UPDATE assets SET width = CASE WHEN width = 0 THEN ? ELSE width END, height = CASE WHEN height = 0 THEN ? ELSE height END, updated_at = ? WHERE id = ?')
    .run(Number(processed.width || 0), Number(processed.height || 0), now(), asset.id);
  return getAccessibleAsset(userId, asset.id, { includeDeleted: false });
}

export function replaceAssetTags(userId, assetId, tags) {
  const db = getDb();
  if (!canEditAsset(db, userId, assetId)) return false;
  const normalized = [...new Set((Array.isArray(tags) ? tags : String(tags || '').split(',')).map(cleanTag).filter(Boolean))].slice(0, 20);
  const createdAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM asset_tags WHERE asset_id = ?').run(assetId);
    const insert = db.prepare('INSERT INTO asset_tags (asset_id, tag, created_at) VALUES (?, ?, ?)');
    for (const tag of normalized) insert.run(assetId, tag, createdAt);
    db.prepare('UPDATE assets SET updated_at = ? WHERE id = ?').run(createdAt, assetId);
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function updateAsset(userId, assetId, changes = {}) {
  const db = getDb();
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
  const owned = asset?.owner_user_id === userId;
  const editable = asset && canEditAsset(db, userId, assetId);
  if (!editable) return null;
  const updates = [];
  const values = [];
  if (changes.name !== undefined) {
    updates.push('name = ?');
    values.push(cleanName(changes.name, asset.name));
  }
  if (owned && changes.favorite !== undefined) {
    updates.push('favorite = ?');
    values.push(changes.favorite ? 1 : 0);
  }
  if (owned && changes.visibility !== undefined && ASSET_VISIBILITIES.has(changes.visibility)) {
    updates.push('visibility = ?');
    values.push(changes.visibility);
  }
  if (owned && changes.collectionId !== undefined) {
    const collectionId = String(changes.collectionId || '');
    if (collectionId && !db.prepare('SELECT id FROM asset_collections WHERE id = ? AND owner_user_id = ?').get(collectionId, userId)) {
      throw Object.assign(new Error('COLLECTION_NOT_FOUND'), { code: 'COLLECTION_NOT_FOUND' });
    }
    updates.push('collection_id = ?');
    values.push(collectionId || null);
  }
  if (owned && changes.deleted === true) {
    updates.push('deleted_at = ?');
    values.push(now());
  } else if (owned && changes.deleted === false) {
    updates.push('deleted_at = NULL');
  }
  if (updates.length) {
    updates.push('updated_at = ?');
    values.push(now());
    db.prepare(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`).run(...values, assetId);
  }
  if (changes.tags !== undefined) replaceAssetTags(userId, assetId, changes.tags);
  return getAccessibleAsset(userId, assetId, { includeDeleted: true });
}

export function listCollections(userId) {
  return getDb().prepare(`
    SELECT collection.*, COUNT(asset.id) AS asset_count
    FROM asset_collections collection
    LEFT JOIN assets asset ON asset.collection_id = collection.id AND asset.deleted_at IS NULL
    WHERE collection.owner_user_id = ?
    GROUP BY collection.id
    ORDER BY collection.collection_type DESC, collection.name COLLATE NOCASE
  `).all(userId).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.collection_type,
    color: row.color,
    assetCount: Number(row.asset_count || 0),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export function createCollection(userId, values = {}) {
  const db = getDb();
  const id = randomUUID();
  const createdAt = now();
  const type = values.type === 'brand' ? 'brand' : 'folder';
  db.prepare(`
    INSERT INTO asset_collections (id, owner_user_id, name, collection_type, color, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    cleanName(values.name, type === 'brand' ? 'Brand kit' : 'New folder'),
    type,
    /^#[0-9a-f]{6}$/i.test(values.color || '') ? values.color : '#5eead4',
    JSON.stringify(values.metadata || {}),
    createdAt,
    createdAt
  );
  return listCollections(userId).find((collection) => collection.id === id);
}

export function deleteCollection(userId, collectionId) {
  const db = getDb();
  const collection = db.prepare('SELECT * FROM asset_collections WHERE id = ? AND owner_user_id = ?').get(collectionId, userId);
  if (!collection) return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE assets SET collection_id = NULL, updated_at = ? WHERE collection_id = ? AND owner_user_id = ?').run(now(), collectionId, userId);
    db.prepare('DELETE FROM asset_collections WHERE id = ? AND owner_user_id = ?').run(collectionId, userId);
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function linkAssetToProject(userId, assetId, projectId, { role = '', assetType = 'reference', purpose = '' } = {}) {
  const db = getDb();
  const asset = getAccessibleAsset(userId, assetId, { includeDeleted: false });
  const project = getEcommerceProject(userId, projectId);
  if (!asset) throw Object.assign(new Error('ASSET_NOT_FOUND'), { code: 'ASSET_NOT_FOUND' });
  if (!project) throw Object.assign(new Error('PROJECT_NOT_FOUND'), { code: 'PROJECT_NOT_FOUND' });
  if (asset.mediaType !== 'image') throw Object.assign(new Error('IMAGE_ASSET_REQUIRED'), { code: 'IMAGE_ASSET_REQUIRED' });
  const normalizedAssetType = ECOMMERCE_ASSET_TYPES.has(assetType) ? assetType : 'reference';
  const normalizedRole = String(role || normalizedAssetType).slice(0, 40);
  const existing = db.prepare('SELECT id, asset_type FROM ecommerce_project_assets WHERE project_id = ? AND user_id = ? AND media_asset_id = ?').get(projectId, userId, assetId);
  if (!existing && listEcommerceProjectAssets(userId, projectId, { includeUnavailable: true }).length >= MAX_ECOMMERCE_PROJECT_ASSETS) {
    throw Object.assign(new Error('ASSET_LIMIT_REACHED'), { code: 'ASSET_LIMIT_REACHED' });
  }
  let projectAssetId = existing?.id || '';
  if (!existing) {
    const raw = db.prepare('SELECT original_storage_path FROM assets WHERE id = ?').get(assetId);
    const linked = createEcommerceProjectAsset(userId, {
      projectId,
      mediaAssetId: assetId,
      assetType: normalizedAssetType,
      fileName: asset.name,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      storagePath: raw.original_storage_path,
      purpose,
      sortOrder: listEcommerceProjectAssets(userId, projectId).length + 1
    });
    projectAssetId = linked.id;
  } else {
    db.prepare(`
      UPDATE ecommerce_project_assets SET asset_type = ?, purpose = ?
      WHERE id = ? AND project_id = ? AND user_id = ?
    `).run(normalizedAssetType, String(purpose || '').slice(0, 80), existing.id, projectId, userId);
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM asset_project_links WHERE asset_id = ? AND project_id = ?').run(assetId, projectId);
    db.prepare(`
      INSERT INTO asset_project_links (asset_id, project_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `).run(assetId, projectId, normalizedRole, now());
    if (normalizedAssetType === 'product' && !project.masterAssetId) {
      db.prepare('UPDATE ecommerce_projects SET master_asset_id = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .run(projectAssetId, now(), projectId, userId);
    } else if (normalizedAssetType !== 'product' && project.masterAssetId === projectAssetId) {
      db.prepare('UPDATE ecommerce_projects SET master_asset_id = NULL, updated_at = ? WHERE id = ? AND user_id = ?')
        .run(now(), projectId, userId);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  recordAssetUsage(userId, assetId, 'project-link', 'ecommerce_project', projectId);
  const updatedProject = ensureEcommerceProjectMasterAsset(userId, projectId);
  return {
    asset: getAccessibleAsset(userId, assetId, { includeDeleted: false }),
    project: updatedProject,
    projectAssetId,
    assetType: normalizedAssetType
  };
}

export function listAssetProjectLinks(userId, assetId) {
  const asset = getAccessibleAsset(userId, assetId, { includeDeleted: false });
  if (!asset || asset.mediaType !== 'image') return null;
  return getDb().prepare(`
    SELECT projectAsset.id AS project_asset_id, projectAsset.project_id, projectAsset.asset_type,
      projectAsset.purpose, project.project_name, project.product_name, project.platform_id
    FROM ecommerce_project_assets projectAsset
    JOIN ecommerce_projects project ON project.id = projectAsset.project_id
    WHERE projectAsset.user_id = ? AND projectAsset.media_asset_id = ?
    ORDER BY project.updated_at DESC, projectAsset.created_at DESC
  `).all(userId, assetId).map((row) => ({
    projectAssetId: row.project_asset_id,
    projectId: row.project_id,
    assetType: row.asset_type || 'reference',
    purpose: row.purpose || '',
    projectName: row.project_name || row.product_name || '',
    productName: row.product_name || '',
    platformId: row.platform_id || ''
  }));
}

export function recordAssetRelation(userId, sourceAssetId, targetAssetId, relationType = 'derived', metadata = {}) {
  const db = getDb();
  const source = getAccessibleAsset(userId, sourceAssetId, { includeDeleted: false });
  const target = getAccessibleAsset(userId, targetAssetId, { includeDeleted: false });
  if (!source || !target || target.ownerUserId !== userId) return false;
  db.prepare(`
    INSERT OR REPLACE INTO asset_relations (source_asset_id, target_asset_id, relation_type, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sourceAssetId, targetAssetId, String(relationType || 'derived').slice(0, 40), JSON.stringify(metadata || {}), now());
  return true;
}

export function recordAssetUsage(userId, assetId, action, contextType = '', contextId = '', metadata = {}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO asset_usage (id, asset_id, user_id, action, context_type, context_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), assetId, userId, String(action || '').slice(0, 40), String(contextType || '').slice(0, 40), String(contextId || '').slice(0, 100), JSON.stringify(metadata || {}), now());
}

export function listTeams(userId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT team.*, member.role AS current_role,
      (SELECT COUNT(*) FROM team_members count_member WHERE count_member.team_id = team.id) AS member_count,
      (SELECT COUNT(*) FROM asset_permissions permission WHERE permission.principal_type = 'team' AND permission.principal_id = team.id) AS asset_count
    FROM teams team
    JOIN team_members member ON member.team_id = team.id AND member.user_id = ?
    ORDER BY team.updated_at DESC
  `).all(userId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.current_role,
    memberCount: Number(row.member_count || 0),
    assetCount: Number(row.asset_count || 0),
    createdAt: row.created_at,
    members: db.prepare(`
      SELECT member.user_id AS user_id, member.role, user.email, user.full_name
      FROM team_members member JOIN users user ON user.id = member.user_id
      WHERE member.team_id = ? ORDER BY CASE member.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, user.email
    `).all(row.id).map((member) => ({
      userId: member.user_id,
      email: member.email,
      fullName: member.full_name || '',
      role: member.role
    }))
  }));
}

export function createTeam(userId, name) {
  const db = getDb();
  const id = randomUUID();
  const createdAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO teams (id, owner_user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, userId, cleanName(name, 'Creative team'), createdAt, createdAt);
    db.prepare("INSERT INTO team_members (team_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(id, userId, createdAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return listTeams(userId).find((team) => team.id === id);
}

export function addTeamMember(userId, teamId, email, role = 'member') {
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ? AND owner_user_id = ?').get(teamId, userId);
  if (!team) throw Object.assign(new Error('TEAM_NOT_FOUND'), { code: 'TEAM_NOT_FOUND' });
  const member = getUserByEmail(email);
  if (!member) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role
  `).run(teamId, member.id, role === 'editor' ? 'editor' : 'member', now());
  db.prepare('UPDATE teams SET updated_at = ? WHERE id = ?').run(now(), teamId);
  return { teamId, userId: member.id, email: member.email, role: role === 'editor' ? 'editor' : 'member' };
}

export function removeTeamMember(userId, teamId, memberUserId) {
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ? AND owner_user_id = ?').get(teamId, userId);
  if (!team) throw Object.assign(new Error('TEAM_NOT_FOUND'), { code: 'TEAM_NOT_FOUND' });
  if (memberUserId === team.owner_user_id) throw Object.assign(new Error('TEAM_OWNER_REQUIRED'), { code: 'TEAM_OWNER_REQUIRED' });
  const result = db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, memberUserId);
  db.prepare('UPDATE teams SET updated_at = ? WHERE id = ?').run(now(), teamId);
  return Boolean(result.changes);
}

export function deleteTeam(userId, teamId) {
  const db = getDb();
  const team = db.prepare('SELECT * FROM teams WHERE id = ? AND owner_user_id = ?').get(teamId, userId);
  if (!team) return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    const affectedAssets = db.prepare(`
      SELECT DISTINCT asset_id FROM asset_permissions
      WHERE principal_type = 'team' AND principal_id = ?
    `).all(teamId);
    db.prepare("DELETE FROM asset_permissions WHERE principal_type = 'team' AND principal_id = ?").run(teamId);
    db.prepare('DELETE FROM teams WHERE id = ? AND owner_user_id = ?').run(teamId, userId);
    for (const { asset_id: assetId } of affectedAssets) {
      const remaining = Number(db.prepare('SELECT COUNT(*) AS count FROM asset_permissions WHERE asset_id = ?').get(assetId)?.count || 0);
      if (!remaining) db.prepare("UPDATE assets SET visibility = 'private', updated_at = ? WHERE id = ?").run(now(), assetId);
    }
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function shareAsset(userId, assetId, { principalType, principalId, email, permission = 'view' } = {}) {
  const db = getDb();
  const asset = db.prepare('SELECT id FROM assets WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL').get(assetId, userId);
  if (!asset) throw Object.assign(new Error('ASSET_NOT_FOUND'), { code: 'ASSET_NOT_FOUND' });
  let resolvedType = principalType === 'team' ? 'team' : 'user';
  let resolvedId = String(principalId || '');
  if (resolvedType === 'user') {
    const target = email ? getUserByEmail(email) : db.prepare('SELECT * FROM users WHERE id = ?').get(resolvedId);
    if (!target) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
    resolvedId = target.id;
  } else {
    const team = db.prepare(`
      SELECT team.id FROM teams team JOIN team_members member ON member.team_id = team.id
      WHERE team.id = ? AND member.user_id = ? AND member.role IN ('owner', 'editor')
    `).get(resolvedId, userId);
    if (!team) throw Object.assign(new Error('TEAM_NOT_FOUND'), { code: 'TEAM_NOT_FOUND' });
  }
  db.prepare(`
    INSERT INTO asset_permissions (asset_id, principal_type, principal_id, permission, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(asset_id, principal_type, principal_id) DO UPDATE SET permission = excluded.permission
  `).run(assetId, resolvedType, resolvedId, permission === 'edit' ? 'edit' : 'view', now());
  db.prepare("UPDATE assets SET visibility = 'team', updated_at = ? WHERE id = ?").run(now(), assetId);
  return { assetId, principalType: resolvedType, principalId: resolvedId, permission: permission === 'edit' ? 'edit' : 'view' };
}

export function listAssetPermissions(userId, assetId) {
  const db = getDb();
  const owned = db.prepare('SELECT id FROM assets WHERE id = ? AND owner_user_id = ?').get(assetId, userId);
  if (!owned) return null;
  return db.prepare(`
    SELECT permission.principal_type, permission.principal_id, permission.permission,
      user.email, user.full_name, team.name AS team_name
    FROM asset_permissions permission
    LEFT JOIN users user ON permission.principal_type = 'user' AND user.id = permission.principal_id
    LEFT JOIN teams team ON permission.principal_type = 'team' AND team.id = permission.principal_id
    WHERE permission.asset_id = ?
    ORDER BY permission.principal_type, COALESCE(user.email, team.name)
  `).all(assetId).map((row) => ({
    principalType: row.principal_type,
    principalId: row.principal_id,
    permission: row.permission,
    label: row.principal_type === 'team' ? row.team_name || row.principal_id : row.email || row.full_name || row.principal_id
  }));
}

export function revokeAssetPermission(userId, assetId, principalType, principalId) {
  const db = getDb();
  const owned = db.prepare('SELECT id FROM assets WHERE id = ? AND owner_user_id = ?').get(assetId, userId);
  if (!owned) return false;
  const result = db.prepare(`
    DELETE FROM asset_permissions WHERE asset_id = ? AND principal_type = ? AND principal_id = ?
  `).run(assetId, principalType === 'team' ? 'team' : 'user', String(principalId || ''));
  const remaining = Number(db.prepare('SELECT COUNT(*) AS count FROM asset_permissions WHERE asset_id = ?').get(assetId)?.count || 0);
  if (!remaining) db.prepare("UPDATE assets SET visibility = 'private', updated_at = ? WHERE id = ?").run(now(), assetId);
  return Boolean(result.changes);
}

export function getVariantRecord(userId, assetId, variantType = 'original') {
  const asset = getAccessibleAsset(userId, assetId, { includeDeleted: false });
  if (!asset) return null;
  const row = getDb().prepare('SELECT * FROM asset_variants WHERE asset_id = ? AND variant_type = ?').get(assetId, variantType);
  return row ? { asset, variant: normalizeVariant(row) } : { asset, variant: null };
}

export async function removeOrphanedAssetFile(userId, assetId) {
  const db = getDb();
  const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND owner_user_id = ?').get(assetId, userId);
  if (!asset) return false;
  const sourceBacked = Boolean(asset.source_table && asset.source_id);
  if (sourceBacked) return false;
  const variants = db.prepare('SELECT storage_path FROM asset_variants WHERE asset_id = ?').all(assetId);
  await Promise.allSettled(variants.map((variant) => deleteStoredFile(variant.storage_path)));
  db.prepare('DELETE FROM assets WHERE id = ? AND owner_user_id = ?').run(assetId, userId);
  return true;
}

export async function permanentlyDeleteAsset(userId, assetId) {
  const db = getDb();
  const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND owner_user_id = ? AND deleted_at IS NOT NULL').get(assetId, userId);
  if (!asset) return false;
  const projectLinks = Number(db.prepare('SELECT COUNT(*) AS count FROM asset_project_links WHERE asset_id = ?').get(assetId)?.count || 0);
  if (projectLinks && asset.source_table !== 'generations') {
    throw Object.assign(new Error('ASSET_IN_USE'), { code: 'ASSET_IN_USE' });
  }
  const variants = db.prepare('SELECT storage_path FROM asset_variants WHERE asset_id = ?').all(assetId);
  const sourceBacked = Boolean(asset.source_table && asset.source_id);
  db.prepare('DELETE FROM assets WHERE id = ? AND owner_user_id = ?').run(assetId, userId);
  if (!sourceBacked) await Promise.allSettled(variants.map((variant) => deleteStoredFile(variant.storage_path)));
  return true;
}

export async function emptyAssetTrash(userId) {
  const ids = getDb().prepare('SELECT id FROM assets WHERE owner_user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at ASC').all(userId);
  let deleted = 0;
  let skipped = 0;
  for (const { id } of ids) {
    try {
      if (await permanentlyDeleteAsset(userId, id)) deleted += 1;
    } catch (error) {
      if (error?.code === 'ASSET_IN_USE') skipped += 1;
      else throw error;
    }
  }
  return { deleted, skipped };
}
