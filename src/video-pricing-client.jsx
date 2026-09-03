import { useEffect, useState } from 'react';

export async function requestVideoPricing({ providerId = '', seconds = 4, mode = 'std' } = {}, { signal } = {}) {
  const params = new URLSearchParams({ providerId: String(providerId || ''), seconds: String(seconds || 4), mode: String(mode || 'std') });
  const response = await fetch(`/api/video-pricing?${params.toString()}`, { cache: 'no-store', signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok || !payload.pricing) throw new Error(payload.error || 'VIDEO_PRICING_FAILED');
  return payload.pricing;
}

export function useVideoPricing(input = {}, { enabled = true } = {}) {
  const [state, setState] = useState({ pricing: null, loading: Boolean(enabled), error: '' });
  const providerId = String(input.providerId || '');
  const seconds = Number(input.seconds || 4);
  const mode = String(input.mode || 'std');
  useEffect(() => {
    if (!enabled || !providerId) {
      setState({ pricing: null, loading: false, error: '' });
      return undefined;
    }
    const controller = new AbortController();
    setState((current) => ({ pricing: current.pricing, loading: true, error: '' }));
    requestVideoPricing({ providerId, seconds, mode }, { signal: controller.signal })
      .then((pricing) => setState({ pricing, loading: false, error: '' }))
      .catch((error) => {
        if (error?.name !== 'AbortError') setState({ pricing: null, loading: false, error: error?.message || 'VIDEO_PRICING_FAILED' });
      });
    return () => controller.abort();
  }, [enabled, providerId, seconds, mode]);
  return state;
}

export function VideoCreditPrice({ pricing, language = 'zh' }) {
  if (!pricing) return <span>{language === 'zh' ? '价格加载中…' : 'Loading price…'}</span>;
  const credits = Number(pricing.credits || 0);
  return <span><strong>{Number.isInteger(credits) ? credits : credits.toFixed(2)}</strong> {language === 'zh' ? '积分' : 'credits'}</span>;
}
