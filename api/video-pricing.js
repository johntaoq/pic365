import { quoteVideoTask } from './_lib/video-generation-queue.js';
import { authenticateRequest } from './_lib/local-auth.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req, { allowAnonymous: true });
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const pricing = quoteVideoTask({ providerId: req.query?.providerId, seconds: req.query?.seconds, mode: req.query?.mode, userId: auth.user?.id || '' });
    return res.status(200).json({ ok: true, pricing });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.code || 'VIDEO_PRICING_FAILED' });
  }
}
