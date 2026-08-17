import { getEcommerceProject, listEcommerceProjectGenerations } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import {
  archiveEcommerceGeneration,
  getEcommerceProjectOutput,
  listEcommerceProjectOutputs,
  selectEcommerceOutputGeneration,
  setEcommerceOutputLocked
} from '../_lib/ecommerce-p1-db.js';
import { readJsonBody } from '../_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function generationPayload(row, { includePrompt = false } = {}) {
  return {
    id: row.id,
    projectId: row.project_id,
    slotId: row.slot_id,
    versionNumber: Number(row.version_number || 1),
    status: row.status,
    size: row.size,
    quality: row.quality,
    errorCode: row.error_code || '',
    prompt: includePrompt ? row.prompt || '' : '',
    promptHidden: !includePrompt,
    imageUrl: row.status === 'succeeded' && row.storage_path
      ? `/api/generated?id=${encodeURIComponent(row.id)}`
      : '',
    createdAt: row.created_at || '',
    completedAt: row.completed_at || ''
  };
}

function projectForRequest(userId, projectId) {
  return projectId ? getEcommerceProject(userId, projectId) : null;
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'GET') {
    const projectId = cleanText(req.query?.projectId, 80);
    if (!projectForRequest(auth.user.id, projectId)) {
      return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
    }
    const generations = listEcommerceProjectGenerations(auth.user.id, projectId)
      .map((row) => generationPayload(row, { includePrompt: Boolean(auth.user.isSuperAdmin) }));
    const outputs = listEcommerceProjectOutputs(auth.user.id, projectId);
    return json(res, 200, { ok: true, generations, outputs });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_OUTPUT_REQUEST' });
  }

  const projectId = cleanText(body.projectId || req.query?.projectId, 80);
  const slotId = cleanText(body.slotId || req.query?.slotId, 80);
  if (!projectForRequest(auth.user.id, projectId)) {
    return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  }

  if (req.method === 'DELETE') {
    const generationId = cleanText(body.generationId || req.query?.generationId, 80);
    const archived = archiveEcommerceGeneration(auth.user.id, projectId, slotId, generationId);
    if (archived.error === 'SELECTED_VERSION') return json(res, 409, { ok: false, error: archived.error });
    if (archived.error) return json(res, 404, { ok: false, error: archived.error });
    return json(res, 200, { ok: true });
  }

  const action = cleanText(body.action, 40);
  if (action === 'select') {
    if (getEcommerceProjectOutput(auth.user.id, projectId, slotId)?.locked) {
      return json(res, 409, { ok: false, error: 'SLOT_LOCKED' });
    }
    const output = selectEcommerceOutputGeneration(
      auth.user.id,
      projectId,
      slotId,
      cleanText(body.generationId, 80)
    );
    if (!output) return json(res, 404, { ok: false, error: 'VERSION_NOT_FOUND' });
    return json(res, 200, { ok: true, output });
  }
  if (action === 'lock') {
    const output = setEcommerceOutputLocked(auth.user.id, projectId, slotId, Boolean(body.locked));
    if (!output) return json(res, 400, { ok: false, error: 'OUTPUT_NOT_READY' });
    return json(res, 200, { ok: true, output });
  }

  const output = getEcommerceProjectOutput(auth.user.id, projectId, slotId);
  return json(res, 400, { ok: false, error: 'INVALID_OUTPUT_ACTION', output });
}
