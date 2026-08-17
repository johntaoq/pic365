import { authenticateRequest } from '../_lib/local-auth.js';
import { chargeAiToolCredit, getEcommerceProject, listEcommerceProjectAssets } from '../_lib/local-db.js';
import { generateText, isProviderConfigured } from '../_lib/provider.js';
import { readJsonBody } from '../_lib/request.js';
import { readStoredImage } from '../_lib/storage.js';
import { ECOMMERCE_INDUSTRIES } from '../../shared/ecommerce-catalog.js';
import {
  buildFallbackEcommerceBrief,
  normalizeAiIdentitySpec,
  normalizeEcommerceAiBrief
} from '../../shared/ecommerce-brief.js';
import {
  buildEcommerceBriefRequestText,
  ECOMMERCE_BRIEF_SYSTEM_PROMPT
} from '../../shared/ecommerce-brief-prompt.js';

const BRIEF_MODEL = process.env.AI_BRIEF_MODEL || process.env.AI_SANITIZE_MODEL || 'gpt-5.6-luna';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const MAX_ATTEMPTS = 2;
const requestWindows = new Map();

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\r\n/g, '\n').slice(0, maxLength);
}

function checkRateLimit(userId) {
  const now = Date.now();
  const current = requestWindows.get(userId) || { startedAt: now, count: 0 };
  if (now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    current.startedAt = now;
    current.count = 0;
  }
  current.count += 1;
  requestWindows.set(userId, current);
  return current.count <= RATE_LIMIT_MAX_REQUESTS;
}

function parseModelJson(content) {
  const text = String(content || '').trim();
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const match = unfenced.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeCurrentBrief(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    coreUser: cleanText(input.coreUser, 1000),
    coreScenario: cleanText(input.coreScenario, 1000),
    sellingPoints: cleanText(Array.isArray(input.sellingPoints) ? input.sellingPoints.join('\n') : input.sellingPoints, 2000),
    identitySpec: normalizeAiIdentitySpec(input.identitySpec)
  };
}

function selectEvidenceAssets(project, assets) {
  const score = (asset) => {
    if (asset.id === project?.masterAssetId) return 1000;
    if (asset.assetType === 'product') return asset.purpose === 'identity' ? 900 : 700;
    if (asset.assetType === 'packaging') return 500;
    if (asset.assetType === 'logo') return 400;
    return 0;
  };
  return [...(assets || [])]
    .filter((asset) => score(asset) > 0)
    .sort((left, right) => score(right) - score(left) || Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
    .slice(0, 4);
}

async function loadEvidence(project, assets) {
  const evidence = [];
  for (const asset of selectEvidenceAssets(project, assets)) {
    try {
      const stored = await readStoredImage(asset.storagePath);
      evidence.push({
        label: asset.id === project.masterAssetId
          ? 'authoritative product master'
          : asset.assetType === 'packaging'
            ? 'packaging evidence'
            : asset.assetType === 'logo'
              ? 'authorized logo evidence'
              : 'supporting product evidence',
        dataUrl: `data:${stored.contentType || 'image/png'};base64,${stored.bytes.toString('base64')}`
      });
    } catch {
      // A missing optional evidence image should not make the conservative local fallback unavailable.
    }
  }
  return evidence;
}

async function generateBrief(input) {
  const fallbackBrief = buildFallbackEcommerceBrief(input);
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const evidenceManifest = input.evidence.map((item, index) => `Image ${index + 1}: ${item.label}`).join('\n');
      const requestText = buildEcommerceBriefRequestText({ ...input, evidenceManifest });
      const result = await generateText({
        model: BRIEF_MODEL,
        temperature: 0.25,
        messages: [
          { role: 'system', content: ECOMMERCE_BRIEF_SYSTEM_PROMPT },
          {
            role: 'user',
            content: input.evidence.length
              ? [
                  { type: 'text', text: requestText },
                  ...input.evidence.map((item) => ({ type: 'image_url', image_url: { url: item.dataUrl, detail: 'high' } }))
                ]
              : requestText
          }
        ]
      });
      const brief = normalizeEcommerceAiBrief(parseModelJson(result.content), { language: input.language });
      if (brief) {
        return {
          brief: {
            ...brief,
            identitySpec: { ...fallbackBrief.identitySpec, ...brief.identitySpec }
          },
          model: result.model,
          fallback: false
        };
      }
      lastError = new Error('INVALID_BRIEF_RESPONSE');
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('BRIEF_GENERATION_FAILED');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  if (!checkRateLimit(auth.user.id)) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_BRIEF_REQUEST' });
  }

  const language = body.language === 'zh' ? 'zh' : 'en';
  const industryId = cleanText(body.industryId, 60);
  const industry = ECOMMERCE_INDUSTRIES.find((item) => item.id === industryId);
  const productName = cleanText(body.productName, 120);
  const brandName = cleanText(body.brandName, 120);
  const projectId = cleanText(body.projectId, 80);
  if (!industry) return json(res, 400, { ok: false, error: 'INVALID_INDUSTRY' });
  if (!productName) return json(res, 400, { ok: false, error: 'PRODUCT_NAME_REQUIRED' });

  let project = null;
  let evidence = [];
  const providerConfigured = isProviderConfigured();
  if (projectId) {
    project = getEcommerceProject(auth.user.id, projectId);
    if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
    const sameProductContext = project.industryId === industryId
      && project.productName.trim().toLocaleLowerCase() === productName.toLocaleLowerCase();
    if (providerConfigured && sameProductContext) {
      evidence = await loadEvidence(project, listEcommerceProjectAssets(auth.user.id, projectId));
    }
  }

  const input = {
    language,
    industryName: language === 'zh' ? industry.nameZh : industry.nameEn,
    productCategory: language === 'zh' ? industry.nameZh : industry.nameEn,
    categoryExamples: language === 'zh' ? industry.examplesZh : industry.examplesEn,
    productName,
    brandName,
    focus: body.focus === 'identitySpec' ? 'identitySpec' : 'brief',
    currentBrief: normalizeCurrentBrief(body.currentBrief),
    evidence
  };
  const fallbackBrief = buildFallbackEcommerceBrief(input);
  let user;
  try {
    user = chargeAiToolCredit(auth.user.id, {
      source: input.focus === 'identitySpec' ? 'ai_magic_identity' : 'ai_magic_brief',
      amount: 1,
      metadata: { projectId, focus: input.focus }
    });
  } catch (error) {
    if (error?.code === 'CREDITS_REQUIRED') return json(res, 402, { ok: false, error: 'CREDITS_REQUIRED' });
    return json(res, 500, { ok: false, error: 'AI_TOOL_CHARGE_FAILED' });
  }

  if (!providerConfigured) {
    return json(res, 200, {
      ok: true,
      brief: fallbackBrief,
      model: 'local-product-brief',
      fallback: true,
      user
    });
  }

  try {
    const generated = await generateBrief(input);
    return json(res, 200, { ok: true, ...generated, user });
  } catch (error) {
    console.warn('AI product brief generation failed', {
      status: error?.status || null,
      code: error?.code || null,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 200, {
      ok: true,
      brief: fallbackBrief,
      model: 'local-product-brief',
      fallback: true,
      user
    });
  }
}
