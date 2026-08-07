import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  Eraser,
  FolderOpen,
  GripVertical,
  ImagePlus,
  ImageUp,
  ListChecks,
  LoaderCircle,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShoppingBag,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
  Zap
} from 'lucide-react';
import {
  ECOMMERCE_INDUSTRIES,
  ECOMMERCE_PLATFORMS,
  getDefaultSlotIds,
  getEcommercePlatform,
  getEcommerceVisualStyle,
  getVisualStylesForIndustry
} from '../shared/ecommerce-catalog.js';
import { runTaskPool } from '../shared/task-pool.js';

const BATCH_GENERATION_CONCURRENCY = 3;

const copy = {
  en: {
    title: 'Create product image sets',
    projects: 'Product projects',
    newProject: 'New project',
    noProjects: 'Your saved product projects will appear here.',
    projectName: 'Project name',
    projectNamePlaceholder: 'For example: Summer launch · Travel tumbler',
    platform: '1. Sales platform',
    productBrief: '2. Product brief',
    industry: 'Industry',
    productName: 'Product name',
    productNamePlaceholder: 'For example: 30 oz insulated travel tumbler',
    brandName: 'Brand or series',
    brandNamePlaceholder: 'Optional; use a brand you own or are authorized to use',
    audience: 'Target customer and use context',
    audiencePlaceholder: 'Who will buy it? Where and why will they use it?',
    sellingPoints: 'Core selling points',
    sellingPointsPlaceholder: 'One verifiable selling point per line',
    specifications: 'Specifications and included items',
    specificationsPlaceholder: 'Size, material, color, quantity, package contents, variants...',
    prohibited: 'Claims or content to avoid',
    prohibitedPlaceholder: 'Unsupported claims, restricted words, incorrect accessories, visual mistakes...',
    sourceAssets: '3. Source materials',
    sourceAssetsHint: 'Upload clear, authorized images of the real product. Product photos define structure; packaging and logo files define brand details; reference images define direction only.',
    saveBeforeUpload: 'Save the product project before uploading source materials.',
    assetType: 'Material type',
    assetProduct: 'Product photo',
    assetPackaging: 'Packaging',
    assetLogo: 'Logo',
    assetReference: 'Visual reference',
    chooseImages: 'Choose images',
    assetLimit: 'PNG, JPG, or WebP; up to 10 MB each and 30 files per project.',
    uploadingAssets: 'Uploading...',
    uploadFailed: 'One or more files could not be uploaded.',
    deleteAsset: 'Delete material',
    masterAsset: 'Product master',
    setMaster: 'Use as master',
    masterHint: 'The master image locks the product structure, color, packaging, and accessory count for later generation.',
    visualDirection: '4. Visual direction',
    visualStyle: 'Visual style',
    outputSlots: '5. Images to produce',
    slotHint: 'Each selected slot will later have its own prompt, generation status, and version history.',
    expandSection: 'Expand',
    collapseSection: 'Collapse',
    assetSummary: (count, hasMaster) => `${count} materials${hasMaster ? ' · master selected' : ''}`,
    required: 'Core',
    selectedCount: (count) => `${count} images selected`,
    production: 'Generate image set',
    selectAll: 'Select all',
    clearSelection: 'Clear selection',
    batchSelection: (count) => `${count} selected · ${count} credits`,
    generateSelected: 'Generate all selected',
    batchGenerating: 'Generating',
    generateSlot: 'Generate · 1 credit',
    regenerateSlot: 'New version · 1 credit',
    queued: 'Queued',
    cancel: 'Cancel',
    cancelling: 'Cancelling...',
    selectAtLeastOne: 'Select at least one image.',
    insufficientBatchCredits: (required, available) => `${required} credits required; ${available} available.`,
    saveChangesFirst: 'Save project changes first',
    masterRequired: 'Select a product master before generating.',
    generationFailed: 'This image could not be generated. Your reserved credit was returned.',
    moderationBlocked: 'This slot needs safer product wording. Update the project facts or restricted-content field, save, and try again.',
    downloadOutput: 'Download',
    viewImage: 'Open image preview',
    imagePreview: 'Image preview',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetZoom: 'Reset zoom',
    closePreview: 'Close preview',
    version: (number) => `Version ${number}`,
    noOutput: 'Not generated yet',
    save: 'Save product project',
    saving: 'Saving...',
    saved: 'Project saved. Next: upload source materials and confirm a product master image.',
    changesSaved: 'Project changes saved.',
    loadFailed: 'Could not load product projects.',
    saveFailed: 'Could not save this project.',
    productRequired: 'Enter a product name first.',
    fieldHelp: 'Show guidance',
    clearField: 'Clear and show the default guidance',
    restoreAiField: 'Restore the original AI draft',
    aiFillBrief: 'AI autofill',
    aiFillingBrief: 'Writing brief...',
    aiBriefFilled: 'AI draft ready',
    aiBriefFailed: 'Could not prepare the product brief.',
    dragFloatingSave: 'Drag to move',
    hideFloatingSave: 'Collapse floating save',
    showFloatingSave: 'Restore floating save',
    signInTitle: 'Sign in to save product projects',
    signInText: 'Guests can still use the free single-image preview. A signed-in account with credits unlocks the complete product workflow.',
    signIn: 'Sign in',
    creditsTitle: 'Credits are required for the complete workspace',
    creditsText: 'Add credits before saving projects and generating production images.',
    recharge: 'Add credits',
    workflow: ['Project brief', 'Source materials', 'Master image', 'Image-set production'],
    currentStage: 'Current',
    draft: 'Draft',
    updated: 'Updated'
  },
  zh: {
    title: '创建商品套图',
    projects: '商品项目',
    newProject: '新建项目',
    noProjects: '保存后的商品项目会显示在这里。',
    projectName: '项目名称',
    projectNamePlaceholder: '例如：夏季上新 · 随行保温杯',
    platform: '1. 销售平台',
    productBrief: '2. 商品资料',
    industry: '商品行业',
    productName: '商品名称',
    productNamePlaceholder: '例如：30oz 大容量吸管保温杯',
    brandName: '品牌或系列',
    brandNamePlaceholder: '选填；只能使用自有或已获授权的品牌',
    audience: '目标用户与使用场景',
    audiencePlaceholder: '谁会购买？在什么场景使用？为什么需要它？',
    sellingPoints: '核心卖点',
    sellingPointsPlaceholder: '每行填写一个可验证的卖点',
    specifications: '规格与包装清单',
    specificationsPlaceholder: '尺寸、材质、颜色、数量、包装包含物、可选规格……',
    prohibited: '禁止出现或避免表达',
    prohibitedPlaceholder: '无依据功效、禁用词、错误配件、容易画错的结构等……',
    sourceAssets: '3. 商品素材',
    sourceAssetsHint: '上传清晰且已获授权的真实商品图。商品图决定结构，包装和 Logo 决定品牌细节，参考图只用于表达视觉方向。',
    saveBeforeUpload: '请先保存商品项目，再上传商品素材。',
    assetType: '素材类型',
    assetProduct: '商品原图',
    assetPackaging: '包装图',
    assetLogo: 'Logo',
    assetReference: '视觉参考图',
    chooseImages: '选择图片',
    assetLimit: '支持 PNG、JPG、WebP；单张不超过 10 MB，每个项目最多 30 张。',
    uploadingAssets: '正在上传……',
    uploadFailed: '部分素材上传失败。',
    deleteAsset: '删除素材',
    masterAsset: '商品母版',
    setMaster: '设为母版',
    masterHint: '商品母版用于锁定后续生成中的商品结构、颜色、包装和配件数量。',
    visualDirection: '4. 视觉方向',
    visualStyle: '视觉风格',
    outputSlots: '5. 需要生成的图片',
    slotHint: '下一阶段，每个已选槽位都会拥有独立 Prompt、生成状态和版本历史。',
    expandSection: '展开',
    collapseSection: '收起',
    assetSummary: (count, hasMaster) => `${count} 张素材${hasMaster ? ' · 已设母版' : ''}`,
    required: '核心',
    selectedCount: (count) => `已选择 ${count} 张 / 组`,
    production: '套图生成',
    selectAll: '全部选中',
    clearSelection: '取消全选',
    batchSelection: (count) => `已选 ${count} · 预计 ${count}积分`,
    generateSelected: '一键生成',
    batchGenerating: '生成中',
    generateSlot: '生成此图 · 1积分',
    regenerateSlot: '生成新版本 · 1积分',
    queued: '排队中',
    cancel: '取消',
    cancelling: '取消中……',
    selectAtLeastOne: '请至少选择一张图片。',
    insufficientBatchCredits: (required, available) => `需要 ${required} 积分，当前可用 ${available} 积分。`,
    saveChangesFirst: '请先保存项目修改',
    masterRequired: '请先选择商品母版。',
    generationFailed: '本张图片生成失败，预留积分已经退回。',
    moderationBlocked: '当前商品表述需要调整。请修改商品资料或禁止内容，保存后再试。',
    downloadOutput: '下载图片',
    viewImage: '放大查看图片',
    imagePreview: '图片预览',
    zoomIn: '放大',
    zoomOut: '缩小',
    resetZoom: '恢复原始比例',
    closePreview: '关闭预览',
    version: (number) => `版本 ${number}`,
    noOutput: '尚未生成',
    save: '保存商品项目',
    saving: '正在保存……',
    saved: '项目已保存。下一步：上传商品素材并确认商品母版。',
    changesSaved: '项目修改已保存。',
    loadFailed: '商品项目加载失败。',
    saveFailed: '商品项目保存失败。',
    productRequired: '请先填写商品名称。',
    fieldHelp: '查看填写提示',
    clearField: '清空并恢复缺省提示',
    restoreAiField: '恢复 AI 原始生成内容',
    aiFillBrief: 'AI 智能填写',
    aiFillingBrief: '正在生成商品资料……',
    aiBriefFilled: 'AI 初稿已生成',
    aiBriefFailed: '商品资料暂时无法生成。',
    dragFloatingSave: '拖动调整位置',
    hideFloatingSave: '收起悬浮保存按钮',
    showFloatingSave: '恢复悬浮保存按钮',
    signInTitle: '登录后才能保存商品项目',
    signInText: '游客仍可使用免费单图预览；登录且拥有积分后，才能使用完整商品工作流。',
    signIn: '登录',
    creditsTitle: '完整工作台需要积分',
    creditsText: '请先充值积分，再保存项目并生成正式图片。',
    recharge: '充值积分',
    workflow: ['商品资料', '商品素材', '母版确认', '整套生成'],
    currentStage: '当前阶段',
    draft: '草稿',
    updated: '更新于'
  }
};

