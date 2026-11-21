import sharp from 'sharp';
import { authenticateRequest } from './_lib/local-auth.js';
import { readJsonBody } from './_lib/request.js';
import { listPrivateTryOnModels, removePrivateTryOnModel, saveGeneratedTryOnModel, uploadPrivateTryOnModel } from './_lib/clothing-try-on-models.js';

const MAX_BYTES = 10 * 1024 * 1024;
export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'GET') return res.status(200).json({ ok: true, models: listPrivateTryOnModels(auth.user.id) });
  try {
    const body = await readJsonBody(req, { maxBytes: Math.ceil(MAX_BYTES * 4 / 3) + 16384 });
    if (req.method === 'DELETE') {
      removePrivateTryOnModel(auth.user.id, String(body.modelId || ''));
      return res.status(200).json({ ok: true });
    }
    if (body.generationId) {
      const model = saveGeneratedTryOnModel(auth.user.id, String(body.generationId), body.definition);
      return res.status(200).json({ ok: true, model });
    }
    const match = String(body.imageDataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i);
    if (!match) return res.status(400).json({ ok: false, error: 'INVALID_REFERENCE_IMAGE_FORMAT' });
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > MAX_BYTES) return res.status(413).json({ ok: false, error: 'REFERENCE_IMAGE_TOO_LARGE' });
    const image = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(image.format) || !image.width || !image.height) throw Object.assign(new Error('INVALID_REFERENCE_IMAGE_FORMAT'), { code: 'INVALID_REFERENCE_IMAGE_FORMAT' });
    const model = await uploadPrivateTryOnModel(auth.user.id, { bytes, mimeType: `image/${image.format}`, definition: body.definition, adultConfirmed: body.adultConfirmed });
    return res.status(201).json({ ok: true, model });
  } catch (error) {
    const code = error?.code || 'MODEL_SAVE_FAILED';
    const status = code.includes('NOT_FOUND') ? 404 : code === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400;
    return res.status(status).json({ ok: false, error: code });
  }
}
