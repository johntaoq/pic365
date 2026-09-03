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
    providerId: String(options.providerId || '').trim()
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
  const params = new URLSearchParams({
    size: request.size,
    quality: request.quality,
    count: String(request.count),
    referenceCount: String(request.referenceCount),
    providerId: request.providerId
  });
  const response = await fetch(`/api/image-pricing?${params}`, { cache: 'no-store', signal });
  const payload = await readPricingResponse(response);
  if (!payload.pricing || payload.pricing.source !== 'server') throw new Error('PRICING_LOAD_FAILED');
  return payload.pricing;
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
  const requestKey = `${normalized.providerId}|${normalized.size}|${normalized.quality}|${normalized.count}|${normalized.referenceCount}`;
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

export function ImageCreditPrice({ pricing, quantity = 1, language = 'zh', compact = false, showPromotionName = true }) {
  if (!pricing) {
    return <span className={`imageCreditPrice pending ${compact ? 'compact' : ''}`}>{language === 'zh' ? '报价中…' : 'Quoting…'}</span>;
  }
  const saleCredits = Number(pricing?.credits || 0) * quantity;
  const originalCredits = Number(pricing?.originalCredits || pricing?.credits || 0) * quantity;
  const unit = language === 'zh' ? '积分' : 'credits';
  const unitGap = compact ? '' : ' ';
  return (
    <span className={`imageCreditPrice ${compact ? 'compact' : ''} ${pricing?.discountApplied ? 'discounted' : ''}`}>
      <strong>{saleCredits}{unitGap}{unit}</strong>
      {pricing?.discountApplied ? <del>{originalCredits}{unitGap}{unit}</del> : null}
      {showPromotionName && pricing?.discountApplied && pricing?.promotion?.name ? <em>{pricing.promotion.name}</em> : null}
    </span>
  );
}
