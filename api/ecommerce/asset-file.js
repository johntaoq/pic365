import { getEcommerceProjectAsset } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { readStoredImage } from '../_lib/storage.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).end();
    return;
  }

  const auth = authenticateRequest(req);
  if (auth.error) {
    res.status(auth.status || 401).json({ ok: false, error: auth.error });
    return;
  }

  const assetId = String(req.query?.id || '').trim();
  const asset = getEcommerceProjectAsset(auth.user.id, assetId);
  if (!asset?.storagePath) {
    res.status(404).json({ ok: false, error: 'ASSET_NOT_FOUND' });
    return;
  }

  try {
    const stored = await readStoredImage(asset.storagePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', stored.contentType || asset.mimeType || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(stored.bytes);
  } catch {
    res.status(404).json({ ok: false, error: 'ASSET_NOT_FOUND' });
  }
}
