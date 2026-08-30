import { authenticateRequest } from '../_lib/local-auth.js';
import { recordAdminAuditEvent, requestAuditMetadata, requirePermission } from '../_lib/governance.js';
import { readJsonBody } from '../_lib/request.js';
import {
  deleteVideoProviderConfig,
  getVideoProviderConfig,
  listVideoProviderConfigs,
  saveVideoProviderConfig,
  updateVideoProviderPricing
} from '../_lib/video-provider-config.js';
import { checkVideoProvider, fetchVideoProviderPricing } from '../_lib/video-provider.js';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';
import { normalizeVideoPricingConfig } from '../../shared/video-pricing.js';

function clean(value, length = 500) {
  return String(value || '').trim().slice(0, length);
}

function auditProvider(provider) {
  if (!provider) return {};
  const { apiKey, apiKeyMasked, ...safe } = provider;
  return safe;
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_CHANNELS);
    if (req.method === 'GET') return res.status(200).json({ ok: true, providers: listVideoProviderConfigs({ admin: true }) });
    const body = await readJsonBody(req);
    const id = clean(body.id || req.query?.id, 80);
    if (req.method === 'DELETE') {
      const before = listVideoProviderConfigs({ admin: true }).find((item) => item.id === id);
      const provider = deleteVideoProviderConfig(id);
      if (!provider) return res.status(404).json({ ok: false, error: 'PROVIDER_NOT_FOUND' });
      recordAdminAuditEvent({
        actorUserId: auth.user.id,
        permission: ADMIN_PERMISSIONS.MANAGE_CHANNELS,
        category: 'channels',
        action: 'video_provider_deleted',
        entityType: 'video_provider',
        entityId: id,
        before: auditProvider(before),
        after: {},
        auditMeta: requestAuditMetadata(req)
      });
      return res.status(200).json({ ok: true, provider });
    }
    if (body.action === 'check') {
      const provider = getVideoProviderConfig(id);
      if (!provider) return res.status(404).json({ ok: false, error: 'PROVIDER_NOT_FOUND' });
      const check = await checkVideoProvider(provider);
      return res.status(check.ok ? 200 : 400).json({ ok: check.ok, check, error: check.ok ? undefined : check.error });
    }
    if (body.action === 'sync-pricing') {
      requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_PRICING);
      const provider = getVideoProviderConfig(id);
      if (!provider) return res.status(404).json({ ok: false, error: 'PROVIDER_NOT_FOUND' });
      const synced = await fetchVideoProviderPricing(provider);
      const pricing = normalizeVideoPricingConfig({
        ...provider.pricingConfig,
        upstreamPricePerSecond: synced.usdPerSecond,
        exchangeRate: synced.exchangeRate,
        pricePerSecondRmb: synced.usdPerSecond * synced.exchangeRate,
        pricingSource: 'synced',
        pricingVersion: synced.pricingVersion,
        priceSyncedAt: new Date().toISOString()
      });
      const updated = updateVideoProviderPricing(id, pricing);
      recordAdminAuditEvent({
        actorUserId: auth.user.id,
        permission: ADMIN_PERMISSIONS.MANAGE_PRICING,
        category: 'pricing',
        action: 'video_pricing_synced',
        entityType: 'video_provider',
        entityId: id,
        before: auditProvider(provider),
        after: auditProvider(updated),
        auditMeta: requestAuditMetadata(req)
      });
      return res.status(200).json({ ok: true, provider: updated });
    }
    const existing = id ? listVideoProviderConfigs({ admin: true }).find((item) => item.id === id) : null;
    const canManagePricing = auth.user.adminPermissions?.includes(ADMIN_PERMISSIONS.MANAGE_PRICING) === true;
    const provider = saveVideoProviderConfig({
      id,
      name: clean(body.name, 80),
      providerType: clean(body.providerType, 80) || 'openai-video-compatible',
      baseUrl: clean(body.baseUrl, 500),
      apiKey: clean(body.apiKey, 1000),
      credentialSource: body.credentialSource,
      imageProviderId: clean(body.imageProviderId, 80),
      model: clean(body.model, 160) || 'sora-2',
      pricingConfig: canManagePricing ? body.pricingConfig : existing?.pricingConfig,
      enabled: body.enabled !== false,
      isDefault: Boolean(body.isDefault)
    });
    recordAdminAuditEvent({
      actorUserId: auth.user.id,
      permission: ADMIN_PERMISSIONS.MANAGE_CHANNELS,
      category: 'channels',
      action: existing ? 'video_provider_updated' : 'video_provider_created',
      entityType: 'video_provider',
      entityId: provider.id,
      before: auditProvider(existing),
      after: auditProvider(provider),
      auditMeta: requestAuditMetadata(req)
    });
    return res.status(existing ? 200 : 201).json({ ok: true, provider });
  } catch (error) {
    const status = error?.code === 'FORBIDDEN' ? 403 : error?.code === 'PROVIDER_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ ok: false, error: error?.code || 'VIDEO_PROVIDER_CONFIG_FAILED' });
  }
}
