import { clearNewAPILoginCookie, finishNewAPILogin } from '../../_lib/newapi-account.js';
import { createLoginSession, logoutRequest } from '../../_lib/local-auth.js';

export default async function handler(req, res, sourceId = 'newapi16') {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    const { userId, landingPath } = await finishNewAPILogin(req, sourceId);
    logoutRequest(req, res);
    createLoginSession(req, res, userId);
    clearNewAPILoginCookie(res, sourceId);
    return res.redirect(303, landingPath);
  } catch {
    clearNewAPILoginCookie(res, sourceId);
    return res.redirect(303, '/?newapi_login=failed');
  }
}
