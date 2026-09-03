import { authenticateRequest } from './_lib/local-auth.js';
import {
  buildChatMessages,
  clearChatConversation,
  commitChatExchange,
  deleteChatMessage,
  getChatProviderConfig,
  getChatResultByRequestId,
  listChatMessages,
  requestChatCompletion,
  reserveChatCreditCapacity
} from './_lib/chat-engine.js';
import { releaseCreditReservation } from './_lib/local-db.js';
import { readJsonBody } from './_lib/request.js';

const MAX_TEXT_LENGTH = 6000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function clean(value, length) {
  return String(value || '').trim().slice(0, length);
}

function inspectImageDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mimeType = String(match[1] || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
  return { dataUrl: value, mimeType, byteLength: bytes.length };
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });

  if (req.method === 'GET') {
    const history = listChatMessages(auth.user.id, req.query?.limit);
    const provider = getChatProviderConfig('', { includeSecret: false, userId: auth.user.id });
    return res.status(200).json({
      ok: true,
      ...history,
      provider: provider ? { name: provider.name, model: provider.model } : null,
      user: auth.profile
    });
  }

  if (req.method === 'DELETE') {
    try {
      const body = await readJsonBody(req, { maxBytes: 4096 });
      const messageId = clean(body.messageId, 80);
      if (messageId) {
        const deletedMessage = deleteChatMessage(auth.user.id, messageId);
        const history = listChatMessages(auth.user.id, 60);
        return res.status(200).json({ ok: true, ...history, deletedMessage });
      }
      clearChatConversation(auth.user.id);
      const history = listChatMessages(auth.user.id, 1);
      return res.status(200).json({ ok: true, ...history, messages: [] });
    } catch (error) {
      const code = error?.code || 'CHAT_DELETE_FAILED';
      return res.status(code === 'CHAT_MESSAGE_NOT_FOUND' ? 404 : 400).json({ ok: false, error: code });
    }
  }

  try {
    const body = await readJsonBody(req, { maxBytes: 18 * 1024 * 1024 });
    const text = clean(body.text, MAX_TEXT_LENGTH);
    const clientRequestId = clean(body.clientRequestId, 120);
    if (!text || !clientRequestId) return res.status(400).json({ ok: false, error: 'INVALID_CHAT_MESSAGE' });

    const duplicate = getChatResultByRequestId(auth.user.id, clientRequestId);
    if (duplicate) return res.status(200).json({ ok: true, ...duplicate, duplicate: true });

    const rawImages = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
    const images = rawImages.map((item) => inspectImageDataUrl(item?.dataUrl || item)).filter(Boolean);
    if (rawImages.length !== images.length) return res.status(400).json({ ok: false, error: 'INVALID_CHAT_IMAGE' });
    const provider = getChatProviderConfig('', { userId: auth.user.id });
    if (!provider) return res.status(503).json({ ok: false, error: 'CHAT_PROVIDER_NOT_CONFIGURED' });
    const chat = buildChatMessages(auth.user.id, { text, images: images.map((item) => item.dataUrl) });
    const textualContext = chat.messages.map((item) => Array.isArray(item.content)
      ? item.content.filter((part) => part?.type === 'text').map((part) => part.text || '').join('\n')
      : String(item.content || '')).join('\n');
    const reservation = reserveChatCreditCapacity(auth.user.id, {
      text: textualContext,
      imageCount: images.length,
      provider,
      clientRequestId
    });
    try {
      const result = await requestChatCompletion({
        provider,
        messages: [{ role: 'system', content: provider.systemPrompt }, ...chat.messages]
      });
      const committed = commitChatExchange({
        userId: auth.user.id,
        conversationId: chat.conversationId,
        clientRequestId,
        userText: text,
        attachments: images.map((item, index) => ({
          name: clean(rawImages[index]?.name, 120) || `image-${index + 1}`,
          mimeType: item.mimeType,
          byteLength: item.byteLength
        })),
        assistantText: result.content,
        provider,
        usage: result.usage,
        reservationId: reservation.reservationId,
        upstreamRequestId: result.upstreamRequestId
      });
      return res.status(200).json({ ok: true, ...committed });
    } catch (error) {
      releaseCreditReservation(reservation.reservationId, error?.code || 'CHAT_FAILED');
      throw error;
    }
  } catch (error) {
    const code = error?.code || (error?.name === 'AbortError' ? 'CHAT_PROVIDER_TIMEOUT' : 'CHAT_FAILED');
    const status = ['CREDITS_REQUIRED', 'GROUP_BUDGET_REQUIRED', 'GROUP_BALANCE_REQUIRED'].includes(code) ? 402
      : code === 'AUTH_REQUIRED' ? 401
        : code === 'GROUP_ACCESS_SUSPENDED' ? 403
          : code === 'CHAT_REQUEST_IN_PROGRESS' ? 409
        : code === 'CHAT_USAGE_UNAVAILABLE' ? 502
          : Number(error?.status) >= 400 ? Number(error.status)
            : 500;
    return res.status(status).json({ ok: false, error: code });
  }
}
