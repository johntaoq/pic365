import { listGenerations } from './_lib/local-db.js';
import { authenticateRequest } from './_lib/local-auth.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  const generations = listGenerations(auth.user.id, 30)
    .filter((row) => row.status === 'succeeded' && row.storage_path)
    .map((row) => ({
      id: row.id,
      prompt: row.prompt,
      model: row.model,
      size: row.size,
      quality: row.quality,
      status: row.status,
      imageUrl: `/api/generated?id=${encodeURIComponent(row.id)}`,
      createdAt: row.created_at || '',
      completedAt: row.completed_at || ''
    }));
  return json(res, 200, { ok: true, generations });
}
