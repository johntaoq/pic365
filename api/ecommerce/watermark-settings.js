import { authenticateRequest } from '../_lib/local-auth.js';
import {
  getEcommerceWatermarkSettings,
  saveEcommerceWatermarkSettings
} from '../_lib/ecommerce-watermark-settings.js';
import { readJsonBody } from '../_lib/request.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, settings: getEcommerceWatermarkSettings(auth.user.id) });
    }
    const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
    if (body?.userId !== auth.user.id) {
      return res.status(403).json({ ok: false, error: 'WATERMARK_ACCOUNT_MISMATCH' });
    }
    const settings = await saveEcommerceWatermarkSettings(auth.user.id, body.settings);
    return res.status(200).json({ ok: true, settings });
  } catch (error) {
    if (error.status === 413) return res.status(413).json({ ok: false, error: 'REQUEST_BODY_TOO_LARGE' });
    if (error.code === 'LAYOUT_WATERMARK_INVALID' || error instanceof SyntaxError) {
      return res.status(400).json({ ok: false, error: 'WATERMARK_SETTINGS_INVALID' });
    }
    console.warn('Watermark settings failed', { message: String(error?.message || 'unknown').slice(0, 240) });
    return res.status(500).json({ ok: false, error: 'WATERMARK_SETTINGS_FAILED' });
  }
}
