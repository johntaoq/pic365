import { authenticateRequest } from '../_lib/local-auth.js';
import { getDb, listImageProviderConfigs } from '../_lib/local-db.js';
import { listChatProviderConfigs, saveChatProviderConfig } from '../_lib/chat-engine.js';
import {
  clearImageModelRuleDeletion, deleteModelRule, getModelRule, isImageModelRuleDeleted, listModelRules, saveModelRule
} from '../_lib/upstream-model-rules.js';
import { recordAdminAuditEvent, requestAuditMetadata, requirePermission } from '../_lib/governance.js';
import { readJsonBody } from '../_lib/request.js';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';
import { parseUpstreamModelPrice, validateTextPrices } from '../../shared/upstream-pricing.js';

const ruleError = (code) => Object.assign(new Error(code), { code });

function inRuleTransaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function ensureImageRules(db, imageProviders) {
  for (const provider of imageProviders) {
    const rule = getModelRule(db, 'image', provider.model);
    if (!rule && isImageModelRuleDeleted(db, provider.model)) continue;
    if (!rule) saveModelRule(db, {
      kind: 'image', model: provider.model, upstreamBaseUrl: provider.baseUrl,
      pricingSchemaVersion: 2, exchangeRate: 7, pricingSource: 'unconfigured',
      unit: 'tokens', imageTextInputRmb: 0, imageInput: 0,
      pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    });
    else if (!rule.upstreamBaseUrl || rule.pricingSchemaVersion !== 2) saveModelRule(db, {
      ...rule, pricingSchemaVersion: 2, upstreamBaseUrl: rule.upstreamBaseUrl || provider.baseUrl,
      unit: rule.unit || 'tokens',
      pricing: rule.pricing || { input: rule.imageTextInputRmb || 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      imageInput: rule.imageInput ?? rule.pricing?.input ?? 0,
      pricingSource: rule.pricing || rule.unit === 'image' ? rule.pricingSource : 'unconfigured'
    });
  }
}

function inventory() {
  const textProviders = listChatProviderConfigs({ admin: true });
  const imageProviders = listImageProviderConfigs({ admin: true });
  const db = getDb();
  inRuleTransaction(db, () => ensureImageRules(db, imageProviders));
  return { textProviders, imageProviders, rules: listModelRules(db) };
}

async function fetchPriceTable(url, signal) {
  try {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error('PRICE_SYNC_FAILED');
    return data;
  } catch {
    throw Object.assign(new Error('PRICE_SYNC_FAILED'), { code: 'PRICE_SYNC_FAILED' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'PATCH', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_PRICING);
    if (req.method === 'GET') return res.status(200).json({ ok: true, ...inventory() });
    const body = await readJsonBody(req);
    const kind = body?.kind;
    const model = typeof body?.model === 'string' ? body.model.trim() : '';
    if (!['image', 'text'].includes(kind) || !model || model.length > 160) throw ruleError('INVALID_MODEL_RULE');
    const db = getDb();
    if (req.method === 'DELETE') {
      if (kind === 'text') requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_CHANNELS);
      inRuleTransaction(db, () => {
        const before = deleteModelRule(db, kind, model, auth.user.id);
        recordAdminAuditEvent({
          actorUserId: auth.user.id, permission: ADMIN_PERMISSIONS.MANAGE_PRICING,
          category: 'pricing', action: 'upstream_rule_deleted',
          entityType: 'upstream_model', entityId: `${kind}:${model}`, before,
          auditMeta: requestAuditMetadata(req)
        });
      });
      return res.status(200).json({ ok: true, ...inventory() });
    }
    const current = inventory();
    const before = getModelRule(db, kind, model);
    let rule;
    let providerAudit;
    if (body.action === 'sync') {
      const providers = kind === 'image' ? current.imageProviders : current.textProviders;
      const provider = providers.find((item) => item.id === body.providerId && item.model === model);
      const source = kind === 'image' ? before?.upstreamBaseUrl : provider?.baseUrl;
      if (!source) throw Object.assign(new Error('MODEL_PROVIDER_NOT_FOUND'), { code: 'MODEL_PROVIDER_NOT_FOUND' });
      const root = String(source).replace(/\/+$/, '').replace(/\/v1$/i, '');
      const signal = AbortSignal.timeout(15_000);
      const data = await fetchPriceTable(`${root}/api/pricing`, signal);
      const row = (Array.isArray(data.data) ? data.data : []).find((item) => item.model_name === model);
      if (!row) throw Object.assign(new Error('MODEL_PRICE_NOT_FOUND'), { code: 'MODEL_PRICE_NOT_FOUND' });
      const statusResponse = await fetch(`${root}/api/status`, { signal, headers: { Accept: 'application/json' } }).catch(() => null);
      const status = statusResponse?.ok ? await statusResponse.json().catch(() => ({})) : {};
      const exchangeRate = Number(status.data?.usd_exchange_rate) || Number(before?.exchangeRate) || provider?.exchangeRate || 7;
      const parsed = parseUpstreamModelPrice(row, exchangeRate);
      if (kind === 'text' && parsed.unit !== 'tokens') throw Object.assign(new Error('UNSUPPORTED_PRICE_FORMAT'), { code: 'UNSUPPORTED_PRICE_FORMAT' });
      // A slow sync started before deletion must not recreate an old rule.
      rule = inRuleTransaction(db, () => {
        const latest = getModelRule(db, kind, model);
        if (!latest) throw ruleError('MODEL_RULE_NOT_FOUND');
        if (latest.updatedAt !== before?.updatedAt) throw ruleError('MODEL_RULE_CHANGED');
        return saveModelRule(db, {
          ...latest, kind, model, ...parsed,
          ...(kind === 'image' ? {
            upstreamBaseUrl: source, pricingSchemaVersion: 2,
            imageTextInputRmb: parsed.pricing?.input ?? latest.imageTextInputRmb ?? 0,
            imageInput: parsed.imageInput ?? parsed.pricing?.input ?? latest.imageInput ?? 0,
            // A flat image price does not supply token prices; keep separately entered rates.
            pricing: parsed.pricing || latest.pricing || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
          } : { providerId: provider.id }),
          exchangeRate, pricingSource: 'synced',
          pricingVersion: String(data.pricing_version || ''),
          priceSyncedAt: new Date().toISOString(),
          estimateSource: parsed.unit === 'tokens' ? 'upstream-token-rates' : parsed.unit
        });
      });
    } else if (kind === 'text') {
      requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_CHANNELS);
      const previous = current.textProviders.find((item) => item.id === body.provider?.id);
      if (body.provider?.id && !previous) throw ruleError('MODEL_PROVIDER_NOT_FOUND');
      if (!previous && current.textProviders.some((item) => item.model === model)) {
        throw Object.assign(new Error('MODEL_ALREADY_EXISTS'), { code: 'MODEL_ALREADY_EXISTS' });
      }
      const pricing = validateTextPrices(body.provider?.pricing);
      const changed = JSON.stringify(pricing) !== JSON.stringify(before?.pricing);
      const provider = saveChatProviderConfig({
        ...body.provider,
        model,
        pricing,
        pricingSource: changed ? 'manual' : before?.pricingSource || 'manual'
      });
      rule = getModelRule(db, kind, provider.model);
      const safe = (item) => item ? {
        id: item.id, name: item.name, model: item.model, enabled: item.enabled,
        magicEnabled: item.magicEnabled, assistantEnabled: item.assistantEnabled,
        isDefault: item.isDefault, maxOutputTokens: item.maxOutputTokens, hasApiKey: item.hasApiKey
      } : {};
      providerAudit = { before: safe(previous), after: safe(provider), keyChanged: Boolean(body.provider?.apiKey) };
    } else {
      if (!String(body.upstreamBaseUrl || '').trim()) throw Object.assign(new Error('INVALID_UPSTREAM_URL'), { code: 'INVALID_UPSTREAM_URL' });
      const pricing = validateTextPrices(body.pricing);
      if (!['image', 'tokens'].includes(body.unit)) throw Object.assign(new Error('INVALID_MODEL_RULE'), { code: 'INVALID_MODEL_RULE' });
      if (body.imageInput == null || body.imageInput === '' || (body.unit === 'image' && (body.fixedPriceRmb == null || body.fixedPriceRmb === ''))) {
        throw Object.assign(new Error('INVALID_MODEL_PRICE'), { code: 'INVALID_MODEL_PRICE' });
      }
      rule = inRuleTransaction(db, () => {
        const latest = getModelRule(db, kind, model);
        if (body.action === 'create' && latest) throw ruleError('MODEL_ALREADY_EXISTS');
        if (body.action !== 'create' && !latest) throw ruleError('MODEL_RULE_NOT_FOUND');
        const saved = saveModelRule(db, {
          ...latest, kind, model, upstreamBaseUrl: String(body.upstreamBaseUrl).trim(),
          pricingSchemaVersion: 2, pricing, imageTextInputRmb: pricing.input,
          imageInput: body.imageInput, referenceTokenBudget: body.referenceTokenBudget,
          unit: body.unit, fixedPriceRmb: body.fixedPriceRmb,
          exchangeRate: Math.max(0.000001, Number(body.exchangeRate) || 7),
          pricingSource: 'manual'
        });
        if (body.action === 'create') clearImageModelRuleDeletion(db, model);
        return saved;
      });
    }
    recordAdminAuditEvent({
      actorUserId: auth.user.id, permission: ADMIN_PERMISSIONS.MANAGE_PRICING,
      category: 'pricing', action: body.action === 'sync' ? 'upstream_rule_synced' : 'upstream_rule_saved',
      entityType: 'upstream_model', entityId: `${kind}:${model}`,
      before: { ...before, ...(providerAudit ? { provider: providerAudit.before } : {}) },
      after: { ...rule, ...(providerAudit ? { provider: providerAudit.after, keyChanged: providerAudit.keyChanged } : {}) },
      auditMeta: requestAuditMetadata(req)
    });
    return res.status(200).json({ ok: true, ...inventory() });
  } catch (error) {
    const code = error?.code || 'UPSTREAM_RULE_FAILED';
    const status = code === 'FORBIDDEN' ? 403 : code === 'MODEL_RULE_NOT_FOUND' ? 404
      : ['MODEL_ALREADY_EXISTS', 'LAST_MODEL_RULE_REQUIRED', 'MODEL_RULE_CHANGED'].includes(code) ? 409 : 400;
    return res.status(status).json({ ok: false, error: code });
  }
}
