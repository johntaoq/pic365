import { getRechargeConfig, getUserProfile } from '../_lib/local-db.js';
import { authenticateRequest } from '../_lib/local-auth.js';
import { getYipayConfig, isYipayConfigured } from '../_lib/yipay.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req, { allowAnonymous: true });
  if (auth.error) {
    return json(res, auth.status || 401, { ok: false, error: auth.error });
  }

  try {
    const recharge = getRechargeConfig();
    const payment = getYipayConfig();
    const checkoutAvailable = isYipayConfigured(payment);
    const packs = recharge.packs.filter((pack) => pack.enabled).map((pack) => {
      const amountYuan = Number(pack.amountCents) / 100;
      return {
      id: pack.id,
      type: 'credit_pack',
      name: { en: `¥${amountYuan} top-up`, zh: `${amountYuan} 元充值` },
      description: pack.bonusCredits > 0
        ? {
            en: `${pack.baseCredits} base credits + ${pack.bonusCredits} bonus credits`,
            zh: `${pack.baseCredits} 基础积分 + ${pack.bonusCredits} 赠送积分`
          }
        : { en: `${pack.baseCredits} base credits`, zh: `${pack.baseCredits} 基础积分` },
      credits: Number(pack.credits),
      baseCredits: Number(pack.baseCredits),
      bonusCredits: Number(pack.bonusCredits),
      bonusPercent: Number(pack.bonusPercent),
      amountCents: Number(pack.amountCents),
      currency: 'cny',
      priceLabel: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amountYuan),
      active: true
    };
    });
    return json(res, 200, {
      ok: true,
      checkoutAvailable,
      paymentInterfaceReady: checkoutAvailable,
      paymentProvider: checkoutAvailable ? 'yipay' : null,
      paymentMethods: checkoutAvailable ? payment.paymentMethods : [],
      packs,
      recharge,
      user: auth.user ? getUserProfile(auth.user.id) : null
    });
  } catch (error) {
    console.warn('Failed to load credit catalog', {
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 500, { ok: false, error: 'SERVER_NOT_CONFIGURED' });
  }
}
