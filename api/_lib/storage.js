import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import path from 'node:path';
import { BlobServiceClient } from '@azure/storage-blob';

const DEFAULT_LOCAL_ROOT = path.resolve(process.cwd(), 'data', 'generated');
const MAX_REMOTE_IMAGE_BYTES = 32 * 1024 * 1024;
const REMOTE_IMAGE_TIMEOUT_MS = 45 * 1000;
let azureContainerClient;

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) return null;
  return {
    contentType: match[1],
    bytes: Buffer.from(match[2], 'base64')
  };
}

export function inspectImageDataUrl(value) {
  const parsed = parseDataUrl(value);
  if (!parsed) return null;
  return {
    contentType: parsed.contentType,
    byteLength: parsed.bytes.length
  };
}

async function readImage(value) {
  const parsed = parseDataUrl(value);
  if (parsed) return parsed;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(value, { signal: controller.signal });
    if (!response.ok) throw new Error(`IMAGE_DOWNLOAD_FAILED_${response.status}`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_REMOTE_IMAGE_BYTES) throw new Error('IMAGE_DOWNLOAD_TOO_LARGE');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_REMOTE_IMAGE_BYTES) throw new Error('IMAGE_DOWNLOAD_TOO_LARGE');
    return {
      contentType: response.headers.get('content-type') || 'image/png',
      bytes
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function extensionForContentType(contentType, fileName = '') {
  if (contentType.includes('jpeg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('video/mp4')) return 'mp4';
  if (contentType.includes('video/webm')) return 'webm';
  if (contentType.includes('quicktime')) return 'mov';
  if (contentType.includes('audio/mpeg')) return 'mp3';
  if (contentType.includes('audio/wav') || contentType.includes('wave')) return 'wav';
  if (contentType.includes('audio/mp4')) return 'm4a';
  if (contentType.includes('audio/ogg')) return 'ogg';
  const namedExtension = path.extname(String(fileName || '')).slice(1).toLowerCase();
  return namedExtension && /^[a-z0-9]{1,8}$/.test(namedExtension) ? namedExtension : 'bin';
}

function getAzureConfig() {
  return {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
    container: process.env.AZURE_STORAGE_CONTAINER || 'generated-images'
  };
}

function getLocalRoot() {
  return path.resolve(process.env.LOCAL_STORAGE_ROOT || DEFAULT_LOCAL_ROOT);
}

function contentTypeForStoragePath(storagePath) {
  const extension = path.extname(String(storagePath || '')).slice(1).toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'png') return 'image/png';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'mp4' || extension === 'm4v') return 'video/mp4';
  if (extension === 'webm') return 'video/webm';
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'm4a') return 'audio/mp4';
  if (extension === 'ogg' || extension === 'oga') return 'audio/ogg';
  if (extension === 'json') return 'application/json';
  return 'application/octet-stream';
}

function hasAzureStorage() {
  return Boolean(getAzureConfig().connectionString);
}

function getAzureContainer() {
  if (azureContainerClient) return azureContainerClient;
  const config = getAzureConfig();
  const service = BlobServiceClient.fromConnectionString(config.connectionString);
  azureContainerClient = service.getContainerClient(config.container);
  return azureContainerClient;
}

export function isStorageConfigured() {
  return hasAzureStorage() || Boolean(process.env.LOCAL_STORAGE_ROOT || process.env.NODE_ENV !== 'production');
}

export async function checkStorageHealth() {
  if (hasAzureStorage()) {
    const container = getAzureContainer();
    await container.getProperties();
    return { ok: true, backend: 'azure-blob', container: getAzureConfig().container };
  }
  const root = getLocalRoot();
  await fs.mkdir(root, { recursive: true });
  await fs.access(root);
  return { ok: true, backend: 'local-disk' };
}

export async function persistImage({ userId, generationId, image }) {
  const { bytes, contentType } = await readImage(image);
  const extension = extensionForContentType(contentType);
  const storagePath = `${userId}/${generationId}.${extension}`;

  if (hasAzureStorage()) {
    const container = getAzureContainer();
    await container.createIfNotExists();
    const blob = container.getBlockBlobClient(storagePath);
    await blob.uploadData(bytes, {
      blobHTTPHeaders: { blobContentType: contentType }
    });
  } else {
    const filePath = path.join(getLocalRoot(), storagePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, bytes);
  }

  return {
    url: `/api/generated?id=${encodeURIComponent(generationId)}`,
    storagePath,
    contentType,
    backend: hasAzureStorage() ? 'azure-blob' : 'local-disk'
  };
}

