import { getDb } from './_lib/local-db.js';
import { authenticateRequest } from './_lib/local-auth.js';
import { readStoredImage } from './_lib/storage.js';

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

  const generationId = String(req.query?.id || '').trim();
  const row = getDb().prepare(`
    SELECT storage_path, status FROM generations WHERE id = ? AND user_id = ?
  `).get(generationId, auth.user.id);
  if (!row || row.status !== 'succeeded' || !row.storage_path) {
    res.status(404).json({ ok: false, error: 'IMAGE_NOT_FOUND' });
    return;
  }

  try {
    const stored = await readStoredImage(row.storage_path);
    res.statusCode = 200;
    res.setHeader('Content-Type', stored.contentType || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.end(stored.bytes);
  } catch {
    res.status(404).json({ ok: false, error: 'IMAGE_NOT_FOUND' });
  }
}
