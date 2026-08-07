import { randomUUID } from 'node:crypto';
import {
  createEcommerceProjectAsset,
  deleteEcommerceProjectAsset,
  getEcommerceProject,
  getEcommerceProjectAsset,
  listEcommerceProjectAssets,
  setEcommerceProjectMasterAsset
} from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { readJsonBody } from '../_lib/request.js';
import {
  deleteStoredFile,
  inspectImageDataUrl,
  persistProjectAsset
} from '../_lib/storage.js';

const ALLOWED_TYPES = new Set(['product', 'packaging', 'logo', 'reference']);
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_PROJECT_ASSETS = 30;

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/[\\/]+/g, '-').slice(0, maxLength);
}

function publicAsset(asset, masterAssetId = '') {
  return {
    id: asset.id,
    projectId: asset.projectId,
    assetType: asset.assetType,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    isMaster: asset.id === masterAssetId,
    imageUrl: `/api/ecommerce/asset-file?id=${encodeURIComponent(asset.id)}`,
    createdAt: asset.createdAt
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'GET') {
    const projectId = cleanText(req.query?.projectId, 80);
    const project = projectId ? getEcommerceProject(auth.user.id, projectId) : null;
    if (!project) {
      return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
    }
    const assets = listEcommerceProjectAssets(auth.user.id, projectId).map((asset) => publicAsset(asset, project.masterAssetId));
    return json(res, 200, { ok: true, assets, masterAssetId: project.masterAssetId });
  }

  if (req.method === 'PATCH') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return json(res, 400, { ok: false, error: 'INVALID_ASSET' });
    }
    const projectId = cleanText(body.projectId, 80);
    const assetId = cleanText(body.assetId, 80);
    const project = setEcommerceProjectMasterAsset(auth.user.id, projectId, assetId);
    if (!project) return json(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
    const assets = listEcommerceProjectAssets(auth.user.id, projectId).map((asset) => publicAsset(asset, project.masterAssetId));
    return json(res, 200, { ok: true, project, assets });
  }

  if (req.method === 'DELETE') {
    const assetId = cleanText(req.query?.id, 80);
    const asset = getEcommerceProjectAsset(auth.user.id, assetId);
    if (!asset) return json(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
    try {
      await deleteStoredFile(asset.storagePath);
      deleteEcommerceProjectAsset(auth.user.id, asset.id);
      return json(res, 200, { ok: true });
    } catch {
      return json(res, 500, { ok: false, error: 'ASSET_DELETE_FAILED' });
    }
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_ASSET' });
  }

  const projectId = cleanText(body.projectId, 80);
  const project = projectId ? getEcommerceProject(auth.user.id, projectId) : null;
  if (!project) {
    return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  }
  if (listEcommerceProjectAssets(auth.user.id, projectId).length >= MAX_PROJECT_ASSETS) {
    return json(res, 400, { ok: false, error: 'ASSET_LIMIT_REACHED' });
  }

  const assetType = ALLOWED_TYPES.has(body.assetType) ? body.assetType : 'product';
  const fileName = cleanText(body.fileName, 180) || 'product-image';
  const dataUrl = String(body.dataUrl || '');
  if (!dataUrl || dataUrl.length > MAX_ASSET_BYTES * 1.5) {
    return json(res, 400, { ok: false, error: 'ASSET_TOO_LARGE' });
  }
  const inspected = inspectImageDataUrl(dataUrl);
  if (!inspected || !ALLOWED_MIME_TYPES.has(inspected.contentType)) {
    return json(res, 400, { ok: false, error: 'INVALID_ASSET_TYPE' });
  }
  if (inspected.byteLength <= 0 || inspected.byteLength > MAX_ASSET_BYTES) {
    return json(res, 400, { ok: false, error: 'ASSET_TOO_LARGE' });
  }

  const assetId = randomUUID();
  let stored;
  try {
    stored = await persistProjectAsset({
      userId: auth.user.id,
      projectId,
      assetId,
      image: dataUrl
    });
    const asset = createEcommerceProjectAsset(auth.user.id, {
      id: assetId,
      projectId,
      assetType,
      fileName,
      mimeType: stored.contentType,
      fileSize: stored.byteLength,
      storagePath: stored.storagePath
    });
    const nextProject = !project.masterAssetId && assetType === 'product'
      ? setEcommerceProjectMasterAsset(auth.user.id, projectId, asset.id)
      : getEcommerceProject(auth.user.id, projectId);
    return json(res, 201, {
      ok: true,
      asset: publicAsset(asset, nextProject?.masterAssetId),
      project: nextProject,
      storageBackend: stored.backend
    });
  } catch {
    if (stored?.storagePath) await deleteStoredFile(stored.storagePath).catch(() => undefined);
    return json(res, 500, { ok: false, error: 'ASSET_UPLOAD_FAILED' });
  }
}
