import { authenticateRequest } from '../_lib/local-auth.js';
import { deleteImageProviderConfig, listImageProviderConfigs, saveImageProviderConfig } from '../_lib/local-db.js';
import { readJsonBody } from '../_lib/request.js';

function clean(value, length = 240) { return String(value || '').trim().slice(0, length); }

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  if (!auth.profile?.isSuperAdmin) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  try {
    if (req.method === 'GET') return res.status(200).json({ ok: true, providers: listImageProviderConfigs({ admin: true }) });
    const body = await readJsonBody(req);
    if (req.method === 'DELETE') {
      const deleted = deleteImageProviderConfig(clean(body.id || req.query?.id, 80));
      if (!deleted) return res.status(404).json({ ok: false, error: 'PROVIDER_NOT_FOUND' });
      return res.status(200).json({ ok: true, provider: deleted });
    }
    const input = {
      id: clean(body.id, 80),
      name: clean(body.name, 80),
      providerType: clean(body.providerType, 60) || 'openai-compatible',
      baseUrl: clean(body.baseUrl, 500).replace(/\/+$/, ''),
      apiKey: clean(body.apiKey, 1000),
      model: clean(body.model, 160),
      pricingStrategy: clean(body.pricingStrategy, 80),
      pricingConfig: body.pricingConfig && typeof body.pricingConfig === 'object' ? body.pricingConfig : {},
      enabled: body.enabled !== false,
      isDefault: Boolean(body.isDefault)
    };
    if (!input.name || !input.baseUrl || !input.model) return res.status(400).json({ ok: false, error: 'INVALID_PROVIDER_CONFIG' });
    return res.status(req.method === 'POST' ? 201 : 200).json({ ok: true, provider: saveImageProviderConfig(input) });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.code || 'PROVIDER_CONFIG_FAILED' });
  }
}
