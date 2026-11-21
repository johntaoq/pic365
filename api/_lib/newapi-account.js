import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getDb, hashPassword, userCanAccessProvider, DEFAULT_SYSTEM_USER_GROUP_ID } from './local-db.js';
import { decryptProviderSecret, encryptProviderSecret } from './provider-secrets.js';
import { listChatProviderConfigs } from './chat-engine.js';
import { requireNewAPIStorageWrite } from './newapi-storage-billing.js';

const sources = {
  newapi16: { source: 'azure16', label: '99Off', accountSuffix: '99off' },
  newapi40: { source: 'azure40', label: 'UniKeyX', accountSuffix: 'unikeyx' },
};
const FLOW_COOKIE = 'pic365_newapi_login';
const opaquePattern = /^[A-Za-z0-9_-]{43}$/;
const subjectPattern = /^[0-9a-f-]{36}$/i;
const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const pendingRenewals = new Map();
const LOGIN_FLOW_SECONDS = 300;

export function getNewAPIConfig(sourceId = 'newapi16') {
  if (!sources[sourceId]) throw Object.assign(new Error('NEWAPI_NOT_CONFIGURED'), { code: 'NEWAPI_NOT_CONFIGURED' });
  const secret = String(process.env[`${sourceId.toUpperCase()}_CLIENT_SECRET`] || '');
  const origin = String(process.env[`${sourceId.toUpperCase()}_ORIGIN`] || '').replace(/\/$/, '');
  const appOrigin = String(process.env.APP_URL || '').replace(/\/$/, '');
  if (secret.length < 32) throw Object.assign(new Error('NEWAPI_NOT_CONFIGURED'), { code: 'NEWAPI_NOT_CONFIGURED' });
  for (const value of [origin, appOrigin]) {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:';
    if ((!local && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw Object.assign(new Error('NEWAPI_NOT_CONFIGURED'), { code: 'NEWAPI_NOT_CONFIGURED' });
    }
  }
  return { ...sources[sourceId], sourceId, secret, origin, appOrigin, callback: `${appOrigin}/api/auth/${sourceId}/callback` };
}

export function sourceForIssuer(issuer) {
  return Object.keys(sources).find((id) => String(process.env[`${id.toUpperCase()}_ORIGIN`] || '').replace(/\/$/, '') === issuer);
}

function credential(row) {
  const stored = decryptProviderSecret(row.token_encrypted);
  return stored.startsWith('sk-') ? { apiKey: stored, binding: '' } : JSON.parse(stored);
}

function account(userId, db) {
  if (!userId) return null;
  return db.prepare('SELECT * FROM newapi_accounts WHERE user_id = ?').get(userId) || null;
}

export function getNewAPIAccountProfile(userId, db = getDb()) {
  const row = account(userId, db);
  if (!row) return null;
  const id = sourceForIssuer(row.issuer);
  return { source: sources[id]?.source || 'unknown', label: sources[id]?.label || 'NewAPI',
    startUrl: id ? `/api/auth/${id}/start` : '/', expiresAt: row.expires_at,
    requiresReauth: !id, requiresRenewal: row.expires_at <= Math.floor(Date.now() / 1000) + 60 };
}

export function activeAccount(userId, db = getDb()) {
  const row = account(userId, db);
  const id = row && sourceForIssuer(row.issuer);
  if (!id || row.expires_at <= Math.floor(Date.now() / 1000)) {
    throw Object.assign(new Error('NEWAPI_REAUTH_REQUIRED'), { code: 'NEWAPI_REAUTH_REQUIRED' });
  }
  const config = getNewAPIConfig(id);
  return { row, config };
}

export function getNewAPIAccountCredential(userId, db = getDb()) {
  const { row, config } = activeAccount(userId, db);
  return { row, config, ...credential(row) };
}

export function listNewAPIProviders(userId, db = getDb()) {
  const row = account(userId, db);
  if (!row) return [];
  const id = sourceForIssuer(row.issuer);
  if (!id) return [];
  const models = JSON.parse(row.models_json);
  const providers = db.prepare('SELECT id, name, model, provider_type, is_default, sort_order FROM image_provider_configs WHERE enabled = 1 ORDER BY sort_order, created_at, id').all()
    .filter((item) => models.includes(item.model) &&
      userCanAccessProvider(userId, 'image', item.id))
    .map((item) => ({
      id: `${id}:${item.id}`, systemProviderId: item.id, name: item.name, model: item.model,
      providerType: item.provider_type || 'openai-compatible', pricingStrategy: 'external-wallet',
      isDefault: Boolean(item.is_default), sortOrder: Number(item.sort_order || 0), billingSource: sources[id].source
    }));
  if (providers.length && !providers.some((item) => item.isDefault)) providers[0].isDefault = true;
  return providers;
}

export function getNewAPIProvider(userId, providerId = '', includeSecret = true, db = getDb()) {
  const row = account(userId, db);
  const config = includeSecret ? activeAccount(userId, db).config : null;
  const providers = listNewAPIProviders(userId, db);
  const selected = providerId ? providers.find((item) => item.id === providerId) ||
    providers.find((item) => providerId === `${sourceForIssuer(row.issuer)}:${item.model}`)
    : providers.find((item) => item.isDefault) || providers[0];
  if (!selected) throw Object.assign(new Error('NEWAPI_MODEL_NOT_ALLOWED'), { code: 'NEWAPI_MODEL_NOT_ALLOWED' });
  const stored = includeSecret ? credential(row) : null;
  return {
    ...selected, baseUrl: row.issuer,
    pricingConfig: { externalWallet: true, billingSource: selected.billingSource },
    ...(includeSecret ? {
      apiKey: stored.apiKey,
      headers: { 'X-Pic365-Client': config.secret, 'X-Pic365-Grant': stored.binding }
    } : {})
  };
}

export function getNewAPITextProvider(userId, provider, includeSecret = true, db = getDb()) {
  const row = account(userId, db);
  if (!row || !provider) return provider;
  const { config } = activeAccount(userId, db);
  const stored = credential(row);
  if (!Array.isArray(stored.textModels) || !stored.textModels.includes(provider.model)) {
    throw Object.assign(new Error('NEWAPI_MODEL_NOT_ALLOWED'), { code: 'NEWAPI_MODEL_NOT_ALLOWED', status: 403 });
  }
  const { apiKey, apiKeyMasked, headers, ...systemProvider } = provider;
  return {
    ...systemProvider, baseUrl: config.origin, billingSource: config.source, billingUserId: userId,
    ...(includeSecret ? {
      apiKey: stored.apiKey,
      headers: { 'X-Pic365-Client': config.secret, 'X-Pic365-Grant': stored.binding }
    } : {})
  };
}

export function newAPITextErrorResponse(error) {
  const status = {
    NEWAPI_REAUTH_REQUIRED: 401, NEWAPI_BALANCE_REQUIRED: 402,
    NEWAPI_MODEL_NOT_ALLOWED: 403, NEWAPI_NOT_CONFIGURED: 503, NEWAPI_BALANCE_UNAVAILABLE: 503, NEWAPI_AUTH_UNAVAILABLE: 503
  }[error?.code];
  return status ? { status, error: error.code } : null;
}

function sourceAuthorizationRejected(response, payload) {
  return [401, 403].includes(response.status) && (payload?.success === false ||
    typeof payload?.error?.code === 'string' || typeof payload?.error?.type === 'string');
}

export async function ensureNewAPIAuthorization(userId, { force = false } = {}) {
  const row = account(userId, getDb());
  if (!row) return;
  const id = sourceForIssuer(row.issuer);
  if (!id) throw Object.assign(new Error('NEWAPI_REAUTH_REQUIRED'), { code: 'NEWAPI_REAUTH_REQUIRED' });
  if (!force && row.expires_at > Math.floor(Date.now() / 1000) + 60) return;
  const renewalKey = `${userId}:${hash(row.token_encrypted)}`;
  if (pendingRenewals.has(renewalKey)) return pendingRenewals.get(renewalKey);
  const renewal = renewNewAPIAccount(row, getNewAPIConfig(id));
  pendingRenewals.set(renewalKey, renewal);
  try { await renewal; } finally { pendingRenewals.delete(renewalKey); }
}

async function renewNewAPIAccount(row, config) {
  const stored = credential(row);
  let response;
  try {
    response = await fetch(`${config.origin}/api/pic365/renew`, {
      method: 'POST', headers: { Authorization: `Bearer ${stored.apiKey}`, 'X-Pic365-Client': config.secret, 'X-Pic365-Grant': stored.binding },
      signal: AbortSignal.timeout(10_000), redirect: 'error'
    });
  } catch {
    throw Object.assign(new Error('NEWAPI_AUTH_UNAVAILABLE'), { code: 'NEWAPI_AUTH_UNAVAILABLE' });
  }
  const payload = await response.json().catch(() => ({}));
  const db = getDb();
  const current = account(row.user_id, db);
  // A concurrent login/renewal already installed newer credentials. Never
  // overwrite them or report a stale request as revocation of the new grant.
  if (current?.issuer === row.issuer && current.subject === row.subject &&
      current.token_encrypted !== row.token_encrypted && current.expires_at > Math.floor(Date.now() / 1000)) return;
  if (!response.ok || !payload.success) {
    const code = sourceAuthorizationRejected(response, payload) && payload.error !== 'invalid_client' ? 'NEWAPI_REAUTH_REQUIRED' : 'NEWAPI_AUTH_UNAVAILABLE';
    throw Object.assign(new Error(code), { code });
  }
  const data = payload.data;
  if (data?.issuer !== row.issuer || data.user_id !== row.source_user_id || data.token_id !== row.source_token_id ||
      !Number.isSafeInteger(data.expires_at) || data.expires_at <= Math.floor(Date.now() / 1000) || !opaquePattern.test(String(data.grant_binding || ''))) {
    throw Object.assign(new Error('NEWAPI_AUTH_UNAVAILABLE'), { code: 'NEWAPI_AUTH_UNAVAILABLE' });
  }
  const encrypted = encryptProviderSecret(JSON.stringify({ ...stored, binding: data.grant_binding }));
  db.prepare('UPDATE newapi_accounts SET token_encrypted = ?, expires_at = ? WHERE user_id = ? AND issuer = ? AND subject = ? AND token_encrypted = ?')
    .run(encrypted, data.expires_at, row.user_id, row.issuer, row.subject, row.token_encrypted);
}

export async function getNewAPIWallet(userId) {
  await ensureNewAPIAuthorization(userId);
  return fetchNewAPIWallet(userId, true);
}

async function fetchNewAPIWallet(userId, mayRenew) {
  const { row, config } = activeAccount(userId);
  const stored = credential(row);
  let response;
  try { response = await fetch(`${config.origin}/api/pic365/balance`, {
    headers: { Authorization: `Bearer ${stored.apiKey}`, 'X-Pic365-Client': config.secret, 'X-Pic365-Grant': stored.binding },
    signal: AbortSignal.timeout(10_000), redirect: 'error'
  }); } catch {
    throw Object.assign(new Error('NEWAPI_BALANCE_UNAVAILABLE'), { code: 'NEWAPI_BALANCE_UNAVAILABLE' });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    if (mayRenew && sourceAuthorizationRejected(response, payload)) {
      await ensureNewAPIAuthorization(userId, { force: true });
      return fetchNewAPIWallet(userId, false);
    }
    const code = sourceAuthorizationRejected(response, payload) ? 'NEWAPI_REAUTH_REQUIRED' : 'NEWAPI_BALANCE_UNAVAILABLE';
    throw Object.assign(new Error(code), { code });
  }
  const quota = Number(payload.data?.quota);
  const unit = Number(payload.data?.quota_per_unit);
  if (!Number.isFinite(quota) || !Number.isFinite(unit) || unit <= 0 || payload.data?.billing_source !== 'wallet') {
    throw Object.assign(new Error('NEWAPI_BALANCE_UNAVAILABLE'), { code: 'NEWAPI_BALANCE_UNAVAILABLE' });
  }
  return { source: config.source, label: config.label, startUrl: `/api/auth/${config.sourceId}/start`, balanceUsd: quota / unit,
    available: quota > 0, expiresAt: row.expires_at, rechargeUrl: `${config.origin}/wallet` };
}

export async function requireNewAPIImageBalance(userId) {
  if (!getNewAPIAccountProfile(userId)) return;
  requireNewAPIStorageWrite(userId);
  const wallet = await getNewAPIWallet(userId);
  if (!wallet.available) throw Object.assign(new Error('NEWAPI_BALANCE_REQUIRED'), { code: 'NEWAPI_BALANCE_REQUIRED' });
}

export function newAPIImageErrorCode(error, provider) {
  if (!Object.values(sources).some((item) => item.source === provider?.billingSource)) return '';
  if (error?.code === 'insufficient_user_quota') return 'NEWAPI_BALANCE_REQUIRED';
  if (String(error?.message || '').includes('Pic365 authorization is unavailable')) return 'NEWAPI_REAUTH_REQUIRED';
  return '';
}

export function startNewAPILogin(req, res, sourceId = 'newapi16') {
  const config = getNewAPIConfig(sourceId);
  const state = randomBytes(32).toString('base64url');
  const browser = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const entry = req.query?.entry === 'create' ? 'create' : undefined;
  const current = Math.floor(Date.now() / 1000);
  const db = getDb();
  db.prepare('DELETE FROM newapi_login_flows WHERE expires_at <= ?').run(current);
  db.prepare('INSERT INTO newapi_login_flows (state_hash, browser_hash, verifier, expires_at) VALUES (?, ?, ?, ?)')
    .run(hash(state), hash(browser), JSON.stringify({ verifier, sourceId, entry }), current + LOGIN_FLOW_SECONDS);
  const secure = config.appOrigin.startsWith('https:') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${FLOW_COOKIE}=${browser}; Path=/api/auth/${sourceId}; Max-Age=${LOGIN_FLOW_SECONDS}; HttpOnly; SameSite=Lax${secure}`);
  res.setHeader('Cache-Control', 'no-store');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  res.redirect(302, `${config.origin}/pic365?${new URLSearchParams({ state, code_challenge: challenge })}`);
}

export function clearNewAPILoginCookie(res, sourceId = 'newapi16') {
  const secure = String(process.env.APP_URL || '').startsWith('https:') ? '; Secure' : '';
  const cookie = `${FLOW_COOKIE}=; Path=/api/auth/${sourceId}; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
  const previous = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : previous ? [previous] : []), cookie]);
}

