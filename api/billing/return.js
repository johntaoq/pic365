import { getAppUrl } from '../_lib/billing.js';
import { processYipayCallback } from '../_lib/yipay.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const appUrl = getAppUrl(req);
  try {
    const result = await processYipayCallback(req);
    return res.redirect(302, `${appUrl}/?billing=${result.paid ? 'success' : 'cancelled'}`);
  } catch (error) {
    console.warn('Failed to process Yipay browser return', {
      code: error?.code || 'YIPAY_RETURN_FAILED',
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return res.redirect(302, `${appUrl}/?billing=failed`);
  }
}
