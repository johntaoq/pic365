import { listImageProviderConfigs } from './_lib/local-db.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, providers: listImageProviderConfigs() });
}
