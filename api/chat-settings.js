import { authenticateRequest } from './_lib/local-auth.js';
import { getUserChatSettings, saveUserChatSettings } from './_lib/chat-assistant-settings.js';
import { readJsonBody } from './_lib/request.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    const settings = req.method === 'GET' ? getUserChatSettings(auth.user.id)
      : saveUserChatSettings(auth.user.id, await readJsonBody(req, { maxBytes: 4096 }));
    return res.status(200).json({ ok: true, settings });
  } catch (error) {
    return res.status(error.status || 400).json({ ok: false, error: error.code || 'CHAT_SETTINGS_FAILED' });
  }
}
