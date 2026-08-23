import { randomUUID } from 'node:crypto';
import { authenticateRequest } from './_lib/local-auth.js';
import { chargeAiToolCredit, refundAiToolCredit } from './_lib/local-db.js';
import { getChatProviderConfig, requestChatCompletion } from './_lib/chat-engine.js';
import { readJsonBody } from './_lib/request.js';
import {
  DEFAULT_IMAGE_PROMPT_OPTIMIZER_MODEL,
  IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT
} from '../shared/image-prompt-optimizer.js';

const MAX_PROMPT_LENGTH = 6000;
const PROMPT_MODEL = process.env.AI_PROMPT_MODEL || DEFAULT_IMAGE_PROMPT_OPTIMIZER_MODEL;
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
  const zh = language === 'zh';
  const additions = zh
    ? [
        '画面要求：主体清晰，构图关系明确，光线、材质、色彩和背景协调，细节自然可信。',
        referenceCount ? `参考图：按输入顺序使用 ${referenceCount} 张参考图，保留用户指向的关键视觉特征。` : '',
        hasAnnotations ? '局部修改：彩色线框仅用于标记修改区域，成图中不得保留标记；未标记区域尽量保持不变。' : ''
      ]
    : [
        'Image direction: keep the main subject clear, the composition intentional, and the lighting, materials, colors, background, and details visually coherent and believable.',
        referenceCount ? `References: use all ${referenceCount} reference images in input order and preserve the visual features the user points to.` : '',
        hasAnnotations ? 'Local edit: colored outlines only identify regions to change; remove the marks from the final image and preserve unmarked areas where possible.' : ''
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
  const provider = getChatProviderConfig('', { includeSecret: true });
  if (!provider?.apiKey) {
    return json(res, 503, { ok: false, error: 'PROMPT_OPTIMIZER_UNAVAILABLE' });
  }
  const promptProvider = {
    ...provider,
    model: PROMPT_MODEL,
    maxOutputTokens: Math.min(2048, provider.maxOutputTokens || 2048)
  };
  const requestId = randomUUID();
  let user;
  try {
    user = chargeAiToolCredit(auth.user.id, {
      source: 'ai_magic_prompt',
      amount: 1,
      referenceId: requestId,
      metadata: { referenceCount, hasAnnotations, model: PROMPT_MODEL }
    });
  } catch (error) {
    if (error?.code === 'CREDITS_REQUIRED') return json(res, 402, { ok: false, error: 'CREDITS_REQUIRED' });
    return json(res, 500, { ok: false, error: 'AI_TOOL_CHARGE_FAILED' });
  }

  try {
    const result = await requestChatCompletion({
      provider: promptProvider,
      messages: [
        { role: 'system', content: IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Output language: ${language === 'zh' ? 'Simplified Chinese' : 'English'}\nReference image count: ${referenceCount}\nContains colored edit annotations: ${hasAnnotations ? 'yes' : 'no'}\n\n<user_prompt>\n${prompt}\n</user_prompt>`
        }
      ]
    });
    const optimized = String(result.content || '').trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return json(res, 200, {
      ok: true,
      prompt: optimized ? optimized.slice(0, MAX_PROMPT_LENGTH) : fallbackPrompt(prompt, { language, referenceCount, hasAnnotations }),
      model: result.model,
      user
    });
  } catch (error) {
    console.warn('Image prompt optimization failed', {
      status: error?.status || null,
      code: error?.code || null,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    let refundedUser = user;
    try {
      refundedUser = refundAiToolCredit(auth.user.id, {
        referenceId: requestId,
        errorCode: error?.code || 'PROMPT_OPTIMIZATION_FAILED',
        metadata: { model: PROMPT_MODEL }
      });
    } catch (refundError) {
      console.error('Image prompt optimization refund failed', {
        code: refundError?.code || null,
        message: String(refundError?.message || 'unknown').slice(0, 240)
      });
    }
    return json(res, 502, {
      ok: false,
      error: 'PROMPT_OPTIMIZATION_FAILED',
      model: PROMPT_MODEL,
      user: refundedUser
    });
  }
}