export async function finishNewAPILogin(req, sourceId = 'newapi16') {
  const config = getNewAPIConfig(sourceId);
  const state = String(req.query?.state || '');
  const code = String(req.query?.code || '');
  const cookies = String(req.headers?.cookie || '').split(';').map((item) => item.trim());
  const browser = cookies.find((item) => item.startsWith(`${FLOW_COOKIE}=`))?.slice(FLOW_COOKIE.length + 1) || '';
  if (!opaquePattern.test(state) || !opaquePattern.test(code) || !opaquePattern.test(browser)) {
    throw Object.assign(new Error('NEWAPI_LOGIN_INVALID'), { code: 'NEWAPI_LOGIN_INVALID' });
  }
  const db = getDb();
  const flow = db.prepare('SELECT * FROM newapi_login_flows WHERE state_hash = ?').get(hash(state));
  if (!flow || !timingSafeEqual(Buffer.from(flow.browser_hash, 'hex'), Buffer.from(hash(browser), 'hex'))) {
    throw Object.assign(new Error('NEWAPI_LOGIN_INVALID'), { code: 'NEWAPI_LOGIN_INVALID' });
  }
  const proof = flow.verifier.startsWith('{') ? JSON.parse(flow.verifier) : { verifier: flow.verifier, sourceId: 'newapi16' };
  if (proof.sourceId !== sourceId) throw Object.assign(new Error('NEWAPI_LOGIN_INVALID'), { code: 'NEWAPI_LOGIN_INVALID' });
  const claim = db.prepare('UPDATE newapi_login_flows SET consumed_at = ? WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?')
    .run(Math.floor(Date.now() / 1000), hash(state), Math.floor(Date.now() / 1000));
  if (claim.changes !== 1) throw Object.assign(new Error('NEWAPI_LOGIN_INVALID'), { code: 'NEWAPI_LOGIN_INVALID' });
  const response = await fetch(`${config.origin}/api/pic365/token`, {
    method: 'POST', headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: proof.verifier, redirect_uri: config.callback,
      text_models: [...new Set(listChatProviderConfigs({ admin: true })
        .filter((provider) => provider.enabled && (provider.magicEnabled || provider.assistantEnabled))
        .map((provider) => provider.model))] }),
    signal: AbortSignal.timeout(10_000), redirect: 'error'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw Object.assign(new Error('NEWAPI_LOGIN_FAILED'), { code: 'NEWAPI_LOGIN_FAILED' });
  const userId = saveNewAPIAccount(payload.data, config);
  return { userId, landingPath: proof.entry === 'create' ? '/#create' : '/' };
}