const SECTION_KEYS = ['platform', 'brief', 'assets', 'visual', 'outputs'];

function getCollapsedSectionsForStage(stage) {
  if (stage === 1 || stage === 2) {
    return { platform: true, brief: true, assets: false, visual: true, outputs: true };
  }
  if (stage === 3) {
    return { platform: true, brief: true, assets: true, visual: false, outputs: true };
  }
  return { platform: true, brief: false, assets: true, visual: true, outputs: true };
}

function createEmptyForm(platformId = ECOMMERCE_PLATFORMS[0].id) {
  const industryId = ECOMMERCE_INDUSTRIES[0].id;
  return {
    id: '',
    projectName: '',
    platformId,
    industryId,
    productName: '',
    brandName: '',
    targetAudience: '',
    sellingPoints: '',
    specifications: '',
    prohibitedContent: '',
    visualStyleId: getVisualStylesForIndustry(industryId)[0]?.id || 'clean-commercial',
    selectedSlots: getDefaultSlotIds(platformId)
  };
}

function projectToForm(project) {
  const industryId = project.industryId || ECOMMERCE_INDUSTRIES[0].id;
  return {
    ...createEmptyForm(project.platformId),
    ...project,
    industryId,
    visualStyleId: project.visualStyleId || getVisualStylesForIndustry(industryId)[0]?.id || 'clean-commercial',
    sellingPoints: (project.sellingPoints || []).join('\n'),
    selectedSlots: project.selectedSlots?.length ? project.selectedSlots : getDefaultSlotIds(project.platformId)
  };
}

function hasSession(session) {
  return Boolean(session?.user || session?.access_token);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

function safeFilenamePart(value, fallback) {
  const cleaned = String(value || fallback || '')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s*[-–—]+\s*/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, 90);
  return cleaned || fallback;
}

function buildDownloadFilename({ productName, slotName, platformName, versionNumber, language }) {
  const fallbackProduct = language === 'zh' ? '商品' : 'Product';
  const fallbackSlot = language === 'zh' ? '分图' : 'Image';
  const fallbackPlatform = language === 'zh' ? '平台' : 'Platform';
  return [
    safeFilenamePart(productName, fallbackProduct),
    safeFilenamePart(slotName, fallbackSlot),
    safeFilenamePart(platformName, fallbackPlatform),
    `V${Math.max(1, Number(versionNumber) || 1)}`
  ].join('-') + '.png';
}

function FieldHelpLabel({ fieldId, label, help, helpLabel, open, onToggle, resetLabel, hasAiOriginal, onReset }) {
  const helpId = `${fieldId}-help`;
  return (
    <div className="ecommerceFieldLabel">
      <label htmlFor={fieldId}>{label}</label>
      <span className="ecommerceFieldTools">
        <button
          className={`ecommerceFieldTool ecommerceFieldHelpButton ${open ? 'active' : ''}`}
          type="button"
          aria-label={`${helpLabel}: ${label}`}
          aria-expanded={open}
          aria-controls={helpId}
          title={`${helpLabel}: ${label}`}
          onClick={onToggle}
        >
          <CircleHelp size={15} />
        </button>
        <button
          className={`ecommerceFieldTool ecommerceFieldResetButton ${hasAiOriginal ? 'hasAiOriginal' : ''}`}
          type="button"
          aria-label={`${resetLabel}: ${label}`}
          title={`${resetLabel}: ${label}`}
          onClick={onReset}
        >
          <Eraser size={14} />
        </button>
      </span>
      {open ? <span className="ecommerceFieldHelp" id={helpId} role="tooltip">{help}</span> : null}
    </div>
  );
}

