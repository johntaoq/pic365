import React, { useEffect, useRef, useState } from 'react';
import { Cat, LoaderCircle, RefreshCw, Save } from 'lucide-react';
import './chat-assistant-settings.css';

export default function AdminChatSettings({ language = 'zh', session }) {
  const zh = language === 'zh';
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  const lock = useRef(false);
  const dirty = draft && JSON.stringify(draft) !== saved;
  const available = draft?.providers.filter((p) => p.enabled && p.hasApiKey && draft.allowedModels.includes(p.model)) || [];
  const models = [...new Set(draft?.providers.map((p) => p.model) || [])];
  async function request(save = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/chat-settings', {
        method: save ? 'PATCH' : 'GET', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        ...(save ? { body: JSON.stringify(draft) } : {})
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      if (!mounted.current) return;
      setDraft(payload.settings);
      setSaved(JSON.stringify(payload.settings));
      if (save) setMessage(zh ? '精灵设置已保存，对后续聊天生效。' : 'Settings saved for subsequent messages.');
    } catch (error) {
      if (!mounted.current) return;
      const errors = {
        CHAT_SETTINGS_CHANGED: zh ? '配置已在其他页面变更。请重新载入后再编辑，未保存的修改将保留到你点击重新载入。' : 'Settings changed elsewhere. Reload before editing again.',
        INVALID_CHAT_SYSTEM_PROMPT: zh ? '请填写 1–8000 字的系统提示词。' : 'Enter a system prompt of 1–8000 characters.',
        INVALID_CHAT_DEFAULT_MODEL: zh ? '请从已勾选且启用的模型中选择默认模型。' : 'Select an enabled default from the allowed models.'
      };
      setMessage(errors[error.message] || (zh ? '设置读取或保存失败，请稍后重试。' : 'Unable to load or save settings. Please retry.'));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    request();
    return () => { mounted.current = false; };
  }, []);
  function toggleModel(model, checked) {
    setDraft((value) => {
      const allowedModels = checked ? [...value.allowedModels, model] : value.allowedModels.filter((m) => m !== model);
      const eligible = value.providers.filter((p) => p.enabled && p.hasApiKey && allowedModels.includes(p.model));
      const defaultProviderId = eligible.some((p) => p.id === value.defaultProviderId) ? value.defaultProviderId : eligible[0]?.id || '';
      return { ...value, allowedModels, defaultProviderId };
    });
  }
  return <section className="adminBlock assistantAdminSettings">
    <header className="assistantSettingsHeading">
      <div><h3><Cat size={19} />{zh ? '聊天精灵设置' : 'Chat assistant settings'}</h3>
        <p>{zh ? '统一管理精灵的行为与可用模型，用户可在精灵窗口内选择自己的聊天模型。' : 'Manage assistant behavior and available models. Users choose their model inside the chat window.'}</p></div>
      <button type="button" disabled={busy} onClick={() => request()}><RefreshCw size={15} />{zh ? '重新载入' : 'Reload'}</button>
    </header>
    {message && <p className="assistantSettingsNotice" role="status">{message}</p>}
    {!draft ? <p role="status">{busy ? (zh ? '正在加载…' : 'Loading…') : (zh ? '请重新载入设置。' : 'Reload settings to continue.')}</p> : <form onSubmit={(event) => { event.preventDefault(); request(true); }}>
      <fieldset disabled={busy}>
        <div className="assistantSettingsColumns">
          <section className="assistantSettingsCard">
            <h4>{zh ? '系统提示词' : 'System prompt'}</h4>
            <p>{zh ? '适用于所有精灵聊天模型，不改变魔笔和电商的专用提示词。' : 'Applies to all chat models; specialized Magic and ecommerce prompts are unchanged.'}</p>
            <label htmlFor="assistant-system-prompt">{zh ? '精灵的角色、语气与回答要求' : 'Assistant role, tone and instructions'}</label>
            <textarea id="assistant-system-prompt" rows={12} maxLength={draft.maxPromptLength} required value={draft.systemPrompt}
              onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} />
            <div className="assistantSettingsPromptFooter"><small>{draft.systemPrompt.length} / {draft.maxPromptLength}</small>
              <button type="button" onClick={() => setDraft({ ...draft, systemPrompt: draft.defaultPrompt })}>{zh ? '填入默认提示词' : 'Use default prompt'}</button></div>
          </section>
          <section className="assistantSettingsCard">
            <h4>{zh ? '用户可选模型' : 'Allowed models'}</h4>
            <p>{zh ? '与「财务管理 → 上游规则」的「精灵」勾选同步。模型定价与接入信息仍在上游规则维护。' : 'Synced with the Assistant checkbox in Finance → Upstream rules, where pricing and connections are managed.'}</p>
            <div className="assistantModelRange">
              {!models.length && <p>{zh ? '请先在上游规则添加文本模型。' : 'Add a text model in Upstream rules first.'}</p>}
              {models.map((model) => {
                const channels = draft.providers.filter((p) => p.model === model);
                const ready = channels.some((p) => p.enabled && p.hasApiKey);
                return <label className="assistantModelOption" key={model}>
                  <input type="checkbox" checked={draft.allowedModels.includes(model)}
                    onChange={(event) => toggleModel(model, event.target.checked)} aria-label={`${model} ${zh ? '允许精灵使用' : 'Allow assistant'}`} />
                  <span><strong>{model}</strong><small>{channels.map((p) => p.name).join(' / ')}{!ready ? (zh ? ' · 未启用或未配置密钥' : ' · Disabled or missing key') : ''}</small></span>
                </label>;
              })}
            </div>
            <label htmlFor="assistant-default-model">{zh ? '精灵默认模型' : 'Assistant default model'}</label>
            <select id="assistant-default-model" value={draft.defaultProviderId} disabled={!available.length}
              onChange={(event) => setDraft({ ...draft, defaultProviderId: event.target.value })}>
              {!available.length && <option value="">{zh ? '暂无可用模型' : 'No available model'}</option>}
              {available.map((p) => <option value={p.id} key={p.id}>{p.name} · {p.model}</option>)}
            </select>
            <p>{!available.length
              ? (zh ? '当前没有可用模型，保存后用户将暂时无法发送聊天。' : 'No model is available. Saving will temporarily disable sending messages.')
              : (zh ? '新用户默认跟随此模型。用户自选模型停用或失去权限时，自动回退到可用默认模型；分组权限仍然生效。' : 'New users follow this default. Unavailable personal choices fall back to an accessible default; group permissions still apply.')}</p>
          </section>
        </div>
      </fieldset>
      <footer className="assistantSettingsSave">
        <span>{dirty ? (zh ? '有未保存的修改' : 'Unsaved changes') : (zh ? '当前配置已加载' : 'Current settings loaded')}</span>
        <button type="submit" className="assistantSettingsPrimary" disabled={busy || !dirty || !draft.systemPrompt.trim()}>
          {busy ? <LoaderCircle size={16} className="spinIcon" /> : <Save size={16} />}{zh ? '保存精灵设置' : 'Save assistant settings'}
        </button>
      </footer>
    </form>}
  </section>;
}
