import React, { useEffect, useMemo, useState } from 'react';
import { applyImagePromotion, getImageGenerationPricing } from '../shared/image-pricing.js';

const DEFAULT_PROMOTION = {
  enabled: false,
  name: '',
  payPercent: 100,
  startsAt: null,
  endsAt: null,
  updatedAt: null
};

let cachedPromotion = DEFAULT_PROMOTION;
let loadingPromise = null;
const listeners = new Set();

function publish(promotion) {
  cachedPromotion = promotion || DEFAULT_PROMOTION;
  for (const listener of listeners) listener(cachedPromotion);
}

export async function refreshImagePromotion() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch('/api/image-pricing', { cache: 'no-store' })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'PRICING_LOAD_FAILED');
      publish(payload.promotion || DEFAULT_PROMOTION);
      return payload;
    })
    .finally(() => {
      loadingPromise = null;
    });
  return loadingPromise;
}

export function useImagePromotion() {
  const [promotion, setPromotion] = useState(cachedPromotion);
  useEffect(() => {
    listeners.add(setPromotion);
    refreshImagePromotion().catch(() => undefined);
    const timer = globalThis.setInterval?.(() => refreshImagePromotion().catch(() => undefined), 60_000);
    return () => {
      listeners.delete(setPromotion);
      if (timer) globalThis.clearInterval?.(timer);
    };
  }, []);
  return promotion;
}

export function getClientImagePricing(options, promotion) {
  return applyImagePromotion(getImageGenerationPricing(options), promotion || cachedPromotion);
}

function normalizePricingRequest(options = {}) {
  return {
    size: String(options.size || '1024x1024').trim().toLowerCase(),
    quality: String(options.quality || 'low').trim().toLowerCase(),
    count: Math.max(1, Math.min(50, Math.round(Number(options.count) || 1))),
    referenceCount: Math.max(0, Math.min(9, Math.round(Number(options.referenceCount) || 0))),
    providerId: String(options.providerId || '').trim(),
    prompt: String(options.prompt || '').slice(0, 48000),
    projectId: String(options.projectId || ''),
    slotId: String(options.slotId || ''),
    adjustment: String(options.adjustment || ''),
    baseGenerationId: String(options.baseGenerationId || ''),
    targetArea: options.targetArea,
    referenceInputs: options.referenceInputs
  };
}

async function readPricingResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'PRICING_LOAD_FAILED');
  if (payload.promotion) publish(payload.promotion);
  return payload;
}

export async function requestImagePricing(options = {}, { signal } = {}) {
  const request = normalizePricingRequest(options);
  const response = await fetch('/api/image-pricing', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request), cache: 'no-store', signal
  });
  const payload = await readPricingResponse(response);
  const pricing = payload.pricing || payload.quotes?.[0]?.pricing;
  if (!pricing || pricing.source !== 'server') throw new Error('PRICING_LOAD_FAILED');
  return pricing;
}

export async function requestImagePricingBatch(items = [], { signal } = {}) {
  const normalizedItems = (items || []).slice(0, 50).map((item, index) => ({
    key: String(item?.key ?? index),
    ...normalizePricingRequest(item)
  }));
  if (!normalizedItems.length) return [];
  const response = await fetch('/api/image-pricing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: normalizedItems }),
    cache: 'no-store',
    signal
  });
  const payload = await readPricingResponse(response);
  const quotes = Array.isArray(payload.quotes) ? payload.quotes : [];
  if (quotes.length !== normalizedItems.length || quotes.some((quote) => quote?.pricing?.source !== 'server')) {
    throw new Error('PRICING_LOAD_FAILED');
  }
  return quotes;
}

export function useServerImagePricing(options = {}, { enabled = true, debounceMs = 100 } = {}) {
  const normalized = normalizePricingRequest(options);
  const requestKey = JSON.stringify(normalized);
  const [state, setState] = useState({ pricing: null, loading: Boolean(enabled), error: '' });

  useEffect(() => {
    if (!enabled) {
      setState({ pricing: null, loading: false, error: '' });
      return undefined;
    }
    const controller = new AbortController();
    setState((current) => ({ pricing: current.pricing?.providerId === normalized.providerId && current.pricing?.size === normalized.size && current.pricing?.quality === normalized.quality && current.pricing?.referenceCount === normalized.referenceCount ? current.pricing : null, loading: true, error: '' }));
    const timer = globalThis.setTimeout?.(() => {
      requestImagePricing(normalized, { signal: controller.signal })
        .then((pricing) => setState({ pricing, loading: false, error: '' }))
        .catch((error) => {
          if (error?.name !== 'AbortError') setState({ pricing: null, loading: false, error: error?.message || 'PRICING_LOAD_FAILED' });
        });
    }, debounceMs);
    return () => {
      controller.abort();
      if (timer) globalThis.clearTimeout?.(timer);
    };
  }, [requestKey, enabled, debounceMs]);

  return state;
}

