import { getDb } from './_lib/local-db.js';
import { authenticateRequest } from './_lib/local-auth.js';
import sharp from 'sharp';
import assetFileHandler from './assets/file.js';
import { persistStoredImage, readStoredImage } from './_lib/storage.js';
import {
  GENERATED_THUMBNAIL_MAX_SIDE,
  GENERATED_THUMBNAIL_VARIANT,
  GENERATED_THUMBNAIL_VERSION,
  GENERATED_PREVIEW_VARIANT,
  generatedThumbnailStoragePath
} from '../shared/image-thumbnails.js';

async function readThumbnail(storagePath) {
  const thumbnailPath = generatedThumbnailStoragePath(storagePath);
  if (!thumbnailPath) throw new Error('INVALID_STORAGE_PATH');
  try {
    return await readStoredImage(thumbnailPath);
  } catch {
    const original = await readStoredImage(storagePath);
    const bytes = await sharp(original.bytes)
      .rotate()
      .resize({
        width: GENERATED_THUMBNAIL_MAX_SIDE,
        height: GENERATED_THUMBNAIL_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 72, effort: 4, smartSubsample: true })
      .toBuffer();
    await persistStoredImage({ storagePath: thumbnailPath, bytes, contentType: 'image/webp' }).catch(() => undefined);
    return { bytes, contentType: 'image/webp' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).end();
    return;
  }

  const auth = authenticateRequest(req);
  if (auth.error) {
    res.status(auth.status || 401).json({ ok: false, error: auth.error });
    return;
  }

  const generationId = String(req.query?.id || '').trim();
  const variant = String(req.query?.variant || '').trim().toLowerCase();
  const useThumbnail = variant === GENERATED_THUMBNAIL_VARIANT || variant === 'thumbnail';
  const usePreview = variant === GENERATED_PREVIEW_VARIANT;
  const db = getDb();
  const row = db.prepare(`
    SELECT generation.storage_path, generation.status, (
      SELECT asset.id FROM assets asset WHERE asset.owner_user_id = generation.user_id
        AND ((asset.source_table = 'generations' AND asset.source_id = generation.id)
          OR asset.original_storage_path = generation.storage_path) LIMIT 1
    ) AS asset_id FROM generations generation WHERE generation.id = ? AND generation.user_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM asset_retention_deletions deletion JOIN assets asset ON asset.id = deletion.asset_id
        WHERE asset.owner_user_id = generation.user_id
          AND ((asset.source_table = 'generations' AND asset.source_id = generation.id)
            OR asset.original_storage_path = generation.storage_path)
      )
  `).get(generationId, auth.user.id);
  if (!row || row.status !== 'succeeded' || !row.storage_path) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(404).json({ ok: false, error: 'IMAGE_NOT_FOUND' });
    return;
  }

  // Reuse the durable asset variants instead of regenerating a second cache.
  if (row.asset_id && (useThumbnail || usePreview)) {
    return assetFileHandler({ ...req, method: req.method, headers: req.headers, query: {
      ...req.query,
      id: row.asset_id,
      variant: useThumbnail ? 'thumbnail' : 'preview'
    } }, res);
  }
  if (usePreview) {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(404).json({ ok: false, error: 'ASSET_VARIANT_NOT_FOUND' });
  }

  try {
    const stored = useThumbnail ? await readThumbnail(row.storage_path) : await readStoredImage(row.storage_path);
    const etag = `"generation-${generationId}-${useThumbnail ? `${GENERATED_THUMBNAIL_VERSION}-thumb` : 'original'}"`;
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (String(req.headers?.['if-none-match'] || '') === etag) {
      res.status(304).end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', stored.contentType || 'image/png');
    res.setHeader('Content-Length', String(stored.bytes.length));
    res.end(stored.bytes);
  } catch (error) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.removeHeader?.('ETag');
    console.warn('Generated image could not be read', {
      generationId,
      variant: useThumbnail ? GENERATED_THUMBNAIL_VARIANT : 'original',
      code: error?.code || null,
      status: error?.statusCode || error?.status || null
    });
    res.status(404).json({ ok: false, error: 'IMAGE_NOT_FOUND' });
  }
}
