import crypto from 'node:crypto';
import sharp from 'sharp';

import { getGeneration } from './local-db.js';
import { getVariantRecord } from './media-assets.js';
import { readStoredFile, readStoredImage } from './storage.js';
import { IMAGE_REFERENCE_MAX_BYTES, validateImageReferenceInputsForModel } from '../../shared/image-generation.js';

export const MAX_REFERENCE_IMAGES = 9;
const MAX_ANNOTATIONS_PER_IMAGE = 64;
const MAX_INLINE_REFERENCE_TOTAL_BYTES = MAX_REFERENCE_IMAGES * IMAGE_REFERENCE_MAX_BYTES;
const MAX_INLINE_REFERENCE_PIXELS = 40_000_000;
const MAX_BRUSH_POINTS = 512;
const ANNOTATION_TYPES = new Set(['brush', 'rectangle', 'ellipse', 'line']);
const INLINE_REFERENCE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function normalizedMimeType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  return type === 'image/jpg' ? 'image/jpeg' : type;
}

function referenceError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function validateReferenceRequestsForModel(references, model) {
  const count = Array.isArray(references) ? references.length : 0;
  const result = validateImageReferenceInputsForModel({ model, count });
  if (!result.valid) throw referenceError(result.error);
  return result.constraints;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#facc15';
}

export function normalizeReferenceAnnotations(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, MAX_ANNOTATIONS_PER_IMAGE)
    .map((item) => {
      const type = ANNOTATION_TYPES.has(item?.type) ? item.type : 'rectangle';
      const points = type === 'brush'
        ? (Array.isArray(item?.points) ? item.points : [])
          .slice(0, MAX_BRUSH_POINTS)
          .map((point) => ({ x: clamp(point?.x, 0, 1), y: clamp(point?.y, 0, 1) }))
        : [];
      return {
        type,
        x1: clamp(item?.x1 ?? points[0]?.x, 0, 1),
        y1: clamp(item?.y1 ?? points[0]?.y, 0, 1),
        x2: clamp(item?.x2 ?? points.at(-1)?.x, 0, 1),
        y2: clamp(item?.y2 ?? points.at(-1)?.y, 0, 1),
        color: normalizeColor(item?.color),
        strokeWidth: clamp(item?.strokeWidth, 0.001, type === 'brush' ? 0.12 : 0.04),
        ...(type === 'brush' ? { points } : {})
      };
    })
    .filter((item) => item.type !== 'brush' || item.points.length > 1);
}

function parseInlineReference(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match || !INLINE_REFERENCE_TYPES.has(match[1].toLowerCase())) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) return null;
  if (bytes.length > IMAGE_REFERENCE_MAX_BYTES) throw referenceError('REFERENCE_IMAGE_TOO_LARGE');
  return {
    contentType: match[1].toLowerCase(),
    bytes,
    dataUrl: `data:${match[1].toLowerCase()};base64,${bytes.toString('base64')}`
  };
}

