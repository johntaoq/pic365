import { authenticateRequest } from './_lib/local-auth.js';
import { getChatProviderConfig, listChatProviderConfigs } from './_lib/chat-engine.js';
import { readJsonBody } from './_lib/request.js';
import { estimateMagicPrice } from '../shared/upstream-pricing.js';
import { IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT } from '../shared/image-prompt-optimizer.js';
import { ECOMMERCE_BRIEF_SYSTEM_PROMPT } from '../shared/ecommerce-brief-prompt.js';
import { getUserChatSettings } from './_lib/chat-assistant-settings.js';
import { estimateTextTokens } from './_lib/text-token-estimate.js';
import { newAPITextErrorResponse, ensureNewAPIAuthorization } from './_lib/newapi-account.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  if (req.method === 'GET') {
    const purpose = req.query?.purpose === 'magic' ? 'magic' : 'assistant';
    const providers = purpose === 'assistant' ? getUserChatSettings(auth.user.id).providers
      : listChatProviderConfigs({ userId: auth.user.id, purpose });
    return res.status(200).json({ ok: true, providers });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  try {
    const body = await readJsonBody(req);
    await ensureNewAPIAuthorization(auth.user.id);
    const provider = getChatProviderConfig('', { includeSecret: false, userId: auth.user.id, purpose: 'magic' });
    if (!provider) return res.status(403).json({ ok: false, error: 'TEXT_MODEL_NOT_AVAILABLE' });
    const systemPrompt = body.mode === 'ecommerce' ? ECOMMERCE_BRIEF_SYSTEM_PROMPT : IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT;
    const text = `${systemPrompt}\n${String(body.text || '').slice(0, 48000)}`;
    const { capacityCenti, ...quote } = estimateMagicPrice(provider, {
      text,
      estimatedTextTokens: estimateTextTokens(text),
      outputTokens: body.mode === 'ecommerce' ? 1200 : undefined,
      imageCount: body.mode === 'ecommerce' ? body.imageCount : 0,
      fixedPrice: body.mode !== 'ecommerce'
    });
    return res.status(200).json({ ok: true, quote });
  } catch (error) {
    const external = newAPITextErrorResponse(error);
    if (external) return res.status(external.status).json({ ok: false, error: external.error });
    return res.status(400).json({ ok: false, error: 'INVALID_PRICING_REQUEST' });
  }
}
