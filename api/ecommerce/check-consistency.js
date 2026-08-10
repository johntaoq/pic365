import {
  getEcommerceProject,
  getEcommerceProjectAsset,
  getGeneration,
  listEcommerceProjectAssets
} from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import {
  getEcommerceProjectOutput,
  listEcommerceProjectOutputs,
  updateEcommerceOutputConsistency
} from '../_lib/ecommerce-p1-db.js';
import { selectEcommerceAssetsForSlot } from '../_lib/ecommerce-prompt.js';
import { generateText, isProviderConfigured } from '../_lib/provider.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';
import { readJsonBody } from '../_lib/request.js';
import { readStoredImage } from '../_lib/storage.js';
import { getEcommercePlatform, getEcommerceVisualStyle } from '../../shared/ecommerce-catalog.js';

const CONSISTENCY_MODEL = process.env.AI_CONSISTENCY_MODEL || process.env.AI_LLM_MODEL || 'gpt-5.6-luna';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function dataUrl(stored) {
  return `data:${stored.contentType || 'image/png'};base64,${stored.bytes.toString('base64')}`;
}

function parseResult(content) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  const issues = (Array.isArray(parsed.issues) ? parsed.issues : [])
    .map((item) => String(item || '').trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 8);
  const status = score >= 85 ? 'passed' : score >= 65 ? 'warning' : 'failed';
  return {
    status,
    score,
    issues,
    summary: String(parsed.summary || '').trim().slice(0, 600) || (issues[0] || '')
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  if (!isProviderConfigured()) return json(res, 500, { ok: false, error: 'SERVER_NOT_CONFIGURED' });

  const rateLimit = checkRateLimit(req, { key: `consistency:${auth.user.id}`, limit: 20, windowMs: 60 * 60 * 1000 });
  applyRateLimitHeaders(res, rateLimit);
  if (!rateLimit.allowed) return json(res, 429, { ok: false, error: 'RATE_LIMITED' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_CONSISTENCY_REQUEST' });
  }
  const projectId = cleanText(body.projectId, 80);
  const slotId = cleanText(body.slotId, 80);
  const project = getEcommerceProject(auth.user.id, projectId);
  const output = getEcommerceProjectOutput(auth.user.id, projectId, slotId);
  if (!project) return json(res, 404, { ok: false, error: 'PROJECT_NOT_FOUND' });
  if (!output?.selectedGenerationId) return json(res, 400, { ok: false, error: 'OUTPUT_NOT_READY' });
  const generation = getGeneration(auth.user.id, output.selectedGenerationId);
  const master = getEcommerceProjectAsset(auth.user.id, project.masterAssetId);
  if (!generation?.storage_path || !master?.storagePath || master.assetType !== 'product') {
    return json(res, 400, { ok: false, error: 'CONSISTENCY_INPUT_UNAVAILABLE' });
  }

  try {
    const platform = getEcommercePlatform(project.platformId);
    const slot = platform.slots.find((item) => item.id === slotId);
    if (!slot) return json(res, 400, { ok: false, error: 'INVALID_PROJECT_SLOT' });
    const selectedAssets = selectEcommerceAssetsForSlot({
      project,
      platform,
      slot,
      assets: listEcommerceProjectAssets(auth.user.id, project.id),
      limit: 5
    });
    const supportingAssets = selectedAssets
      .filter((asset) => asset.id !== project.masterAssetId && asset.assetType !== 'reference')
      .slice(0, 3);
    const anchorOutput = listEcommerceProjectOutputs(auth.user.id, project.id)
      .find((item) => item.slotId !== slotId && item.selectedGenerationId);
    const anchorGeneration = anchorOutput ? getGeneration(auth.user.id, anchorOutput.selectedGenerationId) : null;
    const [masterImage, generatedImage] = await Promise.all([
      readStoredImage(master.storagePath),
      readStoredImage(generation.storage_path)
    ]);
    const supportImages = [];
    for (const asset of supportingAssets) {
      try {
        supportImages.push({ asset, stored: await readStoredImage(asset.storagePath) });
      } catch {
        // Optional evidence can be unavailable without invalidating the master/result comparison.
      }
    }
    let anchorImage = null;
    if (anchorGeneration?.storage_path) {
      try {
        anchorImage = await readStoredImage(anchorGeneration.storage_path);
      } catch {
        anchorImage = null;
      }
    }
    const identity = project.identitySpec || {};
    const style = getEcommerceVisualStyle(project.visualStyleId);
    const supportManifest = supportImages.map(({ asset }, index) => (
      `Image ${index + 3}: ${asset.assetType} evidence${asset.purpose ? ` (${asset.purpose})` : ''}`
    ));
    if (anchorImage) supportManifest.push(`Image ${supportImages.length + 3}: adopted image from another slot, style reference only`);
    const prompt = [
      'You are a strict ecommerce product-identity quality inspector.',
      'Compare image 1, the authoritative product master, with image 2, the generated ecommerce result.',
      supportManifest.length ? `Additional evidence: ${supportManifest.join('; ')}.` : '',
      'Evidence priority is strict: image 1 controls product geometry and identity; supporting product, packaging, and logo images control only the facts they visibly prove; an adopted set image controls style only.',
      'Evaluate product geometry, proportions, openings, controls, handles, accessories, item count, colors, materials, packaging, brand-mark placement, physical support, contact points, reflections, hand anatomy, and scale realism.',
      `Also verify that image 2 reasonably fulfills the ${platform.nameEn} slot "${slot.nameEn}" without inventing unsupported facts.`,
      `The intended visual system is "${style.nameEn}". If a set-style anchor is supplied, allow the slot composition and background to differ but flag a clearly unrelated palette, lighting language, or material rendering.`,
      'Do not penalize intended camera angle, crop, background, lighting, or usage-scene changes. Do not flag details that are merely hidden or occluded; flag only visible contradictions or implausible additions.',
      'Every issue must be a concrete Chinese repair instruction describing what is wrong and what must be restored. Avoid vague comments such as looks different or improve quality.',
      'Return JSON only: {"score":0-100,"summary":"concise Chinese summary","issues":["specific Chinese issue"]}.',
      `Product name: ${project.productName}.`,
      `Identity specification: ${JSON.stringify(identity)}.`
    ].filter(Boolean).join(' ');
    const imageContent = [
      { type: 'image_url', image_url: { url: dataUrl(masterImage), detail: 'high' } },
      { type: 'image_url', image_url: { url: dataUrl(generatedImage), detail: 'high' } },
      ...supportImages.map(({ stored }) => ({ type: 'image_url', image_url: { url: dataUrl(stored), detail: 'high' } }))
    ];
    if (anchorImage) imageContent.push({ type: 'image_url', image_url: { url: dataUrl(anchorImage), detail: 'high' } });
    const result = await generateText({
      model: CONSISTENCY_MODEL,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...imageContent
        ]
      }]
    });
    const consistency = parseResult(result.content);
    if (!consistency) throw new Error('INVALID_CONSISTENCY_RESPONSE');
    const updatedOutput = updateEcommerceOutputConsistency(auth.user.id, projectId, slotId, consistency);
    return json(res, 200, { ok: true, consistency, output: updatedOutput, model: result.model });
  } catch (error) {
    console.warn('Ecommerce consistency check failed', {
      status: error?.status || null,
      code: error?.code || null,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 502, { ok: false, error: 'CONSISTENCY_CHECK_FAILED' });
  }
}
