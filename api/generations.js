import { clearGenerationHistory, hideGenerationFromHistory, listGenerations } from './_lib/local-db.js';
import { authenticateRequest } from './_lib/local-auth.js';
import { readJsonBody } from './_lib/request.js';
import { generatedImageUrl, GENERATED_THUMBNAIL_VARIANT } from '../shared/image-thumbnails.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function imageMimeType(storagePath) {
  const extension = String(storagePath || '').split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  return 'image/png';
}

export default async function handler(req, res) {
  if (!['GET', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'DELETE') {
    const body = await readJsonBody(req);
    const clearAll = body?.all === true;
    const generationId = String(body?.generationId || '').trim();
    if (!clearAll && !generationId) return json(res, 400, { ok: false, error: 'GENERATION_ID_REQUIRED' });
    const removed = clearAll
      ? clearGenerationHistory(auth.user.id)
      : hideGenerationFromHistory(auth.user.id, generationId);
    if (!clearAll && !removed) return json(res, 404, { ok: false, error: 'GENERATION_NOT_FOUND' });
    res.setHeader('Cache-Control', 'private, no-store');
    return json(res, 200, { ok: true, removed });
  }

  const requestedLimit = Number(req.query?.limit || 30);
  const requestedOffset = Number(req.query?.offset || 0);
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 30, 60));
  const offset = Math.max(0, Math.min(Number.isFinite(requestedOffset) ? requestedOffset : 0, 10000));
  const rows = listGenerations(auth.user.id, limit + 1, offset);
  const hasMore = rows.length > limit;
  const canViewSystemPrompts = Boolean(auth.user.isSuperAdmin);
  const generations = rows
    .slice(0, limit)
    .map((row) => {
      const systemPrompt = Boolean(row.project_id);
      const promptHidden = systemPrompt && !canViewSystemPrompts;
      return {
        id: row.id,
        prompt: promptHidden ? '' : row.prompt,
        promptHidden,
        sourceType: systemPrompt ? 'ecommerce' : 'free',
        model: row.model,
        size: row.size,
        quality: row.quality,
        status: row.status,
        imageUrl: generatedImageUrl(row.id),
        thumbnailUrl: generatedImageUrl(row.id, GENERATED_THUMBNAIL_VARIANT),
        mimeType: imageMimeType(row.storage_path),
        createdAt: row.created_at || '',
        completedAt: row.completed_at || ''
      };
    });
  res.setHeader('Cache-Control', 'private, no-store');
  return json(res, 200, {
    ok: true,
    generations,
    hasMore,
    nextOffset: offset + generations.length
  });
}
