import { authenticateRequest } from '../_lib/local-auth.js';
import { ensureImageVariants, getVariantRecord, recordAssetUsage } from '../_lib/media-assets.js';
import { getStoredFileInfo, openStoredFileStream, readStoredFileRange } from '../_lib/storage.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function safeDownloadName(value) {
  return String(value || 'asset')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 160) || 'asset';
}

const MIME_EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'application/pdf': 'pdf'
});

function extensionFromStoragePath(value) {
  const match = String(value || '').split(/[?#]/, 1)[0].match(/\.([a-z0-9]{1,10})$/i);
  return match?.[1]?.toLowerCase() || '';
}

export function assetDownloadName(asset = {}, variant = {}, contentType = '') {
  const name = safeDownloadName(asset.name);
  if (/\.[a-z0-9]{1,10}$/i.test(name)) return name;
  const normalizedMime = String(contentType || variant.mimeType || asset.mimeType || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const extension = MIME_EXTENSIONS[normalizedMime] || extensionFromStoragePath(variant.storagePath);
  return extension ? `${name}.${extension}` : name;
}

export function parseByteRange(value, total) {
  const match = String(value || '').trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || !Number.isSafeInteger(total) || total <= 0) return null;
  const [, startValue, endValue] = match;
  if (!startValue && !endValue) return { invalid: true };
  if (!startValue) {
    const suffixLength = Number(endValue);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { invalid: true };
    return { start: Math.max(0, total - suffixLength), end: total - 1 };
  }
  const start = Number(startValue);
  if (!Number.isSafeInteger(start) || start < 0 || start >= total) return { invalid: true };
  const requestedEnd = endValue ? Number(endValue) : total - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return { invalid: true };
  return { start, end: Math.min(requestedEnd, total - 1) };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  const assetId = String(req.query?.id || '').trim();
  const requestedVariant = String(req.query?.variant || 'original').trim();
  let record = getVariantRecord(auth.user.id, assetId, requestedVariant);
  if (record?.asset?.mediaType === 'image' && !record.variant && ['thumbnail', 'preview'].includes(requestedVariant)) {
    await ensureImageVariants(auth.user.id, assetId).catch(() => undefined);
    record = getVariantRecord(auth.user.id, assetId, requestedVariant);
  }
  if (!record?.asset) return json(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  if (!record.variant && requestedVariant !== 'original') record = getVariantRecord(auth.user.id, assetId, 'original');
  if (!record?.variant?.storagePath) return json(res, 404, { ok: false, error: 'ASSET_VARIANT_NOT_FOUND' });
  try {
    const stored = await getStoredFileInfo(record.variant.storagePath);
    if (!stored?.byteLength) throw new Error('ASSET_FILE_NOT_FOUND');
    const total = stored.byteLength;
    const range = parseByteRange(req.headers?.range, total);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', stored.contentType || record.variant.mimeType || record.asset.mimeType);
    res.setHeader('Cache-Control', requestedVariant === 'original'
      ? 'private, max-age=3600'
      : 'private, max-age=86400, stale-while-revalidate=604800');
    if (req.query?.download === '1') {
      const downloadName = assetDownloadName(
        record.asset,
        record.variant,
        stored.contentType || record.variant.mimeType || record.asset.mimeType
      );
      const fallbackExtension = extensionFromStoragePath(downloadName);
      const fallbackName = `asset${fallbackExtension ? `.${fallbackExtension}` : ''}`;
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
      );
    }
    recordAssetUsage(auth.user.id, assetId, req.query?.download === '1' ? 'download' : 'view', 'variant', requestedVariant);
    if (range) {
      if (range.invalid) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      const { start, end } = range;
      const count = end - start + 1;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', count);
      res.status(206);
      const stream = await openStoredFileStream(record.variant.storagePath, { offset: start, count });
      if (typeof res.stream === 'function') return res.stream(stream);
      if (res.raw) {
        stream.on('error', () => res.raw.destroy());
        stream.pipe(res.raw);
        return;
      }
      if (typeof res.write === 'function' && typeof res.on === 'function') {
        stream.on('error', () => res.destroy?.());
        stream.pipe(res);
        return;
      }
      return res.end(await readStoredFileRange(record.variant.storagePath, { offset: start, count }));
    }
    res.setHeader('Content-Length', total);
    res.status(200);
    const stream = await openStoredFileStream(record.variant.storagePath);
    if (typeof res.stream === 'function') return res.stream(stream);
    if (res.raw) {
      stream.on('error', () => res.raw.destroy());
      stream.pipe(res.raw);
      return;
    }
    if (typeof res.write === 'function' && typeof res.on === 'function') {
      stream.on('error', () => res.destroy?.());
      stream.pipe(res);
      return;
    }
    return res.end(await readStoredFileRange(record.variant.storagePath));
  } catch {
    return json(res, 404, { ok: false, error: 'ASSET_FILE_NOT_FOUND' });
  }
}
