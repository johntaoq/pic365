import { listVideoProviderConfigs } from './_lib/video-provider-config.js';
import { authenticateRequest } from './_lib/local-auth.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req, { allowAnonymous: true });
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, providers: listVideoProviderConfigs({ userId: auth.user?.id || '' }) });
}