export function saveNewAPIAccount(data, config = getNewAPIConfig()) {
  if (data?.issuer !== config.origin || !subjectPattern.test(String(data?.subject || '')) ||
      typeof data?.username !== 'string' || !data.username.trim() || data.username.length > 128 || /[\u0000-\u001f\u007f]/.test(data.username) ||
      !Number.isSafeInteger(data?.user_id) || data.user_id <= 0 || !Number.isSafeInteger(data?.token_id) || data.token_id <= 0 ||
      typeof data?.access_token !== 'string' || !/^sk-[A-Za-z0-9]{32,128}$/.test(data.access_token) ||
      !Number.isSafeInteger(data?.expires_at) || data.expires_at <= Math.floor(Date.now() / 1000) ||
      data.group !== 'default' || !opaquePattern.test(String(data.grant_binding || '')) ||
      data.billing_source !== 'wallet' || !Array.isArray(data.models) || !data.models.length || data.models.length > 32 ||
      data.models.some((name) => typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(name)) ||
      (data.text_models != null && (!Array.isArray(data.text_models) || data.text_models.length > 32 ||
        data.text_models.some((name) => typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(name))))) {
    throw Object.assign(new Error('NEWAPI_LOGIN_INVALID'), { code: 'NEWAPI_LOGIN_INVALID' });
  }
  const displayName = `${data.username.trim()}@${config.accountSuffix}`;
  const encrypted = encryptProviderSecret(JSON.stringify({ apiKey: data.access_token, binding: data.grant_binding,
    textModels: [...new Set(data.text_models || [])] }));
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    let row = db.prepare('SELECT user_id, source_user_id FROM newapi_accounts WHERE issuer = ? AND subject = ?').get(config.origin, data.subject);
    if (row && row.source_user_id !== data.user_id) throw new Error('NEWAPI_IDENTITY_MISMATCH');
    if (!row) {
      const id = randomUUID();
      const created = new Date().toISOString();
      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, role, system_group_id, credit_balance, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'user', ?, 0, ?, ?)`)
        .run(id, `${id}@sso.pic365.invalid`, hashPassword(randomBytes(32).toString('base64url')), displayName, DEFAULT_SYSTEM_USER_GROUP_ID, created, created);
      row = { user_id: id };
    } else {
      db.prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?')
        .run(displayName, new Date().toISOString(), row.user_id);
    }
    db.prepare(`INSERT INTO newapi_accounts (user_id, issuer, subject, source_user_id, source_token_id, token_encrypted, models_json, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET source_token_id = excluded.source_token_id, token_encrypted = excluded.token_encrypted,
        models_json = excluded.models_json, expires_at = excluded.expires_at`)
      .run(row.user_id, config.origin, data.subject, data.user_id, data.token_id, encrypted, JSON.stringify([...new Set(data.models)]), data.expires_at);
    db.exec('COMMIT');
    return row.user_id;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function reserveNewAPIImage(userId, { caseId, prompt, generationId, metadata, requestKey }, db = getDb()) {
  requireNewAPIStorageWrite(userId);
  const provider = getNewAPIProvider(userId, String(metadata.providerId), false, db);
  if (metadata.model !== provider.model) throw new Error('NEWAPI_MODEL_NOT_ALLOWED');
  return reserveNewAPIUsage(userId, provider, { caseId, prompt, generationId, metadata, requestKey }, db);
}

export function reserveNewAPIText(userId, provider, { requestKey = '', source = '' } = {}, db = getDb()) {
  const resolved = getNewAPITextProvider(userId, provider, false, db);
  if (!resolved?.billingSource || resolved.billingSource !== provider.billingSource || resolved.baseUrl !== provider.baseUrl) {
    throw Object.assign(new Error('NEWAPI_MODEL_NOT_ALLOWED'), { code: 'NEWAPI_MODEL_NOT_ALLOWED', status: 403 });
  }
  return reserveNewAPIUsage(userId, resolved, { requestKey,
    metadata: { providerId: provider.id, model: provider.model, source } }, db);
}

function reserveNewAPIUsage(userId, provider, { caseId = null, prompt = '', generationId = null, metadata, requestKey }, db) {
  const key = requestKey ? `${userId}:${requestKey}`.slice(0, 180) : '';
  db.exec('BEGIN IMMEDIATE');
  try {
    const user = db.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'").get(userId);
    if (!user) throw new Error('AUTH_REQUIRED');
    let row = key ? db.prepare("SELECT id FROM credit_reservations WHERE billing_scope = 'external_newapi' AND request_key = ?").get(key) : null;
    const duplicate = Boolean(row);
    if (!row) {
      row = { id: randomUUID() };
      db.prepare(`INSERT INTO credit_reservations
        (id, user_id, generation_id, amount, amount_centi, settled_centi, billing_scope, charged_user_id,
         billing_source, request_key, metadata_json, status, case_id, prompt, created_at)
        VALUES (?, ?, ?, 0, 0, 0, 'external_newapi', ?, ?, ?, ?, 'reserved', ?, ?, ?)`)
        .run(row.id, userId, generationId, userId, provider.billingSource, key, JSON.stringify({ ...metadata, chargedCredits: 0, billingSource: provider.billingSource }), caseId, prompt, new Date().toISOString());
    }
    db.exec('COMMIT');
    return { reservationId: row.id, userId, billingScope: 'external_newapi', chargedCredits: 0, duplicate };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
