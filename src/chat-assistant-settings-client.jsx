import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import './chat-assistant-settings.css';

export function useAssistantSettings({ enabled, accessToken }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const version = useRef(0);
  const savingRef = useRef(false);
  const active = useRef(false);
  const refresh = useCallback(async () => {
    if (!enabled || savingRef.current) return;
    const current = ++version.current;
    try {
      const response = await fetch('/api/chat-settings', {
        cache: 'no-store', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      if (active.current && current === version.current) { setSettings(data.settings); setFeedback(''); }
    } catch {
      if (active.current && current === version.current) setFeedback('loadError');
    } finally {
      if (active.current && current === version.current) setLoading(false);
    }
  }, [enabled, accessToken]);
  useEffect(() => {
    active.current = true;
    setLoading(true);
    refresh();
    const onFocus = () => refresh();
    const timer = enabled ? setInterval(onFocus, 60_000) : null;
    if (enabled) window.addEventListener('focus', onFocus);
    return () => { active.current = false; ++version.current; clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh, enabled]);
  async function selectModel(providerId) {
    if (savingRef.current || !enabled) return;
    savingRef.current = true;
    ++version.current;
    setSaving(true);
    setFeedback('');
    try {
      const response = await fetch('/api/chat-settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ providerId })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error);
      if (active.current) { setSettings(data.settings); setFeedback('saved'); }
    } catch (error) {
      if (active.current) setFeedback(error.message === 'CHAT_MODEL_NOT_AVAILABLE' ? 'unavailable' : 'saveError');
    } finally {
      savingRef.current = false;
      if (active.current) { setSaving(false); setLoading(false); }
    }
  }
  return { settings, loading, saving, feedback, refresh, selectModel };
}

export function AssistantUserSettings({ language, state, sending, onClose }) {
  const zh = language === 'zh';
  const { settings, loading, saving, feedback } = state;
  const defaultModel = settings?.providers.find((p) => p.id === settings.defaultProviderId);
  const notices = zh ? {
    saved: '已保存到当前账号，下条消息生效。',
    loadError: '暂时无法读取设置，请重试。',
    saveError: '保存失败，仍保留原来的模型。',
    unavailable: '此模型已不可用，请刷新后重新选择。'
  } : {
    saved: 'Saved to your account for the next message.',
    loadError: 'Unable to load settings. Please retry.',
    saveError: 'Save failed. Your previous model is unchanged.',
    unavailable: 'This model is no longer available. Refresh to choose again.'
  };
  return <section className="assistantUserSettings" id="assistant-user-settings" aria-label={zh ? '我的精灵设置' : 'My assistant settings'}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <div className="assistantUserSettingsHeading"><strong>{zh ? '我的精灵设置' : 'My assistant settings'}</strong>
      <button type="button" onClick={onClose} aria-label={zh ? '返回聊天' : 'Back to chat'}><X size={16} /></button></div>
    <label htmlFor="user-assistant-model">{zh ? '聊天模型' : 'Chat model'}</label>
    <select id="user-assistant-model" className="chatModelSelect" aria-label={zh ? '精灵文本模型' : 'Assistant model'}
      value={settings?.preferredProviderId || ''} disabled={loading || saving || sending || !settings?.providers.length}
      onChange={(event) => state.selectModel(event.target.value)}>
      <option value="">{zh ? '跟随管理员默认' : 'Follow administrator default'}{defaultModel ? ` · ${defaultModel.name}` : ''}</option>
      {settings?.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    <p>{zh ? '选择自动保存到账号；只影响之后的精灵聊天，历史消息保留。' : 'Automatically saved to your account. Only future chats change; history is retained.'}</p>
    {settings?.unavailablePreference && <p role="status">{zh ? '原选模型已停用或无权使用，当前跟随可用默认模型。' : 'Your previous model is unavailable. Now following an accessible default.'}</p>}
    {!loading && !settings?.providers.length && <p role="status">{zh ? '暂无可用模型，请联系管理员。' : 'No available model. Contact your administrator.'}</p>}
    {(saving || feedback) && <p role="status">{saving ? (zh ? '正在保存…' : 'Saving…') : notices[feedback]}
      {['loadError', 'saveError', 'unavailable'].includes(feedback) && <button type="button" onClick={state.refresh}>{zh ? '刷新设置' : 'Refresh settings'}</button>}</p>}
  </section>;
}