export function useServerImagePricingBatch(items = [], { enabled = true, debounceMs = 80 } = {}) {
  const normalizedItems = useMemo(() => (items || []).slice(0, 50).map((item, index) => ({
    key: String(item?.key ?? index),
    ...normalizePricingRequest(item)
  })), [JSON.stringify(items || [])]);
  const requestKey = JSON.stringify(normalizedItems);
  const [state, setState] = useState({ pricingByKey: {}, loading: Boolean(enabled && normalizedItems.length), error: '' });

  useEffect(() => {
    if (!enabled || !normalizedItems.length) {
      setState({ pricingByKey: {}, loading: false, error: '' });
      return undefined;
    }
    const controller = new AbortController();
    setState({ pricingByKey: {}, loading: true, error: '' });
    const timer = globalThis.setTimeout?.(() => {
      requestImagePricingBatch(normalizedItems, { signal: controller.signal })
        .then((quotes) => setState({
          pricingByKey: Object.fromEntries(quotes.map((quote) => [quote.key, quote.pricing])),
          loading: false,
          error: ''
        }))
        .catch((error) => {
          if (error?.name !== 'AbortError') setState({ pricingByKey: {}, loading: false, error: error?.message || 'PRICING_LOAD_FAILED' });
        });
    }, debounceMs);
    return () => {
      controller.abort();
      if (timer) globalThis.clearTimeout?.(timer);
    };
  }, [requestKey, enabled, debounceMs]);

  return state;
}

export function ImageCreditPrice({ pricing, quantity = 1, language = 'zh', compact = false, showPromotionName = true, totalOnly = false }) {
  if (!pricing) {
    return <span className={`imageCreditPrice pending ${compact ? 'compact' : ''}`}>{language === 'zh' ? '报价中…' : 'Quoting…'}</span>;
  }
  if (pricing.externalWallet) {
    const label = pricing.billingSource === 'azure40' ? 'UniKeyX' : '99Off';
    return <span className={`imageCreditPrice ${compact ? 'compact' : ''}`}><strong>{language === 'zh' ? `${label} 账户计费` : `Billed to ${label}`}</strong></span>;
  }
  const saleCredits = Number((Number(pricing?.credits || 0) * quantity).toFixed(2));
  const originalCredits = Number((Number(pricing?.originalCredits || pricing?.credits || 0) * quantity).toFixed(2));
  const unit = language === 'zh' ? '积分' : 'credits';
  const unitGap = compact ? '' : ' ';
  return (
    <span className={`imageCreditPrice ${compact ? 'compact' : ''} ${pricing?.discountApplied ? 'discounted' : ''}`}>
      <strong>{totalOnly ? (language === 'zh' ? '预留 ' : 'Reserve ') : null}{saleCredits}{unitGap}{unit}</strong>
      {!totalOnly && pricing.imageTextEnabled && pricing.imageTextCredits > 0 ? <small title={language === 'zh' ? '文本费用超过 0.5 积分才计费；按实际用量结算，最多扣预留金额。' : 'Text fees over 0.5 credits are charged from reported usage, capped at the reserve.'}>{pricing.inputTokenBillingMode === 'actual' ? (language === 'zh' ? '文本' : 'Text') : (language === 'zh' ? '文本预留' : 'Text reserve')} {Number((pricing.imageTextCredits * quantity).toFixed(2))}{unitGap}{unit}</small> : null}
      {!totalOnly && pricing.referenceTokenEnabled ? <small title={language === 'zh' ? '按上游返回图片Token总和结算' : 'Settles reported image token totals'}>{pricing.inputTokenBillingMode === 'actual' ? (language === 'zh' ? '参考图' : 'References') : (language === 'zh' ? '参考图预留' : 'Reference reserve')} {Number((pricing.referenceTokenCredits * quantity).toFixed(2))}{unitGap}{unit}</small> : null}
      {!totalOnly && pricing?.discountApplied ? <del>{originalCredits}{unitGap}{unit}</del> : null}
      {!totalOnly && showPromotionName && pricing?.discountApplied && pricing?.promotion?.name ? <em>{pricing.promotion.name}</em> : null}
    </span>
  );
}
