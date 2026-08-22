import { authenticateRequest } from '../_lib/local-auth.js';
import {
  listChatProviderConfigs,
  saveChatProviderConfig,
  synchronizeChatProviderPricing
} from '../_lib/chat-engine.js';
import { readJsonBody } from '../_lib/request.js';
import { recordAdminAuditEvent, requestAuditMetadata, requirePermission } from '../_lib/governance.js';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';
import { normalizeChatPricing } from '../../shared/chat-billing.js';

function clean(value, length = 500) {
  return String(value || '').trim().slice(0, length);
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH, POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });

  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_CHANNELS);
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_PRICING);
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, providers: listChatProviderConfigs({ admin: true }) });
    }

    const body = await readJsonBody(req);
    if (req.method === 'POST' && body.action === 'sync-pricing') {
      const before = listChatProviderConfigs({ admin: true }).find((item) => item.id === clean(body.id, 80));
      const provider = await synchronizeChatProviderPricing(clean(body.id, 80));
      recordAdminAuditEvent({
        actorUserId: auth.user.id,
        permission: ADMIN_PERMISSIONS.MANAGE_PRICING,
        category: 'pricing',
        action: 'chat_provider_pricing_synced',
        entityType: 'chat_provider',
        entityId: provider.id,
        before: before ? { pricing: before.pricing, pricingSource: before.pricingSource } : {},
        after: { pricing: provider.pricing, pricingSource: provider.pricingSource, pricingVersion: provider.pricingVersion },
        auditMeta: requestAuditMetadata(req)
      });
      return res.status(200).json({ ok: true, provider });
    }

    const before = listChatProviderConfigs({ admin: true }).find((item) => item.id === clean(body.id, 80));
    const nextPricing = normalizeChatPricing(body.pricing);
    const pricingChanged = !before || Object.keys(nextPricing).some((key) => Math.abs(nextPricing[key] - Number(before.pricing?.[key] || 0)) > 0.0000001);
    const provider = saveChatProviderConfig({
      id: clean(body.id, 80),
      name: clean(body.name, 80),
      providerType: clean(body.providerType, 60) || 'openai-compatible',
      baseUrl: clean(body.baseUrl, 500),
      apiKey: clean(body.apiKey, 2000),
      model: clean(body.model, 160) || 'gpt-5.6-luna',
      systemPrompt: clean(body.systemPrompt, 8000),
      maxOutputTokens: body.maxOutputTokens,
      pricing: nextPricing,
      exchangeRate: body.exchangeRate,
      pricingSource: pricingChanged ? 'manual' : before?.pricingSource || 'manual',
      pricingVersion: before?.pricingVersion || '',
      priceSyncedAt: before?.priceSyncedAt || null,
      enabled: body.enabled !== false,
      isDefault: true
    });
    recordAdminAuditEvent({
      actorUserId: auth.user.id,
      permission: ADMIN_PERMISSIONS.MANAGE_CHANNELS,
      category: 'channels',
      action: before ? 'chat_provider_updated' : 'chat_provider_created',
      entityType: 'chat_provider',
      entityId: provider.id,
      before: before ? { ...before, apiKeyMasked: undefined } : {},
      after: { ...provider, apiKeyMasked: undefined },
      auditMeta: requestAuditMetadata(req)
    });
    return res.status(before ? 200 : 201).json({ ok: true, provider });
  } catch (error) {
    const code = error?.code || 'CHAT_PROVIDER_CONFIG_FAILED';
    const status = code === 'FORBIDDEN' ? 403
      : code === 'CHAT_PROVIDER_NOT_FOUND' ? 404
        : code === 'PRICE_SYNC_FAILED' ? 502
          : 400;
    return res.status(status).json({ ok: false, error: code });
  }
}
