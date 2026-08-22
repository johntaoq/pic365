import { getEcommerceProject, getGeneration } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { listEcommerceProjectOutputs } from '../_lib/ecommerce-p1-db.js';
import {
  getEcommerceDeliveryDocument,
  listEcommerceDeliveryDocuments,
  reorderEcommerceDeliveryDocuments,
  setEcommerceDeliveryDocumentsInclusion,
  syncEcommerceDeliveryDocument,
  updateEcommerceDeliveryDocument
} from '../_lib/ecommerce-delivery-db.js';
import { readJsonBody } from '../_lib/request.js';
import { createDeliveryDocumentDraft } from '../../shared/ecommerce-delivery.js';
import { getEcommercePlatform } from '../../shared/ecommerce-catalog.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function generatedOutputsForProject(userId, project) {
  const selectedSlots = new Set(project.selectedSlots || []);
  return listEcommerceProjectOutputs(userId, project.id).filter((output) => {
    if (!selectedSlots.has(output.slotId) || !output.selectedGenerationId) return false;
    const generation = getGeneration(userId, output.selectedGenerationId);
    return generation?.status === 'succeeded' && Boolean(generation.storage_path || generation.output_url);
  });
}

function documentsForProject(userId, project) {
  const generatedSlots = new Set(generatedOutputsForProject(userId, project).map((output) => output.slotId));
  return listEcommerceDeliveryDocuments(userId, project.id).filter((document) => generatedSlots.has(document.slotId));
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'GET') {
    const projectId = cleanText(req.query?.projectId, 80);
    const project = getEcommerceProject(auth.user.id, projectId);
    if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
    return json(res, 200, { ok: true, documents: documentsForProject(auth.user.id, project) });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return json(res, error?.status === 413 ? 413 : 400, { ok: false, error: error?.code || 'INVALID_DELIVERY_REQUEST' });
  }

  const projectId = cleanText(body.projectId, 80);
  const project = getEcommerceProject(auth.user.id, projectId);
  if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });

  if (req.method === 'POST') {
    if (body.action !== 'prepare') return json(res, 400, { ok: false, error: 'INVALID_DELIVERY_ACTION' });
    const platform = getEcommercePlatform(project.platformId);
    const outputs = generatedOutputsForProject(auth.user.id, project);
    const outputsBySlot = new Map(outputs.map((output) => [output.slotId, output]));
    const documents = [];
    for (const [index, slotId] of project.selectedSlots.entries()) {
      const slot = platform.slots.find((item) => item.id === slotId);
      const output = outputsBySlot.get(slotId);
      if (!slot || !output) continue;
      documents.push(syncEcommerceDeliveryDocument(auth.user.id, createDeliveryDocumentDraft({
        project,
        slot,
        output,
        language: body.language === 'en' ? 'en' : 'zh',
        order: index + 1
      })));
    }
    return json(res, 200, { ok: true, documents });
  }

  if (body.action === 'reorder') {
    if (!reorderEcommerceDeliveryDocuments(auth.user.id, project.id, body.documentIds)) {
      return json(res, 400, { ok: false, error: 'INVALID_DELIVERY_ORDER' });
    }
    return json(res, 200, { ok: true, documents: documentsForProject(auth.user.id, project) });
  }

  if (body.action === 'set-inclusion') {
    if (!setEcommerceDeliveryDocumentsInclusion(
      auth.user.id,
      project.id,
      Array.isArray(body.documentIds) ? body.documentIds : [],
      body.includeInExport !== false
    )) {
      return json(res, 400, { ok: false, error: 'INVALID_DELIVERY_SELECTION' });
    }
    return json(res, 200, { ok: true, documents: documentsForProject(auth.user.id, project) });
  }

  const documentId = cleanText(body.documentId, 80);
  const document = getEcommerceDeliveryDocument(auth.user.id, documentId);
  if (!document || document.projectId !== project.id || !project.selectedSlots.includes(document.slotId)) {
    return json(res, 404, { ok: false, error: 'DELIVERY_DOCUMENT_NOT_FOUND' });
  }
  const updated = updateEcommerceDeliveryDocument(auth.user.id, document.id, body.document || {});
  return json(res, 200, { ok: true, document: updated });
}
