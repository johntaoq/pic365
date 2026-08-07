import { getEcommerceProject, getGeneration } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { listEcommerceProjectOutputs } from '../_lib/ecommerce-p1-db.js';
import {
  getEcommerceDeliveryDocument,
  listEcommerceDeliveryDocuments,
  updateEcommerceDeliveryValidation
} from '../_lib/ecommerce-delivery-db.js';
import { analyzeDeliverySource } from '../_lib/ecommerce-renderer.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';
import { readJsonBody } from '../_lib/request.js';
import { validateDeliveryDocument } from '../../shared/ecommerce-delivery.js';
import { getEcommercePlatform } from '../../shared/ecommerce-catalog.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

async function validateOne(userId, project, document, platform) {
  const slot = platform.slots.find((item) => item.id === document.slotId);
  if (!slot) return null;
  let diagnostics = {};
  if (document.sourceGenerationId) {
    const generation = getGeneration(userId, document.sourceGenerationId);
    if (generation?.project_id === project.id && generation.status === 'succeeded' && generation.storage_path) {
      try {
        const analyzed = await analyzeDeliverySource(generation.storage_path);
        diagnostics = {
          sourceWidth: analyzed.sourceWidth,
          sourceHeight: analyzed.sourceHeight,
          whiteCornerRatio: analyzed.whiteCornerRatio
        };
      } catch {
        diagnostics = {};
      }
    }
  }
  const validation = {
    ...validateDeliveryDocument({ document, project, slot, diagnostics }),
    checkedAt: new Date().toISOString(),
    diagnostics
  };
  return updateEcommerceDeliveryValidation(userId, document.id, validation);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  const rateLimit = checkRateLimit(req, { key: `delivery-check:${auth.user.id}`, limit: 80, windowMs: 60 * 60 * 1000 });
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_DELIVERY_CHECK' });
  }
  const projectId = cleanText(body.projectId, 80);
  const project = getEcommerceProject(auth.user.id, projectId);
  if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  const platform = getEcommercePlatform(project.platformId);
  const documentId = cleanText(body.documentId, 80);
  const candidates = documentId
    ? [getEcommerceDeliveryDocument(auth.user.id, documentId)].filter(Boolean)
    : listEcommerceDeliveryDocuments(auth.user.id, project.id)
      .filter((document) => project.selectedSlots.includes(document.slotId) && document.includeInExport);
  if (!candidates.length || candidates.some((document) => document.projectId !== project.id)) {
    return json(res, 404, { ok: false, error: 'DELIVERY_DOCUMENT_NOT_FOUND' });
  }
  const documents = [];
  for (const document of candidates) {
    const validated = await validateOne(auth.user.id, project, document, platform);
    if (validated) documents.push(validated);
  }
  const outputs = listEcommerceProjectOutputs(auth.user.id, project.id);
  const outputsBySlot = new Map(outputs.map((output) => [output.slotId, output]));
  const includedSlotIds = new Set(candidates.map((document) => document.slotId));
  const requiredSlots = platform.slots.filter((slot) => slot.required && includedSlotIds.has(slot.id));
  const missingRequiredSlots = requiredSlots.filter((slot) => !outputsBySlot.get(slot.id)?.selectedGenerationId).map((slot) => slot.id);
  const failedDocuments = documents.filter((document) => document.validation?.failed > 0).length;
  const warningDocuments = documents.filter((document) => document.validation?.warnings > 0).length;
  const checkedDocuments = documents.length;
  const readyDocuments = documents.filter((document) => document.validation?.ready).length;
  return json(res, 200, {
    ok: true,
    documents,
    summary: {
      checkedDocuments,
      readyDocuments,
      failedDocuments,
      warningDocuments,
      missingRequiredSlots,
      ready: failedDocuments === 0 && missingRequiredSlots.length === 0 && checkedDocuments > 0
    }
  });
}
