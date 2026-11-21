import { authenticateRequest } from '../_lib/local-auth.js';
import {
  listEcommerceLayoutFavorites, saveEcommerceLayoutFavorite
} from '../_lib/ecommerce-layout-favorites.js';
import { isEcommerceLayoutId } from '../../shared/ecommerce-layout-favorites.js';
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
      return res.status(200).json({
        ok: true, userId: auth.user.id, favorites: listEcommerceLayoutFavorites(auth.user.id)
      });
    }
    const body = await readJsonBody(req, { maxBytes: 8 * 1024 });
    if (body?.userId !== auth.user.id) {
      return res.status(403).json({ ok: false, error: 'LAYOUT_FAVORITES_ACCOUNT_MISMATCH' });
    }
    if (!isEcommerceLayoutId(body?.layoutId) || typeof body?.favorite !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'INVALID_LAYOUT_FAVORITE' });
    }
    const favorite = saveEcommerceLayoutFavorite(auth.user.id, body.layoutId, body.favorite);
    return res.status(200).json({ ok: true, userId: auth.user.id, layoutId: body.layoutId, favorite });
  } catch (error) {
    if (error.status === 413) return res.status(413).json({ ok: false, error: 'REQUEST_BODY_TOO_LARGE' });
    if (error instanceof SyntaxError) return res.status(400).json({ ok: false, error: 'INVALID_LAYOUT_FAVORITE' });
    console.warn('Layout favorites failed', { code: error?.code || 'LAYOUT_FAVORITES_FAILED' });
    return res.status(500).json({ ok: false, error: 'LAYOUT_FAVORITES_FAILED' });
  }
}
