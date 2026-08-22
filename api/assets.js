import { authenticateRequest } from './_lib/local-auth.js';
import { createUploadedAsset, emptyAssetTrash, getAssetStats, listAssets, repairMissingAssetFileMetadata } from './_lib/media-assets.js';
import { readBufferBody } from './_lib/request.js';
import { startMediaProcessingWorker } from '../server/media-processing-worker.js';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'GET') {
    await repairMissingAssetFileMetadata(auth.user.id);
    const result = listAssets(auth.user.id, {
      limit: req.query?.limit,
      offset: req.query?.offset,
      query: req.query?.q,
      mediaType: req.query?.mediaType,
      sourceType: req.query?.sourceType,
      collectionId: req.query?.collectionId,
      teamId: req.query?.teamId,
      collectionType: req.query?.collectionType,
      tag: req.query?.tag,
      favorite: req.query?.favorite === '1',
      deleted: req.query?.deleted === '1',
      shared: req.query?.shared === '1',
      project: req.query?.project === '1',
      isSuperAdmin: auth.user.isSuperAdmin
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return json(res, 200, { ok: true, ...result, stats: getAssetStats(auth.user.id) });
  }

  if (req.method === 'DELETE') {
    const result = await emptyAssetTrash(auth.user.id);
    return json(res, 200, { ok: true, ...result, stats: getAssetStats(auth.user.id) });
  }

  try {
    const bytes = await readBufferBody(req, { maxBytes: MAX_UPLOAD_BYTES });
    const asset = await createUploadedAsset(auth.user.id, {
      bytes,
      mimeType: req.headers?.['content-type'] || 'application/octet-stream',
      fileName: req.query?.fileName || req.headers?.['x-file-name'] || 'Untitled asset',
      sourceType: req.query?.sourceType || 'upload',
      collectionId: req.query?.collectionId || '',
      tags: String(req.query?.tags || '').split(',').filter(Boolean),
      metadata: { importedBy: 'asset-center' }
    });
    startMediaProcessingWorker();
    return json(res, 201, { ok: true, asset, stats: getAssetStats(auth.user.id) });
  } catch (error) {
    const code = error?.code || error?.message || 'ASSET_UPLOAD_FAILED';
    const status = code === 'REQUEST_BODY_TOO_LARGE' || code === 'ASSET_TOO_LARGE' ? 413
      : code === 'ASSET_QUOTA_EXCEEDED' ? 409
        : code === 'UNSUPPORTED_MEDIA_TYPE' ? 415
          : 400;
    return json(res, status, { ok: false, error: code });
  }
}
