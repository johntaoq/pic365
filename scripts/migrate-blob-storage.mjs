import crypto from 'node:crypto';
import { BlobServiceClient } from '@azure/storage-blob';

const sourceConnectionString = process.env.SOURCE_STORAGE_CONNECTION_STRING || '';
const destinationConnectionString = process.env.DESTINATION_STORAGE_CONNECTION_STRING || '';
const sourceContainerName = process.env.SOURCE_STORAGE_CONTAINER || 'generated-images';
const destinationContainerName = process.env.DESTINATION_STORAGE_CONTAINER || 'generated-images';
const concurrency = Math.max(1, Math.min(16, Number(process.env.MIGRATION_CONCURRENCY || 4)));
const execute = process.argv.includes('--execute');
const verifyOnly = process.argv.includes('--verify-only');

if (!sourceConnectionString) throw new Error('SOURCE_STORAGE_CONNECTION_STRING is required');
if (!destinationConnectionString) throw new Error('DESTINATION_STORAGE_CONNECTION_STRING is required');
if (
  sourceConnectionString === destinationConnectionString
  && sourceContainerName === destinationContainerName
) {
  throw new Error('Source and destination storage are identical');
}
if (execute && verifyOnly) throw new Error('Use either --execute or --verify-only');

const sourceService = BlobServiceClient.fromConnectionString(sourceConnectionString);
const destinationService = BlobServiceClient.fromConnectionString(destinationConnectionString);
const sourceContainer = sourceService.getContainerClient(sourceContainerName);
const destinationContainer = destinationService.getContainerClient(destinationContainerName);

function md5(bytes) {
  return crypto.createHash('md5').update(bytes).digest();
}

function sameDigest(left, right) {
  return Boolean(left) && Boolean(right) && Buffer.from(left).equals(Buffer.from(right));
}

async function listSourceBlobs() {
  const blobs = [];
  let totalBytes = 0;
  for await (const blob of sourceContainer.listBlobsFlat({ includeMetadata: true })) {
    const contentLength = Number(blob.properties.contentLength || 0);
    totalBytes += contentLength;
    blobs.push({ name: blob.name, contentLength, properties: blob.properties, metadata: blob.metadata || {} });
  }
  blobs.sort((left, right) => left.name.localeCompare(right.name));
  return { blobs, totalBytes };
}

async function runWorkers(items, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function destinationDigest(blobClient, properties) {
  if (properties.contentMD5) return Buffer.from(properties.contentMD5);
  const bytes = await blobClient.downloadToBuffer();
  return md5(bytes);
}

async function verify(blobs) {
  const failures = [];
  let checked = 0;
  await runWorkers(blobs, async (blob) => {
    const sourceClient = sourceContainer.getBlobClient(blob.name);
    const destinationClient = destinationContainer.getBlobClient(blob.name);
    try {
      const sourceBytes = await sourceClient.downloadToBuffer();
      const expectedDigest = md5(sourceBytes);
      const properties = await destinationClient.getProperties();
      const actualDigest = await destinationDigest(destinationClient, properties);
      if (Number(properties.contentLength || 0) !== sourceBytes.length || !sameDigest(expectedDigest, actualDigest)) {
        failures.push(blob.name);
      }
    } catch {
      failures.push(blob.name);
    }
    checked += 1;
    if (checked % 25 === 0 || checked === blobs.length) {
      console.log(`Verified ${checked}/${blobs.length}`);
    }
  });
  if (failures.length) {
    console.error(JSON.stringify({ verified: false, failureCount: failures.length, failures: failures.slice(0, 20) }));
    process.exitCode = 1;
    return false;
  }
  console.log(JSON.stringify({ verified: true, blobCount: blobs.length }));
  return true;
}

const { blobs, totalBytes } = await listSourceBlobs();
console.log(JSON.stringify({
  mode: execute ? 'execute' : verifyOnly ? 'verify-only' : 'dry-run',
  sourceContainer: sourceContainerName,
  destinationContainer: destinationContainerName,
  blobCount: blobs.length,
  totalBytes,
  totalMiB: Number((totalBytes / 1024 / 1024).toFixed(2)),
  concurrency
}));

if (!execute && !verifyOnly) {
  console.log('Dry run only. Re-run with --execute to copy, or --verify-only to verify an existing copy.');
  process.exit(0);
}

if (execute) {
  await destinationContainer.createIfNotExists();
  let copied = 0;
  let skipped = 0;
  let processed = 0;
  await runWorkers(blobs, async (blob) => {
    const sourceClient = sourceContainer.getBlobClient(blob.name);
    const destinationClient = destinationContainer.getBlockBlobClient(blob.name);
    const bytes = await sourceClient.downloadToBuffer();
    const digest = md5(bytes);
    try {
      const existing = await destinationClient.getProperties();
      if (
        Number(existing.contentLength || 0) === bytes.length
        && sameDigest(existing.contentMD5, digest)
      ) {
        skipped += 1;
        processed += 1;
        if (processed % 25 === 0 || processed === blobs.length) {
          console.log(`Processed ${processed}/${blobs.length} (copied ${copied}, skipped ${skipped})`);
        }
        return;
      }
    } catch (error) {
      if (Number(error?.statusCode || 0) !== 404) throw error;
    }
    await destinationClient.uploadData(bytes, {
      blobHTTPHeaders: {
        blobContentType: blob.properties.contentType || 'application/octet-stream',
        blobContentEncoding: blob.properties.contentEncoding,
        blobContentLanguage: blob.properties.contentLanguage,
        blobCacheControl: blob.properties.cacheControl,
        blobContentDisposition: blob.properties.contentDisposition,
        blobContentMD5: digest
      },
      metadata: blob.metadata
    });
    copied += 1;
    processed += 1;
    if (processed % 25 === 0 || processed === blobs.length) {
      console.log(`Processed ${processed}/${blobs.length} (copied ${copied}, skipped ${skipped})`);
    }
  });
  console.log(JSON.stringify({ copied, skipped, processed }));
}

await verify(blobs);
