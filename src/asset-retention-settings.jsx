import { useEffect, useRef, useState } from 'react';
import { HardDrive, LoaderCircle } from 'lucide-react';
import { DEFAULT_ASSET_RETENTION_DAYS, MAX_ASSET_RETENTION_DAYS, normalizeAssetRetentionDays } from '../shared/asset-retention.js';
import './asset-retention-settings.css';

export default function AssetRetentionSettings({ language = 'zh', profile, onProfileChange }) {
  const zh = language === 'zh';
  const [days, setDays] = useState(String(profile?.assetRetentionDays || DEFAULT_ASSET_RETENTION_DAYS));
  const [status, setStatus] = useState('loading');
  const savedDays = useRef(profile?.assetRetentionDays || DEFAULT_ASSET_RETENTION_DAYS);
  const account = useRef(profile?.id);
  account.current = profile?.id;

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    savedDays.current = profile?.assetRetentionDays || DEFAULT_ASSET_RETENTION_DAYS;
    setDays(String(savedDays.current));
    fetch('/api/asset-retention', { cache: 'no-store' }).then((response) => response.json()).then((payload) => {
      if (cancelled) return;
      if (!payload.ok) throw new Error('SETTINGS_LOAD_FAILED');
      savedDays.current = payload.settings.retentionDays;
      setDays(String(savedDays.current));
      setStatus('idle');
    }).catch(() => { if (!cancelled) setStatus('load-error'); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  async function save() {
    let next;
    try { next = normalizeAssetRetentionDays(days); } catch { setStatus('invalid'); return; }
    setDays(String(next));
    if (next === savedDays.current) { setStatus('idle'); return; }
    const userId = profile?.id;
    setStatus('saving');
    try {
      const response = await fetch('/api/asset-retention', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, retentionDays: next })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error('SETTINGS_SAVE_FAILED');
      if (account.current !== userId) return;
      savedDays.current = payload.settings.retentionDays;
      setDays(String(savedDays.current));
      setStatus('saved');
      onProfileChange?.({ ...profile, assetRetentionDays: savedDays.current });
    } catch { if (account.current === userId) setStatus('error'); }
  }

  return <section className="accountRetentionSettings" aria-labelledby="asset-retention-title">
    <h3 id="asset-retention-title"><HardDrive size={17} />{zh ? '资产保留时间' : 'Asset retention'}</h3>
    <label className="accountRetentionField">
      <span>{zh ? '保留天数' : 'Retention days'}</span>
      <div><input type="number" min="1" max={MAX_ASSET_RETENTION_DAYS} step="1" inputMode="numeric"
        value={days} disabled={['loading', 'saving', 'load-error'].includes(status)}
        onChange={(event) => { setDays(event.target.value); setStatus('idle'); }} onBlur={save}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
      <span>{zh ? '天' : 'days'}</span></div>
    </label>
    <p>{zh ? '默认 30 天。每天 02:00（北京时间）清理逾期资产，永久删除，不进入回收站。' : 'Default: 30 days. Expired assets are permanently deleted daily at 02:00 Beijing time, without going to Trash.'}</p>
    <span className={`accountRetentionStatus ${['invalid', 'error', 'load-error'].includes(status) ? 'error' : ''}`} role="status">
      {['loading', 'saving'].includes(status) ? <LoaderCircle className="spinIcon" size={13} /> : null}
      {status === 'loading' ? (zh ? '加载中' : 'Loading') : status === 'saving' ? (zh ? '保存中' : 'Saving')
        : status === 'saved' ? (zh ? '已保存' : 'Saved') : status === 'invalid' ? (zh ? '请输入 1 至 36500 的整数' : 'Enter a whole number from 1 to 36500')
          : status === 'error' ? (zh ? '保存失败，请重试' : 'Could not save; try again')
            : status === 'load-error' ? (zh ? '加载失败，请重新打开设置' : 'Could not load; reopen settings') : ''}
    </span>
  </section>;
}
