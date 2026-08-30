import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Film, LoaderCircle, Plus, RefreshCw, Save, Settings, ShieldCheck, Trash2, X } from 'lucide-react';
import { defaultVideoPricingConfig, getVideoGenerationPricing, normalizeVideoPricingConfig, VIDEO_PRICING_MODES } from '../shared/video-pricing.js';

function videoProviderDraft(provider = {}, imageProviders = []) {
  const inherited = imageProviders.find((item) => item.id === provider.imageProviderId)
    || imageProviders.find((item) => item.isDefault)
    || imageProviders[0];
  return {
    id: provider.id || '',
    name: provider.name || 'Sora 2',
    providerType: provider.providerType || 'openai-video-compatible',
    credentialSource: 'image-provider',
    imageProviderId: provider.imageProviderId || inherited?.id || '',
    baseUrl: provider.baseUrl || inherited?.baseUrl || '',
    model: provider.model || 'sora-2',
    enabled: provider.enabled !== false,
    isDefault: provider.id ? Boolean(provider.isDefault) : false,
    pricingConfig: normalizeVideoPricingConfig(provider.pricingConfig || defaultVideoPricingConfig()),
    apiKeyMasked: provider.apiKeyMasked || inherited?.apiKeyMasked || ''
  };
}

function formatCredits(value) {
  const credits = Number(value || 0);
  return Number.isInteger(credits) ? String(credits) : credits.toFixed(2);
}

