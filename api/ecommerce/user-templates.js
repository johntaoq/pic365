import { getEcommerceProject } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import {
  createEcommerceUserTemplate,
  deleteEcommerceUserTemplate,
  getEcommerceUserTemplate,
  listEcommerceDeliveryDocuments,
  listEcommerceUserTemplates
} from '../_lib/ecommerce-delivery-db.js';
import { createEcommerceProjectFromTemplate } from '../_lib/ecommerce-project-copy.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';
import { readJsonBody } from '../_lib/request.js';
import { ECOMMERCE_PLATFORMS } from '../../shared/ecommerce-catalog.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function projectConfig(project) {
  return {
    projectName: '',
    platformId: project.platformId,
    industryId: project.industryId,
    productName: '新商品',
    brandName: '',
    coreUser: '',
    coreScenario: '',
    targetAudience: '',
    sellingPoints: [],
    specifications: '',
    prohibitedContent: '',
    aiBriefOriginals: {},
    identitySpec: {},
    templateId: project.templateId,
    visualStyleId: project.visualStyleId,
    selectedSlots: project.selectedSlots
  };
}

function deliveryConfig(userId, projectId) {
  return listEcommerceDeliveryDocuments(userId, projectId).map((document) => ({
    slotId: document.slotId,
    documentType: document.documentType,
    targetWidth: document.targetWidth,
    targetHeight: document.targetHeight,
    outputFormat: document.outputFormat,
    themeId: document.themeId,
    layoutId: document.layoutId,
    safeArea: document.safeArea,
    includeInExport: document.includeInExport,
    moduleOrder: document.moduleOrder,
    advanced: document.advanced
  }));
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  if (req.method === 'GET') return json(res, 200, { ok: true, templates: listEcommerceUserTemplates(auth.user.id) });
  const rateLimit = checkRateLimit(req, { key: `user-templates:${auth.user.id}`, limit: 80, windowMs: 60 * 60 * 1000 });
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });
  if (req.method === 'DELETE') {
    const templateId = cleanText(req.query?.id, 80);
    if (!deleteEcommerceUserTemplate(auth.user.id, templateId)) return json(res, 404, { ok: false, error: 'TEMPLATE_NOT_FOUND' });
    return json(res, 200, { ok: true });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_TEMPLATE_REQUEST' });
  }
  if (body.action === 'create-project') {
    const template = getEcommerceUserTemplate(auth.user.id, cleanText(body.templateId, 80));
    if (!template) return json(res, 404, { ok: false, error: 'TEMPLATE_NOT_FOUND' });
    const targetPlatformId = cleanText(body.targetPlatformId, 40) || template.platformId;
    if (!ECOMMERCE_PLATFORMS.some((platform) => platform.id === targetPlatformId)) {
      return json(res, 400, { ok: false, error: 'INVALID_PLATFORM' });
    }
    const project = createEcommerceProjectFromTemplate(auth.user.id, template, {
      projectName: cleanText(body.projectName, 120),
      targetPlatformId
    });
    return json(res, 201, { ok: true, project });
  }
  if (body.action !== 'save') return json(res, 400, { ok: false, error: 'INVALID_TEMPLATE_ACTION' });
  const project = getEcommerceProject(auth.user.id, cleanText(body.projectId, 80));
  if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  const name = cleanText(body.name, 120);
  if (!name) return json(res, 400, { ok: false, error: 'TEMPLATE_NAME_REQUIRED' });
  if (listEcommerceUserTemplates(auth.user.id).length >= 50) {
    return json(res, 409, { ok: false, error: 'TEMPLATE_LIMIT_REACHED' });
  }
  const template = createEcommerceUserTemplate(auth.user.id, {
    name,
    description: cleanText(body.description, 500),
    platformId: project.platformId,
    industryId: project.industryId,
    projectConfig: projectConfig(project),
    deliveryConfig: deliveryConfig(auth.user.id, project.id)
  });
  return json(res, 201, { ok: true, template });
}