export async function persistProjectAsset({ userId, projectId, assetId, image }) {
  const { bytes, contentType } = await readImage(image);
  const extension = extensionForContentType(contentType);
  const storagePath = `projects/${userId}/${projectId}/assets/${assetId}.${extension}`;

  if (hasAzureStorage()) {
    const container = getAzureContainer();
    await container.createIfNotExists();
    const blob = container.getBlockBlobClient(storagePath);
    await blob.uploadData(bytes, {
      blobHTTPHeaders: { blobContentType: contentType }
    });
  } else {
    const filePath = path.join(getLocalRoot(), storagePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, bytes);
  }

  return {
    storagePath,
    contentType,
    byteLength: bytes.length,
    backend: hasAzureStorage() ? 'azure-blob' : 'local-disk'
  };
}

export async function persistMediaAsset({ userId, assetId, bytes, contentType, fileName = '' }) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!payload.length) throw new Error('EMPTY_STORAGE_PAYLOAD');
  const extension = extensionForContentType(String(contentType || ''), fileName);
  const storagePath = `assets/${userId}/${assetId}/original.${extension}`;
  return persistStoredImage({ storagePath, bytes: payload, contentType: contentType || 'application/octet-stream' });
}

export async function persistStoredImage({ storagePath, bytes, contentType = 'image/webp' }) {
  const normalizedPath = String(storagePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedPath || normalizedPath.includes('../') || normalizedPath.includes('/..')) {
    throw new Error('INVALID_STORAGE_PATH');
  }
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!payload.length) throw new Error('EMPTY_STORAGE_PAYLOAD');

  if (hasAzureStorage()) {
    const container = getAzureContainer();
    await container.createIfNotExists();
    const blob = container.getBlockBlobClient(normalizedPath);
    await blob.uploadData(payload, {
      blobHTTPHeaders: {
        blobContentType: contentType,
        blobCacheControl: 'private, max-age=31536000, immutable'
      }
    });
  } else {
    const filePath = path.join(getLocalRoot(), normalizedPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, payload);
  }

  return {
    storagePath: normalizedPath,
    contentType,
    byteLength: payload.length,
    backend: hasAzureStorage() ? 'azure-blob' : 'local-disk'
  };
}

export async function deleteStoredFile(storagePath) {
  if (!storagePath) return;
  if (hasAzureStorage()) {
    const blob = getAzureContainer().getBlobClient(storagePath);
    await blob.deleteIfExists();
    return;
  }

  const filePath = path.resolve(getLocalRoot(), storagePath);
  const localRoot = `${getLocalRoot()}${path.sep}`;
  if (!filePath.startsWith(localRoot)) throw new Error('INVALID_STORAGE_PATH');
  await fs.rm(filePath, { force: true });
}

export async function readStoredFile(storagePath) {
  if (!storagePath) return null;
  if (hasAzureStorage()) {
    const blob = getAzureContainer().getBlobClient(storagePath);
    const response = await blob.download();
    const chunks = [];
    for await (const chunk of response.readableStreamBody) chunks.push(Buffer.from(chunk));
    return {
      bytes: Buffer.concat(chunks),
      contentType: response.contentType || 'application/octet-stream'
    };
  }

  const filePath = path.join(getLocalRoot(), storagePath);
  const bytes = await fs.readFile(filePath);
  return {
    bytes,
    contentType: contentTypeForStoragePath(filePath)
  };
}

export async function getStoredFileInfo(storagePath) {
  if (!storagePath) return null;
  if (hasAzureStorage()) {
    const properties = await getAzureContainer().getBlobClient(storagePath).getProperties();
    return {
      byteLength: Number(properties.contentLength || 0),
      contentType: properties.contentType || 'application/octet-stream'
    };
  }
  const filePath = path.resolve(getLocalRoot(), storagePath);
  const localRoot = `${getLocalRoot()}${path.sep}`;
  if (!filePath.startsWith(localRoot)) throw new Error('INVALID_STORAGE_PATH');
  const stats = await fs.stat(filePath);
  return { byteLength: Number(stats.size || 0), contentType: contentTypeForStoragePath(filePath) };
}

export async function openStoredFileStream(storagePath, { offset = 0, count } = {}) {
  if (!storagePath) return null;
  const start = Math.max(0, Number(offset) || 0);
  if (hasAzureStorage()) {
    const response = await getAzureContainer().getBlobClient(storagePath).download(start, Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : undefined);
    return response.readableStreamBody;
  }
  const filePath = path.resolve(getLocalRoot(), storagePath);
  const localRoot = `${getLocalRoot()}${path.sep}`;
  if (!filePath.startsWith(localRoot)) throw new Error('INVALID_STORAGE_PATH');
  const options = { start };
  if (Number.isFinite(Number(count)) && Number(count) > 0) options.end = start + Number(count) - 1;
  return nodeFs.createReadStream(filePath, options);
}

export async function readStoredFileRange(storagePath, { offset = 0, count } = {}) {
  const stream = await openStoredFileStream(storagePath, { offset, count });
  if (!stream) return Buffer.alloc(0);
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}


export async function readStoredImage(storagePath) {
  return readStoredFile(storagePath);
}