export function normalizeReferenceRequests(value) {
  const source = Array.isArray(value) ? value : [];
  if (source.length > MAX_REFERENCE_IMAGES) {
    const error = new Error('TOO_MANY_REFERENCE_IMAGES');
    error.code = 'TOO_MANY_REFERENCE_IMAGES';
    throw error;
  }
  const seen = new Set();
  let inlineBytes = 0;
  return source.flatMap((item) => {
    const generationId = String(item?.generationId || '').trim();
    const assetId = String(item?.assetId || '').trim();
    const inline = generationId || assetId ? null : parseInlineReference(item?.imageDataUrl);
    if (!generationId && !assetId && !inline) {
      const error = new Error('INVALID_REFERENCE_IMAGE');
      error.code = 'INVALID_REFERENCE_IMAGE';
      throw error;
    }
    if (inline) {
      inlineBytes += inline.bytes.length;
      if (inlineBytes > MAX_INLINE_REFERENCE_TOTAL_BYTES) {
        const error = new Error('REFERENCE_IMAGES_TOO_LARGE');
        error.code = 'REFERENCE_IMAGES_TOO_LARGE';
        throw error;
      }
    }
    const identity = assetId
      ? `asset:${assetId}`
      : generationId
      ? `generation:${generationId}`
      : `upload:${crypto.createHash('sha256').update(inline.bytes).digest('hex')}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{
      generationId,
      assetId,
      imageDataUrl: inline?.dataUrl || '',
      annotations: normalizeReferenceAnnotations(item?.annotations)
    }];
  });
}

function annotationSvg(annotations, width, height) {
  const shortSide = Math.max(1, Math.min(width, height));
  const elements = annotations.map((annotation) => {
    const x1 = annotation.x1 * width;
    const y1 = annotation.y1 * height;
    const x2 = annotation.x2 * width;
    const y2 = annotation.y2 * height;
    const strokeWidth = Math.max(2, annotation.strokeWidth * shortSide);
    const common = `fill="none" stroke="${annotation.color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
    if (annotation.type === 'brush') {
      const points = (annotation.points || []).map((point) => `${point.x * width},${point.y * height}`);
      if (points.length < 2) return '';
      return `<polyline points="${points.join(' ')}" ${common} stroke-opacity="0.56"/>`;
    }
    if (annotation.type === 'line') {
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${common}/>`;
    }
    if (annotation.type === 'ellipse') {
      return `<ellipse cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" rx="${Math.abs(x2 - x1) / 2}" ry="${Math.abs(y2 - y1) / 2}" ${common}/>`;
    }
    return `<rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" rx="${Math.max(4, strokeWidth)}" ${common}/>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${elements}</svg>`);
}

async function renderAnnotatedImage(stored, annotations) {
  if (!annotations.length) return stored;
  const normalized = await sharp(stored.bytes).rotate().toBuffer({ resolveWithObject: true });
  const width = normalized.info.width;
  const height = normalized.info.height;
  if (!width || !height) return stored;
  const bytes = await sharp(normalized.data)
    .composite([{ input: annotationSvg(annotations, width, height), top: 0, left: 0 }])
    .png()
    .toBuffer();
  return { bytes, contentType: 'image/png' };
}

export async function loadReferenceImageInputs(userId, references, { model = '' } = {}) {
  const constraints = validateReferenceRequestsForModel(references, model);
  const allowedTypes = new Set(constraints.referenceMimeTypes);
  const images = [];
  for (const reference of references) {
    let stored;
    if (reference.imageDataUrl) {
      const inline = parseInlineReference(reference.imageDataUrl);
      if (!inline) {
        const error = new Error('INVALID_REFERENCE_IMAGE');
        error.code = 'INVALID_REFERENCE_IMAGE';
        throw error;
      }
      stored = { bytes: inline.bytes, contentType: inline.contentType };
    } else if (reference.assetId) {
      const record = getVariantRecord(userId, reference.assetId, 'original');
      if (!record?.asset || record.asset.mediaType !== 'image' || !record.variant?.storagePath) {
        throw referenceError('REFERENCE_IMAGE_NOT_FOUND');
      }
      stored = await readStoredFile(record.variant.storagePath);
    } else {
      const generation = getGeneration(userId, reference.generationId);
      if (!generation || generation.status !== 'succeeded' || !generation.storage_path) {
        const error = new Error('REFERENCE_IMAGE_NOT_FOUND');
        error.code = 'REFERENCE_IMAGE_NOT_FOUND';
        throw error;
      }
      stored = await readStoredImage(generation.storage_path);
    }
    if (!stored?.bytes?.length || stored.bytes.length > IMAGE_REFERENCE_MAX_BYTES) {
      throw referenceError('REFERENCE_IMAGE_TOO_LARGE');
    }
    const sourceType = normalizedMimeType(stored?.contentType);
    if (!allowedTypes.has(sourceType)) {
      throw referenceError('INVALID_REFERENCE_IMAGE_FORMAT');
    }
    try {
      const metadata = await sharp(stored.bytes).metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_INLINE_REFERENCE_PIXELS) {
        throw new Error('INVALID_REFERENCE_IMAGE');
      }
    } catch {
      const error = new Error('INVALID_REFERENCE_IMAGE');
      error.code = 'INVALID_REFERENCE_IMAGE';
      throw error;
    }
    const rendered = await renderAnnotatedImage(stored, reference.annotations);
    images.push(`data:${rendered.contentType || 'image/png'};base64,${rendered.bytes.toString('base64')}`);
  }
  return images;
}

export function buildReferencePrompt(prompt, references, { includeNumberedMap = true } = {}) {
  if (!references.length) return prompt;
  const markedIndexes = references
    .map((reference, index) => reference.annotations.length ? index + 1 : null)
    .filter(Boolean);
  const numberedMap = includeNumberedMap
    ? references.map((reference, index) => index === 0
      ? 'Image 1 / Reference 1 / 图1 / 参考图1 / 母版 = supplied reference image 1. This is the primary image and the default editing subject.'
      : `Image ${index + 1} / Reference ${index + 1} / 图${index + 1} / 参考图${index + 1} = supplied reference image ${index + 1}.`
    ).join('\n')
    : '';
  return [
    `Use the ${references.length} supplied reference image${references.length === 1 ? '' : 's'} in their given order.`,
    numberedMap ? `Fixed image naming and input order:\n${numberedMap}\nInterpret the same number as the same supplied image whenever the user says Image N, Reference N, 图N, or 参考图N. “Master” and “母版” always mean Image 1.` : '',
    markedIndexes.length
      ? 'This is a localized image-editing task, not a new image composition.'
      : 'Preserve the visual facts the user is referring to, but follow the written request for composition and changes.',
    markedIndexes.length
      ? `Reference image${markedIndexes.length === 1 ? '' : 's'} ${markedIndexes.join(', ')} ${markedIndexes.length === 1 ? 'contains' : 'contain'} colored painted or outlined annotations. Modify only the content inside those marked regions. Treat the marks only as editing guides and never reproduce the colored marks in the final image.`
      : '',
    markedIndexes.length
      ? 'Lock every unmarked region. Preserve the original crop, composition, geometry, subject identity, pose, background, lighting, colors, materials, text, logos, edges, shadows, and fine details outside the marked regions exactly. Do not redraw, restyle, reframe, or regenerate the whole image.'
      : '',
    'User request:',
    prompt
  ].filter(Boolean).join('\n');
}
