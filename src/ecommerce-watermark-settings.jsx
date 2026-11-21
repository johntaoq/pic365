import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LoaderCircle, RotateCcw, UploadCloud, X } from 'lucide-react';
import {
  DEFAULT_ECOMMERCE_WATERMARK_SETTINGS,
  MAX_LAYOUT_WATERMARK_COLUMNS,
  MAX_LAYOUT_WATERMARK_TEXT_CHARACTERS,
  activeEcommerceWatermarkSettings
} from '../shared/ecommerce-layout-watermark.js';
import { prepareEcommerceWatermarkImage, renderEcommerceWatermarkText } from './ecommerce-layout-watermark.js';
import './ecommerce-watermark-settings.css';

const accountSettings = new Map();
const emptySnapshot = Object.freeze({ settings: null, status: 'loading' });
const labels = {
  zh: {
    watermark: '添加水印', angle: '方向', horizontal: '水平', diagonal: '斜角',
    preset: '电商水印预设',
    columns: '水印列数', text: '文字水印', textPlaceholder: '输入水印文字',
    image: '图片水印', upload: '上传水印图', replace: '更换水印图', remove: '移除水印图',
    loading: '载入中…', saving: '保存中…', saved: '已保存',
    retry: '重试',
    loadError: '水印配置读取失败', saveError: '水印配置保存失败',
    imageInvalid: '请选择有效的 JPG、PNG 或 WebP 水印图。',
    imageTooLarge: '水印图过大，请换一张较小的图片。'
  },
  en: {
    watermark: 'Add watermark', angle: 'Orientation', horizontal: 'Horizontal', diagonal: 'Diagonal',
    preset: 'Commerce watermark preset',
    columns: 'Columns', text: 'Text watermark', textPlaceholder: 'Watermark text',
    image: 'Image watermark', upload: 'Upload image', replace: 'Replace image', remove: 'Remove image',
    loading: 'Loading…', saving: 'Saving…', saved: 'Saved',
    retry: 'Retry',
    loadError: 'Unable to load watermark settings', saveError: 'Unable to save watermark settings',
    imageInvalid: 'Choose a valid JPG, PNG, or WebP image.',
    imageTooLarge: 'The watermark image is too large.'
  }
};

function account(userId) {
  if (!accountSettings.has(userId)) {
    accountSettings.set(userId, {
      snapshot: emptySnapshot, listeners: new Set(), version: 0, queued: 0, saved: 0,
      timer: null, pending: Promise.resolve(), loading: null
    });
  }
  return accountSettings.get(userId);
}

function publish(entry, patch) {
  entry.snapshot = { ...entry.snapshot, ...patch };
  entry.listeners.forEach((listener) => listener());
}

function persist(userId, entry, settings, version) {
  entry.queued = version;
  const request = entry.pending.catch(() => {}).then(async () => {
    const response = await fetch('/api/ecommerce/watermark-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, settings })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'WATERMARK_SETTINGS_SAVE_FAILED');
    entry.saved = Math.max(entry.saved, version);
    if (entry.saved === entry.version) publish(entry, { status: 'saved' });
  }).catch((error) => {
    if (version === entry.version) publish(entry, { status: 'saveError' });
    throw error;
  });
  entry.pending = request;
  return request;
}

async function flushAccount(userId) {
  if (!userId) throw new Error('WATERMARK_SETTINGS_UNAVAILABLE');
  const entry = account(userId);
  if (!entry.snapshot.settings) throw new Error('WATERMARK_SETTINGS_UNAVAILABLE');
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  while (entry.saved < entry.version) {
    if (entry.version > entry.queued || entry.snapshot.status === 'saveError') {
      await persist(userId, entry, entry.snapshot.settings, entry.version);
    } else {
      await entry.pending;
    }
  }
  return entry.snapshot.settings;
}

function loadAccount(userId, force = false) {
  const entry = account(userId);
  if (entry.loading) return entry.loading;
  if (entry.snapshot.settings && !force) return Promise.resolve(entry.snapshot.settings);
  if (entry.snapshot.settings && (entry.version > entry.saved || entry.timer)) {
    return Promise.resolve(entry.snapshot.settings);
  }
  const version = entry.version;
  publish(entry, { status: 'loading' });
  const request = (async () => {
    try {
      await entry.pending.catch(() => {});
      const response = await fetch('/api/ecommerce/watermark-settings', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error('WATERMARK_SETTINGS_LOAD_FAILED');
      if (version === entry.version) {
        entry.saved = entry.queued = entry.version;
        publish(entry, { settings: payload.settings, status: 'saved' });
      }
      return entry.snapshot.settings;
    } catch (error) {
      if (version === entry.version) publish(entry, { status: 'loadError' });
      throw error;
    } finally {
      entry.loading = null;
    }
  })();
  entry.loading = request;
  return request;
}

function updateAccount(userId, patch) {
  const entry = account(userId);
  if (!entry.snapshot.settings) return;
  const next = { ...entry.snapshot.settings, ...patch };
  if (Object.hasOwn(patch, 'text')) {
    next.textImageDataUrl = next.text.trim() ? renderEcommerceWatermarkText(next.text.trim()) : '';
  }
  const version = ++entry.version;
  publish(entry, { settings: next, status: 'saving' });
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void persist(userId, entry, next, version).catch(() => {});
  }, 350);
}

