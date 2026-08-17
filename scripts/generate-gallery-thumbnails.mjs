import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceRoot = path.join(root, 'data', 'images');
const outputRoot = path.join(sourceRoot, 'thumbnails');
const supported = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const concurrency = Math.max(1, Math.min(Number(process.env.GALLERY_THUMBNAIL_CONCURRENCY || 8), 16));

async function collectFiles(directory, relativeRoot = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'thumbnails') continue;
    const relativePath = path.join(relativeRoot, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath, relativePath));
    else if (supported.has(path.extname(entry.name).toLowerCase())) files.push(relativePath);
  }
  return files;
}

async function isFresh(source, destination) {
  try {
    const [sourceStat, destinationStat] = await Promise.all([stat(source), stat(destination)]);
    return destinationStat.size > 0 && destinationStat.mtimeMs >= sourceStat.mtimeMs;
  } catch {
    return false;
  }
}

async function createThumbnail(relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const destination = path.join(outputRoot, relativePath.replace(/\.[^/.]+$/, '.webp'));
  if (await isFresh(source, destination)) return { skipped: true, destination };
  await mkdir(path.dirname(destination), { recursive: true });
  await sharp(source)
    .rotate()
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 4, smartSubsample: true })
    .toFile(destination);
  return { skipped: false, destination };
}

const files = await collectFiles(sourceRoot);
let cursor = 0;
let created = 0;
let skipped = 0;
const failed = [];

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < files.length) {
    const index = cursor;
    cursor += 1;
    try {
      const result = await createThumbnail(files[index]);
      if (result.skipped) skipped += 1;
      else created += 1;
    } catch (error) {
      failed.push({ file: files[index], error: error?.message || 'THUMBNAIL_FAILED' });
    }
  }
}));

console.log(`Gallery thumbnails ready: ${created} created, ${skipped} unchanged, ${failed.length} skipped as invalid, ${files.length} total.`);
if (failed.length) console.warn(failed.map((item) => `${item.file}: ${item.error}`).join('\n'));
