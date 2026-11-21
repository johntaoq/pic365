import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { applyImagePromotion, getImageGenerationPricing } from '../shared/image-pricing.js';

const ImagePricingContext = createContext({ mode: 'pending', client: null });
const NO_SINGLE_QUOTE = { pricing: null, loading: false, error: '' };
const NO_BATCH_QUOTE = { pricingByKey: {}, loading: false, error: '' };
const FIXED_QUOTE_DEBOUNCE_MS = 40; // Coalesce changes while dragging the width/height sliders.
const QUOTE_REUSE_MS = 30_000;
const MAX_RECENT_QUOTES = 100;

export function ImagePricingProvider({ profile, children }) {
  // Until /api/me resolves, this could be a 99Off or UniKeyX account.
  const source = profile?.externalWallet?.source;
  const mode = !profile ? 'pending' : source === 'azure16' || source === 'azure40' ? 'external' : 'local';
  const userId = profile?.id || '';
  const value = useMemo(() => ({ mode, client: mode === 'local' ? createQuoteClient() : null }), [mode, userId]);
  return <ImagePricingContext.Provider value={value}>{children}</ImagePricingContext.Provider>;
}

async function rejectImagePricingRequest() {
  throw new Error('PRICING_LOAD_FAILED');
}

export function useImagePricingAccess() {
  const { mode, client } = useContext(ImagePricingContext);
  return {
    skipImagePricing: mode === 'external',
    showImagePricing: mode === 'local',
    requestImagePricing: client?.quote || rejectImagePricingRequest,
    requestImagePricingBatch: client?.quoteBatch || rejectImagePricingRequest
  };
}

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
  const { showImagePricing } = useImagePricingAccess();
  const [promotion, setPromotion] = useState(cachedPromotion);
  useEffect(() => {
    if (!showImagePricing) return;
    listeners.add(setPromotion);
    refreshImagePromotion().catch(() => undefined);
    const timer = globalThis.setInterval?.(() => refreshImagePromotion().catch(() => undefined), 60_000);
    return () => {
      listeners.delete(setPromotion);
      if (timer) globalThis.clearInterval?.(timer);
    };
  }, [showImagePricing]);
  return showImagePricing ? promotion : DEFAULT_PROMOTION;
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
    prompt: String(options.prompt || '').trim().slice(0, 48000),
    projectId: String(options.projectId || ''),
    slotId: String(options.slotId || ''),
    adjustment: String(options.adjustment || ''),
    baseGenerationId: String(options.baseGenerationId || ''),
    targetArea: options.targetArea,
    referenceInputs: options.referenceInputs
  };
}

function quoteKey(options, request = normalizePricingRequest(options), ignoreText = options.chargeTextTokens === false) {
  if (ignoreText) {
    const { providerId, size, quality, count, referenceCount } = request;
    return JSON.stringify([false, providerId, size, quality, count, referenceCount]);
  }
  return JSON.stringify([true, options.projectRevision || '', request]);
}

function quoteExpiresAt(payload, startedAt) {
  const promotion = payload.promotion;
  const serverAt = Date.parse(payload.serverNow);
  let maxAge = QUOTE_REUSE_MS;
  if (promotion?.enabled && Number.isFinite(serverAt)) {
    for (const date of [promotion.startsAt, promotion.endsAt]) {
      const remaining = Date.parse(date) - serverAt;
      if (remaining > 0) maxAge = Math.min(maxAge, remaining);
    }
  }
  return startedAt + maxAge;
}

async function readPricingResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'PRICING_LOAD_FAILED');
  if (payload.promotion) publish(payload.promotion);
  return payload;
}

