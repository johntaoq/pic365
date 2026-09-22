import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Link2, Unlink2 } from 'lucide-react';
import { validateImageSizeForModel } from '../../shared/image-generation.js';
import { ratioIdForImageSize } from '../../shared/image-size-templates.js';
import { IMAGE_QUALITY_VALUES, imageQualityLabel } from '../../src/image-quality-labels.js';
import { PREVIEW_SERVICES, changeService, editDimension, matchingPixelSizes, selectPixelSize, selectRatio, settingsContext } from './generation-settings.js';

export default function GenerationSettings({ value, onChange, sourceSize = false, disabled = false }) {
  const { service, constraints, template } = settingsContext(value);
  const [draft, setDraft] = useState({ width: String(value.width), height: String(value.height) });
  const [notice, setNotice] = useState('');
  const widthInput = useRef();
  const cancelCommit = useRef(false);
  useEffect(() => { setDraft({ width: String(value.width), height: String(value.height) }); }, [value.width, value.height]);
  const size = `${value.width}x${value.height}`;
  const sizes = matchingPixelSizes(value);
  const others = template.sizes.filter(item => !sizes.includes(item) && item !== size);
  const actualRatio = ratioIdForImageSize(size, template.ratios);
  let divisor = value.width;
  let remainder = value.height;
  while (remainder) [divisor, remainder] = [remainder, divisor % remainder];
  const displayedRatio = actualRatio === 'free' ? `${value.width / divisor}:${value.height / divisor}` : actualRatio;
  const check = validateImageSizeForModel(size, service.model);
  const fieldsDisabled = disabled || sourceSize;
  const pretty = text => text.replace('x', ' × ');
  function apply(next) { onChange(next); setNotice(''); }
  function commit(side) {
    if (cancelCommit.current) { cancelCommit.current = false; return; }
    const next = editDimension(value, side, draft[side]);
    onChange(next);
    setDraft({ width: String(next.width), height: String(next.height) });
    setNotice(Number(draft[side]) !== next[side] ? `已按尺寸约束调整为 ${next.width} × ${next.height} px` : '');
  }
  return <div className="generation-settings">
    <label className="field engine-field"><span>生图服务</span><select aria-label="生图服务" value={value.providerId} disabled={disabled} onChange={event => {
      const next = changeService(value, event.target.value);
      onChange(next);
      setNotice(next.width !== value.width || next.height !== value.height || next.auto !== value.auto
        ? `已适配该服务：${next.width} × ${next.height} px` : '');
    }}>{PREVIEW_SERVICES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>

    <fieldset className="canvas-settings" disabled={fieldsDisabled}>
      <legend>画幅比例</legend>
      <div className="ratio-options" role="group" aria-label="画幅比例">
        {template.ratios.map(item => <button type="button" key={item.id} aria-label={`比例 ${item.id}`} aria-pressed={!value.auto && value.ratio === item.id} className={!value.auto && value.ratio === item.id ? 'active' : ''} onClick={() => apply(selectRatio(value, item.id))}>
          <span className="ratio-icon" aria-hidden="true"><i style={{ width: `${Math.min(24, 24 * item.width / item.height)}px`, height: `${Math.min(24, 24 * item.height / item.width)}px` }} /></span><span>{item.id}</span>
        </button>)}
        {template.allowFreeRatio && <button type="button" className={!value.auto && value.ratio === 'free' ? 'active' : ''} aria-pressed={!value.auto && value.ratio === 'free'} aria-label="自由比例" onClick={() => apply(selectRatio(value, 'free'))}><span className="ratio-icon"><Unlink2 size={18} /></span><span>自由</span></button>}
      </div>
      <label className="field pixel-field"><span>像素尺寸 <small>宽 × 高</small></span>
        <select aria-label="像素尺寸" value={value.auto ? 'auto' : size} onChange={event => {
          if (event.target.value === 'custom') { apply({ ...value, auto: false }); widthInput.current?.focus(); return; }
          apply(selectPixelSize(value, event.target.value));
        }}>
          <optgroup label={value.ratio === 'free' ? '常用尺寸' : `${value.ratio} 对应尺寸`}>
            {!sizes.includes(size) && <option value={size}>{pretty(size)} · 自定义</option>}
            {sizes.map(item => <option value={item} key={item}>{pretty(item)}</option>)}
          </optgroup>
          {others.length > 0 && <optgroup label="其他尺寸 · 同步切换比例">{others.map(item => <option value={item} key={item}>{pretty(item)} · {ratioIdForImageSize(item, template.ratios)}</option>)}</optgroup>}
          <option value="custom">自定义宽 × 高…</option>
          {constraints.allowAutoSize && <option value="auto">自动尺寸</option>}
        </select>
      </label>
      {!value.auto && <div className="dimension-link-row">
        {['width', 'height'].map((side, index) => <React.Fragment key={side}>
          {index === 1 && <span className="dimension-link" title={value.ratio === 'free' ? '宽高独立调整' : `宽高按 ${value.ratio} 联动`} aria-label={value.ratio === 'free' ? '宽高独立调整' : `宽高按 ${value.ratio} 联动`}>{value.ratio === 'free' ? <Unlink2 size={15} /> : <Link2 size={15} />}</span>}
          <label className="field"><span>{side === 'width' ? '宽度' : '高度'} <small>px</small></span><input ref={side === 'width' ? widthInput : undefined} aria-label={side === 'width' ? '宽度 px' : '高度 px'} type="number" inputMode="numeric" min={constraints.minSide} max={constraints.maxSide} step="16" value={draft[side]} onChange={event => setDraft(current => ({ ...current, [side]: event.target.value }))} onBlur={() => commit(side)} onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === 'Escape') { cancelCommit.current = true; setDraft({ width: String(value.width), height: String(value.height) }); event.currentTarget.blur(); }
          }} /></label>
        </React.Fragment>)}
        <button className="icon-button swap-dimensions" type="button" title="交换宽高" aria-label="交换宽高" disabled={!validateImageSizeForModel(`${value.height}x${value.width}`, service.model).valid} onClick={() => apply(selectPixelSize(value, `${value.height}x${value.width}`))}><ArrowLeftRight size={16} /></button>
      </div>}
    </fieldset>
    <div className="canvas-readout" aria-live="polite">
      {!sourceSize && !value.auto && <span className="canvas-thumbnail" aria-hidden="true"><i style={{ width: `${Math.min(28, 28 * value.width / value.height)}px`, height: `${Math.min(28, 28 * value.height / value.width)}px` }} /></span>}
      <span>{sourceSize ? '沿用每张参考图尺寸' : value.auto ? '尺寸由模型自动决定' : <><strong>{pretty(size)} px</strong><small>{value.ratio === 'free' ? `自由宽高 · 当前 ${displayedRatio}` : `${value.ratio} · 等比联动`} · {(value.width * value.height / 1000000).toFixed(2)} MP</small></>}</span>
    </div>
    {!sourceSize && !value.auto && !check.valid && <p className="dimension-error" role="alert">当前尺寸不符合此服务要求，请选择可用的像素尺寸。</p>}
    {notice && <p className="dimension-notice" role="status">{notice}</p>}
    <label className="field quality-field"><span>{constraints.isGeminiImage ? '分辨率' : '画质'}</span><select aria-label={constraints.isGeminiImage ? '分辨率' : '画质'} value={value.quality} disabled={disabled} onChange={event => apply({ ...value, quality: event.target.value })}>
      {IMAGE_QUALITY_VALUES.map(item => <option value={item} key={item}>{constraints.isGeminiImage ? ({ auto: '自动', low: '1K', medium: '2K', high: '4K' })[item] : imageQualityLabel(item, 'zh')}</option>)}
    </select></label>
  </div>;
}
