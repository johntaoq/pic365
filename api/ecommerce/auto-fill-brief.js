import { createHash } from 'node:crypto';
import { authenticateRequest } from '../_lib/local-auth.js';
import {
  chargeAiToolCredit,
  getEcommerceProject,
  listEcommerceProjectAssets,
  markEcommerceProjectAutomaticAnalysis,
  saveEcommerceProjectAutomaticAnalysis
} from '../_lib/local-db.js';
import { generateText, isProviderConfigured } from '../_lib/provider.js';
import { readJsonBody } from '../_lib/request.js';
import { readStoredImage } from '../_lib/storage.js';
import { ECOMMERCE_INDUSTRIES, getEcommerceSubcategory } from '../../shared/ecommerce-catalog.js';
import {
  buildFallbackEcommerceBrief,
  mergeRefreshedAiIdentitySpec,
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

function automaticAnalysisFingerprint(project, assets) {
  const evidence = selectEvidenceAssets(project, assets).map((asset) => ({
    id: asset.id,
    type: asset.assetType,
    purpose: asset.purpose || '',
    size: Number(asset.fileSize || 0),
    storagePath: asset.storagePath || ''
  }));
  return createHash('sha256').update(JSON.stringify({
    productName: project.productName,
    brandName: project.brandName,
    industryId: project.industryId,
    subcategoryId: project.subcategoryId || '',
    masterAssetId: project.masterAssetId || '',
    evidence
  })).digest('hex');
}

function mergeAutomaticBrief(project, generatedBrief) {
  const originals = project.aiBriefOriginals && typeof project.aiBriefOriginals === 'object'
    ? { ...project.aiBriefOriginals }
    : {};
  const nextOriginals = { ...originals };
  const currentText = {
    coreUser: String(project.coreUser || '').trim(),
    coreScenario: String(project.coreScenario || '').trim(),
    sellingPoints: (project.sellingPoints || []).join('\n').trim()
  };
  const generatedText = {
    coreUser: String(generatedBrief.coreUser || '').trim(),
    coreScenario: String(generatedBrief.coreScenario || '').trim(),
    sellingPoints: String(generatedBrief.sellingPoints || '').trim()
  };
  const mergedText = { ...currentText };
  for (const field of ['coreUser', 'coreScenario', 'sellingPoints']) {
    const previousAiValue = String(originals[field] || '').trim();
    const replaceable = !currentText[field] || (previousAiValue && currentText[field] === previousAiValue);
    if (!replaceable || !generatedText[field]) continue;
    mergedText[field] = generatedText[field];
    nextOriginals[field] = generatedText[field];
  }
  const mergedIdentity = mergeRefreshedAiIdentitySpec(
    project.identitySpec,
    generatedBrief.identitySpec,
    originals.identitySpec
  );
  if (Object.keys(mergedIdentity.aiOriginals).length) nextOriginals.identitySpec = mergedIdentity.aiOriginals;
  return {
    coreUser: mergedText.coreUser,
    coreScenario: mergedText.coreScenario,
    sellingPoints: mergedText.sellingPoints.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    identitySpec: mergedIdentity.identitySpec,
    aiBriefOriginals: nextOriginals
  };
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
  const automatic = body.automatic === true;
  const projectId = cleanText(body.projectId, 80);
  let project = projectId ? getEcommerceProject(auth.user.id, projectId) : null;
  if (automatic && !project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });

  const industryId = automatic ? project.industryId : cleanText(body.industryId, 60);
  const industry = ECOMMERCE_INDUSTRIES.find((item) => item.id === industryId);
  const productName = automatic ? project.productName : cleanText(body.productName, 120);
  const brandName = automatic ? project.brandName : cleanText(body.brandName, 120);
  if (!industry) return json(res, 400, { ok: false, error: 'INVALID_INDUSTRY' });
  if (!productName) return json(res, 400, { ok: false, error: 'PRODUCT_NAME_REQUIRED' });

  let evidence = [];
  let projectAssets = [];
  const providerConfigured = isProviderConfigured();
  if (projectId) {
    project ||= getEcommerceProject(auth.user.id, projectId);
    if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
    const sameProductContext = project.industryId === industryId
      && project.productName.trim().toLocaleLowerCase() === productName.toLocaleLowerCase();
    if (providerConfigured && sameProductContext) {
      projectAssets = listEcommerceProjectAssets(auth.user.id, projectId);
      evidence = await loadEvidence(project, projectAssets);
    }
  }

  const fingerprint = automatic ? automaticAnalysisFingerprint(project, projectAssets) : '';
  if (automatic && !evidence.length) {
    markEcommerceProjectAutomaticAnalysis(auth.user.id, projectId, { fingerprint, status: 'waiting-for-image' });
    return json(res, 409, { ok: false, error: 'PRODUCT_IMAGE_REQUIRED' });
  }
  if (automatic && project.autoAnalysisStatus === 'completed' && project.autoAnalysisFingerprint === fingerprint) {
    return json(res, 200, { ok: true, analyzed: true, cached: true, project });
  }
  if (automatic) markEcommerceProjectAutomaticAnalysis(auth.user.id, projectId, { fingerprint, status: 'running' });

  const subcategory = getEcommerceSubcategory(industryId, project?.subcategoryId);
  const categoryName = language === 'zh'
    ? `${industry.nameZh} / ${subcategory.nameZh}`
    : `${industry.nameEn} / ${subcategory.nameEn}`;

  const input = {
    language,
    industryName: language === 'zh' ? industry.nameZh : industry.nameEn,
    productCategory: categoryName,
    categoryExamples: language === 'zh'
      ? `${subcategory.nameZh}；${industry.examplesZh}`
      : `${subcategory.nameEn}; ${industry.examplesEn}`,
    productName,
    brandName,
    focus: automatic ? 'complete' : body.focus === 'identitySpec' ? 'identitySpec' : 'brief',
    currentBrief: automatic ? normalizeCurrentBrief(project) : normalizeCurrentBrief(body.currentBrief),
    evidence
  };
  const fallbackBrief = buildFallbackEcommerceBrief(input);

  if (automatic) {
    if (!providerConfigured) {
      markEcommerceProjectAutomaticAnalysis(auth.user.id, projectId, { fingerprint, status: 'provider-unavailable' });
      return json(res, 503, { ok: false, error: 'AI_PROVIDER_NOT_CONFIGURED' });
    }
    try {
      const generated = await generateBrief(input);
      const merged = mergeAutomaticBrief(project, generated.brief);
      const savedProject = saveEcommerceProjectAutomaticAnalysis(auth.user.id, projectId, {
        ...merged,
        fingerprint,
        status: 'completed'
      });
      return json(res, 200, {
        ok: true,
        analyzed: true,
        model: generated.model,
        project: savedProject
      });
    } catch (error) {
      markEcommerceProjectAutomaticAnalysis(auth.user.id, projectId, { fingerprint, status: 'failed' });
      console.warn('Automatic ecommerce product analysis failed', {
        status: error?.status || null,
        code: error?.code || null,
        message: String(error?.message || 'unknown').slice(0, 240)
      });
      return json(res, 502, { ok: false, error: 'AUTOMATIC_ANALYSIS_FAILED' });
    }
  }

  let user;
  try {
    user = chargeAiToolCredit(auth.user.id, {
      source: input.focus === 'identitySpec' ? 'ai_magic_identity' : 'ai_magic_brief',
      amount: 1,
      metadata: { projectId, focus: input.focus }
    });
  } catch (error) {
    if (['CREDITS_REQUIRED', 'GROUP_BUDGET_REQUIRED', 'GROUP_BALANCE_REQUIRED'].includes(error?.code)) return json(res, 402, { ok: false, error: error.code });
    if (error?.code === 'GROUP_ACCESS_SUSPENDED') return json(res, 403, { ok: false, error: error.code });
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
