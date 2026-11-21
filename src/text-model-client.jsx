import React, { useEffect, useState } from 'react';
import './upstream-rules.css';
import { newAPIErrorMessage } from './newapi-wallet.jsx';

export function useTextModels({ purpose = 'magic', enabled = true, text = '', imageCount = 0, mode = 'optimizer' } = {}) {
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) { setProviders([]); setProviderId(''); return; }
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/text-models?purpose=${purpose}`, { cache: 'no-store', signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !payload.ok || controller.signal.aborted) return;
        const available = payload.providers || [];
        setProviders(available);
        setProviderId((current) => available.some((item) => item.id === current) ? current : available[0]?.id || '');
        setRevision((value) => value + 1);
      } catch { /* Keep the current choice during a temporary connectivity failure. */ }
    };
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener('focus', load);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', load); };
  }, [purpose, enabled]);
  useEffect(() => {
    setQuote(null);
    setQuoteError('');
    if (!enabled || purpose !== 'magic' || !providerId) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/text-models', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, text, imageCount, mode }), signal: controller.signal
        });
        const payload = await response.json();
        if (!controller.signal.aborted) {
          if (response.ok && payload.ok) setQuote(payload.quote);
          else setQuoteError(payload.error || '');
        }
      } catch { /* A missing quote disables the chargeable magic action. */ }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, purpose, providerId, text, imageCount, mode, revision]);
  return { providers, providerId, setProviderId, quote, quoteError, loading };
}

export function MagicModelControl({ models, language = 'zh', disabled = false, showEstimate = true, children }) {
  const zh = language === 'zh';
  return <div className="magicModelControl">
    {showEstimate && <small title={models.quote?.externalWallet ? undefined : models.quote?.fixedPrice
      ? (zh ? '生图魔笔固定扣 1 积分；失败退回预留积分。' : 'Image Magic costs exactly 1 credit; failed requests release the hold.')
      : (zh ? '按实际用量结算，最低 1 积分；失败退回预留积分。' : 'Billed on actual usage, minimum 1 credit. Failed requests release held credits.')}>
      {models.loading ? (zh ? '估算中…' : 'Estimating…') : models.quote
        ? models.quote.externalWallet
          ? `${models.quote.billingSource === 'azure16' ? '99Off' : 'UniKeyX'} ${zh ? '余额' : 'wallet'}`
          : models.quote.fixedPrice
          ? (zh ? '固定 1 积分' : 'Fixed 1 credit')
          : `${zh ? '预估' : 'Est.'} ${models.quote.estimatedCredits} ${zh ? '积分' : 'credits'}`
        : newAPIErrorMessage(models.quoteError, language) || (zh ? '报价暂不可用' : 'Quote unavailable')}
    </small>}
    {children}
  </div>;
}