export default function AdminVideoProvider({ language, session, imageProviders = [] }) {
  const zh = language === 'zh';
  const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  const [providers, setProviders] = useState([]);
  const [draft, setDraft] = useState(() => videoProviderDraft({}, imageProviders));
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  async function load({ preserveDraft = false } = {}) {
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/admin/video-providers', { headers, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'VIDEO_PROVIDER_LOAD_FAILED');
      const nextProviders = payload.providers || [];
      setProviders(nextProviders);
      setDraft((current) => {
        if (preserveDraft && current.id) {
          const refreshed = nextProviders.find((provider) => provider.id === current.id);
          if (refreshed) return videoProviderDraft(refreshed, imageProviders);
        }
        return videoProviderDraft({}, imageProviders);
      });
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(zh ? `视频渠道加载失败：${error.message}` : `Video channels failed to load: ${error.message}`);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    setDraft((current) => current.imageProviderId ? current : videoProviderDraft(current, imageProviders));
  }, [imageProviders]);

  function beginNew() {
    setDraft(videoProviderDraft({}, imageProviders));
    setMessage('');
  }

  function beginEdit(provider) {
    setDraft(videoProviderDraft(provider, imageProviders));
    setMessage('');
  }

  function updatePricing(patch) {
    setDraft((current) => ({
      ...current,
      pricingConfig: normalizeVideoPricingConfig({ ...current.pricingConfig, ...patch })
    }));
  }

  async function save(event) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');
    try {
      const response = await fetch('/api/admin/video-providers', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(draft)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'VIDEO_PROVIDER_SAVE_FAILED');
      await load();
      setStatus('success');
      setMessage(zh ? '视频渠道已保存。' : 'Video channel saved.');
    } catch (error) {
      setStatus('error');
      setMessage(zh ? `保存失败：${error.message}` : `Save failed: ${error.message}`);
    }
  }

  async function runProviderAction(action, provider = draft) {
    setStatus(action);
    setMessage('');
    try {
      const response = await fetch('/api/admin/video-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action, id: provider.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'VIDEO_PROVIDER_ACTION_FAILED');
      await load({ preserveDraft: draft.id === provider.id });
      setStatus('success');
      setMessage(action === 'sync-pricing'
        ? (zh ? '已从 UniKeyX 同步 Sora 价格。' : 'Sora pricing synchronized from UniKeyX.')
        : (zh ? '连接成功，当前 Key 可访问视频模型。' : 'Connection succeeded and the video model is visible.'));
    } catch (error) {
      setStatus('error');
      setMessage(zh ? `操作失败：${error.message}` : `Action failed: ${error.message}`);
    }
  }

  async function removeProvider(provider) {
    if (!globalThis.confirm?.(zh ? `删除视频渠道“${provider.name}”？` : `Delete video channel "${provider.name}"?`)) return;
    setStatus('deleting');
    setMessage('');
    try {
      const response = await fetch('/api/admin/video-providers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ id: provider.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'VIDEO_PROVIDER_DELETE_FAILED');
      await load();
      setStatus('success');
      setMessage(zh ? '视频渠道已删除。' : 'Video channel deleted.');
    } catch (error) {
      setStatus('error');
      setMessage(zh ? `删除失败：${error.message}` : `Delete failed: ${error.message}`);
    }
  }

  const pricing = draft.pricingConfig;
  const previewCredits = useMemo(() => Object.fromEntries([4, 8, 12].map((seconds) => [seconds, formatCredits(getVideoGenerationPricing({ seconds }, pricing).credits)])), [pricing]);

  return (
    <section className="adminBlock adminProviderBlock adminChannelSection adminVideoProvider">
      <div className="adminSectionHeading">
        <div><h3><Film size={18} />{zh ? '视频渠道配置' : 'Video channels'}</h3><p>{zh ? '每个视频渠道独立配置。默认 Sora 2 可继承图片渠道的 URL 和加密 Key。' : 'Configure each video channel independently. Sora 2 can inherit an image channel URL and encrypted key.'}</p></div>
        <button className="adminProviderAction adminProviderCancel" type="button" onClick={beginNew}><Plus size={15} />{zh ? '新增视频渠道' : 'Add video channel'}</button>
      </div>

      <form className="adminProviderForm adminChannelEditor" onSubmit={save}>
        <label><span>{zh ? '显示名称' : 'Display name'}</span><input value={draft.name} required onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span>Model</span><input value={draft.model} required onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} /></label>
        <label><span>{zh ? '继承图片渠道' : 'Inherited image channel'}</span><select value={draft.imageProviderId} required onChange={(event) => { const inherited = imageProviders.find((provider) => provider.id === event.target.value); setDraft((current) => ({ ...current, imageProviderId: event.target.value, baseUrl: inherited?.baseUrl || '', apiKeyMasked: inherited?.apiKeyMasked || '' })); }}>{imageProviders.map((provider) => <option value={provider.id} key={provider.id}>{provider.name} · {provider.model}</option>)}</select></label>
        <label><span>{zh ? '计费方式' : 'Billing mode'}</span><select value={pricing.mode} onChange={(event) => updatePricing({ mode: event.target.value, pricingSource: 'manual' })}><option value={VIDEO_PRICING_MODES.PER_SECOND}>{zh ? '按秒计费' : 'Per second'}</option><option value={VIDEO_PRICING_MODES.PER_GENERATION}>{zh ? '按条计费' : 'Per generation'}</option></select></label>
        <label><span>Base URL</span><input value={imageProviders.find((item) => item.id === draft.imageProviderId)?.baseUrl || draft.baseUrl} disabled /></label>
        <label><span>API Key</span><input value={draft.apiKeyMasked || (zh ? '继承加密 Key' : 'Inherited encrypted key')} disabled /></label>
        <label><span>{zh ? '每秒售价（元）' : 'Price per second (RMB)'}</span><input type="number" min="0" step="0.0001" value={pricing.pricePerSecondRmb} disabled={pricing.mode !== VIDEO_PRICING_MODES.PER_SECOND} onChange={(event) => updatePricing({ pricePerSecondRmb: event.target.value, pricingSource: 'manual' })} /></label>
        <label><span>{zh ? '每条售价（元）' : 'Price per video (RMB)'}</span><input type="number" min="0" step="0.01" value={pricing.pricePerGenerationRmb} disabled={pricing.mode !== VIDEO_PRICING_MODES.PER_GENERATION} onChange={(event) => updatePricing({ pricePerGenerationRmb: event.target.value, pricingSource: 'manual' })} /></label>
        <label><span>{zh ? '美元汇率' : 'USD exchange rate'}</span><input type="number" min="0.0001" step="0.0001" value={pricing.exchangeRate} onChange={(event) => updatePricing({ exchangeRate: event.target.value, pricingSource: 'manual' })} /></label>
        <label><span>{zh ? '上游美元/秒' : 'Upstream USD/second'}</span><input type="number" min="0" step="0.0001" value={pricing.upstreamPricePerSecond} onChange={(event) => updatePricing({ upstreamPricePerSecond: event.target.value, pricingSource: 'manual' })} /></label>
        <label className="adminProviderCheck"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span>{zh ? '启用' : 'Enabled'}</span></label>
        <label className="adminProviderCheck"><input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft((current) => ({ ...current, isDefault: event.target.checked }))} /><span>{zh ? '默认渠道' : 'Default channel'}</span></label>
        <div className="adminChatPricingMeta adminChannelPricingMeta">
          <span>{zh ? '价格来源' : 'Source'}：<b>{pricing.pricingSource === 'synced' ? (zh ? '自动同步' : 'Synced') : (zh ? '手动设置' : 'Manual')}</b></span>
          <span>4s：<b>{previewCredits[4]} {zh ? '积分' : 'credits'}</b></span>
          <span>8s：<b>{previewCredits[8]} {zh ? '积分' : 'credits'}</b></span>
          <span>12s：<b>{previewCredits[12]} {zh ? '积分' : 'credits'}</b></span>
        </div>
        <div className="adminChannelEditorActions">
          <button className="adminProviderAction adminProviderSave" type="submit" disabled={status === 'saving'}>{status === 'saving' ? <LoaderCircle className="spinIcon" size={16} /> : <Save size={16} />}{draft.id ? (zh ? '保存视频渠道' : 'Save video channel') : (zh ? '新增视频渠道' : 'Add video channel')}</button>
          {draft.id ? <><button className="adminProviderAction adminProviderCancel" type="button" onClick={() => void runProviderAction('sync-pricing')} disabled={status === 'sync-pricing'}>{status === 'sync-pricing' ? <LoaderCircle className="spinIcon" size={16} /> : <RefreshCw size={16} />}{zh ? '同步价格' : 'Sync pricing'}</button><button className="adminProviderAction adminProviderCancel" type="button" onClick={() => void runProviderAction('check')} disabled={status === 'check'}>{status === 'check' ? <LoaderCircle className="spinIcon" size={16} /> : <ShieldCheck size={16} />}{zh ? '检查连接' : 'Check connection'}</button><button className="adminProviderAction adminProviderCancel" type="button" onClick={beginNew}><X size={16} />{zh ? '取消编辑' : 'Cancel edit'}</button></> : null}
        </div>
      </form>

      <div className="adminChannelTableWrap">
        <table className="adminChannelTable">
          <thead><tr><th>{zh ? '渠道名称' : 'Channel'}</th><th>{zh ? '模型与来源' : 'Model & source'}</th><th>{zh ? '接口与密钥' : 'Endpoint & key'}</th><th>{zh ? '计费' : 'Billing'}</th><th>{zh ? '状态' : 'Status'}</th><th>{zh ? '操作' : 'Actions'}</th></tr></thead>
          <tbody>{providers.map((provider) => <tr key={provider.id}><td><strong>{provider.name}</strong></td><td><span>{provider.model}</span><small>{provider.inheritedProviderName || (zh ? '图片渠道' : 'Image channel')}</small></td><td><span>{provider.baseUrl}</span><small>{provider.apiKeyMasked || (zh ? '未配置 Key' : 'No key')}</small></td><td><span>{provider.pricingMode === VIDEO_PRICING_MODES.PER_SECOND ? (zh ? '按秒' : 'Per second') : (zh ? '按条' : 'Per video')}</span><small>{formatCredits(getVideoGenerationPricing({ seconds: 4 }, provider.pricingConfig).credits)} {zh ? '积分 / 4秒' : 'credits / 4s'}</small></td><td><div className="adminChannelStatus"><i className={provider.enabled ? 'enabled' : 'disabled'}>{provider.enabled ? (zh ? '启用' : 'Enabled') : (zh ? '停用' : 'Disabled')}</i>{provider.isDefault ? <i className="default">{zh ? '默认' : 'Default'}</i> : null}</div></td><td><div className="adminChannelRowActions"><button className="adminProviderRowAction adminProviderEdit" type="button" onClick={() => beginEdit(provider)}><Settings size={14} />{zh ? '编辑' : 'Edit'}</button><button className="adminProviderRowAction adminProviderRemove" type="button" onClick={() => void removeProvider(provider)} aria-label={zh ? '删除视频渠道' : 'Delete video channel'}><Trash2 size={15} /></button></div></td></tr>)}</tbody>
        </table>
      </div>
      {message ? <p className={`adminNotice ${status === 'error' ? 'error' : ''}`}>{status === 'success' ? <CheckCircle2 size={15} /> : null}{message}</p> : null}
    </section>
  );
}
