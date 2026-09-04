import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { IMAGE_STYLE_PRESETS } from '../shared/image-style-presets.js';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.join(root, 'output', 'style-preview-audit');
const casesPayload = JSON.parse(await fs.readFile(path.join(root, 'data', 'cases.json'), 'utf8'));
const caseById = new Map(casesPayload.cases.map((item) => [Number(item.id), item]));

function xml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function previewPath(preset) {
  const source = preset.previewAsset || caseById.get(Number(preset.previewCaseId))?.thumbnail || '';
  return source ? path.join(root, 'data', source.replace(/^\/?images\//, 'images/')) : '';
}

await fs.mkdir(outputDir, { recursive: true });
const records = [];
for (const preset of IMAGE_STYLE_PRESETS) {
  const sourcePath = previewPath(preset);
  let exists = false;
  let width = 0;
  let height = 0;
  try {
    const metadata = await sharp(sourcePath).metadata();
    exists = true;
    width = Number(metadata.width || 0);
    height = Number(metadata.height || 0);
  } catch {
    // Missing or invalid images remain visible in the manifest.
  }
  records.push({
    id: preset.id,
    category: preset.category,
    label: preset.label.zh,
    description: preset.description.zh,
    previewCaseId: preset.previewCaseId || null,
    previewAsset: preset.previewAsset || '',
    sourcePath,
    exists,
    width,
    height
  });
}

const sourceCounts = new Map();
for (const record of records) sourceCounts.set(record.sourcePath, (sourceCounts.get(record.sourcePath) || 0) + 1);
for (const record of records) record.reused = sourceCounts.get(record.sourcePath) || 0;
await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(records, null, 2)}\n`);

const cardWidth = 320;
const cardHeight = 292;
const imageWidth = 292;
const imageHeight = 198;
const columns = 4;
const rows = 4;
const pageSize = columns * rows;

for (let pageIndex = 0; pageIndex * pageSize < records.length; pageIndex += 1) {
  const pageRecords = records.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const width = cardWidth * columns;
  const height = cardHeight * rows;
  const composites = [];
  for (let index = 0; index < pageRecords.length; index += 1) {
    const record = pageRecords[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * cardWidth + 14;
    const top = row * cardHeight + 14;
    if (record.exists) {
      const image = await sharp(record.sourcePath)
        .resize(imageWidth, imageHeight, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer();
      composites.push({ input: image, left, top });
    }
    const source = record.previewAsset ? 'asset' : `case ${record.previewCaseId}`;
    const labelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="76">
      <rect width="100%" height="100%" fill="#111827"/>
      <text x="4" y="18" font-family="Microsoft YaHei, sans-serif" font-size="15" font-weight="700" fill="#f8fafc">${xml(record.label)}</text>
      <text x="4" y="39" font-family="Microsoft YaHei, sans-serif" font-size="11" fill="#a7f3d0">${xml(record.description)}</text>
      <text x="4" y="60" font-family="Segoe UI, sans-serif" font-size="10" fill="#94a3b8">${xml(record.id)} · ${source} · reused ${record.reused}</text>
    </svg>`);
    composites.push({ input: labelSvg, left, top: top + imageHeight });
  }
  await sharp({
    create: { width, height, channels: 3, background: '#070c16' }
  }).composite(composites).png().toFile(path.join(outputDir, `sheet-${String(pageIndex + 1).padStart(2, '0')}.png`));
}

