import React, { useEffect, useState } from 'react';
import { Cat, Coins, KeyRound, LoaderCircle, RefreshCw, Save } from 'lucide-react';
import { normalizeChatPricing, pricingCreditsPerMillion } from '../shared/chat-billing.js';

function draftFromProvider(provider = {}) {
  return {
    id: provider.id || '',
    name: provider.name || '5.6-luna',
    providerType: provider.providerType || 'openai-compatible',
    baseUrl: provider.baseUrl || 'https://www.unikeyx.com',
    apiKey: '',
    apiKeyMasked: provider.apiKeyMasked || '',
    model: provider.model || 'gpt-5.6-luna',
    systemPrompt: provider.systemPrompt || '',
    maxOutputTokens: Number(provider.maxOutputTokens || 2048),
    pricing: normalizeChatPricing(provider.pricing),
    pricingSource: provider.pricingSource || 'manual',
    pricingVersion: provider.pricingVersion || '',
    priceSyncedAt: provider.priceSyncedAt || '',
    exchangeRate: Number(provider.exchangeRate || 7),
    enabled: provider.enabled !== false
  };
}

function formatDate(value, language) {
  if (!value) return '-';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : value;
}

export default function AdminChatProvider({ language, session }) {
  const [draft, setDraft] = useState(() => draftFromProvider());
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const credits = pricingCreditsPerMillion(draft.pricing);
  const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  const zh = language === 'zh';

  async function load() {
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/admin/chat-provider', { headers, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CHAT_PROVIDER_LOAD_FAILED');
      setDraft(draftFromProvider(payload.providers?.[0]));
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(zh ? `加载失败：${error.message}` : `Load failed: ${error.message}`);
    }
  }

  useEffect(() => { load(); }, []);

  function updatePricing(key, value) {
    setDraft((current) => ({
      ...current,
      pricing: normalizeChatPricing({ ...current.pricing, [key]: value })
    }));
  }

  async function save(event) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');
    try {
      const response = await fetch('/api/admin/chat-provider', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(draft)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CHAT_PROVIDER_SAVE_FAILED');
      setDraft(draftFromProvider(payload.provider));
      setStatus('success');
      setMessage(zh ? '聊天引擎和计费规则已保存。' : 'Chat engine and pricing saved.');
    } catch (error) {
      setStatus('error');
      setMessage(zh ? `保存失败：${error.message}` : `Save failed: ${error.message}`);
    }
  }

  async function syncPricing() {
    if (!draft.id) return;
    setStatus('syncing');
    setMessage('');
    try {
      const response = await fetch('/api/admin/chat-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'sync-pricing', id: draft.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'PRICE_SYNC_FAILED');
      setDraft(draftFromProvider(payload.provider));
      setStatus('success');
      setMessage(zh ? '已同步当前模型价格，请确认后保存其他设置。' : 'Current model pricing synchronized.');
    } catch (error) {
      setStatus('error');
      setMessage(zh ? `同步失败，原价格未变：${error.message}` : `Sync failed; existing prices were kept: ${error.message}`);
    }
  }

  const priceFields = [
    ['input', zh ? '输入' : 'Input'],
    ['output', zh ? '输出' : 'Output'],
    ['cacheRead', zh ? '缓存读' : 'Cache read'],
    ['cacheWrite', zh ? '缓存写' : 'Cache write']
  ];

  return (
    <form className="adminBlock adminChatProvider" onSubmit={save}>
      <div className="adminSectionHeading">
        <div>
          <h3><Cat size={19} />{zh ? '聊天精灵' : 'Chat assistant'}</h3>
          <p>{zh ? '配置多模态文本引擎。调用成功后按渠道返回的实际 Token 用量扣费，精确到 0.01 积分。' : 'Configure the multimodal text engine. Successful calls are billed from actual token usage to 0.01 credits.'}</p>
        </div>
        <label className="adminRechargeSwitch"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span>{zh ? '启用精灵' : 'Enabled'}</span></label>
      </div>

      {status === 'loading' ? <div className="adminState"><LoaderCircle className="spinIcon" size={20} />{zh ? '正在加载聊天引擎…' : 'Loading chat engine…'}</div> : (
        <>
          <div className="adminChatProviderGrid">
            <label><span>{zh ? '显示名称' : 'Display name'}</span><input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label><span>Model</span><input required value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} /></label>
            <label className="wide"><span>Base URL</span><input required value={draft.baseUrl} onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} /></label>
            <label><span>API Key</span><input type="password" required={!draft.id} value={draft.apiKey} onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={draft.apiKeyMasked || (zh ? '留空保持不变' : 'Leave blank to keep')} /></label>
            <label><span>{zh ? '最大输出 Token' : 'Max output tokens'}</span><input type="number" min="128" max="16384" step="1" value={draft.maxOutputTokens} onChange={(event) => setDraft((current) => ({ ...current, maxOutputTokens: event.target.value }))} /></label>
            <label className="wide"><span>{zh ? '系统提示词' : 'System prompt'}</span><textarea rows="4" value={draft.systemPrompt} onChange={(event) => setDraft((current) => ({ ...current, systemPrompt: event.target.value }))} /></label>
          </div>

          <section className="adminChatPricing">
            <header>
              <div><strong><Coins size={17} />{zh ? '实际用量计费' : 'Actual usage billing'}</strong><span>{zh ? '单位：人民币元 / 100 万 Token；100 积分 = 1 元' : 'RMB per 1M tokens; 100 credits = RMB 1'}</span></div>
              <button type="button" onClick={syncPricing} disabled={!draft.id || status === 'syncing'}>{status === 'syncing' ? <LoaderCircle className="spinIcon" size={16} /> : <RefreshCw size={16} />}{zh ? '同步价格' : 'Sync pricing'}</button>
            </header>
            <div className="adminChatPricingGrid">
              {priceFields.map(([key, label]) => <label key={key}><span>{label}</span><div><input type="number" min="0" step="0.000001" value={draft.pricing[key]} onChange={(event) => updatePricing(key, event.target.value)} /><b>{zh ? '元' : 'RMB'}</b></div><small>{credits[key].toFixed(2)} {zh ? '积分 / 百万 Token' : 'credits / 1M tokens'}</small></label>)}
            </div>
            <div className="adminChatPricingMeta">
              <span>{zh ? '价格来源' : 'Source'}：<b>{draft.pricingSource === 'synced' ? (zh ? '自动同步' : 'Synced') : (zh ? '手动设置' : 'Manual')}</b></span>
              <span>{zh ? '美元汇率' : 'USD rate'}：<b>{Number(draft.exchangeRate || 0).toFixed(4)}</b></span>
              <span>{zh ? '同步时间' : 'Synced'}：<b>{formatDate(draft.priceSyncedAt, language)}</b></span>
              {draft.pricingVersion ? <span>{zh ? '版本' : 'Version'}：<b>{draft.pricingVersion.slice(0, 12)}</b></span> : null}
            </div>
          </section>

          <div className="adminChatProviderActions">
            <button className="adminProviderAction adminProviderSave" type="submit" disabled={status === 'saving'}>{status === 'saving' ? <LoaderCircle className="spinIcon" size={16} /> : <Save size={16} />}{zh ? '保存聊天精灵配置' : 'Save chat assistant'}</button>
            <button className="adminProviderAction adminProviderCancel" type="button" onClick={load}><KeyRound size={16} />{zh ? '重新加载' : 'Reload'}</button>
          </div>
          {message ? <p className={`adminNotice ${status === 'error' ? 'error' : ''}`}>{message}</p> : null}
        </>
      )}
    </form>
  );
}
