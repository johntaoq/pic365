import {
  getEcommerceProject,
  getEcommerceProjectAsset,
  getGeneration
} from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import {
  getEcommerceProjectOutput,
  updateEcommerceOutputConsistency
} from '../_lib/ecommerce-p1-db.js';
import { generateText, isProviderConfigured } from '../_lib/provider.js';
import { applyRateLimitHeaders, checkRateLimit } from '../_lib/rate-limit.js';
import { readJsonBody } from '../_lib/request.js';
import { readStoredImage } from '../_lib/storage.js';

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
  if (!generation?.storage_path || !master?.storagePath) {
    return json(res, 400, { ok: false, error: 'CONSISTENCY_INPUT_UNAVAILABLE' });
  }

  try {
    const [masterImage, generatedImage] = await Promise.all([
      readStoredImage(master.storagePath),
      readStoredImage(generation.storage_path)
    ]);
    const identity = project.identitySpec || {};
    const prompt = [
      'You are a strict ecommerce product-identity quality inspector.',
      'Compare image 1, the authoritative product master, with image 2, the generated ecommerce result.',
      'Judge only product identity consistency: geometry, proportions, openings, controls, handles, accessories, item count, colors, materials, packaging and brand-mark placement.',
      'Do not penalize intended changes in camera angle, crop, background, lighting or usage scene.',
      'Return JSON only: {"score":0-100,"summary":"concise Chinese summary","issues":["specific Chinese issue"]}.',
      `Product name: ${project.productName}.`,
      `Identity specification: ${JSON.stringify(identity)}.`
    ].join(' ');
    const result = await generateText({
      model: CONSISTENCY_MODEL,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl(masterImage), detail: 'high' } },
          { type: 'image_url', image_url: { url: dataUrl(generatedImage), detail: 'high' } }
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