export function useEcommerceWatermarkSettings(userId) {
  const subscribe = useCallback((listener) => {
    if (!userId) return () => {};
    const entry = account(userId);
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }, [userId]);
  const snapshot = useSyncExternalStore(subscribe,
    () => userId ? account(userId).snapshot : emptySnapshot,
    () => emptySnapshot);
  useEffect(() => {
    if (userId) void loadAccount(userId, true).catch(() => {});
  }, [userId]);
  return {
    ...snapshot,
    ready: Boolean(userId && snapshot.settings && !['loading', 'loadError'].includes(snapshot.status)),
    update: (patch) => updateAccount(userId, patch),
    flush: () => flushAccount(userId),
    reload: () => userId ? loadAccount(userId, true) : Promise.reject(new Error('WATERMARK_SETTINGS_UNAVAILABLE'))
  };
}

export function watermarkReady(settings) {
  try {
    activeEcommerceWatermarkSettings(settings || DEFAULT_ECOMMERCE_WATERMARK_SETTINGS);
    return true;
  } catch {
    return false;
  }
}

export default function EcommerceWatermarkSettings({
  language = 'zh',
  active,
  onActiveChange,
  state,
  disabled = false,
  scope = '',
  className = '',
  onMessage,
  onBusyChange,
  presetOnly = false
}) {
  const t = labels[language] || labels.en;
  const inputRef = useRef(null);
  const [reading, setReading] = useState(false);
  const settings = state.settings || DEFAULT_ECOMMERCE_WATERMARK_SETTINGS;
  const locked = disabled || !state.ready;
  async function addImage(file) {
    if (inputRef.current) inputRef.current.value = '';
    if (!file || locked) return;
    setReading(true);
    onBusyChange?.(true);
    try {
      const image = await prepareEcommerceWatermarkImage(file);
      state.update({ imageDataUrl: image.imageDataUrl, imageName: image.name.slice(0, 120), imageEnabled: true });
      onMessage?.('');
    } catch (error) {
      onMessage?.(error?.message === 'WATERMARK_IMAGE_TOO_LARGE' ? t.imageTooLarge : t.imageInvalid);
    } finally {
      setReading(false);
      onBusyChange?.(false);
    }
  }

  return <div className={`ecommerceWatermarkSettings ${className}`}>
    <input ref={inputRef} className="ecommerceWatermarkFile" type="file" tabIndex={-1}
      accept="image/jpeg,image/png,image/webp" aria-hidden="true"
      onChange={(event) => void addImage(event.target.files?.[0])} />
    {presetOnly
      ? <div className="ecommerceWatermarkMain"><strong>{t.preset}</strong>{scope ? <small>{scope}</small> : null}</div>
      : <label className="ecommerceWatermarkMain">
        <input type="checkbox" checked={Boolean(active)} disabled={locked || reading}
          onChange={(event) => { onActiveChange(event.target.checked); onMessage?.(''); }} />
        <span><strong>{t.watermark}</strong>{scope ? <small>{scope}</small> : null}</span>
      </label>}
    {(active || presetOnly) && state.ready ? <div className="ecommerceWatermarkDetails">
      <div className="ecommerceWatermarkAngle">
        <span>{t.angle}</span>
        <div role="group" aria-label={t.angle}>
          {[{ angle: 0, label: t.horizontal }, { angle: -45, label: t.diagonal }].map((option) =>
            <button key={option.angle} type="button" disabled={disabled} aria-pressed={settings.angle === option.angle}
              onClick={() => state.update({ angle: option.angle })}>{option.label}</button>)}
        </div>
      </div>
      <label className="ecommerceWatermarkColumns">
        <span>{t.columns}</span>
        <input type="number" min={1} max={MAX_LAYOUT_WATERMARK_COLUMNS} step={1}
          value={settings.columns} disabled={disabled}
          onChange={(event) => {
            const requested = Number(event.target.value);
            state.update({ columns: Math.min(MAX_LAYOUT_WATERMARK_COLUMNS,
              Math.max(1, Number.isFinite(requested) ? Math.trunc(requested) : 1)) });
          }} />
      </label>
      <label className="ecommerceWatermarkCheck">
        <input type="checkbox" checked={settings.textEnabled} disabled={disabled}
          onChange={(event) => state.update({ textEnabled: event.target.checked })} />
        <span>{t.text}</span>
      </label>
      {settings.textEnabled ? <div className="ecommerceWatermarkText">
        <input type="text" value={settings.text} disabled={disabled} aria-label={t.text}
          placeholder={t.textPlaceholder}
          onChange={(event) => {
            state.update({ text: Array.from(event.target.value)
              .slice(0, MAX_LAYOUT_WATERMARK_TEXT_CHARACTERS).join('') });
            onMessage?.('');
          }} />
        <small>{Array.from(settings.text).length}/{MAX_LAYOUT_WATERMARK_TEXT_CHARACTERS}</small>
      </div> : null}
      <label className="ecommerceWatermarkCheck">
        <input type="checkbox" checked={settings.imageEnabled} disabled={disabled || reading}
          onChange={(event) => {
            state.update({ imageEnabled: event.target.checked });
            onMessage?.('');
            if (event.target.checked && !settings.imageDataUrl) inputRef.current?.click();
          }} />
        <span>{t.image}</span>
      </label>
      {settings.imageEnabled ? <div className="ecommerceWatermarkUpload">
        {settings.imageDataUrl ? <img src={settings.imageDataUrl} alt="" /> : null}
        <button type="button" disabled={disabled || reading} onClick={() => inputRef.current?.click()}>
          {reading ? <LoaderCircle className="spin" size={14} /> : <UploadCloud size={14} />}
          <span>{settings.imageDataUrl ? t.replace : t.upload}</span>
        </button>
        {settings.imageDataUrl ? <>
          <span className="ecommerceWatermarkFilename" title={settings.imageName}>{settings.imageName}</span>
          <button className="ecommerceWatermarkRemove" type="button" disabled={disabled || reading}
            title={t.remove} aria-label={t.remove}
            onClick={() => state.update({ imageDataUrl: '', imageName: '', imageEnabled: false })}><X size={14} /></button>
        </> : null}
      </div> : null}
    </div> : null}
    {state.status === 'saving' && (active || presetOnly) ? <small className="ecommerceWatermarkStatus" role="status"><LoaderCircle size={12} className="spin" /> {t.saving}</small> : null}
    {(active || presetOnly) && state.status === 'saved' ? <small className="ecommerceWatermarkStatus" role="status">{t.saved}</small> : null}
    {['loadError', 'saveError'].includes(state.status) ? <small className="ecommerceWatermarkStatus error" role="alert">
      {t[state.status]}
      {(state.status === 'saveError' && state.settings) || state.status === 'loadError'
        ? <button type="button" onClick={() => void (state.status === 'loadError' ? state.reload() : state.flush()).catch(() => {})}
          title={t.retry} aria-label={t.retry}>
          <RotateCcw size={13} />
        </button> : null}
    </small> : null}
    {(active || presetOnly) && state.status === 'loading' ? <small className="ecommerceWatermarkStatus">{t.loading}</small> : null}
  </div>;
}
