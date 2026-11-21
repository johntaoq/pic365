import React, { useEffect, useState } from 'react';
import { Image, Type, Plus, RefreshCw, Settings, Save, X, LoaderCircle, Trash2 } from 'lucide-react';
import { normalizeChatPricing } from '../shared/chat-billing.js';
import './upstream-rules.css';
import ImageUpstreamRules from './image-upstream-rules.jsx';

const priceKeys = ['input', 'output', 'cacheRead', 'cacheWrite'];

export default function AdminUpstreamRules({ language = 'zh', session }) {
  const zh = language === 'zh';
  const [data, setData] = useState({ textProviders: [], imageProviders: [], rules: [] });
  const [kind, setKind] = useState('text');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  const labels = zh ? ['输入', '输出', '缓存读', '缓存写'] : ['Input', 'Output', 'Cache read', 'Cache write'];
  const errors = {
    LAST_MODEL_RULE_REQUIRED: zh ? '每类模型至少保留一个，不能删除最后一个。' : 'Keep at least one model of each type.',
    MODEL_RULE_NOT_FOUND: zh ? '此模型规则已不存在，请刷新列表。' : 'This model rule no longer exists. Refresh the list.',
    MODEL_RULE_CHANGED: zh ? '同步期间规则已变更，请刷新后重试。' : 'The rule changed during sync. Refresh and try again.',
    MODEL_PRICE_NOT_FOUND: zh ? '未找到这个精确模型名称，原价格已保留。' : 'Exact model not found; existing prices retained.',
    UNSUPPORTED_PRICE_FORMAT: zh ? '上游价格格式暂不支持，原规则已保留。' : 'Unsupported upstream format; rules retained.',
    INVALID_MODEL_PRICE: zh ? '请填写完整的非负价格。' : 'Enter valid non-negative prices.',
    API_KEY_REQUIRED: zh ? '新模型需要填写 API Key。' : 'An API key is required for a new model.',
    MODEL_ALREADY_EXISTS: zh ? '该模型已存在，请编辑现有规则；同一模型只能出现一次。' : 'This model already exists. Edit its existing rule.',
    MODEL_PROVIDER_NOT_FOUND: zh ? '请先配置模型的上游地址。' : 'Configure the upstream URL first.',
    INVALID_UPSTREAM_URL: zh ? '请输入完整的 http 或 https 上游地址。' : 'Enter a valid http or https upstream URL.',
    PRICE_SYNC_FAILED: zh ? '同步失败，原价格已保留，你也可以手动输入。' : 'Sync failed. Existing prices are retained; manual entry is available.'
  };
  async function request(body) {
    const previousData = data;
    setBusy(true);
    setMessage('');
    if (body?.kind === 'text' && body.provider) {
      setData((current) => ({
        ...current, textProviders: current.textProviders.map((provider) => provider.model === body.model
          ? { ...provider, magicEnabled: body.provider.magicEnabled, assistantEnabled: body.provider.assistantEnabled }
          : body.provider.magicEnabled ? { ...provider, magicEnabled: false } : provider)
      }));
    }
    try {
      const response = await fetch('/api/admin/upstream-rules', body ? {
        method: body.action === 'delete' ? 'DELETE' : body.action === 'sync' ? 'POST' : 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      } : { headers, cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      setData(payload);
      if (body) {
        setDraft(null);
        setMessage(body.action === 'delete' ? (zh ? '模型已删除。' : 'Model deleted.')
          : body.action === 'sync' ? (zh ? '上游价格已同步。' : 'Upstream prices synchronized.') : (zh ? '规则已保存。' : 'Rules saved.'));
      }
      return true;
    } catch (error) {
      if (body) setData(previousData);
      setMessage(errors[error.message] || `${zh ? '操作失败' : 'Operation failed'}: ${error.message}`);
      return false;
    } finally { setBusy(false); }
  }
  useEffect(() => { request(); }, []);
  function removeModel(modelKind, model) {
    const prompt = modelKind === 'image'
      ? (zh ? `删除“${model}”的上游规则？不会删除下游生图渠道；依赖此规则的 Token 计费请求会报缺少上游价格。`
        : `Delete the upstream rule for “${model}”? Image channels stay in place, but requests that depend on these token rates will report missing pricing.`)
      : (zh ? `删除文本模型“${model}”？对应的服务配置将被移除，历史对话和用量保留。若它是魔笔模型，需重新指定。`
        : `Delete text model “${model}”? Its service configuration will be removed, but conversations and usage are retained. If it serves Magic, select another model for Magic.`);
    if (globalThis.confirm?.(prompt)) request({ action: 'delete', kind: modelKind, model });
  }
  function editText(provider = {}) {
    setDraft({ kind: 'text', provider: {
      ...provider, id: provider.id || '', name: provider.name || '', model: provider.model || '',
      baseUrl: provider.baseUrl || 'https://www.unikeyx.com/v1', apiKey: '',
      maxOutputTokens: provider.maxOutputTokens || 2048, systemPrompt: provider.systemPrompt || '',
      pricing: provider.pricing || normalizeChatPricing(), enabled: provider.enabled ?? true,
      magicEnabled: provider.magicEnabled ?? !data.textProviders.some((item) => item.magicEnabled),
      assistantEnabled: provider.assistantEnabled ?? true,
      isDefault: provider.isDefault ?? false
    } });
  }
  function field(key, value) {
    setDraft((current) => ({ ...current, provider: { ...current.provider, [key]: value } }));
  }
  const images = data.rules.filter((rule) => rule.kind === 'image');
  const textModels = data.textProviders.filter((p, i, all) => all.findIndex((item) => item.model === p.model) === i);
  return <section className="adminBlock upstreamRules">
    <header className="upstreamHeading">
      <h3>{zh ? '上游规则' : 'Upstream rules'}</h3>
      <div>
        <button type="button" disabled={busy} title={zh ? '刷新' : 'Refresh'} onClick={() => request()}><RefreshCw size={16} /></button>
        {kind === 'text' && <button type="button" disabled={busy} onClick={() => editText()}><Plus size={16} />{zh ? '添加文本模型' : 'Add text model'}</button>}
      </div>
    </header>
    <nav className="upstreamTabs" aria-label={zh ? '模型类型' : 'Model type'}>
      <button type="button" aria-pressed={kind === 'text'} onClick={() => { setKind('text'); setDraft(null); }}><Type size={16} />{zh ? '文本模型' : 'Text models'} ({textModels.length})</button>
      <button type="button" aria-pressed={kind === 'image'} onClick={() => { setKind('image'); setDraft(null); }}><Image size={16} />{zh ? '图片模型' : 'Image models'} ({images.length})</button>
    </nav>
    {message && <p role="status" className="upstreamMessage">{message}</p>}
    {busy && <div role="status"><LoaderCircle size={18} className="spin" /></div>}
    {kind === 'image' && <ImageUpstreamRules rules={data.rules} busy={busy} onSave={request} onDelete={(model) => removeModel('image', model)} language={language} />}
    {kind === 'text' && !draft && <div className="upstreamTableWrap"><table>
      <caption>{zh ? '元 / 百万 Token · 100 积分 = 1 元 · 魔笔只选一个模型，精灵可选多个 · 至少保留一个文本模型'
        : 'RMB / 1M tokens · 100 credits = RMB 1 · Select one Magic model; Assistant allows several · Keep at least one text model'}</caption>
      <thead><tr><th>Model</th>
        {labels.map((label) => <th key={label}>{label}</th>)}<th>{zh ? '魔笔' : 'Magic'}</th><th>{zh ? '精灵' : 'Assistant'}</th>
        <th>{zh ? '来源' : 'Source'}</th><th>{zh ? '操作' : 'Actions'}</th></tr></thead>
      <tbody>{textModels.map((provider) => {
        const rule = data.rules.find((item) => item.kind === kind && item.model === provider.model);
        return <tr key={provider.id}>
          <td className="upstreamModelCell"><strong>{provider.model}</strong><small>{provider.name}{!provider.enabled ? (zh ? ' · 已停用' : ' · Disabled') : ''}</small></td>
          {priceKeys.map((key, index) => <td key={key} data-label={labels[index]}>{Number(provider.pricing[key]).toFixed(4)}</td>)}
            <td data-label={zh ? '魔笔' : 'Magic'}><input type="radio" name="system-magic-model"
              aria-label={`${provider.model} ${zh ? '设为魔笔模型' : 'Set as Magic model'}`}
              checked={provider.magicEnabled} disabled={busy || !provider.enabled || !provider.hasApiKey}
              onChange={() => request({ kind: 'text', model: provider.model, provider: { ...provider, magicEnabled: true } })} /></td>
            <td data-label={zh ? '精灵' : 'Assistant'}><input type="checkbox"
              aria-label={`${provider.model} ${zh ? '精灵' : 'Assistant'}`} checked={provider.assistantEnabled} disabled={busy}
              onChange={(event) => request({ kind: 'text', model: provider.model, provider: { ...provider, assistantEnabled: event.target.checked } })} /></td>
          <td data-label={zh ? '来源' : 'Source'}><div><small>{rule?.pricingSource === 'synced' ? (zh ? '已同步' : 'Synced') : (zh ? '手动 / 迁移' : 'Manual / migrated')}</small>
            {rule?.priceSyncedAt && <small>{new Date(rule.priceSyncedAt).toLocaleString(zh ? 'zh-CN' : 'en-US')}</small>}</div></td>
          <td data-label={zh ? '操作' : 'Actions'}><div className="upstreamRowActions">
            <button type="button" title={zh ? '同步上游价格' : 'Sync upstream prices'} disabled={busy} onClick={() => request({ action: 'sync', kind, model: provider.model, providerId: provider.id })}><RefreshCw size={16} /></button>
            <button type="button" title={zh ? '编辑规则' : 'Edit rule'} disabled={busy} onClick={() => editText(provider)}><Settings size={16} /></button>
            <button type="button" disabled={busy || textModels.length <= 1} onClick={() => removeModel('text', provider.model)}
              title={textModels.length <= 1 ? (zh ? '至少保留一个文本模型' : 'Keep at least one text model') : (zh ? '删除模型' : 'Delete model')}
              aria-label={zh ? `删除文本模型 ${provider.model}` : `Delete text model ${provider.model}`}><Trash2 size={16} /></button>
          </div></td>
        </tr>;
      })}</tbody>
    </table></div>}
    {kind === 'text' && draft && <form className="upstreamEditor" onSubmit={(event) => { event.preventDefault(); request({ ...draft, model: draft.provider.model }); }}>
      <header className="upstreamHeading"><h4>{zh ? '编辑模型规则' : 'Edit model rule'}</h4>
        <button type="button" title={zh ? '取消' : 'Cancel'} disabled={busy} onClick={() => setDraft(null)}><X size={18} /></button></header>
      <>
        <div className="upstreamFields">
          <label>{zh ? '显示名称' : 'Display name'}<input required value={draft.provider.name} onChange={(e) => field('name', e.target.value)} /></label>
          <label>Model<input required value={draft.provider.model} onChange={(e) => field('model', e.target.value)} /></label>
          <label>Base URL<input required type="url" value={draft.provider.baseUrl} onChange={(e) => field('baseUrl', e.target.value)} /></label>
          <label>API Key<input type="password" autoComplete="new-password" required={!draft.provider.id} value={draft.provider.apiKey} placeholder={draft.provider.apiKeyMasked || ''} onChange={(e) => field('apiKey', e.target.value)} /></label>
          <label>{zh ? '最大输出 Token' : 'Max output tokens'}<input type="number" min="128" max="16384" value={draft.provider.maxOutputTokens} onChange={(e) => field('maxOutputTokens', Number(e.target.value))} /></label>
          <label>{zh ? '美元汇率' : 'USD exchange rate'}<input type="number" min="0.000001" step="0.000001" value={draft.provider.exchangeRate || 7} onChange={(e) => field('exchangeRate', Number(e.target.value))} /></label>
        </div>
        <fieldset><legend>{zh ? '实际用量单价 · 元 / 百万 Token' : 'Usage pricing · RMB / 1M tokens'}</legend>
          <div className="upstreamFields">{priceKeys.map((key, index) => <label key={key}>{labels[index]}<input type="number" min="0" step="0.000001" required value={draft.provider.pricing[key]} onChange={(e) => field('pricing', { ...draft.provider.pricing, [key]: Number(e.target.value) })} /></label>)}</div>
          {draft.provider.pricing.tiers?.map((tier, index) => <div className="upstreamTier" key={index}>
            <span>{zh ? '输入超过' : 'Input above'} {tier.aboveTokens.toLocaleString()} Token</span>
            <div className="upstreamFields">{priceKeys.map((key, labelIndex) => <label key={key}>{labels[labelIndex]}<input type="number" min="0" step="0.000001" value={tier[key]} onChange={(e) => field('pricing', { ...draft.provider.pricing, tiers: draft.provider.pricing.tiers.map((item, i) => i === index ? { ...item, [key]: Number(e.target.value) } : item) })} /></label>)}</div>
          </div>)}
        </fieldset>
        <div className="upstreamChecks">
          <label><input type="checkbox" checked={draft.provider.enabled} onChange={(e) => field('enabled', e.target.checked)} />{zh ? '启用' : 'Enabled'}</label>
          <label><input type="radio" name="editor-magic-model" checked={draft.provider.magicEnabled}
            onChange={() => field('magicEnabled', true)} />{zh ? '设为唯一魔笔模型' : 'Set as the only Magic model'}</label>
          <label><input type="checkbox" checked={draft.provider.assistantEnabled} onChange={(e) => field('assistantEnabled', e.target.checked)} />{zh ? '精灵可用' : 'Available to Assistant'}</label>
        </div>
        <p>{zh ? '魔笔由系统自动选择此处指定的模型。精灵的提示词与默认模型，请到「系统管理 → 聊天精灵设置」配置。' : 'Magic uses the selected model automatically. Configure the Assistant prompt and default in System → Chat assistant settings.'}</p>
      </>
      <footer><button type="submit" disabled={busy}><Save size={16} />{zh ? '保存' : 'Save'}</button></footer>
    </form>}
  </section>;
}
