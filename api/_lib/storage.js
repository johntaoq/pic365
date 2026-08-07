import fs from 'node:fs/promises';
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

function extensionForContentType(contentType) {
  if (contentType.includes('jpeg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  return 'png';
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

export async function readStoredImage(storagePath) {
  if (!storagePath) return null;
  if (hasAzureStorage()) {
    const blob = getAzureContainer().getBlobClient(storagePath);
    const response = await blob.download();
    const chunks = [];
    for await (const chunk of response.readableStreamBody) chunks.push(Buffer.from(chunk));
    return {
      bytes: Buffer.concat(chunks),
      contentType: response.contentType || 'image/png'
    };
  }

  const filePath = path.join(getLocalRoot(), storagePath);
  const bytes = await fs.readFile(filePath);
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const contentType = extension === 'jpg' || extension === 'jpeg'
    ? 'image/jpeg'
    : extension === 'webp'
      ? 'image/webp'
      : 'image/png';
  return {
    bytes,
    contentType
  };
}
