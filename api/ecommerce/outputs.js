import { getEcommerceProject, listEcommerceProjectGenerations } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';

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
  const projectId = String(req.query?.projectId || '').trim();
  if (!projectId || !getEcommerceProject(auth.user.id, projectId)) {
    return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  }

  const generations = listEcommerceProjectGenerations(auth.user.id, projectId).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    slotId: row.slot_id,
    versionNumber: Number(row.version_number || 1),
    status: row.status,
    size: row.size,
    quality: row.quality,
    errorCode: row.error_code || '',
    imageUrl: row.status === 'succeeded' && row.storage_path
      ? `/api/generated?id=${encodeURIComponent(row.id)}`
      : '',
    createdAt: row.created_at || '',
    completedAt: row.completed_at || ''
  }));
  return json(res, 200, { ok: true, generations });
}