function createQuoteClient() {
  // Quotes are estimates only. Keep them in this signed-in session (never in
  // HTTP/storage caches), and let the generation endpoints price the real job.
  const recent = new Map();
  async function quoteMany(items, batch, signal) {
    signal?.throwIfAborted();
    const startedAt = Date.now();
    const entries = items.map((options, index) => {
      const request = normalizePricingRequest(options);
      const key = String(options.key ?? index).slice(0, 120) || String(index);
      // Server-built prompts also depend on the persisted project and assets.
      const cacheable = !request.projectId || Boolean(options.projectRevision);
      const cached = (options.chargeTextTokens === false && recent.get(quoteKey(options, request)))
        || (cacheable && recent.get(quoteKey(options, request, false)));
      const pricing = cached?.expiresAt > startedAt && cached.promotionVersion === cachedPromotion.updatedAt ? cached.pricing : null;
      return { options, request, key, cacheable, pricing };
    });
    // Do not mix fresh and cached prices in one batch if any item needs a
    // refresh: the applicable promotion may have changed since the preview.
    if (entries.some((entry) => !entry.pricing)) {
      const body = batch ? { items: entries.map(({ key, request }) => ({ key, ...request })) } : entries[0].request;
      const response = await fetch('/api/image-pricing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), cache: 'no-store', signal
      });
      signal?.throwIfAborted();
      const payload = await readPricingResponse(response);
      signal?.throwIfAborted();
      const quotes = batch ? payload.quotes : [{ pricing: payload.pricing || payload.quotes?.[0]?.pricing }];
      if (!Array.isArray(quotes) || quotes.length !== entries.length || quotes.some((quote, index) => (
        quote?.pricing?.source !== 'server' || (batch && quote.key !== entries[index].key)
        || !Number.isFinite(quote.pricing.credits)
      ))) throw new Error('PRICING_LOAD_FAILED');
      const expiresAt = quoteExpiresAt(payload, startedAt);
      entries.forEach((entry, index) => {
        const { pricing } = quotes[index];
        entry.pricing = pricing;
        // Only discard prompt text from the reuse key if the server confirms
        // the rate is independent of text; a provider setting may have changed.
        const ignoreText = entry.options.chargeTextTokens === false && pricing.chargeTextTokens === false;
        if ((!entry.cacheable && !ignoreText) || expiresAt <= Date.now()) return;
        const cacheKey = quoteKey(entry.options, entry.request, ignoreText);
        recent.delete(cacheKey);
        recent.set(cacheKey, { pricing, expiresAt, promotionVersion: cachedPromotion.updatedAt });
        if (recent.size > MAX_RECENT_QUOTES) recent.delete(recent.keys().next().value);
      });
    }
    return entries.map(({ key, pricing }) => ({ key, pricing }));
  }
  return {
    quote: async (options = {}, { signal } = {}) => (await quoteMany([options], false, signal))[0].pricing,
    quoteBatch: (items = [], { signal } = {}) => quoteMany(items.slice(0, 50), true, signal)
  };
}

function useQuotePreview(request, input, key, enabled, debounceMs) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!enabled) {
      setState(null);
      return undefined;
    }
    const controller = new AbortController();
    const { signal } = controller;
    const load = () => {
      request(input, { signal })
        .then((data) => { if (!signal.aborted) setState({ key, request, data, error: '' }); })
        .catch((error) => {
          if (!signal.aborted) setState({ key, request, data: null, error: error?.message || 'PRICING_LOAD_FAILED' });
        });
    };
    const timer = debounceMs > 0 ? setTimeout(load, debounceMs) : null;
    if (timer === null) load();
    return () => {
      controller.abort();
      if (timer !== null) clearTimeout(timer);
    };
  }, [key, request, enabled, debounceMs]);
  // On a price-relevant change, do not expose a stale quote even for the
  // render before the effect runs (for example after selecting a new model).
  return enabled && state?.key === key && state.request === request ? state : null;
}

export function useServerImagePricing(options = {}, { enabled = true, debounceMs = 100 } = {}) {
  const { showImagePricing, requestImagePricing } = useImagePricingAccess();
  const canQuote = enabled && showImagePricing;
  const state = useQuotePreview(requestImagePricing, options, canQuote ? quoteKey(options) : '', canQuote,
    options.chargeTextTokens === false ? Math.min(FIXED_QUOTE_DEBOUNCE_MS, debounceMs) : debounceMs);
  return canQuote ? { pricing: state?.data || null, loading: !state, error: state?.error || '' } : NO_SINGLE_QUOTE;
}

export function useServerImagePricingBatch(items = [], { enabled = true, debounceMs = 80 } = {}) {
  const { showImagePricing, requestImagePricingBatch } = useImagePricingAccess();
  const requested = items.slice(0, 50);
  const canQuote = enabled && showImagePricing && requested.length > 0;
  const key = canQuote ? JSON.stringify(requested.map((item, index) => [item.key ?? index, quoteKey(item)])) : '';
  const state = useQuotePreview(requestImagePricingBatch, requested, key, canQuote,
    requested.every((item) => item.chargeTextTokens === false) ? Math.min(FIXED_QUOTE_DEBOUNCE_MS, debounceMs) : debounceMs);
  return canQuote ? {
    pricingByKey: state?.data ? Object.fromEntries(state.data.map((quote) => [quote.key, quote.pricing])) : NO_BATCH_QUOTE.pricingByKey,
    loading: !state, error: state?.error || ''
  } : NO_BATCH_QUOTE;
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
