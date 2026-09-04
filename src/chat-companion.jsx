import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ImagePlus, LoaderCircle, Send, Trash2, X } from 'lucide-react';
import { clampFloatingPosition, clampFloatingSize, normalizeFloatingPosition } from '../shared/floating-position.js';
import foxAvatarUrl from './assets/chat-companion/pic265-fox-avatar.jpg';

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const POSITION_STORAGE_KEYS = Object.freeze({
  collapsed: 'pic365-chat-companion-position-collapsed',
  expanded: 'pic365-chat-companion-position-expanded'
});
const PANEL_SIZE_STORAGE_KEY = 'pic365-chat-companion-panel-size';
const PANEL_MIN_SIZE = Object.freeze({ width: 320, height: 420 });

function readStoredPosition(mode) {
  try {
    return normalizeFloatingPosition(JSON.parse(globalThis.localStorage?.getItem(POSITION_STORAGE_KEYS[mode]) || 'null'));
  } catch {
    return null;
  }
}

function storePosition(mode, position) {
  try {
    globalThis.localStorage?.setItem(POSITION_STORAGE_KEYS[mode], JSON.stringify(position));
  } catch {
    // Position persistence is optional when storage is unavailable.
  }
}

function readStoredPanelSize() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(PANEL_SIZE_STORAGE_KEY) || 'null');
    const width = Number(value?.width);
    const height = Number(value?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return {
      width: Math.max(PANEL_MIN_SIZE.width, width),
      height: Math.max(PANEL_MIN_SIZE.height, height)
    };
  } catch {
    return null;
  }
}

function storePanelSize(size) {
  try {
    globalThis.localStorage?.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Size persistence is optional when storage is unavailable.
  }
}

function FoxHead({ small = false }) {
  return <img className={`chatCompanionFox ${small ? 'small' : ''}`} src={foxAvatarUrl} alt="" draggable="false" />;
}

function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return reject(new Error('IMAGE_TYPE'));
    if (file.size > MAX_IMAGE_BYTES) return reject(new Error('IMAGE_SIZE'));
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name: file.name || 'pasted-image.png',
      mimeType: file.type,
      byteLength: file.size,
      dataUrl: reader.result
    });
    reader.onerror = () => reject(new Error('IMAGE_READ'));
    reader.readAsDataURL(file);
  });
}

function errorText(code, language) {
  const zh = {
    AUTH_REQUIRED: '登录后即可和精灵聊天。',
    CREDITS_REQUIRED: '积分不足，请充值后继续。',
    GROUP_BUDGET_REQUIRED: '集团预算不足，请联系集团管理员增加预算。',
    GROUP_BALANCE_REQUIRED: '集团可用余额不足，请先向集团账户转入积分。',
    GROUP_ACCESS_SUSPENDED: '你的集团账户已暂停或正在退出。',
    CHAT_REQUEST_IN_PROGRESS: '这条消息正在处理中，请稍候。',
    CHAT_PROVIDER_NOT_CONFIGURED: '聊天引擎暂未配置。',
    CHAT_PROVIDER_TIMEOUT: '精灵思考超时，请重试。',
    CHAT_USAGE_UNAVAILABLE: '渠道没有返回实际用量，本次未扣费。',
    INVALID_CHAT_IMAGE: '图片仅支持 PNG、JPG、WebP，单张不超过 5 MB。',
    IMAGE_TYPE: '图片仅支持 PNG、JPG、WebP。',
    IMAGE_SIZE: '单张图片不能超过 5 MB。'
  };
  const en = {
    AUTH_REQUIRED: 'Sign in to chat.',
    CREDITS_REQUIRED: 'Not enough credits.',
    GROUP_BUDGET_REQUIRED: 'Your group budget is insufficient. Contact the group administrator.',
    GROUP_BALANCE_REQUIRED: 'The group balance is insufficient.',
    GROUP_ACCESS_SUSPENDED: 'Your group access is paused or being removed.',
    CHAT_REQUEST_IN_PROGRESS: 'This message is already being processed.',
    CHAT_PROVIDER_NOT_CONFIGURED: 'The chat engine is not configured.',
    CHAT_PROVIDER_TIMEOUT: 'The assistant timed out. Please retry.',
    CHAT_USAGE_UNAVAILABLE: 'The provider returned no usage data, so nothing was charged.',
    INVALID_CHAT_IMAGE: 'Use PNG, JPG, or WebP images up to 5 MB each.',
    IMAGE_TYPE: 'Use PNG, JPG, or WebP images.',
    IMAGE_SIZE: 'Each image must be 5 MB or smaller.'
  };
  return (language === 'zh' ? zh : en)[code] || (language === 'zh' ? '发送失败，请稍后重试。' : 'Unable to send. Please try again.');
}

