import { createLoginSession } from '../../_lib/local-auth.js';
import { getOrCreateWatchaUser } from '../../_lib/local-db.js';
import {
  authErrorRedirect,
  exchangeCodeForToken,
  fetchWatchaUserInfo,
  getWatchaConfig,
  parseCookies,
  safeReturnTo,
  watchaCookieHeaders,
  WATCHA_COOKIE_NAMES
} from '../../_lib/watcha.js';

function redirect(res, location, secureCookie = true) {
  const existing = res.getHeader?.('Set-Cookie');
  const cookies = [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    ...watchaCookieHeaders(secureCookie)
  ];
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.writeHead(302, { Location: location });
  res.end();
}
function logWatchaFailure(stage, error) {
  console.warn('Watcha OAuth failed', {
    stage,
    message: String(error?.message || error || 'unknown').slice(0, 240),
    status: error?.status || null
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const cookies = parseCookies(req);
  const config = getWatchaConfig(req);
  const secureCookie = config.appUrl.startsWith('https://');
  const returnTo = safeReturnTo(cookies[WATCHA_COOKIE_NAMES.returnTo], req);
  if (req.query?.error) return redirect(res, authErrorRedirect(req, 'watcha_denied', returnTo), secureCookie);

  const code = String(req.query?.code || '').trim();
  const state = String(req.query?.state || '').trim();
  const expectedState = cookies[WATCHA_COOKIE_NAMES.state] || '';
  const verifier = cookies[WATCHA_COOKIE_NAMES.verifier] || '';
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return redirect(res, authErrorRedirect(req, 'watcha_state_failed', returnTo), secureCookie);
  }

  try {
    const token = await exchangeCodeForToken(config, { code, verifier });
    const watchaUser = await fetchWatchaUserInfo(config, token.access_token);
    const user = getOrCreateWatchaUser(watchaUser, token);
    createLoginSession(req, res, user.id);
    return redirect(res, returnTo, secureCookie);
  } catch (error) {
    logWatchaFailure('callback', error);
    return redirect(res, authErrorRedirect(req, 'watcha_login_failed', returnTo), secureCookie);
  }
}
