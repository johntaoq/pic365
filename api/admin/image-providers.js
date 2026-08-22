import { authenticateRequest } from '../_lib/local-auth.js';
import { deleteImageProviderConfig, listImageProviderConfigs, saveImageProviderConfig } from '../_lib/local-db.js';
import { readJsonBody } from '../_lib/request.js';
import { recordAdminAuditEvent, requestAuditMetadata, requirePermission } from '../_lib/governance.js';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';

function clean(value, length = 240) { return String(value || '').trim().slice(0, length); }

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_CHANNELS);
    if (req.method === 'GET') return res.status(200).json({ ok: true, providers: listImageProviderConfigs({ admin: true }) });
    const body = await readJsonBody(req);
    if (req.method === 'DELETE') {
      const before = listImageProviderConfigs({ admin: true }).find((item) => item.id === clean(body.id || req.query?.id, 80));
      const deleted = deleteImageProviderConfig(clean(body.id || req.query?.id, 80));
      if (!deleted) return res.status(404).json({ ok: false, error: 'PROVIDER_NOT_FOUND' });
      recordAdminAuditEvent({
        actorUserId: auth.user.id, permission: ADMIN_PERMISSIONS.MANAGE_CHANNELS,
        category: 'channels', action: 'image_provider_deleted', entityType: 'image_provider', entityId: deleted.id,
        before: before ? { ...before, apiKeyMasked: undefined } : {}, after: {}, auditMeta: requestAuditMetadata(req)
      });
      return res.status(200).json({ ok: true, provider: deleted });
    }
    const existing = clean(body.id, 80)
      ? listImageProviderConfigs({ admin: true }).find((item) => item.id === clean(body.id, 80))
      : null;
    const canManagePricing = auth.user.adminPermissions?.includes(ADMIN_PERMISSIONS.MANAGE_PRICING) === true;
    const input = {
      id: clean(body.id, 80),
      name: clean(body.name, 80),
      providerType: clean(body.providerType, 60) || 'openai-compatible',
      baseUrl: clean(body.baseUrl, 500).replace(/\/+$/, ''),
      apiKey: clean(body.apiKey, 1000),
      model: clean(body.model, 160),
      pricingStrategy: canManagePricing ? clean(body.pricingStrategy, 80) : existing?.pricingStrategy,
      pricingConfig: canManagePricing && body.pricingConfig && typeof body.pricingConfig === 'object' ? body.pricingConfig : existing?.pricingConfig,
      enabled: body.enabled !== false,
      isDefault: Boolean(body.isDefault)
    };
    if (!input.name || !input.baseUrl || !input.model) return res.status(400).json({ ok: false, error: 'INVALID_PROVIDER_CONFIG' });
    const provider = saveImageProviderConfig(input);
    recordAdminAuditEvent({
      actorUserId: auth.user.id, permission: ADMIN_PERMISSIONS.MANAGE_CHANNELS,
      category: 'channels', action: existing ? 'image_provider_updated' : 'image_provider_created',
      entityType: 'image_provider', entityId: provider.id,
      before: existing ? { ...existing, apiKeyMasked: undefined } : {},
      after: { ...provider, apiKeyMasked: undefined }, auditMeta: requestAuditMetadata(req)
    });
    return res.status(req.method === 'POST' ? 201 : 200).json({ ok: true, provider });
  } catch (error) {
    return res.status(error?.code === 'FORBIDDEN' ? 403 : 400).json({ ok: false, error: error?.code || 'PROVIDER_CONFIG_FAILED' });
  }
}
