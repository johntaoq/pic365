import {
  createEcommerceProject,
  getEcommerceProject,
  listEcommerceProjects,
  updateEcommerceProject
} from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { readJsonBody } from '../_lib/request.js';
import {
  ECOMMERCE_INDUSTRIES,
  ECOMMERCE_PLATFORMS,
  ECOMMERCE_VISUAL_STYLES,
  getDefaultSlotIds
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
  return Object.fromEntries(
    ['targetAudience', 'sellingPoints', 'specifications', 'prohibitedContent']
      .map((field) => [field, cleanText(value[field], field === 'targetAudience' ? 1000 : 2000)])
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

  const productName = cleanText(body.productName, 120);
  if (!productName) return { error: 'PRODUCT_NAME_REQUIRED' };

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
      targetAudience: cleanText(body.targetAudience, 1000),
      sellingPoints: cleanSellingPoints(body.sellingPoints),
      specifications: cleanText(body.specifications, 2000),
      prohibitedContent: cleanText(body.prohibitedContent, 2000),
      aiBriefOriginals: cleanAiBriefOriginals(body.aiBriefOriginals),
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
    return json(res, 201, { ok: true, project });
  }

  const projectId = cleanText(body.id || req.query?.id, 80);
  if (!projectId) return json(res, 400, { ok: false, error: 'PROJECT_ID_REQUIRED' });
  const project = updateEcommerceProject(auth.user.id, projectId, normalized.value);
  if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  return json(res, 200, { ok: true, project });
}
