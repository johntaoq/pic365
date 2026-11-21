import { authenticateRequest } from './_lib/local-auth.js';
import { getChatProviderConfig, requestChatCompletion } from './_lib/chat-engine.js';
import { reserveMagicCredit, completeMagicCredit, cancelMagicCredit } from './_lib/magic-billing.js';
import { readJsonBody } from './_lib/request.js';
import { IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT } from '../shared/image-prompt-optimizer.js';
import { newAPITextErrorResponse, ensureNewAPIAuthorization } from './_lib/newapi-account.js';

const MAX_PROMPT_LENGTH = 6000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const requestWindows = new Map();

function json(res, status, payload) {
  res.status(status).json(payload);
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

function fallbackPrompt(prompt, { language, referenceCount, hasAnnotations }) {
  if (hasAnnotations) return prompt.slice(0, MAX_PROMPT_LENGTH);
  const zh = language === 'zh';
  const additions = zh
    ? [
        '画面要求：主体清晰，构图关系明确，光线、材质、色彩和背景协调，细节自然可信。',
        referenceCount ? `参考图：按输入顺序使用 ${referenceCount} 张参考图，保留用户指向的关键视觉特征。` : ''
      ]
    : [
        'Image direction: keep the main subject clear, the composition intentional, and the lighting, materials, colors, background, and details visually coherent and believable.',
        referenceCount ? `References: use all ${referenceCount} reference images in input order and preserve the visual features the user points to.` : ''
      ];
  return [prompt, ...additions.filter(Boolean)].join('\n\n').slice(0, MAX_PROMPT_LENGTH);
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
    return json(res, 400, { ok: false, error: 'INVALID_PROMPT' });
  }

  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) return json(res, 400, { ok: false, error: 'INVALID_PROMPT' });
  const language = body.language === 'zh' ? 'zh' : 'en';
  const referenceCount = Math.max(0, Math.min(9, Number(body.referenceCount) || 0));
  const hasAnnotations = Boolean(body.hasAnnotations);
  let provider;
  let reservation;
  try {
    await ensureNewAPIAuthorization(auth.user.id);
    provider = getChatProviderConfig('', { includeSecret: true, userId: auth.user.id, purpose: 'magic' });
    if (!provider?.apiKey) return json(res, 503, { ok: false, error: 'PROMPT_OPTIMIZER_UNAVAILABLE' });
    reservation = reserveMagicCredit(auth.user.id, provider, {
      source: 'ai_magic_prompt',
      text: `${IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT}\n${prompt}`
    });
  } catch (error) {
    const external = newAPITextErrorResponse(error);
    if (external) return json(res, external.status, { ok: false, error: external.error });
    if (['CREDITS_REQUIRED', 'GROUP_BUDGET_REQUIRED', 'GROUP_BALANCE_REQUIRED'].includes(error?.code)) return json(res, 402, { ok: false, error: error.code });
    if (error?.code === 'GROUP_ACCESS_SUSPENDED') return json(res, 403, { ok: false, error: error.code });
    return json(res, 500, { ok: false, error: 'AI_TOOL_CHARGE_FAILED' });
  }

  try {
    const result = await requestChatCompletion({
      provider,
      messages: [
        { role: 'system', content: IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Output language: ${language === 'zh' ? 'Simplified Chinese' : 'English'}\nReference image count: ${referenceCount}\nContains colored edit annotations: ${hasAnnotations ? 'yes' : 'no'}\n\n<user_prompt>\n${prompt}\n</user_prompt>`
        }
      ]
    });
    const optimized = String(result.content || '').trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const billing = completeMagicCredit(reservation, result.usage);
    return json(res, 200, {
      ok: true,
      prompt: optimized ? optimized.slice(0, MAX_PROMPT_LENGTH) : fallbackPrompt(prompt, { language, referenceCount, hasAnnotations }),
      model: result.model,
      ...billing
    });
  } catch (error) {
    console.warn('Image prompt optimization failed', {
      status: error?.status || null,
      code: error?.code || null,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    let refundedUser;
    try {
      refundedUser = cancelMagicCredit(reservation, error?.code || 'PROMPT_OPTIMIZATION_FAILED');
    } catch (refundError) {
      console.error('Image prompt optimization refund failed', {
        code: refundError?.code || null,
        message: String(refundError?.message || 'unknown').slice(0, 240)
      });
    }
    const external = newAPITextErrorResponse(error);
    return json(res, external?.status || 502, {
      ok: false,
      error: external?.error || 'PROMPT_OPTIMIZATION_FAILED',
      model: provider.model,
      user: refundedUser
    });
  }
}
