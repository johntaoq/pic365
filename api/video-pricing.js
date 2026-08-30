import { quoteVideoTask } from './_lib/video-generation-queue.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const pricing = quoteVideoTask({ providerId: req.query?.providerId, seconds: req.query?.seconds });
    return res.status(200).json({ ok: true, pricing });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.code || 'VIDEO_PRICING_FAILED' });
  }
}
