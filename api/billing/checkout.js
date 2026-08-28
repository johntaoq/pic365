import { authenticateRequest } from '../_lib/local-auth.js';
import {
  getRechargeConfig,
  getUserProfile,
  markLocalPaymentCheckoutCreated,
  markLocalPaymentOrderFailed
} from '../_lib/local-db.js';
import { getAppUrl, readJsonBody } from '../_lib/billing.js';
import {
  createYipayCheckoutUrl,
  createYipayPaymentOrder,
  formatYipayMoney,
  getYipayConfig,
  isYipayConfigured,
  YIPAY_PAYMENT_METHODS
} from '../_lib/yipay.js';
import { quoteCustomRecharge } from '../../shared/recharge-config.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

function fixedPackProduct(pack) {
  const amountYuan = Number(pack.amountCents) / 100;
  return {
    id: `yipay-${pack.id}`,
    nameEn: `Pic365 ¥${amountYuan} credit recharge`,
    nameZh: `Pic365 ${amountYuan} 元积分充值`,
    descriptionEn: `${pack.credits} Pic365 credits`,
    descriptionZh: `${pack.credits} Pic365 积分`,
    credits: Number(pack.credits),
    amountCents: Number(pack.amountCents)
  };
}

function customRechargeProduct(amountCents, recharge) {
  const quote = quoteCustomRecharge(amountCents, recharge);
  if (!quote.valid) {
    const code = quote.requiresContact ? 'RECHARGE_CONTACT_REQUIRED' : 'INVALID_RECHARGE_AMOUNT';
    throw Object.assign(new Error(code), { code });
  }
  const amountYuan = Number(quote.amountCents) / 100;
  return {
    id: `yipay-custom-${quote.amountCents}-${quote.credits}`,
    nameEn: `Pic365 ¥${amountYuan} custom credit recharge`,
    nameZh: `Pic365 ${amountYuan} 元自定义积分充值`,
    descriptionEn: `${quote.credits} Pic365 credits`,
    descriptionZh: `${quote.credits} Pic365 积分`,
    credits: quote.credits,
    amountCents: quote.amountCents
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const paymentConfig = getYipayConfig({ includeSecret: true });
  if (!isYipayConfigured(paymentConfig)) return json(res, 503, { ok: false, error: 'BILLING_NOT_CONFIGURED' });
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error, loginRequired: true });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_BILLING_PRODUCT' });
  }
  const paymentType = String(body.paymentType || 'alipay').trim().toLowerCase();
  if (!YIPAY_PAYMENT_METHODS.some((method) => method.id === paymentType)) {
    return json(res, 400, { ok: false, error: 'INVALID_PAYMENT_METHOD' });
  }

  const recharge = getRechargeConfig();
  let product;
  try {
    if (String(body.productId || '') === 'custom') {
      product = customRechargeProduct(Math.round(Number(body.amountCents)), recharge);
    } else {
      const pack = recharge.packs.find((item) => item.enabled && item.id === String(body.productId || '').trim());
      if (!pack) return json(res, 404, { ok: false, error: 'BILLING_PRODUCT_NOT_FOUND' });
      product = fixedPackProduct(pack);
    }
  } catch (error) {
    return json(res, 400, { ok: false, error: error?.code || 'INVALID_BILLING_PRODUCT' });
  }

  let order;
  try {
    order = createYipayPaymentOrder({ userId: auth.user.id, product, paymentType });
    const appUrl = getAppUrl(req);
    const checkoutUrl = createYipayCheckoutUrl({
      pid: paymentConfig.merchantId,
      type: paymentType,
      out_trade_no: order.id,
      notify_url: `${appUrl}/api/billing/webhook`,
      return_url: `${appUrl}/api/billing/return`,
      name: product.nameZh,
      money: formatYipayMoney(product.amountCents),
      param: 'pic365-credit-recharge'
    }, paymentConfig);
    markLocalPaymentCheckoutCreated(order.id, {
      providerOrderId: order.id,
      metadata: {
        paymentType,
        gatewayHost: new URL(paymentConfig.gatewayUrl).host
      }
    });
    return json(res, 200, {
      ok: true,
      url: checkoutUrl,
      orderId: order.id,
      paymentProvider: 'yipay',
      paymentType,
      user: getUserProfile(auth.user.id)
    });
  } catch (error) {
    if (order?.id) markLocalPaymentOrderFailed(order.id, error?.code || 'CHECKOUT_FAILED');
    console.warn('Failed to create Yipay checkout', {
      orderId: order?.id || '',
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 502, { ok: false, error: error?.code || 'CHECKOUT_FAILED' });
  }
}
