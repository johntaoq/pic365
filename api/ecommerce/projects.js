import {
  createEcommerceProject,
  getEcommerceProject,
  listEcommerceProjects,
  updateEcommerceProject
} from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { syncEcommerceProjectOutputs } from '../_lib/ecommerce-p1-db.js';
import { readJsonBody } from '../_lib/request.js';
import {
  ECOMMERCE_INDUSTRIES,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_VISUAL_STYLES,
  getDefaultSlotIds,
  getEcommerceTemplate
} from '../../shared/ecommerce-catalog.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\r\n/g, '\n').slice(0, maxLength);
}

function cleanSellingPoints(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value || '').split(/\r?\n|[，,；;]/);
  return [...new Set(entries.map((item) => cleanText(item, 160)).filter(Boolean))].slice(0, 12);
}

function cleanAiBriefOriginals(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const legacyAudience = cleanText(value.targetAudience, 1000);
  const fields = Object.fromEntries(
    ['coreUser', 'coreScenario', 'sellingPoints']
      .map((field) => [field, cleanText(value[field] || (field === 'coreUser' ? legacyAudience : ''), field === 'sellingPoints' ? 2000 : 1000)])
      .filter(([, content]) => Boolean(content))
  );
  const identitySpec = cleanIdentitySpec(value.identitySpec);
  return Object.keys(identitySpec).length ? { ...fields, identitySpec } : fields;
}

function cleanIdentitySpec(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const limits = {
    structure: 1200,
    colorsMaterials: 1200,
    brandMarks: 1000,
    packaging: 1200,
    includedItems: 1200,
    mustKeep: 1600,
    mustAvoid: 1600
  };
  return Object.fromEntries(
    Object.entries(limits)
      .map(([field, maxLength]) => [field, cleanText(value[field], maxLength)])
      .filter(([, content]) => Boolean(content))
  );
}

function normalizeProjectInput(body) {
  const platformId = cleanText(body.platformId, 40);
  const platform = ECOMMERCE_PLATFORMS.find((item) => item.id === platformId);
  if (!platform) return { error: 'INVALID_PLATFORM' };

  const industryId = cleanText(body.industryId, 60);
  if (!ECOMMERCE_INDUSTRIES.some((item) => item.id === industryId)) return { error: 'INVALID_INDUSTRY' };

  const visualStyleId = cleanText(body.visualStyleId, 60);
  if (!ECOMMERCE_VISUAL_STYLES.some((item) => item.id === visualStyleId)) return { error: 'INVALID_VISUAL_STYLE' };

  const templateId = cleanText(body.templateId, 80);
  const template = templateId ? getEcommerceTemplate(templateId) : null;
  if (templateId && (!template || template.platformId !== platformId)) return { error: 'INVALID_TEMPLATE' };

  const productName = cleanText(body.productName, 120);
  if (!productName) return { error: 'PRODUCT_NAME_REQUIRED' };
  const legacyAudience = cleanText(body.targetAudience, 1000);
  const hasCoreUser = Object.prototype.hasOwnProperty.call(body, 'coreUser');
  const hasCoreScenario = Object.prototype.hasOwnProperty.call(body, 'coreScenario');
  const coreUser = cleanText(hasCoreUser ? body.coreUser : legacyAudience, 1000);
  const coreScenario = cleanText(hasCoreScenario ? body.coreScenario : '', 1000);

  const validSlotIds = new Set(platform.slots.map((item) => item.id));
  const selectedSlots = [...new Set(
    (Array.isArray(body.selectedSlots) ? body.selectedSlots : [])
      .map((item) => cleanText(item, 80))
      .filter((item) => validSlotIds.has(item))
  )];

  return {
    value: {
      projectName: cleanText(body.projectName, 120) || `${productName} · ${platform.nameZh}`,
      platformId,
      industryId,
      productName,
      brandName: cleanText(body.brandName, 120),
      coreUser,
      coreScenario,
      targetAudience: [coreUser, coreScenario].filter(Boolean).join('\n'),
      sellingPoints: cleanSellingPoints(body.sellingPoints),
      specifications: cleanText(body.specifications, 2000),
      prohibitedContent: cleanText(body.prohibitedContent, 2000),
      aiBriefOriginals: cleanAiBriefOriginals(body.aiBriefOriginals),
      identitySpec: cleanIdentitySpec(body.identitySpec),
      templateId,
      visualStyleId,
      selectedSlots: selectedSlots.length ? selectedSlots : getDefaultSlotIds(platformId)
    }
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'GET') {
    const projectId = cleanText(req.query?.id, 80);
    if (projectId) {
      const project = getEcommerceProject(auth.user.id, projectId);
      if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
      return json(res, 200, { ok: true, project });
    }
    return json(res, 200, { ok: true, projects: listEcommerceProjects(auth.user.id) });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_PROJECT' });
  }

  const normalized = normalizeProjectInput(body);
  if (normalized.error) return json(res, 400, { ok: false, error: normalized.error });

  if (req.method === 'POST') {
    const project = createEcommerceProject(auth.user.id, normalized.value);
    syncEcommerceProjectOutputs(auth.user.id, project.id, project.selectedSlots);
    return json(res, 201, { ok: true, project });
  }

  const projectId = cleanText(body.id || req.query?.id, 80);
  if (!projectId) return json(res, 400, { ok: false, error: 'PROJECT_ID_REQUIRED' });
  const project = updateEcommerceProject(auth.user.id, projectId, normalized.value);
  if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  syncEcommerceProjectOutputs(auth.user.id, project.id, project.selectedSlots);
  return json(res, 200, { ok: true, project });
}