const candidateCaseIds = [
  24, 27, 41, 43, 45, 58, 60, 91, 105, 118, 120, 132, 141, 142, 143, 156,
  172, 179, 187, 191, 195, 204, 208, 213, 215, 220, 224, 229, 238, 240, 246,
  263, 270, 271, 276, 279, 281, 285, 286, 291, 298, 299, 304, 305, 310, 313,
  316, 319, 321, 322, 327, 328, 339, 344, 345, 352, 353, 354, 355, 356, 364,
  366, 367, 371, 373, 375, 376, 378, 379, 384, 388, 390, 400, 401, 403, 404,
  406, 410, 412, 415, 416, 425, 426, 427, 428, 430, 434, 435, 439, 441, 442,
  444, 449, 451, 452, 458, 459, 460, 463, 464, 465, 466, 467, 470, 471, 473,
  474, 475, 476, 477, 478, 480, 481, 482, 483, 485, 486, 487, 488, 489, 490,
  494, 495, 496, 497, 498, 499, 500, 501, 503, 504, 506, 507, 509, 511, 512,
  513, 514, 515, 516, 517, 518, 519
];
const candidateRecords = candidateCaseIds.map((id) => caseById.get(id)).filter(Boolean);
for (let pageIndex = 0; pageIndex * pageSize < candidateRecords.length; pageIndex += 1) {
  const pageRecords = candidateRecords.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const width = cardWidth * columns;
  const height = cardHeight * rows;
  const composites = [];
  for (let index = 0; index < pageRecords.length; index += 1) {
    const record = pageRecords[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * cardWidth + 14;
    const top = row * cardHeight + 14;
    const sourcePath = path.join(root, 'data', record.thumbnail.replace(/^\/?images\//, 'images/'));
    const image = await sharp(sourcePath)
      .resize(imageWidth, imageHeight, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer();
    composites.push({ input: image, left, top });
    const labelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="76">
      <rect width="100%" height="100%" fill="#111827"/>
      <text x="4" y="20" font-family="Microsoft YaHei, sans-serif" font-size="14" font-weight="700" fill="#f8fafc">${record.id} · ${xml(record.title)}</text>
      <text x="4" y="45" font-family="Microsoft YaHei, sans-serif" font-size="10" fill="#94a3b8">${xml(record.category)}</text>
    </svg>`);
    composites.push({ input: labelSvg, left, top: top + imageHeight });
  }
  await sharp({
    create: { width, height, channels: 3, background: '#070c16' }
  }).composite(composites).png().toFile(path.join(outputDir, `candidates-${String(pageIndex + 1).padStart(2, '0')}.png`));
}

const generatedDir = path.join(root, 'data', 'images', 'style-presets', 'generated');
const generatedFiles = await fs.readdir(generatedDir, { withFileTypes: true }).catch(() => []);
const generatedRecords = generatedFiles
  .filter((item) => item.isFile() && /\.webp$/i.test(item.name))
  .map((item) => {
    const id = item.name.replace(/\.webp$/i, '');
    const preset = IMAGE_STYLE_PRESETS.find((candidate) => candidate.id === id);
    return {
      id,
      label: preset?.label?.zh || id,
      description: preset?.description?.zh || '',
      sourcePath: path.join(generatedDir, item.name)
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

for (let pageIndex = 0; pageIndex * pageSize < generatedRecords.length; pageIndex += 1) {
  const pageRecords = generatedRecords.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const width = cardWidth * columns;
  const height = cardHeight * rows;
  const composites = [];
  for (let index = 0; index < pageRecords.length; index += 1) {
    const record = pageRecords[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * cardWidth + 14;
    const top = row * cardHeight + 14;
    const preview = await sharp(record.sourcePath)
      .resize(imageWidth, imageHeight, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer();
    composites.push({ input: preview, left, top });
    const labelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="76">
      <rect width="100%" height="100%" fill="#111827"/>
      <text x="4" y="18" font-family="Microsoft YaHei, sans-serif" font-size="15" font-weight="700" fill="#f8fafc">${xml(record.label)}</text>
      <text x="4" y="39" font-family="Microsoft YaHei, sans-serif" font-size="11" fill="#a7f3d0">${xml(record.description)}</text>
      <text x="4" y="60" font-family="Segoe UI, sans-serif" font-size="10" fill="#94a3b8">${xml(record.id)} · generated</text>
    </svg>`);
    composites.push({ input: labelSvg, left, top: top + imageHeight });
  }
  await sharp({
    create: { width, height, channels: 3, background: '#070c16' }
  }).composite(composites).png().toFile(path.join(outputDir, `generated-${String(pageIndex + 1).padStart(2, '0')}.png`));
}

console.log(`Audited ${records.length} style preview mappings and ${candidateRecords.length} candidate cases into ${outputDir}`);