function displayCredits(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, '');
}

export default function ChatCompanion({ language, session, profile, onSignIn, onBilling, onProfileChange }) {
  const isSignedIn = Boolean(session?.user || session?.access_token);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [provider, setProvider] = useState(null);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [positions, setPositions] = useState(() => ({
    collapsed: readStoredPosition('collapsed'),
    expanded: readStoredPosition('expanded')
  }));
  const [panelSize, setPanelSize] = useState(readStoredPanelSize);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const companionRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const transcriptRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const suppressOrbClickRef = useRef(false);
  const t = useMemo(() => language === 'zh' ? {
    name: 'Pic265精灵',
    subtitle: '能看图，也能回答问题',
    wake: '唤醒 Pic265精灵',
    welcome: '你好呀，我是 Pic265精灵。你可以问我问题，也可以发图片让我帮你看看。',
    input: '输入问题，或粘贴图片…',
    clear: '清空聊天记录',
    copyAll: '复制全部聊天记录',
    copyOne: '复制这条消息',
    deleteOne: '删除这条消息',
    copied: '已复制',
    userLabel: '用户',
    assistantLabel: 'Pic265精灵',
    attach: '添加图片',
    send: '发送',
    signIn: '登录后开始聊天',
    recharge: '去充值',
    context: '最多携带最近 24 条消息',
    imageLimit: '最多 3 张，单张不超过 5 MB',
    thinking: 'Pic265精灵正在思考…',
    drag: '拖动调整位置',
    resize: '拖动调整精灵窗口大小',
    charged: (credits) => `本次 ${displayCredits(credits)} 积分`
  } : {
    name: 'Pic265 Assistant',
    subtitle: 'Understands images and questions',
    wake: 'Open chat assistant',
    welcome: 'Hi! Ask me a question or send an image for help.',
    input: 'Ask a question or paste an image…',
    clear: 'Clear chat history',
    copyAll: 'Copy all chat messages',
    copyOne: 'Copy this message',
    deleteOne: 'Delete this message',
    copied: 'Copied',
    userLabel: 'User',
    assistantLabel: 'Pic265 Assistant',
    attach: 'Add images',
    send: 'Send',
    signIn: 'Sign in to chat',
    recharge: 'Add credits',
    context: 'Uses up to the latest 24 messages',
    imageLimit: 'Up to 3 images, 5 MB each',
    thinking: 'Thinking…',
    drag: 'Drag to move',
    resize: 'Drag to resize the chat window',
    charged: (credits) => `${displayCredits(credits)} credits`
  }, [language]);

  const positionMode = open ? 'expanded' : 'collapsed';
  const activePosition = positions[positionMode];

  function viewportSize() {
    return { width: globalThis.innerWidth || 0, height: globalThis.innerHeight || 0 };
  }

  function clampForCompanion(position, rect = companionRef.current?.getBoundingClientRect()) {
    if (!rect) return position;
    return clampFloatingPosition(
      position,
      { width: rect.width, height: rect.height },
      viewportSize(),
      globalThis.innerWidth <= 760 ? 8 : 12
    );
  }

  function startDrag(event) {
    if (globalThis.innerWidth <= 760) return;
    if (event.button !== 0 || event.target.closest('button, input, textarea, select, a')) return;
    const rect = companionRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      captureTarget: event.currentTarget,
      pointerId: event.pointerId,
      mode: positionMode,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false
    };
    setDragging(true);
  }

  function startOrbDrag(event) {
    const rect = companionRef.current?.getBoundingClientRect();
    if (!rect || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      captureTarget: event.currentTarget,
      pointerId: event.pointerId,
      mode: 'collapsed',
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false
    };
    setDragging(true);
  }

  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    drag.moved = true;
    event.preventDefault();
    const next = clampFloatingPosition(
      { x: drag.left + deltaX, y: drag.top + deltaY },
      { width: drag.width, height: drag.height },
      viewportSize(),
      globalThis.innerWidth <= 760 ? 8 : 12
    );
    drag.position = next;
    setPositions((current) => ({ ...current, [drag.mode]: next }));
  }

  function finishDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.captureTarget?.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDragging(false);
    if (!drag.moved) return;
    const finalPosition = clampFloatingPosition(
      drag.position || { x: drag.left, y: drag.top },
      { width: drag.width, height: drag.height },
      viewportSize(),
      globalThis.innerWidth <= 760 ? 8 : 12
    );
    setPositions((current) => ({ ...current, [drag.mode]: finalPosition }));
    storePosition(drag.mode, finalPosition);
    if (drag.mode === 'collapsed') {
      suppressOrbClickRef.current = true;
      globalThis.setTimeout(() => { suppressOrbClickRef.current = false; }, 250);
    }
  }

  function cancelDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  }

  function startResize(event) {
    if (event.button !== 0) return;
    const rect = companionRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizeRef.current = {
      captureTarget: event.currentTarget,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    };
    setResizing(true);
  }

  function moveResize(event) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    const margin = globalThis.innerWidth <= 760 ? 8 : 12;
    const maximumSize = {
      width: Math.max(PANEL_MIN_SIZE.width, viewportSize().width - resize.left - margin),
      height: Math.max(PANEL_MIN_SIZE.height, viewportSize().height - resize.top - margin)
    };
    setPanelSize(clampFloatingSize({
      width: resize.width + event.clientX - resize.startX,
      height: resize.height + event.clientY - resize.startY
    }, PANEL_MIN_SIZE, maximumSize));
  }

  function finishResize(event) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resize.captureTarget?.releasePointerCapture?.(event.pointerId);
    resizeRef.current = null;
    setResizing(false);
    setPanelSize((current) => {
      if (current) storePanelSize(current);
      return current;
    });
  }

  function cancelResize(event) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    setResizing(false);
  }

  useEffect(() => {
    globalThis.addEventListener?.('pointermove', moveDrag, { passive: false });
    globalThis.addEventListener?.('pointerup', finishDrag);
    globalThis.addEventListener?.('pointercancel', cancelDrag);
    globalThis.addEventListener?.('pointermove', moveResize, { passive: false });
    globalThis.addEventListener?.('pointerup', finishResize);
    globalThis.addEventListener?.('pointercancel', cancelResize);
    return () => {
      globalThis.removeEventListener?.('pointermove', moveDrag);
      globalThis.removeEventListener?.('pointerup', finishDrag);
      globalThis.removeEventListener?.('pointercancel', cancelDrag);
      globalThis.removeEventListener?.('pointermove', moveResize);
      globalThis.removeEventListener?.('pointerup', finishResize);
      globalThis.removeEventListener?.('pointercancel', cancelResize);
    };
  }, []);

  useEffect(() => {
    if (!open || !isSignedIn) return;
    let active = true;
    setStatus('loading');
    fetch('/api/chat?limit=60', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'CHAT_FAILED');
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setMessages(Array.isArray(payload.messages) ? payload.messages : []);
        setProvider(payload.provider || null);
        if (payload.user) onProfileChange?.(payload.user);
        setStatus('idle');
      })
      .catch((error) => {
        if (!active) return;
        setMessage(errorText(error.message, language));
        setStatus('error');
      });
    return () => { active = false; };
  }, [open, isSignedIn, language]);

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, open]);

  useEffect(() => {
    const keepInsideViewport = () => {
      const current = positions[positionMode];
      if (!current) return;
      const next = clampForCompanion(current);
      if (!next || (next.x === current.x && next.y === current.y)) return;
      setPositions((value) => ({ ...value, [positionMode]: next }));
      storePosition(positionMode, next);
    };
    keepInsideViewport();
    globalThis.addEventListener?.('resize', keepInsideViewport);
    return () => globalThis.removeEventListener?.('resize', keepInsideViewport);
  }, [open, panelSize?.height, panelSize?.width, positionMode, positions[positionMode]?.x, positions[positionMode]?.y]);

  async function addFiles(files) {
    const available = MAX_IMAGES - attachments.length;
    if (available <= 0) return;
    try {
      const next = await Promise.all([...files].slice(0, available).map(fileToAttachment));
      setAttachments((current) => [...current, ...next].slice(0, MAX_IMAGES));
      setMessage('');
    } catch (error) {
      setMessage(errorText(error.message, language));
    }
  }

  function handlePaste(event) {
    const imageFiles = [...(event.clipboardData?.items || [])]
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!imageFiles.length) return;
    event.preventDefault();
    addFiles(imageFiles);
  }

  async function clearHistory() {
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/chat', { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CHAT_FAILED');
      setMessages([]);
      setAttachments([]);
      setStatus('idle');
      textareaRef.current?.focus();
    } catch (error) {
      setStatus('error');
      setMessage(errorText(error.message, language));
    }
  }

  async function copyText(value, id) {
    const text = String(value || '').trim();
    if (!text) return;
    try {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setCopiedId(id);
      globalThis.setTimeout(() => setCopiedId((current) => current === id ? '' : current), 1400);
    } catch {
      setMessage(language === 'zh' ? '复制失败，请手动选择文字。' : 'Copy failed. Select the text manually.');
    }
  }

  function copyAllMessages() {
    const transcript = messages.map((item) => {
      const label = item.role === 'assistant' ? t.assistantLabel : t.userLabel;
      return `${label}：${item.content}`;
    }).join('\n\n');
    copyText(transcript, 'all');
  }

  async function deleteMessage(item) {
    if (!item?.id || item.id.startsWith('local-')) return;
    setDeletingId(item.id);
    setMessage('');
    try {
      const response = await fetch('/api/chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: item.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CHAT_DELETE_FAILED');
      setMessages(Array.isArray(payload.messages) ? payload.messages : messages.filter((messageItem) => messageItem.id !== item.id));
    } catch (error) {
      setMessage(errorText(error.message, language));
    } finally {
      setDeletingId('');
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || status === 'sending') return;
    if (!isSignedIn) {
      onSignIn?.();
      return;
    }
    const clientRequestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const localUserMessage = {
      id: `local-${clientRequestId}`,
      role: 'user',
      content: text,
      attachments,
      chargedCredits: 0,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, localUserMessage]);
    setDraft('');
    setAttachments([]);
    setMessage('');
    setStatus('sending');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId,
          text,
          images: localUserMessage.attachments.map((item) => ({
            name: item.name,
            dataUrl: item.dataUrl
          }))
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CHAT_FAILED');
      setMessages((current) => [
        ...current.filter((item) => item.id !== localUserMessage.id),
        payload.userMessage || localUserMessage,
        payload.message
      ]);
      if (payload.user) onProfileChange?.(payload.user);
      setStatus('idle');
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== localUserMessage.id));
      setDraft(text);
      setAttachments(localUserMessage.attachments);
      setStatus('error');
      setMessage(errorText(error.message, language));
    }
  }

  return (
    <aside
      ref={companionRef}
      className={`chatCompanion ${open ? 'open' : ''} ${dragging ? 'dragging' : ''} ${resizing ? 'resizing' : ''}`}
      style={activePosition ? { left: `${activePosition.x}px`, top: `${activePosition.y}px`, right: 'auto', bottom: 'auto' } : undefined}
      aria-live="polite"
    >
      {open ? (
        <section
          className="chatCompanionPanel"
          aria-label={t.name}
          style={panelSize ? {
            '--chat-companion-width': `${panelSize.width}px`,
            '--chat-companion-height': `${panelSize.height}px`
          } : undefined}
        >
          <header
            className="chatCompanionHeader"
            title={t.drag}
            onPointerDown={startDrag}
          >
            <FoxHead small />
            <div><strong>{t.name}</strong><span>{provider?.name || t.subtitle}</span></div>
            <button type="button" onClick={copyAllMessages} disabled={!messages.length} title={t.copyAll} aria-label={t.copyAll}>{copiedId === 'all' ? <Check size={17} /> : <Copy size={17} />}</button>
            <button type="button" onClick={clearHistory} disabled={!isSignedIn || status === 'sending'} title={t.clear} aria-label={t.clear}><Trash2 size={17} /></button>
            <button type="button" onClick={() => setOpen(false)} title={language === 'zh' ? '缩小' : 'Minimize'} aria-label={language === 'zh' ? '缩小聊天精灵' : 'Minimize chat'}><X size={19} /></button>
          </header>

          <div className="chatCompanionTranscript" ref={transcriptRef}>
            {!messages.length ? <div className="chatCompanionWelcome"><FoxHead /><p>{t.welcome}</p></div> : null}
            {messages.map((item) => (
              <article className={`chatCompanionMessage ${item.role}`} key={item.id}>
                {item.attachments?.length ? <div className="chatCompanionMessageImages">{item.attachments.map((attachment, index) => attachment.dataUrl
                  ? <img src={attachment.dataUrl} alt={attachment.name || ''} key={attachment.id || `${item.id}-${index}`} />
                  : <span key={`${item.id}-${index}`}>{attachment.name || (language === 'zh' ? '图片' : 'Image')}</span>)}</div> : null}
                <p>{item.content}</p>
                {item.role === 'assistant' && Number(item.chargedCredits || 0) > 0 ? <small>{t.charged(item.chargedCredits)}</small> : null}
                <div className="chatCompanionMessageActions">
                  <button type="button" onClick={() => copyText(item.content, item.id)} title={t.copyOne} aria-label={t.copyOne}>{copiedId === item.id ? <Check size={13} /> : <Copy size={13} />}</button>
                  <button type="button" onClick={() => deleteMessage(item)} disabled={deletingId === item.id || item.id.startsWith('local-')} title={t.deleteOne} aria-label={t.deleteOne}>{deletingId === item.id ? <LoaderCircle className="spinIcon" size={13} /> : <Trash2 size={13} />}</button>
                </div>
              </article>
            ))}
            {status === 'sending' ? <div className="chatCompanionThinking"><LoaderCircle className="spinIcon" size={15} />{t.thinking}</div> : null}
          </div>

          {!isSignedIn ? (
            <div className="chatCompanionAuth"><p>{t.signIn}</p><button type="button" onClick={onSignIn}>{t.signIn}</button></div>
          ) : (
            <div className="chatCompanionComposer">
              {attachments.length ? <div className="chatCompanionAttachments">{attachments.map((item) => <div key={item.id}><img src={item.dataUrl} alt="" /><button type="button" onClick={() => setAttachments((current) => current.filter((attachment) => attachment.id !== item.id))}><X size={13} /></button></div>)}</div> : null}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 6000))}
                onPaste={handlePaste}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={t.input}
                rows={2}
              />
              <div className="chatCompanionComposerBar">
                <div>
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attachments.length >= MAX_IMAGES} title={t.attach}><ImagePlus size={18} /></button>
                  <input ref={fileInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
                  <span>{attachments.length ? `${attachments.length}/${MAX_IMAGES}` : t.context}</span>
                </div>
                <button className="chatCompanionSend" type="button" onClick={sendMessage} disabled={!draft.trim() || status === 'sending'} aria-label={t.send}><Send size={18} /></button>
              </div>
              {attachments.length ? <small className="chatCompanionLimit">{t.imageLimit}</small> : null}
              {message ? <div className="chatCompanionError">{message}{message === errorText('CREDITS_REQUIRED', language) ? <button type="button" onClick={onBilling}>{t.recharge}</button> : null}</div> : null}
            </div>
          )}
          <button
            className="chatCompanionResizeHandle"
            type="button"
            title={t.resize}
            aria-label={t.resize}
            onPointerDown={startResize}
          ><span /><span /><span /></button>
        </section>
      ) : (
        <button
          className="chatCompanionOrb"
          type="button"
          onPointerDown={startOrbDrag}
          onClick={(event) => {
            if (suppressOrbClickRef.current) {
              event.preventDefault();
              return;
            }
            setOpen(true);
          }}
          aria-label={t.wake}
          title={`${t.wake} · ${t.drag}`}
        >
          <span className="chatCompanionGlow" />
          <FoxHead />
          <span className="chatCompanionPing" />
        </button>
      )}
    </aside>
  );
}
