import React from 'react';
import { Link2, SlidersHorizontal, Unlink2 } from 'lucide-react';
import { IMAGE_QUALITY_VALUES, imageQualityLabel } from './image-quality-labels.js';
import { studioSizeChoices } from './free-image-settings-ui.js';

export default function FreeImageSettings({
  language, t, batch, providers, providerId, setProviderId, model, modelConstraints,
  hasFullWorkspace, isGenerating, batchRepairUploading, batchKeepsReferenceSize, batchHasImages,
  setBatchPreserveSourceSize, ratioLock, ratioOptions, setRatio,
  size, sizeMode, sizeTemplate, commonSizeOptions, selectSizeOption, width, height,
  quality, setQuality, count, setCount, dimensionDrafts, setDimensionDrafts,
  updateDimension, updateDimensionDraft, commitDimensionDraft, canvasRatio, hideCount = false, qualityLocked = false, children,
}) {
  const zh = language === 'zh';
  const sizeDisabled = batch ? batchRepairUploading || batchKeepsReferenceSize : !hasFullWorkspace || isGenerating;
  const detailDisabled = batch ? batchRepairUploading : !hasFullWorkspace || isGenerating;
  const visibleRatio = !batch && !hasFullWorkspace ? '1:1' : ratioLock;
  const choices = studioSizeChoices(model, visibleRatio, commonSizeOptions, ratioOptions);
  const selectedSize = !batch && !hasFullWorkspace ? '1024x1024'
    : sizeMode === 'auto' ? 'auto'
      : sizeTemplate === size ? 'template' : choices.all.includes(size) ? size : 'custom';
  return <section className={`freeImageControlsPanel freeImageSettingsV2 ${batch ? 'freeImageBatchRepairControls' : ''}`}>
    <h3><SlidersHorizontal size={15} />{zh ? '生成设置' : 'Generation settings'}</h3>
    <div className={`freeImageControlRail ${batch ? 'freeImageBatchSizeRail' : ''}`}>
      <label className="studioProviderField">
        <span>{zh ? '生图服务' : 'Image service'}</span>
        <select aria-label={zh ? '生图服务' : 'Image service'} value={providerId} onChange={event => setProviderId(event.target.value)} disabled={(batch ? batchRepairUploading : isGenerating) || !providers.length}>
          {providers.map(provider => <option value={provider.id} key={provider.id}>{provider.name}</option>)}
        </select>
      </label>
      <fieldset className="studioRatioField" disabled={sizeDisabled || sizeMode === 'auto'}>
        <legend>{zh ? '画幅比例' : 'Aspect ratio'}</legend>
        <div className="studioRatioOptions" role="group" aria-label={zh ? '画幅比例' : 'Aspect ratio'}>
          {ratioOptions.map(preset => <button type="button" key={preset.id} aria-label={`${zh ? '比例' : 'Ratio'} ${preset.id}`} aria-pressed={sizeMode !== 'auto' && visibleRatio === preset.id} className={sizeMode !== 'auto' && visibleRatio === preset.id ? 'active' : ''} onClick={() => setRatio(preset.id)}>
            <span className="studioRatioIcon" aria-hidden="true"><i style={{ width: Math.min(24, 24 * preset.width / preset.height), height: Math.min(24, 24 * preset.height / preset.width) }} /></span>
            <span>{preset.id}</span>
          </button>)}
          {!modelConstraints.isGeminiImage && <button type="button" aria-label={zh ? '自由比例' : 'Free ratio'} aria-pressed={sizeMode !== 'auto' && visibleRatio === 'free'} className={sizeMode !== 'auto' && visibleRatio === 'free' ? 'active' : ''} onClick={() => setRatio('free')}><Unlink2 size={17} /><span>{t.free}</span></button>}
        </div>
      </fieldset>
      <label className="studioSizeField">
        <span>{zh ? '像素尺寸' : 'Pixel dimensions'}<small>{zh ? '宽 × 高' : 'Width × height'}</small></span>
        <select aria-label={zh ? '像素尺寸' : 'Pixel dimensions'} value={selectedSize} onChange={event => selectSizeOption(event.target.value)} disabled={sizeDisabled}>
          {sizeTemplate ? <option value="template">{t.sizeTemplate} {sizeTemplate.replace('x', '×')}</option> : null}
          {modelConstraints.allowAutoSize ? <option value="auto">{t.auto}</option> : null}
          {choices.matching.length > 0 && <optgroup label={visibleRatio === 'free' ? (zh ? '常用尺寸' : 'Common sizes') : `${visibleRatio} · ${zh ? '对应尺寸' : 'Matching sizes'}`}>
            {choices.matching.map(item => <option value={item} key={item}>{item.replace('x', ' × ')}</option>)}
          </optgroup>}
          {choices.other.length > 0 && <optgroup label={zh ? '其他尺寸 · 同步切换比例' : 'Other sizes · updates ratio'}>
            {choices.other.map(item => <option value={item} key={item}>{item.replace('x', ' × ')}</option>)}
          </optgroup>}
          <option value="custom">{t.customSize} · {width}×{height}</option>
        </select>
      </label>
    </div>
    {sizeMode === 'custom' && (!batch || !batchKeepsReferenceSize) ? <div className="freeImageDimensionRail">
      {[{ key: 'width', label: t.width, value: !batch && !hasFullWorkspace ? 1024 : width }, { key: 'height', label: t.height, value: !batch && !hasFullWorkspace ? 1024 : height }].map(dimension => <label key={dimension.key}>
        <span>{dimension.label}<small>px</small></span>
        <input type="range" aria-label={`${dimension.label} ${zh ? '滑块' : 'slider'}`} min={modelConstraints.minSide} max={modelConstraints.maxSide} step="16" value={dimension.value} onChange={event => updateDimension(dimension.key, event.target.value)} disabled={detailDisabled} />
        <input type="number" aria-label={`${dimension.label} px`} inputMode="numeric" step="1" min={modelConstraints.minSide} max={modelConstraints.maxSide} value={!batch && !hasFullWorkspace ? '1024' : dimensionDrafts[dimension.key]} onChange={event => updateDimensionDraft(dimension.key, event.target.value)} onBlur={() => commitDimensionDraft(dimension.key)} onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); commitDimensionDraft(dimension.key); event.currentTarget.blur(); }
          else if (!batch && event.key === 'Escape') {
            event.preventDefault();
            setDimensionDrafts(current => ({ ...current, [dimension.key]: String(dimension.key === 'width' ? width : height) }));
            event.currentTarget.blur();
          }
        }} disabled={detailDisabled} />
      </label>)}
    </div> : null}
    <div className="studioDimensionSummary">
      {batchKeepsReferenceSize && batch ? <span>{t.preserveOriginalSize}</span> : sizeMode === 'auto' ? <span>{t.auto}</span> : <>
        {ratioLock === 'free' ? <Unlink2 size={15} /> : <Link2 size={15} />}
        <span><strong>{!batch && !hasFullWorkspace ? '1024 × 1024' : `${width} × ${height}`} px</strong><small>{!batch && !hasFullWorkspace ? '1:1' : `${canvasRatio.width}:${canvasRatio.height}`} · {ratioLock === 'free' ? (zh ? '自由宽高' : 'Independent dimensions') : (zh ? '等比联动' : 'Linked dimensions')}</small></span>
      </>}
    </div>
    <div className="freeImageControlRail studioQualityRail">
      <label>
        <span>{modelConstraints.isGeminiImage ? t.geminiResolution : t.quality}</span>
        <select aria-label={modelConstraints.isGeminiImage ? t.geminiResolution : t.quality} value={qualityLocked || (!batch && !hasFullWorkspace) ? 'low' : quality} onChange={event => setQuality(event.target.value)} disabled={detailDisabled || qualityLocked}>
          {(qualityLocked ? ['low'] : IMAGE_QUALITY_VALUES).map(item => <option key={item} value={item}>{modelConstraints.isGeminiImage ? ({ low: '1K', medium: '2K', high: '4K', auto: zh ? '自动' : 'Auto' })[item] : imageQualityLabel(item, language)}</option>)}
        </select>
      </label>
      {batch ? <div className="freeImageBatchSizeChoice"><label className={!batchHasImages ? 'disabled' : ''}><input type="checkbox" checked={batchKeepsReferenceSize} onChange={event => setBatchPreserveSourceSize(event.target.checked)} disabled={!batchHasImages} /><span>{t.preserveOriginalSize}</span></label></div> : !hideCount ? <div className="freeImageCountPreview">
        <label><span>{t.drawCount}</span><select aria-label={t.drawCount} value={hasFullWorkspace ? count : 1} onChange={event => setCount(Number(event.target.value))} disabled={!hasFullWorkspace || isGenerating}>{[1, 2, 3, 4].map(item => <option value={item} key={item}>{item}</option>)}</select></label>
      </div> : null}
    </div>
    {children}
  </section>;
}
