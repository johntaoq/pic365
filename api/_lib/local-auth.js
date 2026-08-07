import {
  createSession,
  deleteSession,
  getUserBySessionToken,
  getUserProfile,
  normalizeEmail
} from './local-db.js';

export const SESSION_COOKIE = 'member_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function parseCookies(req) {
  const header = req.headers?.cookie || req.headers?.Cookie || '';
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))])
  );
}

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function getSessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE] || bearerToken(req);
}

function secureCookie(req) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwardedProto === 'https';
}

export function setSessionCookie(req, res, token) {
  const secure = secureCookie(req) ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`
  );
}

export function clearSessionCookie(req, res) {
  const secure = secureCookie(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
}

export function authenticateRequest(req, { allowAnonymous = false } = {}) {
  const token = getSessionToken(req);
  const user = getUserBySessionToken(token);
  if (!user) {
    if (allowAnonymous) return { user: null, profile: null, token: null };
    return { error: 'AUTH_REQUIRED', status: 401 };
  }
  return { user, profile: getUserProfile(user.id), token };
}

export function createLoginSession(req, res, userId) {
  const session = createSession(userId);
  setSessionCookie(req, res, session.token);
  return session;
}

export function logoutRequest(req, res) {
  const token = getSessionToken(req);
  deleteSession(token);
  clearSessionCookie(req, res);
}

export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

export function jsonUser(user) {
  return user ? getUserProfile(user.id) : null;
}
