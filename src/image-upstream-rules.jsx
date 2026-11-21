import React, { useState } from 'react';
import { Plus, RefreshCw, Save, Settings, X } from 'lucide-react';

const numberText = (value) => Number(value || 0).toFixed(6).replace(/\.?0+$/, '') || '0';

export default function ImageUpstreamRules({ rules, busy, onSave, language = 'zh' }) {
  const zh = language === 'zh';
  const [draft, setDraft] = useState(null);
  const models = rules.filter((rule) => rule.kind === 'image');
  function edit(rule) {
    setDraft({
      action: rule ? 'update' : 'create', kind: 'image', model: rule?.model || '',
      upstreamBaseUrl: rule?.upstreamBaseUrl || 'https://www.unikeyx.com',
      unit: rule?.unit || 'tokens',
      pricing: rule?.pricing || { input: rule?.imageTextInputRmb || 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      imageInput: rule?.imageInput ?? rule?.pricing?.input ?? 0,
      fixedPriceRmb: rule?.fixedPriceRmb || 0, exchangeRate: rule?.exchangeRate || 7,
      referenceTokenBudget: rule?.referenceTokenBudget || 4096
    });
  }
  async function save(event) {
    event.preventDefault();
    if (await onSave(draft)) setDraft(null);
  }
  const field = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return <div className="imageUpstreamRules">
    <header className="upstreamHeading">
      <p>{zh ? '按精确模型名维护唯一的上游采购价格，与下游售价分开。同步失败可手动输入，原价格不会被清空。' : 'One upstream cost rule per exact model name, independent of retail prices. Failed sync preserves existing prices; manual entry is supported.'}</p>
      <button type="button" disabled={busy} onClick={() => edit()}><Plus size={16} />{zh ? '新增模型上游' : 'Add model upstream'}</button>
    </header>
    {!draft ? <div className="upstreamTableWrap"><table>
      <caption>{zh ? 'Token 单价：元 / 百万 Token；每个下游生图服务单独决定是否另计。' : 'Rates: RMB / million tokens. Each retail image service controls its own surcharges.'}</caption>
      <thead><tr><th>Model / {zh ? '上游地址' : 'Upstream'}</th><th>{zh ? '文本输入' : 'Text input'}</th>
        <th>{zh ? '参考图输入' : 'Image input'}</th><th>{zh ? '生图输出' : 'Image output'}</th><th>{zh ? '来源' : 'Source'}</th><th>{zh ? '操作' : 'Actions'}</th></tr></thead>
      <tbody>{models.map((rule) => <tr key={rule.model}>
        <td className="upstreamModelCell"><strong>{rule.model}</strong><small>{rule.upstreamBaseUrl || (zh ? '未设置上游地址' : 'Upstream not configured')}</small></td>
        <td data-label={zh ? '文本输入 · 元/百万' : 'Text · RMB/1M'}>{numberText(rule.imageTextInputRmb ?? rule.pricing?.input)}</td>
        <td data-label={zh ? '参考图输入 · 元/百万' : 'Images · RMB/1M'}>{numberText(rule.imageInput ?? rule.pricing?.input)}</td>
        <td data-label={zh ? '输出成本' : 'Output cost'}>{rule.unit === 'image'
          ? `${numberText(rule.fixedPriceRmb)} ${zh ? '元/张' : 'RMB/image'}`
          : `${numberText(rule.pricing?.output)} ${zh ? '元/百万 Token' : 'RMB/1M tokens'}`}</td>
        <td data-label={zh ? '来源' : 'Source'}><small>{rule.pricingSource === 'synced' ? (zh ? '上游同步' : 'Synced')
          : rule.pricingSource === 'unconfigured' ? (zh ? '待配置' : 'Not configured') : (zh ? '手动 / 迁移' : 'Manual / migrated')}</small>
          {rule.priceSyncedAt && <small>{zh ? '上次同步：' : 'Last synced: '}{new Date(rule.priceSyncedAt).toLocaleString(zh ? 'zh-CN' : 'en-US')}</small>}</td>
        <td data-label={zh ? '操作' : 'Actions'}><div className="upstreamRowActions">
          <button type="button" disabled={busy || !rule.upstreamBaseUrl} title={zh ? '同步上游价格' : 'Sync upstream prices'} onClick={() => onSave({ action: 'sync', kind: 'image', model: rule.model })}><RefreshCw size={16} /></button>
          <button type="button" disabled={busy} title={zh ? '编辑规则' : 'Edit rule'} onClick={() => edit(rule)}><Settings size={16} /></button>
        </div></td>
      </tr>)}</tbody>
    </table>{!models.length && <p>{zh ? '暂无上游图片模型，点击新增即可配置。' : 'No image models yet. Add one to get started.'}</p>}</div> : <form className="upstreamEditor" onSubmit={save}>
      <header className="upstreamHeading"><h4>{draft.action === 'create' ? (zh ? '新增模型上游' : 'Add model upstream') : (zh ? '编辑上游采购价' : 'Edit upstream costs')}</h4>
        <button type="button" disabled={busy} title={zh ? '取消' : 'Cancel'} onClick={() => setDraft(null)}><X size={17} /></button></header>
      <fieldset disabled={busy}><legend>{zh ? '模型与采购价格' : 'Model and purchase rates'}</legend><div className="upstreamFields">
        <label>{zh ? '模型名称（唯一）' : 'Unique model name'}<input required maxLength={160} readOnly={draft.action !== 'create'} value={draft.model} onChange={(e) => field('model', e.target.value)} placeholder="gpt-image-2" /></label>
        <label>{zh ? '模型上游地址' : 'Upstream URL'}<input type="url" required value={draft.upstreamBaseUrl} maxLength={500} onChange={(e) => field('upstreamBaseUrl', e.target.value)} /></label>
        <label>{zh ? '上游输出计费单位' : 'Output pricing unit'}<select value={draft.unit} onChange={(e) => field('unit', e.target.value)}>
          <option value="tokens">{zh ? '按 Token' : 'Per token'}</option><option value="image">{zh ? '每张固定价' : 'Per image'}</option></select></label>
        <label>{zh ? '同步美元价格时的汇率' : 'Exchange rate for USD prices'}<input type="number" min="0.000001" step="0.000001" required value={draft.exchangeRate} onChange={(e) => field('exchangeRate', e.target.value)} /></label>
      </div>
      <p>{zh ? '采购单价（手动填写为人民币；也可保存后同步上游）' : 'Purchase rates (manual entries in RMB; save then sync if desired)'}</p>
      <div className="upstreamFields">
        <label>{zh ? '文本输入 · 元/百万 Token' : 'Text input · RMB/1M tokens'}<input type="number" min="0" step="0.000001" required value={draft.pricing.input} onChange={(e) => field('pricing', { ...draft.pricing, input: e.target.value })} /></label>
        <label>{zh ? '参考图输入 · 元/百万 Token' : 'Image input · RMB/1M tokens'}<input type="number" min="0" step="0.000001" required value={draft.imageInput} onChange={(e) => field('imageInput', e.target.value)} /></label>
        {draft.unit === 'tokens' ? <label>{zh ? '生图输出 · 元/百万 Token' : 'Output · RMB/1M tokens'}<input type="number" min="0" step="0.000001" required value={draft.pricing.output} onChange={(e) => field('pricing', { ...draft.pricing, output: e.target.value })} /></label>
          : <label>{zh ? '生图输出 · 元/张' : 'Output · RMB/image'}<input type="number" min="0" step="0.000001" required value={draft.fixedPriceRmb} onChange={(e) => field('fixedPriceRmb', e.target.value)} /></label>}
      </div>
      <details className="upstreamBudgetSettings"><summary>{zh ? '预估冻结额度' : 'Reservation budget'}</summary>
        <label>{zh ? '每张参考图预留 Token' : 'Reserved tokens per reference'}<input type="number" min="1" max="1000000" step="1" required value={draft.referenceTokenBudget} onChange={(e) => field('referenceTokenBudget', e.target.value)} /></label>
        <p>{zh ? '仅用于生成前冻结额度，不是实际图片 Token。结算使用上游返回的图片 Token 总和；未返回明细不另扣，超出冻结额不超扣并记录差额。' : 'Reservation only, not actual image tokens. Settlement uses reported image-token totals. Missing usage is not billed; over-budget fees are waived and recorded.'}</p>
      </details></fieldset>
      <footer><button type="submit" disabled={busy}><Save size={16} />{zh ? '保存上游规则' : 'Save upstream rule'}</button></footer>
    </form>}
  </div>;
}