function CollapsibleSectionLegend({ label, summary, collapsed, contentId, expandLabel, collapseLabel, onToggle }) {
  const actionLabel = collapsed ? expandLabel : collapseLabel;
  return (
    <div className="ecommerceCollapsibleLegend">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={contentId}
        title={`${actionLabel}: ${label}`}
        onClick={onToggle}
      >
        <span className="ecommerceCollapsibleLegendCopy">
          <strong>{label}</strong>
          {summary ? <small>{summary}</small> : null}
        </span>
        <span className="ecommerceCollapsibleLegendAction">
          <span>{actionLabel}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

function clampImageZoom(value) {
  return Math.min(4, Math.max(0.5, value));
}

function EcommerceImageLightbox({ image, t, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panRef = useRef(null);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [image?.imageUrl]);

  useEffect(() => {
    if (!image) return undefined;
    const previousOverflow = globalThis.document?.body?.style?.overflow || '';
    if (globalThis.document?.body) globalThis.document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') adjustZoom(0.25);
      if (event.key === '-') adjustZoom(-0.25);
      if (event.key === '0') resetZoom();
    };
    globalThis.document?.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.document?.removeEventListener('keydown', handleKeyDown);
      if (globalThis.document?.body) globalThis.document.body.style.overflow = previousOverflow;
    };
  }, [image, onClose]);

  if (!image) return null;

  function setNextZoom(nextValue) {
    const nextZoom = clampImageZoom(nextValue);
    setZoom(nextZoom);
    if (nextZoom <= 1) setOffset({ x: 0, y: 0 });
  }

  function adjustZoom(delta) {
    setZoom((current) => {
      const nextZoom = clampImageZoom(Number((current + delta).toFixed(2)));
      if (nextZoom <= 1) setOffset({ x: 0, y: 0 });
      return nextZoom;
    });
  }

  function resetZoom() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function beginPan(event) {
    if (zoom <= 1 || event.button !== 0) return;
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPanning(true);
  }

  function movePan(event) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    setOffset({
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY
    });
  }

  function endPan(event) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setPanning(false);
  }

  return (
    <div
      className="ecommerceImageLightbox"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="ecommerceImageLightboxDialog" role="dialog" aria-modal="true" aria-labelledby="ecommerce-image-preview-title">
        <header className="ecommerceImageLightboxHeader">
          <div>
            <small>{t.imagePreview}</small>
            <strong id="ecommerce-image-preview-title">{image.title}</strong>
            <span>{image.meta}</span>
          </div>
          <div className="ecommerceImageLightboxControls">
            <button type="button" onClick={() => adjustZoom(-0.25)} disabled={zoom <= 0.5} aria-label={t.zoomOut} title={t.zoomOut}>
              <Minus size={17} />
            </button>
            <output aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button type="button" onClick={() => adjustZoom(0.25)} disabled={zoom >= 4} aria-label={t.zoomIn} title={t.zoomIn}>
              <Plus size={17} />
            </button>
            <button type="button" onClick={resetZoom} disabled={zoom === 1 && offset.x === 0 && offset.y === 0} aria-label={t.resetZoom} title={t.resetZoom}>
              <RotateCcw size={17} />
            </button>
            <button className="close" type="button" onClick={onClose} aria-label={t.closePreview} title={t.closePreview}>
              <X size={19} />
            </button>
          </div>
        </header>
        <div
          className={`ecommerceImageLightboxCanvas ${zoom > 1 ? 'zoomed' : ''} ${panning ? 'panning' : ''}`}
          onWheel={(event) => {
            event.preventDefault();
            adjustZoom(event.deltaY < 0 ? 0.25 : -0.25);
          }}
          onDoubleClick={() => setNextZoom(zoom === 1 ? 2 : 1)}
          onPointerDown={beginPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          <img
            src={image.imageUrl}
            alt={image.alt}
            draggable={false}
            className={panning ? 'panning' : ''}
            style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})` }}
          />
        </div>
      </section>
    </div>
  );
}

function clampFloatingPoint(x, y, width, height) {
  const margin = 14;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const viewportWidth = globalThis.innerWidth || width + margin * 2;
  const viewportHeight = globalThis.innerHeight || height + margin * 2;
  const minX = margin + halfWidth;
  const minY = margin + halfHeight;
  const maxX = Math.max(minX, viewportWidth - margin - halfWidth);
  const maxY = Math.max(minY, viewportHeight - margin - halfHeight);
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY)
  };
}

function FloatingSaveControl({ label, savingLabel, dragLabel, hideLabel, showLabel, saving, disabled, formId }) {
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState(null);
  const [dragging, setDragging] = useState(false);
  const controlRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    function keepInsideViewport() {
      setPosition((current) => {
        const element = controlRef.current;
        if (!current || !element) return current;
        const rect = element.getBoundingClientRect();
        const next = clampFloatingPoint(current.x, current.y, rect.width, rect.height);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    }
    globalThis.addEventListener?.('resize', keepInsideViewport);
    return () => globalThis.removeEventListener?.('resize', keepInsideViewport);
  }, []);

  useEffect(() => {
    if (!position) return undefined;
    const frame = globalThis.requestAnimationFrame?.(() => {
      const element = controlRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setPosition((current) => {
        if (!current) return current;
        const next = clampFloatingPoint(current.x, current.y, rect.width, rect.height);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    });
    return () => globalThis.cancelAnimationFrame?.(frame);
  }, [collapsed]);

  function beginDrag(event) {
    if (event.button !== 0 || dragRef.current) return;
    const element = controlRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    dragRef.current = {
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left + rect.width / 2,
      originY: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      moved: false
    };
    if (Number.isFinite(event.pointerId)) event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }

  function moveControl(event) {
    const drag = dragRef.current;
    if (!drag || (drag.pointerId !== null && Number.isFinite(event.pointerId) && drag.pointerId !== event.pointerId)) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
    drag.moved = true;
    event.preventDefault();
    setPosition(clampFloatingPoint(
      drag.originX + deltaX,
      drag.originY + deltaY,
      drag.width,
      drag.height
    ));
  }

  function endDrag(event) {
    const drag = dragRef.current;
    if (!drag || (drag.pointerId !== null && Number.isFinite(event.pointerId) && drag.pointerId !== event.pointerId)) return;
    if (drag.moved) {
      suppressClickRef.current = true;
      globalThis.setTimeout?.(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
    if (Number.isFinite(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
  }

  function consumeDragClick(event) {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  const floatingStyle = position ? {
    bottom: 'auto',
    left: `${position.x}px`,
    right: 'auto',
    top: `${position.y}px`,
    transform: 'translate(-50%, -50%)'
  } : undefined;

  if (collapsed) {
    return (
      <button
        ref={controlRef}
        className={`ecommerceFloatingSaveOrb ${dragging ? 'dragging' : ''}`}
        style={floatingStyle}
        type="button"
        aria-label={showLabel}
        title={showLabel}
        onPointerDown={beginDrag}
        onPointerMove={moveControl}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseDown={beginDrag}
        onMouseMove={moveControl}
        onMouseUp={endDrag}
        onClick={(event) => {
          if (!consumeDragClick(event)) setCollapsed(false);
        }}
      >
        <Save size={23} />
      </button>
    );
  }

  return (
    <div
      ref={controlRef}
      className={`ecommerceFloatingSave ${dragging ? 'dragging' : ''}`}
      style={floatingStyle}
      title={dragLabel}
      onPointerDown={beginDrag}
      onPointerMove={moveControl}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onMouseDown={beginDrag}
      onMouseMove={moveControl}
      onMouseUp={endDrag}
    >
      <GripVertical className="ecommerceFloatingSaveGrip" size={17} aria-hidden="true" />
      <button
        className="ecommerceFloatingSaveAction"
        type="submit"
        form={formId}
        disabled={disabled}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {saving ? <LoaderCircle size={19} className="spin" /> : <Save size={19} />}
        <span>{saving ? savingLabel : label}</span>
      </button>
      <button
        className="ecommerceFloatingSaveClose"
        type="button"
        aria-label={hideLabel}
        title={hideLabel}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => setCollapsed(true)}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function EcommerceWorkspace({ language, session, profile, onSignIn, onBilling, onProfileChange }) {
  const t = copy[language] || copy.en;
  const signedIn = hasSession(session);
  const hasAccess = signedIn && Boolean(profile?.isSuperAdmin || Number(profile?.creditBalance || 0) > 0);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(() => createEmptyForm());
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [assets, setAssets] = useState([]);
  const [assetType, setAssetType] = useState('product');
  const [assetStatus, setAssetStatus] = useState('idle');
  const [generations, setGenerations] = useState([]);
  const [selectedProductionSlots, setSelectedProductionSlots] = useState([]);
  const [generationTasks, setGenerationTasks] = useState({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [generationMessage, setGenerationMessage] = useState('');
  const [openFieldHelp, setOpenFieldHelp] = useState('');
  const [aiBriefOriginals, setAiBriefOriginals] = useState({});
  const [aiBriefStatus, setAiBriefStatus] = useState('idle');
  const [collapsedSections, setCollapsedSections] = useState(() => getCollapsedSectionsForStage(0));
  const [previewImage, setPreviewImage] = useState(null);
  const fileInputRef = useRef(null);
  const generationTasksRef = useRef(new Map());
  const platform = useMemo(() => getEcommercePlatform(form.platformId), [form.platformId]);
  const industry = useMemo(
    () => ECOMMERCE_INDUSTRIES.find((item) => item.id === form.industryId) || ECOMMERCE_INDUSTRIES[0],
    [form.industryId]
  );
  const recommendedVisualStyles = useMemo(() => getVisualStylesForIndustry(form.industryId), [form.industryId]);
  const visualStyles = useMemo(() => {
    const selectedStyle = getEcommerceVisualStyle(form.visualStyleId);
    return recommendedVisualStyles.some((item) => item.id === selectedStyle.id)
      ? recommendedVisualStyles
      : [...recommendedVisualStyles, selectedStyle];
  }, [form.visualStyleId, recommendedVisualStyles]);
  const currentStage = !form.id ? 0 : form.masterAssetId ? 3 : assets.length ? 2 : 1;
  const previousStageRef = useRef(currentStage);

  useEffect(() => {
    if (previousStageRef.current === currentStage) return;
    previousStageRef.current = currentStage;
    setCollapsedSections(getCollapsedSectionsForStage(currentStage));
  }, [currentStage]);

  useEffect(() => {
    let active = true;
    if (!signedIn) {
      setProjects([]);
      return () => {
        active = false;
      };
    }

    setStatus('loading');
    fetch('/api/ecommerce/projects')
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'LOAD_FAILED');
        setProjects(payload.projects || []);
        setStatus('idle');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
        setMessage(t.loadFailed);
      });

    return () => {
      active = false;
    };
  }, [signedIn, language]);

  useEffect(() => {
    let active = true;
    setAssets([]);
    if (!signedIn || !form.id) return () => {
      active = false;
    };

    setAssetStatus('loading');
    fetch(`/api/ecommerce/assets?projectId=${encodeURIComponent(form.id)}`)
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'LOAD_FAILED');
        setAssets(payload.assets || []);
        setForm((current) => ({ ...current, masterAssetId: payload.masterAssetId || '' }));
        setAssetStatus('idle');
      })
      .catch(() => {
        if (active) setAssetStatus('error');
      });

    return () => {
      active = false;
    };
  }, [signedIn, form.id]);

  useEffect(() => {
    setSelectedProductionSlots([]);
    generationTasksRef.current.clear();
    setGenerationTasks({});
    setBatchRunning(false);
  }, [form.id]);

  useEffect(() => {
    setSelectedProductionSlots((current) => current.filter((slotId) => form.selectedSlots.includes(slotId)));
  }, [form.selectedSlots]);

  useEffect(() => {
    let active = true;
    setGenerations([]);
    setGenerationMessage('');
    if (!signedIn || !form.id) return () => {
      active = false;
    };

    fetch(`/api/ecommerce/outputs?projectId=${encodeURIComponent(form.id)}`)
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (!active || !response.ok || !payload?.ok) return;
        setGenerations(payload.generations || []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [signedIn, form.id]);

  function updateField(field, value) {
    setMessage('');
    if (['industryId', 'productName', 'brandName'].includes(field)) {
      setAiBriefOriginals({});
      setAiBriefStatus('idle');
    }
    if (form.id) setStatus('dirty');
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectPlatform(platformId) {
    setMessage('');
    if (form.id) setStatus('dirty');
    setForm((current) => ({
      ...current,
      platformId,
      selectedSlots: getDefaultSlotIds(platformId)
    }));
  }

  function selectIndustry(industryId) {
    const firstStyle = getVisualStylesForIndustry(industryId)[0];
    setMessage('');
    setAiBriefOriginals({});
    setAiBriefStatus('idle');
    if (form.id) setStatus('dirty');
    setForm((current) => ({
      ...current,
      industryId,
      visualStyleId: firstStyle?.id || 'clean-commercial'
    }));
  }

  function toggleSlot(slotId) {
    if (form.id) setStatus('dirty');
    setForm((current) => {
      const selected = new Set(current.selectedSlots);
      if (selected.has(slotId)) selected.delete(slotId);
      else selected.add(slotId);
      return { ...current, selectedSlots: [...selected] };
    });
  }

  function toggleSection(sectionKey) {
    if (!SECTION_KEYS.includes(sectionKey)) return;
    setCollapsedSections((current) => ({ ...current, [sectionKey]: !current[sectionKey] }));
  }

  function startNewProject() {
    setForm(createEmptyForm());
    setMessage('');
    setStatus('idle');
    setAssets([]);
    setAiBriefOriginals({});
    setAiBriefStatus('idle');
    setCollapsedSections(getCollapsedSectionsForStage(0));
    setPreviewImage(null);
  }

  function openProject(project) {
    setForm(projectToForm(project));
    setMessage('');
    setStatus('saved');
    setAiBriefOriginals(project.aiBriefOriginals || {});
    setAiBriefStatus(Object.keys(project.aiBriefOriginals || {}).length ? 'success' : 'idle');
    setCollapsedSections(getCollapsedSectionsForStage(project.masterAssetId ? 3 : 1));
    setPreviewImage(null);
  }

  async function handleSave(event) {
    event?.preventDefault?.();
    if (!signedIn) {
      onSignIn?.();
      return;
    }
    if (!hasAccess) {
      onBilling?.();
      return;
    }
    if (!form.productName.trim()) {
      setMessage(t.productRequired);
      return;
    }

    const isNewProject = !form.id;
    setStatus('saving');
    setMessage('');
    try {
      const response = await fetch('/api/ecommerce/projects', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          aiBriefOriginals,
          sellingPoints: form.sellingPoints.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.project) throw new Error(payload?.error || 'SAVE_FAILED');
      const savedProject = payload.project;
      setProjects((current) => [savedProject, ...current.filter((item) => item.id !== savedProject.id)]);
      setForm(projectToForm(savedProject));
      setAiBriefOriginals(savedProject.aiBriefOriginals || aiBriefOriginals);
      setStatus('saved');
      setMessage(isNewProject ? t.saved : t.changesSaved);
    } catch {
      setStatus('error');
      setMessage(t.saveFailed);
    }
  }

  function resetBriefField(field) {
    const hasAiOriginal = Object.prototype.hasOwnProperty.call(aiBriefOriginals, field);
    updateField(field, hasAiOriginal ? aiBriefOriginals[field] : '');
  }

  async function handleAiFillBrief() {
    if (!signedIn) {
      onSignIn?.();
      return;
    }
    if (!hasAccess) {
      onBilling?.();
      return;
    }
    if (!form.productName.trim()) {
      setAiBriefStatus('error');
      setMessage(t.productRequired);
      globalThis.document?.getElementById('ecommerce-product-name')?.focus();
      return;
    }

    setAiBriefStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/ecommerce/auto-fill-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          industryId: form.industryId,
          productName: form.productName,
          brandName: form.brandName
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.brief) throw new Error(payload?.error || 'AI_BRIEF_FAILED');
      const originalBrief = {
        targetAudience: String(payload.brief.targetAudience || ''),
        sellingPoints: String(payload.brief.sellingPoints || ''),
        specifications: String(payload.brief.specifications || ''),
        prohibitedContent: String(payload.brief.prohibitedContent || '')
      };
      if (Object.values(originalBrief).some((value) => !value.trim())) throw new Error('AI_BRIEF_INCOMPLETE');
      setAiBriefOriginals(originalBrief);
      setForm((current) => ({ ...current, ...originalBrief }));
      if (form.id) setStatus('dirty');
      setAiBriefStatus('success');
    } catch {
      setAiBriefStatus('error');
      setMessage(t.aiBriefFailed);
    }
  }

  async function handleAssetFiles(event) {
    const files = [...(event.target.files || [])].slice(0, Math.max(0, 30 - assets.length));
    event.target.value = '';
    if (!files.length || !form.id || !hasAccess) return;

    setAssetStatus('uploading');
    let failed = false;
    const uploaded = [];
    for (const file of files) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
        failed = true;
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const response = await fetch('/api/ecommerce/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: form.id, assetType, fileName: file.name, dataUrl })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok || !payload.asset) throw new Error(payload?.error || 'UPLOAD_FAILED');
        uploaded.push(payload.asset);
        if (payload.project) {
          setForm((current) => ({ ...current, masterAssetId: payload.project.masterAssetId || '' }));
          setProjects((current) => current.map((item) => item.id === payload.project.id ? payload.project : item));
        }
      } catch {
        failed = true;
      }
    }
    if (uploaded.length) setAssets((current) => [...uploaded, ...current]);
    setAssetStatus(failed ? 'error' : 'idle');
  }

  async function handleDeleteAsset(assetId) {
    if (!hasAccess || assetStatus === 'uploading') return;
    setAssetStatus('deleting');
    try {
      const response = await fetch(`/api/ecommerce/assets?id=${encodeURIComponent(assetId)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'DELETE_FAILED');
      setAssets((current) => current.filter((item) => item.id !== assetId));
      if (form.masterAssetId === assetId) {
        setForm((current) => ({ ...current, masterAssetId: '' }));
        setProjects((current) => current.map((item) => item.id === form.id ? { ...item, masterAssetId: '' } : item));
      }
      setAssetStatus('idle');
    } catch {
      setAssetStatus('error');
    }
  }

  async function handleSetMaster(assetId) {
    if (!hasAccess || !form.id || assetStatus === 'uploading') return;
    setAssetStatus('updating');
    try {
      const response = await fetch('/api/ecommerce/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: form.id, assetId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.project) throw new Error(payload?.error || 'MASTER_UPDATE_FAILED');
      setAssets(payload.assets || []);
      setForm((current) => ({ ...current, masterAssetId: payload.project.masterAssetId || '' }));
      setProjects((current) => current.map((item) => item.id === payload.project.id ? payload.project : item));
      setAssetStatus('idle');
    } catch {
      setAssetStatus('error');
    }
  }

  function createGenerationTaskId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function updateGenerationTask(slotId, task) {
    if (task) generationTasksRef.current.set(slotId, task);
    else generationTasksRef.current.delete(slotId);
    setGenerationTasks(Object.fromEntries(generationTasksRef.current));
  }

  function toggleProductionSlot(slotId) {
    setSelectedProductionSlots((current) => current.includes(slotId)
      ? current.filter((item) => item !== slotId)
      : [...current, slotId]);
  }

  async function runSlotGeneration(slotId, taskId = createGenerationTaskId()) {
    if (!hasAccess) {
      onBilling?.();
      return false;
    }
    if (!form.masterAssetId) {
      setGenerationMessage(t.masterRequired);
      return false;
    }
    if (status === 'dirty') {
      setGenerationMessage(t.saveChangesFirst);
      return false;
    }

    const queuedTask = generationTasksRef.current.get(slotId);
    if (queuedTask && queuedTask.taskId !== taskId) return false;
    updateGenerationTask(slotId, { taskId, status: 'generating' });
    setGenerationMessage('');
    try {
      const response = await fetch('/api/ecommerce/generate-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: form.id, slotId, quality: 'medium', taskId })
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.user) onProfileChange?.(payload.user);
      if (payload.generation) {
        setGenerations((current) => [payload.generation, ...current.filter((item) => item.id !== payload.generation.id)]);
      }
      if (!response.ok || !payload?.ok || !payload.generation) {
        if (payload.error === 'GENERATION_CANCELLED') return false;
        if (payload.error === 'CREDITS_REQUIRED') onBilling?.();
        setGenerationMessage(payload.error === 'CONTENT_MODERATION_BLOCKED' ? t.moderationBlocked : t.generationFailed);
        return false;
      }
      return true;
    } catch {
      setGenerationMessage(t.generationFailed);
      return false;
    } finally {
      const currentTask = generationTasksRef.current.get(slotId);
      if (currentTask?.taskId === taskId) updateGenerationTask(slotId, null);
    }
  }

  async function handleCancelGeneration(slotId) {
    const task = generationTasksRef.current.get(slotId);
    if (!task) return;
    if (task.status === 'queued') {
      updateGenerationTask(slotId, null);
      return;
    }
    if (task.status === 'cancelling') return;

    updateGenerationTask(slotId, { ...task, status: 'cancelling' });
    try {
      const response = await fetch('/api/ecommerce/cancel-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.taskId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'CANCEL_FAILED');
    } catch {
      const currentTask = generationTasksRef.current.get(slotId);
      if (currentTask?.taskId === task.taskId) updateGenerationTask(slotId, { ...task, status: 'generating' });
      setGenerationMessage(t.generationFailed);
    }
  }

  async function handleGenerateSelected() {
    const slotIds = selectedProductionSlots.filter((slotId) => form.selectedSlots.includes(slotId));
    if (!slotIds.length) {
      setGenerationMessage(t.selectAtLeastOne);
      return;
    }
    if (!form.masterAssetId) {
      setGenerationMessage(t.masterRequired);
      return;
    }
    if (status === 'dirty') {
      setGenerationMessage(t.saveChangesFirst);
      return;
    }
    const availableCredits = profile?.isSuperAdmin ? Number.POSITIVE_INFINITY : Number(profile?.creditBalance || 0);
    if (slotIds.length > availableCredits) {
      setGenerationMessage(t.insufficientBatchCredits(slotIds.length, availableCredits));
      onBilling?.();
      return;
    }

    const jobs = slotIds.map((slotId) => ({ slotId, taskId: createGenerationTaskId() }));
    jobs.forEach((job) => updateGenerationTask(job.slotId, { taskId: job.taskId, status: 'queued' }));
    setBatchRunning(true);
    setGenerationMessage('');
    await runTaskPool(jobs, BATCH_GENERATION_CONCURRENCY, async (job) => {
      const task = generationTasksRef.current.get(job.slotId);
      if (!task || task.taskId !== job.taskId) return false;
      return runSlotGeneration(job.slotId, job.taskId);
    });
    setBatchRunning(false);
  }

  const localName = (item) => language === 'zh' ? item.nameZh : item.nameEn;
  const localDescription = (item) => language === 'zh' ? item.descriptionZh : item.descriptionEn;
  const localPurpose = (item) => language === 'zh' ? item.purposeZh : item.purposeEn;
  const localExamples = (item) => language === 'zh' ? item.examplesZh : item.examplesEn;
  const latestGenerationBySlot = useMemo(() => {
    const latest = new Map();
    for (const generation of generations) {
      if (!generation.slotId) continue;
      const current = latest.get(generation.slotId);
      if (!current || (current.status !== 'succeeded' && generation.status === 'succeeded')) {
        latest.set(generation.slotId, generation);
      }
    }
    return latest;
  }, [generations]);
  const productionSlots = platform.slots.filter((item) => form.selectedSlots.includes(item.id));
  const allProductionSelected = Boolean(productionSlots.length) && productionSlots.every((item) => selectedProductionSlots.includes(item.id));
  const activeGenerationCount = Object.values(generationTasks).filter((task) => ['queued', 'generating', 'cancelling'].includes(task.status)).length;
  const assetTypeLabels = {
    product: t.assetProduct,
    packaging: t.assetPackaging,
    logo: t.assetLogo,
    reference: t.assetReference
  };
  const hasAiOriginal = (field) => Object.prototype.hasOwnProperty.call(aiBriefOriginals, field);
  const resetLabelFor = (field) => hasAiOriginal(field) ? t.restoreAiField : t.clearField;

  return (
    <div className="ecommerceWorkspace">
      <div className="ecommerceHero">
        <h2>{t.title}</h2>
      </div>

      <div className="ecommerceWorkflow" aria-label={language === 'zh' ? '项目流程' : 'Project workflow'}>
        {t.workflow.map((label, index) => (
          <div className={index === currentStage ? 'active' : index < currentStage ? 'completed' : ''} key={label}>
            <span>{index < currentStage ? <Check size={14} /> : index + 1}</span>
            <strong>{label}</strong>
            {index === currentStage ? <em>{t.currentStage}</em> : null}
          </div>
        ))}
      </div>

      {!signedIn ? (
        <div className="ecommerceGate">
          <FolderOpen size={24} />
          <div><strong>{t.signInTitle}</strong><span>{t.signInText}</span></div>
          <button type="button" onClick={onSignIn}>{t.signIn}</button>
        </div>
      ) : !hasAccess ? (
        <div className="ecommerceGate">
          <Sparkles size={24} />
          <div><strong>{t.creditsTitle}</strong><span>{t.creditsText}</span></div>
          <button type="button" onClick={onBilling}>{t.recharge}</button>
        </div>
      ) : null}

      <div className="ecommerceLayout">
        <aside className="ecommerceProjectList">
          <div className="ecommerceProjectListHeader">
            <h3>{t.projects}</h3>
            <button type="button" onClick={startNewProject}><Plus size={15} /> {t.newProject}</button>
          </div>
          {status === 'loading' ? <LoaderCircle className="spin ecommerceListLoader" size={21} /> : null}
          {projects.length ? (
            <div className="ecommerceProjectCards">
              {projects.map((project) => {
                const itemPlatform = getEcommercePlatform(project.platformId);
                return (
                  <button
                    className={project.id === form.id ? 'active' : ''}
                    type="button"
                    onClick={() => openProject(project)}
                    key={project.id}
                  >
                    <span><Box size={15} /> {localName(itemPlatform)}</span>
                    <strong>{project.projectName || project.productName}</strong>
                    <em>{project.selectedSlots?.length || 0} · {t.draft}</em>
                  </button>
                );
              })}
            </div>
          ) : status !== 'loading' ? <p>{t.noProjects}</p> : null}
        </aside>

        <form id="ecommerce-product-project-form" className="ecommerceProjectForm" onSubmit={handleSave}>
          <div className={`ecommerceStagePanel ecommerceProductBriefStage ${currentStage === 0 ? 'stageActive' : ''}`}>
          <div className="ecommerceField ecommerceProjectNameField">
            <FieldHelpLabel
              fieldId="ecommerce-project-name"
              label={t.projectName}
              help={t.projectNamePlaceholder}
              helpLabel={t.fieldHelp}
              open={openFieldHelp === 'projectName'}
              onToggle={() => setOpenFieldHelp((current) => current === 'projectName' ? '' : 'projectName')}
              resetLabel={resetLabelFor('projectName')}
              hasAiOriginal={hasAiOriginal('projectName')}
              onReset={() => resetBriefField('projectName')}
            />
            <input id="ecommerce-project-name" value={form.projectName} onChange={(event) => updateField('projectName', event.target.value)} placeholder={t.projectNamePlaceholder} />
          </div>

          <fieldset className={`ecommerceSection ecommerceCollapsibleSection ${collapsedSections.platform ? 'collapsed' : ''}`}>
            <CollapsibleSectionLegend
              label={t.platform}
              summary={localName(platform)}
              collapsed={collapsedSections.platform}
              contentId="ecommerce-platform-section"
              expandLabel={t.expandSection}
              collapseLabel={t.collapseSection}
              onToggle={() => toggleSection('platform')}
            />
            <div className="ecommerceCollapsibleContent" id="ecommerce-platform-section" hidden={collapsedSections.platform}>
              <div className="ecommercePlatformGrid">
                {ECOMMERCE_PLATFORMS.map((item) => (
                  <button className={form.platformId === item.id ? 'active' : ''} type="button" onClick={() => selectPlatform(item.id)} key={item.id}>
                    <span>{form.platformId === item.id ? <Check size={15} /> : <ShoppingBag size={15} />}</span>
                    <strong>{localName(item)}</strong>
                    <em>{localDescription(item)}</em>
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset className={`ecommerceSection ecommerceProductBriefSection ecommerceCollapsibleSection ${collapsedSections.brief ? 'collapsed' : ''}`}>
            <CollapsibleSectionLegend
              label={t.productBrief}
              summary={form.productName.trim() || localName(industry)}
              collapsed={collapsedSections.brief}
              contentId="ecommerce-brief-section"
              expandLabel={t.expandSection}
              collapseLabel={t.collapseSection}
              onToggle={() => toggleSection('brief')}
            />
            <div className="ecommerceCollapsibleContent" id="ecommerce-brief-section" hidden={collapsedSections.brief}>
            <div className="ecommerceFieldsGrid">
              <label className="ecommerceField">
                <span>{t.industry}</span>
                <select value={form.industryId} onChange={(event) => selectIndustry(event.target.value)}>
                  {ECOMMERCE_INDUSTRIES.map((item) => (
                    <option value={item.id} key={item.id}>{localName(item)} · {localExamples(item)}</option>
                  ))}
                </select>
              </label>
              <div className="ecommerceField">
                <FieldHelpLabel
                  fieldId="ecommerce-product-name"
                  label={t.productName}
                  help={t.productNamePlaceholder}
                  helpLabel={t.fieldHelp}
                  open={openFieldHelp === 'productName'}
                  onToggle={() => setOpenFieldHelp((current) => current === 'productName' ? '' : 'productName')}
                  resetLabel={resetLabelFor('productName')}
                  hasAiOriginal={hasAiOriginal('productName')}
                  onReset={() => resetBriefField('productName')}
                />
                <input id="ecommerce-product-name" required value={form.productName} onChange={(event) => updateField('productName', event.target.value)} placeholder={t.productNamePlaceholder} />
              </div>
              <div className="ecommerceField">
                <FieldHelpLabel
                  fieldId="ecommerce-brand-name"
                  label={t.brandName}
                  help={t.brandNamePlaceholder}
                  helpLabel={t.fieldHelp}
                  open={openFieldHelp === 'brandName'}
                  onToggle={() => setOpenFieldHelp((current) => current === 'brandName' ? '' : 'brandName')}
                  resetLabel={resetLabelFor('brandName')}
                  hasAiOriginal={hasAiOriginal('brandName')}
                  onReset={() => resetBriefField('brandName')}
                />
                <input id="ecommerce-brand-name" value={form.brandName} onChange={(event) => updateField('brandName', event.target.value)} placeholder={t.brandNamePlaceholder} />
              </div>
              <div className="ecommerceAiBriefSlot">
                <button
                  className={`ecommerceAiBriefButton ${aiBriefStatus === 'success' ? 'success' : ''}`}
                  type="button"
                  disabled={aiBriefStatus === 'loading'}
                  onClick={handleAiFillBrief}
                >
                  <span className="ecommerceAiBriefIcon">
                    {aiBriefStatus === 'loading' ? <LoaderCircle size={20} className="spin" /> : <WandSparkles size={21} />}
                  </span>
                  <span>{aiBriefStatus === 'loading' ? t.aiFillingBrief : aiBriefStatus === 'success' ? t.aiBriefFilled : t.aiFillBrief}</span>
                </button>
              </div>
              <div className="ecommerceField ecommerceFieldWide">
                <FieldHelpLabel
                  fieldId="ecommerce-target-audience"
                  label={t.audience}
                  help={t.audiencePlaceholder}
                  helpLabel={t.fieldHelp}
                  open={openFieldHelp === 'targetAudience'}
                  onToggle={() => setOpenFieldHelp((current) => current === 'targetAudience' ? '' : 'targetAudience')}
                  resetLabel={resetLabelFor('targetAudience')}
                  hasAiOriginal={hasAiOriginal('targetAudience')}
                  onReset={() => resetBriefField('targetAudience')}
                />
                <textarea id="ecommerce-target-audience" value={form.targetAudience} onChange={(event) => updateField('targetAudience', event.target.value)} placeholder={t.audiencePlaceholder} />
              </div>
              <div className="ecommerceField">
                <FieldHelpLabel
                  fieldId="ecommerce-selling-points"
                  label={t.sellingPoints}
                  help={t.sellingPointsPlaceholder}
                  helpLabel={t.fieldHelp}
                  open={openFieldHelp === 'sellingPoints'}
                  onToggle={() => setOpenFieldHelp((current) => current === 'sellingPoints' ? '' : 'sellingPoints')}
                  resetLabel={resetLabelFor('sellingPoints')}
                  hasAiOriginal={hasAiOriginal('sellingPoints')}
                  onReset={() => resetBriefField('sellingPoints')}
                />
                <textarea id="ecommerce-selling-points" value={form.sellingPoints} onChange={(event) => updateField('sellingPoints', event.target.value)} placeholder={t.sellingPointsPlaceholder} />
              </div>
              <div className="ecommerceField">
                <FieldHelpLabel
                  fieldId="ecommerce-specifications"
                  label={t.specifications}
                  help={t.specificationsPlaceholder}
                  helpLabel={t.fieldHelp}
                  open={openFieldHelp === 'specifications'}
                  onToggle={() => setOpenFieldHelp((current) => current === 'specifications' ? '' : 'specifications')}
                  resetLabel={resetLabelFor('specifications')}
                  hasAiOriginal={hasAiOriginal('specifications')}
                  onReset={() => resetBriefField('specifications')}
                />
                <textarea id="ecommerce-specifications" value={form.specifications} onChange={(event) => updateField('specifications', event.target.value)} placeholder={t.specificationsPlaceholder} />
              </div>
              <div className="ecommerceField ecommerceFieldWide">
                <FieldHelpLabel
                  fieldId="ecommerce-prohibited-content"
                  label={t.prohibited}
                  help={t.prohibitedPlaceholder}
                  helpLabel={t.fieldHelp}
                  open={openFieldHelp === 'prohibitedContent'}
                  onToggle={() => setOpenFieldHelp((current) => current === 'prohibitedContent' ? '' : 'prohibitedContent')}
                  resetLabel={resetLabelFor('prohibitedContent')}
                  hasAiOriginal={hasAiOriginal('prohibitedContent')}
                  onReset={() => resetBriefField('prohibitedContent')}
                />
                <textarea id="ecommerce-prohibited-content" value={form.prohibitedContent} onChange={(event) => updateField('prohibitedContent', event.target.value)} placeholder={t.prohibitedPlaceholder} />
              </div>
            </div>
            </div>
          </fieldset>
          </div>

          <fieldset className={`ecommerceSection ecommerceAssetSection ecommerceCollapsibleSection ${collapsedSections.assets ? 'collapsed' : ''} ${currentStage === 1 || currentStage === 2 ? 'stageActive' : ''} ${currentStage === 1 ? 'stageUpload' : currentStage === 2 ? 'stageMaster' : ''}`}>
            <CollapsibleSectionLegend
              label={t.sourceAssets}
              summary={t.assetSummary(assets.length, Boolean(form.masterAssetId))}
              collapsed={collapsedSections.assets}
              contentId="ecommerce-assets-section"
              expandLabel={t.expandSection}
              collapseLabel={t.collapseSection}
              onToggle={() => toggleSection('assets')}
            />
            <div className="ecommerceCollapsibleContent" id="ecommerce-assets-section" hidden={collapsedSections.assets}>
              <p className="ecommerceAssetHint">{t.sourceAssetsHint}</p>
              {!form.id ? (
                <div className="ecommerceAssetEmpty"><FolderOpen size={22} /><span>{t.saveBeforeUpload}</span></div>
              ) : (
                <>
                <div className="ecommerceAssetToolbar">
                  <label className="ecommerceField">
                    <span>{t.assetType}</span>
                    <select value={assetType} onChange={(event) => setAssetType(event.target.value)} disabled={assetStatus === 'uploading'}>
                      {Object.entries(assetTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                  </label>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      hidden
                      onChange={handleAssetFiles}
                    />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!hasAccess || assetStatus === 'uploading' || assets.length >= 30}>
                      {assetStatus === 'uploading' ? <LoaderCircle size={16} className="spin" /> : <ImageUp size={16} />}
                      {assetStatus === 'uploading' ? t.uploadingAssets : t.chooseImages}
                    </button>
                    <small>{assetStatus === 'error' ? t.uploadFailed : t.assetLimit}</small>
                  </div>
                </div>
                {assetStatus === 'loading' ? <LoaderCircle className="spin ecommerceListLoader" size={21} /> : null}
                {assets.length ? (
                  <div className="ecommerceAssetGrid">
                    {assets.map((asset) => (
                      <article className={asset.isMaster ? 'master' : ''} key={asset.id}>
                        <img src={asset.imageUrl} alt={asset.fileName} loading="lazy" />
                        {asset.isMaster ? <em className="ecommerceMasterBadge"><Check size={12} /> {t.masterAsset}</em> : null}
                        <div>
                          <span>{assetTypeLabels[asset.assetType] || asset.assetType}</span>
                          <strong title={asset.fileName}>{asset.fileName}</strong>
                        </div>
                        <button type="button" aria-label={`${t.deleteAsset}: ${asset.fileName}`} onClick={() => handleDeleteAsset(asset.id)}>
                          <Trash2 size={14} />
                        </button>
                        {!asset.isMaster && ['product', 'packaging'].includes(asset.assetType) ? (
                          <button className="ecommerceSetMasterButton" type="button" onClick={() => handleSetMaster(asset.id)}>
                            {t.setMaster}
                          </button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : assetStatus !== 'loading' ? <div className="ecommerceAssetEmpty"><ImageUp size={22} /><span>{t.assetLimit}</span></div> : null}
                {assets.length ? <p className="ecommerceMasterHint">{t.masterHint}</p> : null}
                </>
              )}
            </div>
          </fieldset>

          <fieldset className={`ecommerceSection ecommerceVisualSection ecommerceCollapsibleSection ${collapsedSections.visual ? 'collapsed' : ''}`}>
            <CollapsibleSectionLegend
              label={t.visualDirection}
              summary={localName(getEcommerceVisualStyle(form.visualStyleId))}
              collapsed={collapsedSections.visual}
              contentId="ecommerce-visual-section"
              expandLabel={t.expandSection}
              collapseLabel={t.collapseSection}
              onToggle={() => toggleSection('visual')}
            />
            <div className="ecommerceCollapsibleContent" id="ecommerce-visual-section" hidden={collapsedSections.visual}>
              <div className="ecommerceVisualStyleGrid" aria-label={t.visualStyle}>
                {visualStyles.map((item) => {
                  const active = form.visualStyleId === item.id;
                  return (
                    <button
                      className={active ? 'active' : ''}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateField('visualStyleId', item.id)}
                      style={{
                        '--visual-a': item.colors?.[0] || '#dff8f0',
                        '--visual-b': item.colors?.[1] || '#95cfe0',
                        '--visual-c': item.colors?.[2] || '#253650'
                      }}
                      key={item.id}
                    >
                      <span className="ecommerceVisualStylePreview" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="ecommerceVisualStyleCopy">
                        <strong>{active ? <Check size={14} /> : null}{localName(item)}</strong>
                        <small>{localDescription(item)}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </fieldset>

          <fieldset className={`ecommerceSection ecommerceCollapsibleSection ${collapsedSections.outputs ? 'collapsed' : ''}`}>
            <CollapsibleSectionLegend
              label={t.outputSlots}
              summary={t.selectedCount(form.selectedSlots.length)}
              collapsed={collapsedSections.outputs}
              contentId="ecommerce-outputs-section"
              expandLabel={t.expandSection}
              collapseLabel={t.collapseSection}
              onToggle={() => toggleSection('outputs')}
            />
            <div className="ecommerceCollapsibleContent" id="ecommerce-outputs-section" hidden={collapsedSections.outputs}>
              <div className="ecommerceSlotHeader">
                <p>{t.slotHint}</p>
                <strong>{t.selectedCount(form.selectedSlots.length)}</strong>
              </div>
              <div className="ecommerceSlotGrid">
                {platform.slots.map((item) => {
                  const selected = form.selectedSlots.includes(item.id);
                  return (
                    <label className={selected ? 'selected' : ''} key={item.id}>
                      <input type="checkbox" checked={selected} onChange={() => toggleSlot(item.id)} />
                      <span className="ecommerceSlotCheck">{selected ? <Check size={14} /> : null}</span>
                      <span className="ecommerceSlotCopy">
                        <strong>{localName(item)} {item.required ? <em>{t.required}</em> : null}</strong>
                        <small>{item.aspectRatio} · {item.recommendedSize}</small>
                        <p>{localPurpose(item)}</p>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </fieldset>

          {form.id ? (
            <fieldset className={`ecommerceSection ecommerceProductionSection ${currentStage === 3 ? 'stageActive' : ''}`}>
              <legend>{t.production}</legend>
              <div className="ecommerceBatchToolbar">
                <button
                  type="button"
                  onClick={() => setSelectedProductionSlots(allProductionSelected ? [] : productionSlots.map((item) => item.id))}
                  disabled={batchRunning}
                >
                  <ListChecks size={15} />
                  {allProductionSelected ? t.clearSelection : t.selectAll}
                </button>
                <span>{t.batchSelection(selectedProductionSlots.length)}</span>
                <button
                  className="primary"
                  type="button"
                  onClick={handleGenerateSelected}
                  disabled={batchRunning || activeGenerationCount > 0 || !selectedProductionSlots.length || !form.masterAssetId || status === 'dirty'}
                >
                  {batchRunning ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />}
                  {batchRunning ? `${t.batchGenerating} ${activeGenerationCount}` : t.generateSelected}
                </button>
              </div>
              {generationMessage ? <p className="ecommerceGenerationMessage">{generationMessage}</p> : null}
              <div className="ecommerceProductionGrid">
                {productionSlots.map((item) => {
                  const latest = latestGenerationBySlot.get(item.id);
                  const task = generationTasks[item.id];
                  const taskActive = Boolean(task && ['queued', 'generating', 'cancelling'].includes(task.status));
                  const selectedForBatch = selectedProductionSlots.includes(item.id);
                  return (
                    <article className={selectedForBatch ? 'selected' : ''} key={item.id}>
                      <div className="ecommerceProductionPreview">
                        {latest?.imageUrl ? (
                          <button
                            className="ecommerceProductionImageButton"
                            type="button"
                            aria-label={`${t.viewImage}: ${localName(item)}`}
                            title={t.viewImage}
                            onClick={() => setPreviewImage({
                              imageUrl: latest.imageUrl,
                              alt: localName(item),
                              title: localName(item),
                              meta: `${item.aspectRatio} · ${item.recommendedSize} · ${t.version(latest.versionNumber)}`
                            })}
                          >
                            <img src={latest.imageUrl} alt={localName(item)} loading="lazy" />
                            <span><Maximize2 size={18} /></span>
                          </button>
                        ) : (
                          <div><ImagePlus size={24} /><span>{latest?.status === 'failed' ? t.generationFailed : t.noOutput}</span></div>
                        )}
                        <label className="ecommerceProductionSelect" aria-label={`${t.selectAll}: ${localName(item)}`}>
                          <input
                            type="checkbox"
                            checked={selectedForBatch}
                            onChange={() => toggleProductionSlot(item.id)}
                            disabled={batchRunning}
                          />
                          <span>{selectedForBatch ? <Check size={14} /> : null}</span>
                        </label>
                        {task?.status === 'queued' ? <em className="ecommerceTaskStatus">{t.queued}</em> : null}
                      </div>
                      <div className="ecommerceProductionCopy">
                        <span>{item.aspectRatio} · {item.recommendedSize}</span>
                        <strong>{localName(item)}</strong>
                        {latest ? <em>{t.version(latest.versionNumber)}</em> : null}
                      </div>
                      <div className="ecommerceProductionActions">
                        <button
                          className={taskActive ? 'cancel' : ''}
                          type="button"
                          onClick={() => taskActive ? handleCancelGeneration(item.id) : runSlotGeneration(item.id)}
                          disabled={task?.status === 'cancelling' || (!taskActive && (batchRunning || !form.masterAssetId || status === 'dirty'))}
                        >
                          {taskActive
                            ? task.status === 'cancelling' ? <LoaderCircle size={15} className="spin" /> : <X size={15} />
                            : latest ? <RefreshCw size={15} /> : <Sparkles size={15} />}
                          {taskActive
                            ? task.status === 'cancelling' ? t.cancelling : t.cancel
                            : status === 'dirty' ? t.saveChangesFirst : latest ? t.regenerateSlot : t.generateSlot}
                        </button>
                        {latest?.imageUrl ? (
                          <a
                            href={latest.imageUrl}
                            download={buildDownloadFilename({
                              productName: form.productName,
                              slotName: localName(item),
                              platformName: localName(platform),
                              versionNumber: latest.versionNumber,
                              language
                            })}
                          >
                            <Download size={14} /> {t.downloadOutput}
                          </a>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <div className="ecommerceFormFooter">
            <span className={status === 'error' ? 'error' : ''}>{message}</span>
            <button type="submit" disabled={status === 'saving' || !hasAccess}>
              {status === 'saving' ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}
              {status === 'saving' ? t.saving : t.save}
            </button>
          </div>
        </form>
      </div>
      <FloatingSaveControl
        label={t.save}
        savingLabel={t.saving}
        dragLabel={t.dragFloatingSave}
        hideLabel={t.hideFloatingSave}
        showLabel={t.showFloatingSave}
        saving={status === 'saving'}
        disabled={status === 'saving' || !hasAccess}
        formId="ecommerce-product-project-form"
      />
      <EcommerceImageLightbox image={previewImage} t={t} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
