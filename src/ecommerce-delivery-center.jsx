import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleMinus,
  CircleAlert,
  ClipboardCheck,
  Copy,
  Download,
  FileArchive,
  FileCheck2,
  FileImage,
  ImagePlus,
  Layers3,
  LayoutTemplate,
  LoaderCircle,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  TriangleAlert,
  Type,
  Upload,
  WandSparkles,
  X
} from 'lucide-react';
import {
  DELIVERY_FORMATS,
  DELIVERY_LAYOUTS,
  DELIVERY_THEMES,
  DELIVERY_TYPES,
  createDeliveryDocumentDraft,
  getDeliveryDefaultsForType,
  getDeliveryExportAvailability,
  getDeliveryTextScale,
  getDeliveryTheme,
  getDeliveryWorkflowStep,
  resolveDeliveryOverlayBoxes
} from '../shared/ecommerce-delivery.js';
import { ECOMMERCE_PLATFORMS } from '../shared/ecommerce-catalog.js';
import { resolveEcommerceRefinementSize } from '../shared/image-pricing.js';
import { ImageCreditPrice, useServerImagePricing } from './image-pricing-client.jsx';
import { clampImagePanOffset } from './image-pan-zoom.js';

const copy = {
  zh: {
    title: '专业交付',
    summaryEmpty: '等待加载',
    summaryReady: (ready, total) => `${ready}/${total} 通过参考检查`,
    prepare: '一键加载',
    preparing: '正在加载……',
    sync: '重新加载',
    tabs: { editor: '单页精修', sequence: '详情页编排' },
    finishAction: '单页精修',
    steps: ['加载生成结果', '一键检查', '精修', '导出'],
    noOutputTitle: '先完成至少一张套图',
    noOutputText: '交付中心会使用每个槽位的“当前采用版本”，失败尝试不会覆盖正式成果。',
    selectedSource: '当前采用版本',
    missingSource: '缺少采用图片',
    ready: '检查通过',
    unchecked: '未检查',
    hasIssues: '参考问题',
    editorTitle: '结构化图层',
    smartReset: '恢复专业推荐',
    type: '制图类型',
    headline: '主标题',
    subtitle: '副标题',
    price: '价格或利益点',
    badge: '活动标签',
    bullets: '卖点列表',
    specs: '规格参数',
    logo: 'Logo 图层',
    noLogo: '不使用 Logo',
    dimensions: '真实尺寸',
    width: '宽度',
    height: '高度',
    depth: '深度',
    weight: '重量',
    packageItems: '包装包含物',
    comparisonLeft: '本商品事实',
    comparisonRight: '对比对象事实',
    comparisonLeftRegion: '左图区域',
    comparisonRightRegion: '右图区域',
    leftTitle: '左图标题',
    rightTitle: '右图标题',
    variants: 'SKU 颜色 / 款式',
    stepsList: '步骤或镜头',
    advanced: '版式与导出设置',
    theme: '视觉主题',
    layout: '信息区位置',
    format: '导出格式',
    imageFit: '图片适配',
    cover: '裁切铺满',
    contain: '完整显示',
    showText: '显示文字图层',
    showMask: '显示文字底板',
    safeArea: '启用平台安全区',
    showSafeArea: '预览安全区',
    includeExport: '加入批量交付',
    deliveryList: '本次交付清单',
    deliveryListCount: (count) => `${count} 张`,
    removeFromDelivery: '移出本次交付',
    restoreToDelivery: '恢复到本次交付',
    removeMissing: '移除未生成项',
    removedItems: (count) => `已移除 ${count} 项`,
    removedHint: '不参与检查、详情编排和导出',
    removedSuccess: '已移出本次交付，可在左栏底部恢复。',
    restoredSuccess: '已恢复到本次交付。',
    missingRemovedSuccess: '未生成的空项已移出本次交付。',
    noIncludedTitle: '本次交付清单为空',
    noIncludedText: '请从左栏底部恢复需要交付的图片。',
    save: '保存本图设置',
    saving: '保存中……',
    check: '检查本图',
    checking: '检查中……',
    exportCurrent: '导出本图',
    exportAll: '导出交付',
    exporting: '正在打包……',
    includeDetailPage: '同时生成详情长图',
    checkAll: '一键检查',
    checkSummary: (ready, total) => `${ready}/${total} 张通过 · 仅供参考`,
    platformRules: '参考检查结果',
    noCheck: '可选检查尺寸、格式、安全区和专业制图完整性；检查结果不影响导出。',
    passed: '通过',
    warning: '建议优化',
    failed: '参考问题',
    sequenceTitle: '详情页与素材顺序',
    sequenceText: '按消费者阅读顺序编排，导出 ZIP 和详情长图都会沿用这里的次序。',
    moveUp: '前移',
    moveDown: '后移',
    reuseTitle: '把成熟流程复用到下一个商品',
    reuse: '项目复用',
    openReuse: '展开项目复用',
    closeReuse: '收起项目复用',
    duplicate: '复制当前项目',
    duplicateText: '复制商品资料、素材、身份规范和交付版式，不复制旧生成结果。',
    adapting: '正在创建……',
    adapt: '跨平台创建',
    adaptText: '保留商品事实与素材，自动换成目标平台推荐槽位和视觉方案。',
    targetPlatform: '目标平台',
    createAdapted: '创建跨平台项目',
    templateName: '模板名称',
    templatePlaceholder: '例如：美妆天猫上新标准',
    saveTemplate: '保存为我的模板',
    saveTemplateText: '保存结构、槽位、视觉和交付设置；不保存商品图片与个人素材。',
    myTemplates: '我的模板',
    createFromTemplate: '创建项目',
    deleteTemplate: '删除模板',
    noTemplates: '还没有个人模板。',
    saveSuccess: '本图设置已保存。',
    checkSuccess: '参考检查已完成，不影响导出。',
    prepareSuccess: '生成结果已加载。',
    exportBlocked: '交付图片尚未准备完整，请先补齐采用图片。',
    actionFailed: '操作未完成，请稍后重试。',
    templateSaved: '已保存为个人模板。',
    projectCreated: '新项目已创建。',
    livePreview: '实时预览',
    doubleClickPreview: '双击画布放大查看',
    largePreview: '单图精修大画布',
    closeLargePreview: '关闭大画布',
    zoomIn: '放大',
    zoomOut: '缩小',
    resetZoom: '恢复比例',
    dragToBrowse: '放大后按住拖动浏览',
    maskObject: '文字蒙版',
    textObject: '文字容器',
    objectOpacity: '透明度',
    resetObject: '恢复默认边界',
    removeObject: '移除此图层',
    restoreObject: '恢复图层',
    dragObject: '拖动调整位置',
    resizeObject: '拖动角点调整边界，文字会自动缩放',
    refineImage: 'AI 单图精修',
    refinePrompt: '修改要求',
    refinePromptPlaceholder: '例如：只把右下角茶叶托盘换成白瓷碟；茶罐、Logo、光线和其余区域保持不变',
    refineArea: '修改范围',
    refineAreas: {
      auto: '自动判断', subject: '商品主体', background: '背景',
      'top-left': '左上区域', 'top-right': '右上区域', 'bottom-left': '左下区域', 'bottom-right': '右下区域'
    },
    refinementAssets: '补充素材',
    refinementAssetsHint: '可选，最多 4 张；为每张素材指定用途。',
    chooseProjectAssets: '选择项目素材',
    uploadRefinementAsset: '上传补充图',
    uploadingRefinementAsset: '正在上传…',
    noRefinementAssets: '项目中暂无其他可选素材。',
    refinementRoles: { detail: '局部内容', composition: '仅构图', lighting: '仅光线', scene: '仅场景' },
    removeRefinementAsset: '移除补充素材',
    createRefinement: (credits) => `生成精修版本 · ${credits}积分`,
    createRefinementLabel: '生成精修版本',
    refiningImage: '正在生成精修版本…',
    refinementPreservesOriginal: '生成新版本，原图保留',
    refinementSuccess: '精修版本已生成，原版本已保留。',
    refinementFailed: '精修未完成，请检查积分、素材或生成状态。',
    refinementUploadFailed: '补充素材上传失败。',
    saveLayerChanges: '保存图层设置',
    generatedPreview: '采用图',
    safeAreaLabel: '安全区',
    itemCount: (count) => `${count} 项`,
    selectedCount: (count) => `已选 ${count} 张`,
    requiresSave: '修改后请先保存本图设置。'
  },
  en: {
    title: 'Professional delivery',
    summaryEmpty: 'Not loaded',
    summaryReady: (ready, total) => `${ready}/${total} passed the advisory check`,
    prepare: 'Load all',
    preparing: 'Loading...',
    sync: 'Reload',
    tabs: { editor: 'Single-page finishing', sequence: 'Detail-page order' },
    finishAction: 'Finish one image',
    steps: ['Load results', 'Check all', 'Finish', 'Export'],
    noOutputTitle: 'Finish at least one project image first',
    noOutputText: 'Delivery uses each slot’s adopted version. A failed attempt never replaces the approved result.',
    selectedSource: 'Adopted version',
    missingSource: 'No adopted image',
    ready: 'Check passed',
    unchecked: 'Unchecked',
    hasIssues: 'Advisory findings',
    editorTitle: 'Structured layers',
    smartReset: 'Restore recommendation',
    type: 'Artwork type',
    headline: 'Headline',
    subtitle: 'Subtitle',
    price: 'Price or offer',
    badge: 'Campaign badge',
    bullets: 'Benefits',
    specs: 'Specifications',
    logo: 'Logo layer',
    noLogo: 'No logo',
    dimensions: 'Real dimensions',
    width: 'Width',
    height: 'Height',
    depth: 'Depth',
    weight: 'Weight',
    packageItems: 'Package contents',
    comparisonLeft: 'This product facts',
    comparisonRight: 'Comparison facts',
    comparisonLeftRegion: 'Left image',
    comparisonRightRegion: 'Right image',
    leftTitle: 'Left-image title',
    rightTitle: 'Right-image title',
    variants: 'SKU colors / styles',
    stepsList: 'Steps or shots',
    advanced: 'Layout and export settings',
    theme: 'Visual theme',
    layout: 'Copy position',
    format: 'Export format',
    imageFit: 'Image fit',
    cover: 'Crop to fill',
    contain: 'Show complete image',
    showText: 'Show text layers',
    showMask: 'Show text panel',
    safeArea: 'Use platform safe area',
    showSafeArea: 'Preview safe area',
    includeExport: 'Include in batch delivery',
    deliveryList: 'Current delivery list',
    deliveryListCount: (count) => `${count} images`,
    removeFromDelivery: 'Remove from this delivery',
    restoreToDelivery: 'Restore to this delivery',
    removeMissing: 'Remove ungenerated items',
    removedItems: (count) => `${count} removed`,
    removedHint: 'Excluded from checks, ordering, and export',
    removedSuccess: 'Removed from this delivery. Restore it from the bottom of the left rail.',
    restoredSuccess: 'Restored to this delivery.',
    missingRemovedSuccess: 'Ungenerated placeholders were removed from this delivery.',
    noIncludedTitle: 'This delivery list is empty',
    noIncludedText: 'Restore the images you want from the bottom of the left rail.',
    save: 'Save image settings',
    saving: 'Saving...',
    check: 'Check image',
    checking: 'Checking...',
    exportCurrent: 'Export image',
    exportAll: 'Export delivery',
    exporting: 'Packaging...',
    includeDetailPage: 'Also create a long detail page',
    checkAll: 'Check all',
    checkSummary: (ready, total) => `${ready}/${total} passed · advisory only`,
    platformRules: 'Advisory check results',
    noCheck: 'Optionally check dimensions, format, safe area, and completeness. Findings do not block export.',
    passed: 'Passed',
    warning: 'Improve',
    failed: 'Advisory finding',
    sequenceTitle: 'Detail-page and asset order',
    sequenceText: 'The ZIP and long detail page use this customer-reading order.',
    moveUp: 'Move earlier',
    moveDown: 'Move later',
    reuseTitle: 'Reuse a proven workflow for the next product',
    reuse: 'Project reuse',
    openReuse: 'Open project reuse',
    closeReuse: 'Close project reuse',
    duplicate: 'Duplicate project',
    duplicateText: 'Copies facts, assets, identity rules, and delivery layouts without old generated results.',
    adapting: 'Creating...',
    adapt: 'Create for another platform',
    adaptText: 'Keeps facts and assets, then applies the target platform’s recommended slots and direction.',
    targetPlatform: 'Target platform',
    createAdapted: 'Create adapted project',
    templateName: 'Template name',
    templatePlaceholder: 'For example: Beauty Tmall launch standard',
    saveTemplate: 'Save as my template',
    saveTemplateText: 'Saves structure, slots, visual direction, and delivery settings without product images or personal assets.',
    myTemplates: 'My templates',
    createFromTemplate: 'Create project',
    deleteTemplate: 'Delete template',
    noTemplates: 'No personal templates yet.',
    saveSuccess: 'Image settings saved.',
    checkSuccess: 'Advisory checks completed. Export remains available.',
    prepareSuccess: 'Generated results loaded.',
    exportBlocked: 'Some delivery images are unavailable. Add adopted source images before export.',
    actionFailed: 'The action could not be completed.',
    templateSaved: 'Saved as a personal template.',
    projectCreated: 'New project created.',
    livePreview: 'Live preview',
    doubleClickPreview: 'Double-click the canvas for a larger view',
    largePreview: 'Large finishing canvas',
    closeLargePreview: 'Close large canvas',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetZoom: 'Reset zoom',
    dragToBrowse: 'Drag to browse after zooming',
    maskObject: 'Text mask',
    textObject: 'Text container',
    objectOpacity: 'Opacity',
    resetObject: 'Reset bounds',
    removeObject: 'Remove this layer',
    restoreObject: 'Restore layer',
    dragObject: 'Drag to reposition',
    resizeObject: 'Drag a corner to resize; copy scales automatically',
    refineImage: 'AI image refinement',
    refinePrompt: 'Change request',
    refinePromptPlaceholder: 'Example: replace only the tray at bottom right with a white ceramic plate; keep the product, logo, lighting, and all other areas unchanged',
    refineArea: 'Target area',
    refineAreas: {
      auto: 'Auto detect', subject: 'Product', background: 'Background',
      'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right'
    },
    refinementAssets: 'Supporting images',
    refinementAssetsHint: 'Optional, up to four. Assign a role to each image.',
    chooseProjectAssets: 'Choose project assets',
    uploadRefinementAsset: 'Upload supporting image',
    uploadingRefinementAsset: 'Uploading...',
    noRefinementAssets: 'No other project assets are available.',
    refinementRoles: { detail: 'Local content', composition: 'Composition only', lighting: 'Lighting only', scene: 'Scene only' },
    removeRefinementAsset: 'Remove supporting image',
    createRefinement: (credits) => `Create refined version · ${credits} credits`,
    createRefinementLabel: 'Create refined version',
    refiningImage: 'Creating refined version...',
    refinementPreservesOriginal: 'Creates a new version and keeps the original',
    refinementSuccess: 'Refined version created. The original was preserved.',
    refinementFailed: 'Refinement could not be completed. Check credits, assets, or generation status.',
    refinementUploadFailed: 'Supporting image upload failed.',
    saveLayerChanges: 'Save layer settings',
    generatedPreview: 'Adopted image',
    safeAreaLabel: 'Safe area',
    itemCount: (count) => `${count} items`,
    selectedCount: (count) => `${count} selected`,
    requiresSave: 'Save this image before continuing.'
  }
};

function listToText(value) {
  return (Array.isArray(value) ? value : []).join('\n');
}

function textToList(value, limit = 10) {
  return [...new Set(String(value || '').split(/\r?\n|[；;]/).map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function editableTextToList(value, limit = 10) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .slice(0, limit);
}

function defaultRefinementRole(asset) {
  return ['composition', 'lighting', 'scene'].includes(asset?.purpose) ? asset.purpose : 'detail';
}

function clampCanvasBox(startBox, deltaX, deltaY, mode, handle, objectType) {
  const minWidth = objectType === 'mask' ? 0.18 : 0.12;
  const minHeight = objectType === 'mask' ? 0.1 : 0.07;
  let left = startBox.x;
  let top = startBox.y;
  let right = startBox.x + startBox.width;
  let bottom = startBox.y + startBox.height;
  if (mode === 'drag') {
    left = Math.max(0, Math.min(1 - startBox.width, left + deltaX));
    top = Math.max(0, Math.min(1 - startBox.height, top + deltaY));
    right = left + startBox.width;
    bottom = top + startBox.height;
  } else {
    if (handle.includes('w')) left = Math.max(0, Math.min(right - minWidth, left + deltaX));
    if (handle.includes('e')) right = Math.min(1, Math.max(left + minWidth, right + deltaX));
    if (handle.includes('n')) top = Math.max(0, Math.min(bottom - minHeight, top + deltaY));
    if (handle.includes('s')) bottom = Math.min(1, Math.max(top + minHeight, bottom + deltaY));
  }
  return {
    x: Number(left.toFixed(5)),
    y: Number(top.toFixed(5)),
    width: Number((right - left).toFixed(5)),
    height: Number((bottom - top).toFixed(5))
  };
}

function localized(item, language, field = 'name') {
  return language === 'zh' ? item?.[`${field}Zh`] : item?.[`${field}En`];
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(value, fallback) {
  const encoded = String(value || '').match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { return fallback; }
  }
  return fallback;
}

function DeliveryStatusBadge({ document, t }) {
  if (!document?.sourceGenerationId) return <span className="missing"><CircleAlert size={12} /> {t.missingSource}</span>;
  if (!document.validation?.checkedAt) return <span className="unchecked"><ClipboardCheck size={12} /> {t.unchecked}</span>;
  if (document.validation.ready) return <span className="ready"><CheckCircle2 size={12} /> {t.ready}</span>;
  return <span className="issues"><TriangleAlert size={12} /> {t.hasIssues}</span>;
}

function deliveryBoxStyle(box) {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`
  };
}

function DeliveryObjectHandles({ objectType, onBeginInteraction, t }) {
  return ['nw', 'ne', 'sw', 'se'].map((handle) => (
    <button
      className={`deliveryObjectResizeHandle ${handle}`}
      type="button"
      aria-label={`${t.resizeObject}: ${handle}`}
      title={t.resizeObject}
      onPointerDown={(event) => onBeginInteraction(event, objectType, 'resize', handle)}
      key={handle}
    />
  ));
}

function DeliveryObjectRemoveButton({ objectType, onRemoveObject, t }) {
  return (
    <button
      className="deliveryObjectRemoveButton"
      type="button"
      aria-label={t.removeObject}
      title={t.removeObject}
      onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemoveObject(objectType); }}
    >
      <X size={12} />
    </button>
  );
}

function GeneralPreviewPanel({ document, editable, selectedObject, onSelectObject, onBeginInteraction, onRemoveObject, t }) {
  const content = document.content || {};
  const showMask = document.advanced?.showMask == null ? document.advanced?.showText !== false : document.advanced.showMask !== false;
  const showText = document.advanced?.showText !== false;
  if (!showMask && !showText) return null;
  const geometry = resolveDeliveryOverlayBoxes(document);
  const copyScale = getDeliveryTextScale(content, geometry.textBox);
  const centered = ['top-center', 'bottom-center'].includes(document.layoutId);
  return (
    <>
      {showMask ? <div
        className={`deliveryCanvasObject deliveryMaskObject ${editable ? 'editable' : ''} ${selectedObject === 'mask' ? 'selected' : ''}`}
        style={{ ...deliveryBoxStyle(geometry.maskBox), opacity: geometry.maskOpacity }}
        onPointerDown={editable ? (event) => onBeginInteraction(event, 'mask', 'drag') : undefined}
        onClick={editable ? () => onSelectObject('mask') : undefined}
      >
        {editable && selectedObject === 'mask' ? <><DeliveryObjectRemoveButton objectType="mask" onRemoveObject={onRemoveObject} t={t} /><DeliveryObjectHandles objectType="mask" onBeginInteraction={onBeginInteraction} t={t} /></> : null}
      </div> : null}
      {showText ? <div
        className={`deliveryCanvasObject deliveryTextObject ${centered ? 'centered' : ''} ${editable ? 'editable' : ''} ${selectedObject === 'text' ? 'selected' : ''}`}
        style={{ ...deliveryBoxStyle(geometry.textBox), opacity: geometry.textOpacity, '--delivery-copy-scale': copyScale }}
        onPointerDown={editable ? (event) => onBeginInteraction(event, 'text', 'drag') : undefined}
        onClick={editable ? () => onSelectObject('text') : undefined}
      >
        <div className="deliveryTextContent">
          {content.badge ? <em>{content.badge}</em> : null}
          {content.headline ? <strong>{content.headline}</strong> : null}
          {content.subtitle ? <span>{content.subtitle}</span> : null}
          {content.bullets?.length ? <ul>{content.bullets.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul> : null}
          {content.price ? <b>{content.price}</b> : null}
        </div>
        {editable && selectedObject === 'text' ? <><DeliveryObjectRemoveButton objectType="text" onRemoveObject={onRemoveObject} t={t} /><DeliveryObjectHandles objectType="text" onBeginInteraction={onBeginInteraction} t={t} /></> : null}
      </div> : null}
    </>
  );
}

function DeliveryPreviewOverlay({ document, logoUrl, t, editable = false, selectedObject = 'text', onSelectObject, onBeginInteraction, onRemoveObject }) {
  const content = document.content || {};
  return (
    <div className={`deliveryPreviewOverlay type-${document.documentType} ${editable ? 'editable' : ''}`}>
      {document.advanced?.showSafeArea ? <div className="deliverySafeArea"><span>{t.safeAreaLabel}</span></div> : null}
      {logoUrl ? <img className="deliveryPreviewLogo" src={logoUrl} alt="Logo" /> : null}
      {document.documentType !== 'comparison' ? <GeneralPreviewPanel document={document} editable={editable} selectedObject={selectedObject} onSelectObject={onSelectObject} onBeginInteraction={onBeginInteraction} onRemoveObject={onRemoveObject} t={t} /> : null}
      {document.documentType === 'dimensions' ? (
        <div className="deliveryDimensionPreview">
          {content.dimensions?.width || content.dimensions?.depth ? <span className="horizontal">{content.dimensions.width || content.dimensions.depth}</span> : null}
          {content.dimensions?.height ? <span className="vertical">{content.dimensions.height}</span> : null}
          {content.dimensions?.weight ? <span className="weight">{content.dimensions.weight}</span> : null}
        </div>
      ) : null}
      {document.documentType === 'package-contents' ? <div className="deliveryChipPreview">{content.packageItems?.slice(0, 8).map((item) => <span key={item}>{item}</span>)}</div> : null}
      {document.documentType === 'variants' ? <div className="deliveryChipPreview">{content.variants?.slice(0, 8).map((item) => <span key={item}>{item}</span>)}</div> : null}
      {document.documentType === 'comparison' ? (
        <div className="deliveryComparisonPreview">
          <div className="leftRegion"><small>{t.comparisonLeftRegion}</small><strong>{content.comparison?.leftTitle}</strong>{content.comparison?.leftItems?.map((item, index) => <span key={`left-${index}`}>{item}</span>)}</div>
          <div className="rightRegion"><small>{t.comparisonRightRegion}</small><strong>{content.comparison?.rightTitle}</strong>{content.comparison?.rightItems?.map((item, index) => <span key={`right-${index}`}>{item}</span>)}</div>
        </div>
      ) : null}
      {['storyboard', 'how-to'].includes(document.documentType) ? (
        <div className="deliveryStepsPreview">{content.steps?.slice(0, 6).map((item, index) => <span key={`${index}-${item}`}><b>{index + 1}</b>{item}</span>)}</div>
      ) : null}
    </div>
  );
}

function DeliveryArtboard({ document, generation, slotName, logoUrl, t, editable = false, selectedObject, onSelectObject, onBeginInteraction, onRemoveObject, onOpenLarge }) {
  const theme = getDeliveryTheme(document.themeId);
  return (
    <div
      className={`deliveryArtboard theme-${document.themeId} ${editable ? 'editable' : ''}`}
      style={{
        aspectRatio: `${document.targetWidth} / ${document.targetHeight}`,
        '--delivery-aspect': document.targetWidth / document.targetHeight,
        '--delivery-foreground': theme.foreground,
        '--delivery-muted': theme.muted,
        '--delivery-accent': theme.accent,
        '--delivery-panel': theme.panel
      }}
      title={onOpenLarge ? t.doubleClickPreview : undefined}
      onDoubleClick={onOpenLarge}
    >
      {generation?.imageUrl ? <img className={document.advanced?.imageFit === 'contain' ? 'contain' : 'cover'} src={generation.imageUrl} alt={slotName} /> : <div className="deliveryMissingArt"><FileImage size={34} /><span>{t.missingSource}</span></div>}
      <DeliveryPreviewOverlay
        document={document}
        logoUrl={logoUrl}
        t={t}
        editable={editable}
        selectedObject={selectedObject}
        onSelectObject={onSelectObject}
        onBeginInteraction={onBeginInteraction}
        onRemoveObject={onRemoveObject}
      />
    </div>
  );
}

function DeliveryArtboardLightbox({
  document,
  generation,
  slotName,
  logoUrl,
  language,
  t,
  project,
  assets,
  selectedObject,
  selectedObjectOpacity,
  canEditTextObjects,
  maskVisible,
  textVisible,
  dirty,
  status,
  onSelectObject,
  onBeginInteraction,
  onRemoveObject,
  onUpdateOpacity,
  onResetObject,
  onSave,
  refinementPricing,
  refinementPricingLoading,
  onRefine,
  onUploadAssets,
  onClose
}) {
  const [refinementPrompt, setRefinementPrompt] = useState('');
  const [targetArea, setTargetArea] = useState('auto');
  const [referenceInputs, setReferenceInputs] = useState([]);
  const [uploadedAssets, setUploadedAssets] = useState([]);
  const [refinementState, setRefinementState] = useState('idle');
  const [refinementMessage, setRefinementMessage] = useState('');
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [canvasPanning, setCanvasPanning] = useState(false);
  const fileInputRef = useRef(null);
  const largeCanvasRef = useRef(null);
  const largeCanvasContentRef = useRef(null);
  const largeCanvasPanRef = useRef(null);
  const availableAssets = useMemo(() => {
    const byId = new Map([...(assets || []), ...uploadedAssets].map((asset) => [asset.id, asset]));
    byId.delete(project.masterAssetId);
    return [...byId.values()];
  }, [assets, uploadedAssets, project.masterAssetId]);
  const selectedReferenceAssets = referenceInputs
    .map((input) => ({ ...input, asset: availableAssets.find((asset) => asset.id === input.assetId) }))
    .filter((input) => input.asset);
  const selectedLayerVisible = selectedObject === 'mask' ? maskVisible : textVisible;

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    globalThis.addEventListener?.('keydown', handleKeyDown);
    return () => globalThis.removeEventListener?.('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const keepCanvasInBounds = () => setCanvasOffset((current) => boundedCanvasOffset(current, canvasZoom));
    globalThis.addEventListener?.('resize', keepCanvasInBounds);
    return () => globalThis.removeEventListener?.('resize', keepCanvasInBounds);
  }, [canvasZoom]);

  function boundedCanvasOffset(nextOffset, zoomValue = canvasZoom) {
    const viewport = largeCanvasRef.current;
    const content = largeCanvasContentRef.current;
    if (!viewport || !content || zoomValue <= 1) return { x: 0, y: 0 };
    return clampImagePanOffset(nextOffset, {
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
      contentWidth: content.offsetWidth,
      contentHeight: content.offsetHeight,
      zoom: zoomValue
    });
  }

  function setCanvasZoomValue(nextValue) {
    const nextZoom = Math.max(0.5, Math.min(4, Number(nextValue) || 1));
    setCanvasZoom(nextZoom);
    setCanvasOffset((current) => boundedCanvasOffset(current, nextZoom));
  }

  function beginCanvasPan(event) {
    if (canvasZoom <= 1 || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    largeCanvasPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: canvasOffset.x,
      originY: canvasOffset.y
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setCanvasPanning(true);
  }

  function moveCanvasPan(event) {
    const pan = largeCanvasPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasOffset(boundedCanvasOffset({
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY
    }));
  }

  function endCanvasPan(event) {
    const pan = largeCanvasPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.stopPropagation();
    largeCanvasPanRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setCanvasPanning(false);
  }

  function toggleReferenceAsset(asset) {
    setReferenceInputs((current) => {
      if (current.some((input) => input.assetId === asset.id)) return current.filter((input) => input.assetId !== asset.id);
      if (current.length >= 4) return current;
      return [...current, { assetId: asset.id, role: defaultRefinementRole(asset) }];
    });
    setRefinementMessage('');
  }

  function updateReferenceRole(assetId, role) {
    setReferenceInputs((current) => current.map((input) => input.assetId === assetId ? { ...input, role } : input));
  }

  async function uploadReferenceAssets(event) {
    const files = [...(event.target.files || [])].slice(0, Math.max(0, 4 - referenceInputs.length));
    event.target.value = '';
    if (!files.length || !onUploadAssets) return;
    setRefinementState('uploading');
    setRefinementMessage('');
    const uploaded = await onUploadAssets(files);
    if (!uploaded?.length) {
      setRefinementState('idle');
      setRefinementMessage(t.refinementUploadFailed);
      return;
    }
    setUploadedAssets((current) => [...current, ...uploaded]);
    setReferenceInputs((current) => {
      const next = [...current];
      for (const asset of uploaded) {
        if (next.length >= 4 || next.some((input) => input.assetId === asset.id)) break;
        next.push({ assetId: asset.id, role: 'detail' });
      }
      return next;
    });
    setRefinementState('idle');
  }

  async function createRefinement() {
    if (!generation?.id || !refinementPrompt.trim() || !onRefine) return;
    setRefinementState('generating');
    setRefinementMessage('');
    const success = await onRefine({
      baseGenerationId: generation.id,
      adjustment: refinementPrompt.trim(),
      targetArea,
      referenceInputs
    });
    setRefinementState('idle');
    if (success) {
      setRefinementPrompt('');
      setRefinementMessage(t.refinementSuccess);
    } else {
      setRefinementMessage(t.refinementFailed);
    }
  }

  const busy = ['uploading', 'generating'].includes(refinementState) || ['saving', 'preparing'].includes(status);
  return (
    <div className="deliveryArtboardLightbox" role="dialog" aria-modal="true" aria-label={t.largePreview} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="deliveryArtboardLightboxPanel">
        <header>
          <div><span>{t.largePreview}</span><strong>{slotName}</strong><small>{t.dragToBrowse}</small></div>
          <div className="deliveryArtboardLightboxZoomControls">
            <button type="button" aria-label={t.zoomOut} title={t.zoomOut} disabled={canvasZoom <= 0.5} onClick={() => setCanvasZoomValue(canvasZoom - 0.25)}><Minus size={16} /></button>
            <output>{Math.round(canvasZoom * 100)}%</output>
            <button type="button" aria-label={t.zoomIn} title={t.zoomIn} disabled={canvasZoom >= 4} onClick={() => setCanvasZoomValue(canvasZoom + 0.25)}><Plus size={16} /></button>
            <button type="button" aria-label={t.resetZoom} title={t.resetZoom} disabled={canvasZoom === 1 && canvasOffset.x === 0 && canvasOffset.y === 0} onClick={() => setCanvasZoomValue(1)}><RotateCcw size={16} /></button>
            <button type="button" aria-label={t.closeLargePreview} title={t.closeLargePreview} onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        <div className="deliveryArtboardLightboxWorkspace">
          <div className="deliveryArtboardLightboxCanvasColumn">
            <div
              ref={largeCanvasRef}
              className={`deliveryArtboardLightboxCanvas ${canvasZoom > 1 ? 'zoomed' : ''} ${canvasPanning ? 'panning' : ''}`}
              onWheel={(event) => {
                event.preventDefault();
                setCanvasZoomValue(canvasZoom + (event.deltaY < 0 ? 0.25 : -0.25));
              }}
              onDoubleClick={() => setCanvasZoomValue(canvasZoom === 1 ? 2 : 1)}
              onPointerDownCapture={beginCanvasPan}
              onPointerMove={moveCanvasPan}
              onPointerUp={endCanvasPan}
              onPointerCancel={endCanvasPan}
            >
              <div
                ref={largeCanvasContentRef}
                className={canvasPanning ? 'deliveryArtboardLightboxPanLayer panning' : 'deliveryArtboardLightboxPanLayer'}
                style={{
                  '--delivery-lightbox-aspect': document.targetWidth / document.targetHeight,
                  transform: `translate3d(${canvasOffset.x}px, ${canvasOffset.y}px, 0) scale(${canvasZoom})`
                }}
              >
                <DeliveryArtboard
                  document={document}
                  generation={generation}
                  slotName={slotName}
                  logoUrl={logoUrl}
                  t={t}
                  editable={canEditTextObjects}
                  selectedObject={selectedObject}
                  onSelectObject={onSelectObject}
                  onBeginInteraction={onBeginInteraction}
                  onRemoveObject={onRemoveObject}
                />
              </div>
            </div>
            {canEditTextObjects ? (
              <div className="deliveryObjectToolbar deliveryLightboxObjectToolbar">
                <div>
                  <button className={`${selectedObject === 'mask' && maskVisible ? 'active' : ''} ${!maskVisible ? 'hiddenLayer' : ''}`} type="button" title={!maskVisible ? t.restoreObject : undefined} onClick={() => onSelectObject('mask')}>{maskVisible ? <Layers3 size={13} /> : <Plus size={13} />}{t.maskObject}</button>
                  <button className={`${selectedObject === 'text' && textVisible ? 'active' : ''} ${!textVisible ? 'hiddenLayer' : ''}`} type="button" title={!textVisible ? t.restoreObject : undefined} onClick={() => onSelectObject('text')}>{textVisible ? <Type size={13} /> : <Plus size={13} />}{t.textObject}</button>
                </div>
                <label>
                  <span>{t.objectOpacity}</span>
                  <input type="range" min="0.1" max="1" step="0.05" value={selectedObjectOpacity} disabled={!selectedLayerVisible} onInput={(event) => onUpdateOpacity(event.currentTarget.value)} onChange={(event) => onUpdateOpacity(event.currentTarget.value)} />
                  <em>{Math.round(selectedObjectOpacity * 100)}%</em>
                </label>
                <button className="reset" type="button" onClick={() => onResetObject(selectedObject)} disabled={!selectedLayerVisible}><RotateCcw size={13} />{t.resetObject}</button>
                <button className="save" type="button" onClick={() => onSave()} disabled={!dirty || status === 'saving'}>{status === 'saving' ? <LoaderCircle className="spin" size={13} /> : <Save size={13} />}{t.saveLayerChanges}</button>
              </div>
            ) : null}
          </div>
          <aside className="deliveryRefinementPanel">
            <header><span><WandSparkles size={16} /></span><div><strong>{t.refineImage}</strong><small>{t.refinementPreservesOriginal}</small></div></header>
            <label className="deliveryField">
              <span>{t.refineArea}</span>
              <select value={targetArea} onChange={(event) => setTargetArea(event.target.value)} disabled={busy}>
                {Object.entries(t.refineAreas).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label className="deliveryField">
              <span>{t.refinePrompt}</span>
              <textarea value={refinementPrompt} onChange={(event) => { setRefinementPrompt(event.target.value); setRefinementMessage(''); }} placeholder={t.refinePromptPlaceholder} disabled={busy} />
            </label>
            <div className="deliveryRefinementAssetsHeader"><div><strong>{t.refinementAssets}</strong><small>{t.refinementAssetsHint}</small></div><em>{referenceInputs.length}/4</em></div>
            {selectedReferenceAssets.length ? (
              <div className="deliverySelectedRefinementAssets">
                {selectedReferenceAssets.map(({ assetId, role, asset }) => (
                  <article key={assetId}>
                    <img src={asset.imageUrl} alt={asset.fileName} />
                    <div><strong title={asset.fileName}>{asset.fileName}</strong><select value={role} onChange={(event) => updateReferenceRole(assetId, event.target.value)} disabled={busy}>{Object.entries(t.refinementRoles).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
                    <button type="button" aria-label={`${t.removeRefinementAsset}: ${asset.fileName}`} title={t.removeRefinementAsset} onClick={() => toggleReferenceAsset(asset)} disabled={busy}><X size={13} /></button>
                  </article>
                ))}
              </div>
            ) : null}
            <details className="deliveryRefinementAssetPicker">
              <summary><span><ImagePlus size={14} />{t.chooseProjectAssets}</span><ChevronDown size={14} /></summary>
              {availableAssets.length ? <div>{availableAssets.map((asset) => { const selected = referenceInputs.some((input) => input.assetId === asset.id); return <button className={selected ? 'active' : ''} type="button" onClick={() => toggleReferenceAsset(asset)} disabled={busy || (!selected && referenceInputs.length >= 4)} key={asset.id}><img src={asset.imageUrl} alt="" /><span>{asset.fileName}</span>{selected ? <Check size={12} /> : null}</button>; })}</div> : <p>{t.noRefinementAssets}</p>}
            </details>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={uploadReferenceAssets} />
            <button className="deliveryUploadRefinementAsset" type="button" onClick={() => fileInputRef.current?.click()} disabled={busy || referenceInputs.length >= 4 || !onUploadAssets}><Upload size={14} />{refinementState === 'uploading' ? t.uploadingRefinementAsset : t.uploadRefinementAsset}</button>
            <button className="deliveryCreateRefinement" type="button" onClick={createRefinement} disabled={busy || refinementPricingLoading || !refinementPricing || !onRefine || !generation?.id || !refinementPrompt.trim()}>
              {refinementState === 'generating' ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />}
              {refinementState === 'generating' ? t.refiningImage : <>{t.createRefinementLabel} · <ImageCreditPrice pricing={refinementPricing} language={language} compact /></>}
            </button>
            {refinementMessage ? <p className={refinementMessage === t.refinementSuccess ? 'success' : 'error'}>{refinementMessage}</p> : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function ValidationPanel({ document, language, t }) {
  const validation = document?.validation;
  if (!validation?.rules?.length) return <p className="deliveryNoCheck">{t.noCheck}</p>;
  return (
    <div className="deliveryValidationList">
      {validation.rules.map((rule) => (
        <div className={rule.status} key={rule.id}>
          {rule.status === 'passed' ? <CheckCircle2 size={15} /> : rule.status === 'warning' ? <TriangleAlert size={15} /> : <CircleAlert size={15} />}
          <span><strong>{language === 'zh' ? rule.titleZh : rule.titleEn}</strong><small>{language === 'zh' ? rule.detailZh : rule.detailEn}</small></span>
          <em>{rule.status === 'passed' ? t.passed : rule.status === 'warning' ? t.warning : t.failed}</em>
        </div>
      ))}
    </div>
  );
}

export default function EcommerceDeliveryCenter({
  language,
  project,
  platform,
  slots,
  outputs,
  generations,
  assets,
  reuseEnabled = false,
  onProjectCreated,
  onRefineImage,
  onUploadRefinementAssets
}) {
  const t = copy[language] || copy.zh;
  const [documents, setDocuments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState('editor');
  const [activeWorkflowStage, setActiveWorkflowStage] = useState(0);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [includeDetailPage, setIncludeDetailPage] = useState(true);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [largePreviewOpen, setLargePreviewOpen] = useState(false);
  const [selectedCanvasObject, setSelectedCanvasObject] = useState('text');
  const [targetPlatformId, setTargetPlatformId] = useState(() => ECOMMERCE_PLATFORMS.find((item) => item.id !== project.platformId)?.id || project.platformId);
  const [templateName, setTemplateName] = useState('');
  const [reuseOpen, setReuseOpen] = useState(false);
  const canvasInteractionRef = useRef(null);

  const slotById = useMemo(() => new Map((slots || []).map((slot) => [slot.id, slot])), [slots]);
  const outputBySlot = useMemo(() => new Map((outputs || []).map((output) => [output.slotId, output])), [outputs]);
  const generationById = useMemo(() => new Map((generations || []).map((generation) => [generation.id, generation])), [generations]);
  const logoAssets = useMemo(() => (assets || []).filter((asset) => asset.assetType === 'logo'), [assets]);
  const includedDocuments = useMemo(() => documents.filter((document) => document.includeInExport), [documents]);
  const removedDocuments = useMemo(() => documents.filter((document) => !document.includeInExport), [documents]);
  const missingIncludedDocuments = useMemo(() => includedDocuments.filter((document) => !document.sourceGenerationId), [includedDocuments]);
  const selectedDocument = includedDocuments.find((document) => document.id === selectedDocumentId) || includedDocuments[0] || null;
  const selectedSlot = selectedDocument ? slotById.get(selectedDocument.slotId) : null;
  const selectedGeneration = selectedDocument ? generationById.get(selectedDocument.sourceGenerationId) : null;
  const selectedRefinementSize = selectedSlot
    ? resolveEcommerceRefinementSize(selectedGeneration, selectedSlot)
    : '1024x1024';
  const {
    pricing: selectedRefinementPricing,
    loading: selectedRefinementPricingLoading
  } = useServerImagePricing({ size: selectedRefinementSize, quality: 'medium', providerId: project.imageProviderId });
  const selectedOutput = selectedDocument ? outputBySlot.get(selectedDocument.slotId) : null;
  const selectedLogo = selectedDocument?.content?.logoAssetId
    ? assets.find((asset) => asset.id === selectedDocument.content.logoAssetId)
    : null;
  const selectedOverlayGeometry = selectedDocument ? resolveDeliveryOverlayBoxes(selectedDocument) : null;
  const selectedObjectOpacity = selectedOverlayGeometry
    ? selectedCanvasObject === 'mask' ? selectedOverlayGeometry.maskOpacity : selectedOverlayGeometry.textOpacity
    : 1;
  const selectedMaskVisible = Boolean(selectedDocument && (selectedDocument.advanced?.showMask == null ? selectedDocument.advanced?.showText !== false : selectedDocument.advanced.showMask !== false));
  const selectedTextVisible = Boolean(selectedDocument && selectedDocument.advanced?.showText !== false);
  const selectedObjectVisible = selectedCanvasObject === 'mask' ? selectedMaskVisible : selectedTextVisible;
  const canEditTextObjects = Boolean(selectedDocument && selectedDocument.documentType !== 'comparison');
  const readyCount = includedDocuments.filter((document) => document.validation?.ready).length;
  const exportCount = includedDocuments.length;
  const hasOutputs = (outputs || []).some((output) => output.selectedGenerationId);
  const workflowStep = getDeliveryWorkflowStep(documents, { dirty });
  const exportAvailability = getDeliveryExportAvailability(documents, { dirty });
  const canExportDelivery = exportAvailability.canExport;

  useEffect(() => {
    function moveCanvasObject(event) {
      const interaction = canvasInteractionRef.current;
      if (!interaction || (interaction.pointerId != null && event.pointerId !== interaction.pointerId)) return;
      event.preventDefault();
      const nextBox = clampCanvasBox(
        interaction.startBox,
        (event.clientX - interaction.startX) / interaction.rect.width,
        (event.clientY - interaction.startY) / interaction.rect.height,
        interaction.mode,
        interaction.handle,
        interaction.objectType
      );
      const field = interaction.objectType === 'mask' ? 'maskBox' : 'textBox';
      setDocuments((current) => current.map((document) => document.id === interaction.documentId
        ? { ...document, advanced: { ...document.advanced, [field]: nextBox } }
        : document));
      setDirty(true);
      setMessage('');
    }
    function endCanvasObject(event) {
      const interaction = canvasInteractionRef.current;
      if (!interaction || (interaction.pointerId != null && event.pointerId !== interaction.pointerId)) return;
      canvasInteractionRef.current = null;
      globalThis.document?.body.classList.remove('deliveryObjectDragging');
    }
    globalThis.addEventListener?.('pointermove', moveCanvasObject, { passive: false });
    globalThis.addEventListener?.('pointerup', endCanvasObject);
    globalThis.addEventListener?.('pointercancel', endCanvasObject);
    return () => {
      globalThis.removeEventListener?.('pointermove', moveCanvasObject);
      globalThis.removeEventListener?.('pointerup', endCanvasObject);
      globalThis.removeEventListener?.('pointercancel', endCanvasObject);
      globalThis.document?.body.classList.remove('deliveryObjectDragging');
    };
  }, []);

  async function loadWorkspace() {
    setStatus('loading');
    try {
      const [documentResponse, templateResponse] = await Promise.all([
        fetch(`/api/ecommerce/delivery-documents?projectId=${encodeURIComponent(project.id)}`),
        fetch('/api/ecommerce/user-templates')
      ]);
      const [documentPayload, templatePayload] = await Promise.all([
        documentResponse.json().catch(() => ({})),
        templateResponse.json().catch(() => ({}))
      ]);
      if (!documentResponse.ok || !documentPayload?.ok) throw new Error(documentPayload.error || 'LOAD_FAILED');
      let nextDocuments = documentPayload.documents || [];
      if (!nextDocuments.length) nextDocuments = await prepareWorkspace(false);
      else setDocuments(nextDocuments);
      setTemplates(templateResponse.ok && templatePayload?.ok ? templatePayload.templates || [] : []);
      setSelectedDocumentId((current) => {
        const available = nextDocuments.filter((document) => document.includeInExport);
        return available.some((item) => item.id === current) ? current : available[0]?.id || '';
      });
      setActiveTab('editor');
      setActiveWorkflowStage(Math.min(getDeliveryWorkflowStep(nextDocuments), 2));
      setStatus('idle');
    } catch {
      setStatus('error');
      setMessage(t.actionFailed);
    }
  }

  useEffect(() => {
    setDocuments([]);
    setSelectedDocumentId('');
    setActiveTab('editor');
    setActiveWorkflowStage(0);
    setTargetPlatformId(ECOMMERCE_PLATFORMS.find((item) => item.id !== project.platformId)?.id || project.platformId);
    setTemplateName('');
    setReuseOpen(false);
    setDirty(false);
    loadWorkspace();
  }, [project.id]);

  useEffect(() => {
    setLargePreviewOpen(false);
    setSelectedCanvasObject('text');
    canvasInteractionRef.current = null;
    globalThis.document?.body.classList.remove('deliveryObjectDragging');
  }, [selectedDocumentId]);

  useEffect(() => {
    if (!largePreviewOpen) return undefined;
    function handleDeleteObject(event) {
      if (!['Delete', 'Backspace'].includes(event.key)) return;
      const target = event.target;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
      const visible = selectedCanvasObject === 'mask' ? selectedMaskVisible : selectedTextVisible;
      if (!visible) return;
      event.preventDefault();
      removeCanvasObject(selectedCanvasObject);
    }
    globalThis.addEventListener?.('keydown', handleDeleteObject);
    return () => globalThis.removeEventListener?.('keydown', handleDeleteObject);
  }, [largePreviewOpen, selectedCanvasObject, selectedMaskVisible, selectedTextVisible, selectedDocumentId]);

  async function prepareWorkspace(showMessage = true) {
    setStatus('preparing');
    const response = await fetch('/api/ecommerce/delivery-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'prepare', projectId: project.id, language })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      setStatus('error');
      if (showMessage) setMessage(t.actionFailed);
      throw new Error(payload.error || 'PREPARE_FAILED');
    }
    const nextDocuments = payload.documents || [];
    setDocuments(nextDocuments);
    setSelectedDocumentId((current) => {
      const available = nextDocuments.filter((document) => document.includeInExport);
      return available.some((item) => item.id === current) ? current : available[0]?.id || '';
    });
    setDirty(false);
    setStatus('idle');
    if (showMessage) setMessage(t.prepareSuccess);
    return nextDocuments;
  }

  function updateSelectedDocument(patch) {
    if (!selectedDocument) return;
    setActiveWorkflowStage(2);
    setActiveTab('editor');
    setDocuments((current) => current.map((document) => document.id === selectedDocument.id ? { ...document, ...patch } : document));
    setDirty(true);
    setMessage('');
  }

  async function selectDocument(documentId) {
    if (documentId === selectedDocument?.id) return;
    if (dirty) {
      const saved = await saveDocument({ silent: true });
      if (!saved) return;
    }
    setSelectedDocumentId(documentId);
    setActiveWorkflowStage(Math.min(workflowStep, 2));
    setActiveTab('editor');
    setDirty(false);
    setMessage('');
  }

  function updateContent(field, value) {
    updateSelectedDocument({ content: { ...selectedDocument.content, [field]: value } });
  }

  function updateNestedContent(group, field, value) {
    updateSelectedDocument({
      content: {
        ...selectedDocument.content,
        [group]: { ...(selectedDocument.content?.[group] || {}), [field]: value }
      }
    });
  }

  function updateAdvanced(field, value) {
    updateSelectedDocument({ advanced: { ...selectedDocument.advanced, [field]: value } });
  }

  function updateAdvancedFields(patch) {
    updateSelectedDocument({ advanced: { ...selectedDocument.advanced, ...patch } });
  }

  function selectOrRestoreCanvasObject(objectType) {
    const visible = objectType === 'mask' ? selectedMaskVisible : selectedTextVisible;
    if (!visible) updateAdvanced(objectType === 'mask' ? 'showMask' : 'showText', true);
    setSelectedCanvasObject(objectType);
  }

  function removeCanvasObject(objectType) {
    if (!selectedDocument || !canEditTextObjects) return;
    updateAdvanced(objectType === 'mask' ? 'showMask' : 'showText', false);
    const otherObject = objectType === 'mask' ? 'text' : 'mask';
    const otherVisible = otherObject === 'mask' ? selectedMaskVisible : selectedTextVisible;
    if (otherVisible) setSelectedCanvasObject(otherObject);
  }

  function beginCanvasObjectInteraction(event, objectType, mode, handle = '') {
    if (!selectedDocument) return;
    const artboard = event.currentTarget.closest('.deliveryArtboard');
    if (!artboard) return;
    const rect = artboard.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveWorkflowStage(2);
    setActiveTab('editor');
    const geometry = resolveDeliveryOverlayBoxes(selectedDocument);
    canvasInteractionRef.current = {
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      documentId: selectedDocument.id,
      objectType,
      mode,
      handle,
      rect,
      startX: event.clientX,
      startY: event.clientY,
      startBox: objectType === 'mask' ? geometry.maskBox : geometry.textBox
    };
    setSelectedCanvasObject(objectType);
    globalThis.document?.body.classList.add('deliveryObjectDragging');
  }

  function resetCanvasObject(objectType) {
    updateAdvanced(objectType === 'mask' ? 'maskBox' : 'textBox', null);
  }

  function updateSelectedObjectOpacity(value) {
    const opacity = Number(value);
    updateAdvancedFields(selectedCanvasObject === 'mask'
      ? { maskOpacity: opacity, overlayOpacity: opacity }
      : { textOpacity: opacity });
  }

  function changeLayout(layoutId) {
    updateSelectedDocument({
      layoutId,
      advanced: { ...selectedDocument.advanced, maskBox: null, textBox: null }
    });
  }

  function restoreRecommended() {
    if (!selectedSlot) return;
    const draft = createDeliveryDocumentDraft({
      project,
      slot: selectedSlot,
      output: outputBySlot.get(selectedSlot.id),
      language,
      order: selectedDocument.moduleOrder
    });
    updateSelectedDocument({
      documentType: draft.documentType,
      targetWidth: draft.targetWidth,
      targetHeight: draft.targetHeight,
      outputFormat: draft.outputFormat,
      themeId: draft.themeId,
      layoutId: draft.layoutId,
      safeArea: draft.safeArea,
      content: draft.content,
      advanced: draft.advanced,
      validation: {}
    });
  }

  function changeDocumentType(documentType) {
    const defaults = getDeliveryDefaultsForType(documentType);
    updateSelectedDocument({
      documentType,
      themeId: defaults.themeId,
      layoutId: defaults.layoutId,
      advanced: { ...selectedDocument.advanced, showText: defaults.showText, showMask: defaults.showText, maskBox: null, textBox: null },
      validation: {}
    });
  }

  async function saveDocument({ silent = false } = {}) {
    if (!selectedDocument) return null;
    setStatus('saving');
    try {
      const response = await fetch('/api/ecommerce/delivery-documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, documentId: selectedDocument.id, document: selectedDocument })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.document) throw new Error(payload.error || 'SAVE_FAILED');
      setDocuments((current) => current.map((document) => document.id === payload.document.id ? payload.document : document));
      setDirty(false);
      setStatus('idle');
      if (!silent) setMessage(t.saveSuccess);
      return payload.document;
    } catch {
      setStatus('error');
      setMessage(t.actionFailed);
      return null;
    }
  }

  async function refineSelectedImage(request) {
    if (!selectedSlot || !selectedGeneration || !onRefineImage || selectedOutput?.locked) return false;
    if (dirty) {
      const saved = await saveDocument({ silent: true });
      if (!saved) return false;
    }
    try {
      const success = await onRefineImage(selectedSlot.id, request);
      if (!success) return false;
      await prepareWorkspace(false);
      return true;
    } catch {
      return false;
    }
  }

  function openSinglePageRefinement() {
    if (!selectedDocument?.sourceGenerationId) return;
    setActiveWorkflowStage(2);
    setActiveTab('editor');
    setLargePreviewOpen(false);
  }

  function openDeliveryExport() {
    if (!canExportDelivery) return;
    setActiveWorkflowStage(3);
    setLargePreviewOpen(false);
    setActiveTab('sequence');
  }

  function switchDeliveryTab(tabId) {
    if (tabId === 'sequence') {
      if (!canExportDelivery) return;
      setActiveWorkflowStage(3);
      setLargePreviewOpen(false);
    } else {
      setActiveWorkflowStage(Math.min(workflowStep, 2));
    }
    setActiveTab(tabId);
  }

  async function reloadDeliveryResults() {
    setActiveWorkflowStage(0);
    await prepareWorkspace(true);
  }

  async function checkDocuments(documentId = '') {
    setActiveWorkflowStage(1);
    if (dirty) {
      const saved = await saveDocument({ silent: true });
      if (!saved) return;
    }
    setStatus('checking');
    try {
      const response = await fetch('/api/ecommerce/delivery-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, documentId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload.error || 'CHECK_FAILED');
      const checkedById = new Map((payload.documents || []).map((document) => [document.id, document]));
      setDocuments((current) => current.map((document) => checkedById.get(document.id) || document));
      setStatus('idle');
      setMessage(t.checkSuccess);
    } catch {
      setStatus('error');
      setMessage(t.actionFailed);
    }
  }

  async function exportDocuments(documentIds = []) {
    if (dirty) {
      setMessage(t.requiresSave);
      return;
    }
    setStatus('exporting');
    try {
      const response = await fetch('/api/ecommerce/delivery-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          documentIds,
          language,
          includeDetailPage: documentIds.length ? false : includeDetailPage
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (payload.error === 'DELIVERY_SOURCE_UNAVAILABLE') setMessage(t.exportBlocked);
        else setMessage(t.actionFailed);
        setStatus('error');
        return;
      }
      const blob = await response.blob();
      triggerDownload(blob, filenameFromDisposition(response.headers.get('content-disposition'), `${project.productName}-delivery.zip`));
      setStatus('idle');
      setMessage('');
    } catch {
      setStatus('error');
      setMessage(t.actionFailed);
    }
  }

  async function exportCurrentDocument() {
    if (!selectedDocument || dirty) {
      setMessage(t.requiresSave);
      return;
    }
    setStatus('exporting');
    try {
      const response = await fetch(`/api/ecommerce/delivery-render?documentId=${encodeURIComponent(selectedDocument.id)}&download=1&language=${language}`);
      if (!response.ok) {
        setMessage(t.actionFailed);
        setStatus('error');
        return;
      }
      const blob = await response.blob();
      triggerDownload(blob, filenameFromDisposition(response.headers.get('content-disposition'), `${project.productName}.${selectedDocument.outputFormat}`));
      setStatus('idle');
      setMessage('');
    } catch {
      setStatus('error');
      setMessage(t.actionFailed);
    }
  }

  async function toggleInclude(documentId, includeInExport) {
    await setDocumentsInclusion([documentId], includeInExport);
  }

  async function setDocumentsInclusion(documentIds, includeInExport, successMessage = '') {
    const ids = [...new Set((documentIds || []).filter(Boolean))];
    if (!ids.length || selectionBusy) return false;
    if (dirty && selectedDocument && ids.includes(selectedDocument.id)) {
      const saved = await saveDocument({ silent: true });
      if (!saved) return false;
    }
    setSelectionBusy(true);
    try {
      const response = await fetch('/api/ecommerce/delivery-documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-inclusion',
          projectId: project.id,
          documentIds: ids,
          includeInExport
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload.error || 'SELECTION_FAILED');
      const nextDocuments = payload.documents || [];
      setDocuments(nextDocuments);
      setSelectedDocumentId((current) => {
        const available = nextDocuments.filter((document) => document.includeInExport);
        return available.some((document) => document.id === current) ? current : available[0]?.id || '';
      });
      setDirty(false);
      setStatus('idle');
      setMessage(successMessage || (includeInExport ? t.restoredSuccess : t.removedSuccess));
      return true;
    } catch {
      setStatus('error');
      setMessage(t.actionFailed);
      return false;
    } finally {
      setSelectionBusy(false);
    }
  }

  async function removeMissingDocuments() {
    await setDocumentsInclusion(missingIncludedDocuments.map((document) => document.id), false, t.missingRemovedSuccess);
  }

  async function moveDocument(documentId, direction) {
    const index = includedDocuments.findIndex((item) => item.id === documentId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= includedDocuments.length) return;
    const included = [...includedDocuments];
    [included[index], included[nextIndex]] = [included[nextIndex], included[index]];
    const next = [...included, ...removedDocuments];
    setDocuments(next.map((document, order) => ({ ...document, moduleOrder: order + 1 })));
    const response = await fetch('/api/ecommerce/delivery-documents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', projectId: project.id, documentIds: next.map((document) => document.id) })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.ok) setDocuments(payload.documents || next);
    else setMessage(t.actionFailed);
  }

  async function createProjectAction(action) {
    setStatus('creating');
    try {
      const response = await fetch('/api/ecommerce/project-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, action, targetPlatformId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.project) throw new Error(payload.error || 'CREATE_FAILED');
      setStatus('idle');
      setMessage(t.projectCreated);
      onProjectCreated?.(payload.project);
    } catch {
      setStatus('error');
      setMessage(t.actionFailed);
    }
  }

  async function saveTemplate() {
    if (!templateName.trim()) return;
    setStatus('saving-template');
    try {
      const response = await fetch('/api/ecommerce/user-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', projectId: project.id, name: templateName.trim() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.template) throw new Error(payload.error || 'TEMPLATE_FAILED');
      setTemplates((current) => [payload.template, ...current]);
      setTemplateName('');
      setStatus('idle');
      setMessage(t.templateSaved);
    } catch {
      setStatus('error');
      setMessage(t.actionFailed);
    }
  }

  async function createFromTemplate(templateId) {
    setStatus('creating');
    try {
      const response = await fetch('/api/ecommerce/user-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-project', templateId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.project) throw new Error(payload.error || 'CREATE_FAILED');
      setStatus('idle');
      setMessage(t.projectCreated);
      onProjectCreated?.(payload.project);
    } catch {
      setStatus('error');
      setMessage(t.actionFailed);
    }
  }

  async function deleteTemplate(templateId) {
    const response = await fetch(`/api/ecommerce/user-templates?id=${encodeURIComponent(templateId)}`, { method: 'DELETE' });
    if (response.ok) setTemplates((current) => current.filter((template) => template.id !== templateId));
  }

  if (!hasOutputs) {
    return (
      <div className="deliveryEmptyState">
        <FileImage size={30} />
        <strong>{t.noOutputTitle}</strong>
        <span>{t.noOutputText}</span>
      </div>
    );
  }

  return (
    <div className="deliveryCenter">
      <header className="deliveryCenterHeader" aria-label={`${localized(platform, language)} · ${includedDocuments.length ? t.summaryReady(readyCount, includedDocuments.length) : t.summaryEmpty}`}>
        <div className="deliveryHeaderActions">
          <button className={activeWorkflowStage === 0 ? 'active' : workflowStep > 0 ? 'completed' : ''} type="button" aria-current={activeWorkflowStage === 0 ? 'step' : undefined} onClick={reloadDeliveryResults} disabled={status === 'preparing' || status === 'loading'}>
            <i>{activeWorkflowStage !== 0 && workflowStep > 0 ? <Check size={11} /> : 1}</i>
            {status === 'preparing' || status === 'loading' ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
            {documents.length ? t.sync : t.prepare}
          </button>
          <button className={activeWorkflowStage === 1 ? 'active' : workflowStep > 1 ? 'completed' : ''} type="button" aria-current={activeWorkflowStage === 1 ? 'step' : undefined} onClick={() => checkDocuments()} disabled={status === 'checking' || !includedDocuments.length}>
            <i>{activeWorkflowStage !== 1 && workflowStep > 1 ? <Check size={11} /> : 2}</i>
            {status === 'checking' ? <LoaderCircle className="spin" size={15} /> : <FileCheck2 size={15} />}
            {status === 'checking' ? t.checking : t.checkAll}
          </button>
          <button className={activeWorkflowStage === 2 ? 'active' : workflowStep > 2 ? 'completed' : ''} type="button" aria-current={activeWorkflowStage === 2 ? 'step' : undefined} onClick={openSinglePageRefinement} disabled={!selectedDocument?.sourceGenerationId}>
            <i>{activeWorkflowStage !== 2 && workflowStep > 2 ? <Check size={11} /> : 3}</i><WandSparkles size={15} />{t.finishAction}
          </button>
          <button className={activeWorkflowStage === 3 ? 'active' : ''} type="button" aria-current={activeWorkflowStage === 3 ? 'step' : undefined} onClick={openDeliveryExport} disabled={!canExportDelivery}>
            <i>4</i><FileArchive size={15} />{t.exportAll}
          </button>
        </div>
      </header>

      <nav className="deliveryTabs" aria-label={t.title}>
        {Object.entries(t.tabs).map(([id, label]) => (
          <button className={activeTab === id ? 'active' : ''} type="button" onClick={() => switchDeliveryTab(id)} disabled={id === 'sequence' && !canExportDelivery} key={id}>
            {id === 'editor' ? <Layers3 size={15} /> : <LayoutTemplate size={15} />}{label}
          </button>
        ))}
      </nav>

      {activeTab === 'editor' ? (
        <div className="deliveryEditorLayout">
          <aside className="deliverySlotRail">
            <header className="deliverySlotRailHeader">
              <div><strong>{t.deliveryList}</strong><small>{t.deliveryListCount(includedDocuments.length)}</small></div>
              {missingIncludedDocuments.length ? <button type="button" onClick={removeMissingDocuments} disabled={selectionBusy}><CircleMinus size={13} />{t.removeMissing}</button> : null}
            </header>
            <div className="deliverySlotItems">
            {includedDocuments.map((document) => {
              const slot = slotById.get(document.slotId);
              const generation = generationById.get(document.sourceGenerationId);
              return (
                <article className={`${document.id === selectedDocument?.id ? 'active' : ''} ${!document.sourceGenerationId ? 'missingSource' : ''}`} key={document.id}>
                  <button className="deliverySlotSelect" type="button" onClick={() => selectDocument(document.id)}>
                    <span>{generation?.imageUrl ? <img src={generation.imageUrl} alt="" /> : <FileImage size={20} />}</span>
                    <div><strong>{localized(slot, language)}</strong><small>{document.targetWidth} × {document.targetHeight}</small><DeliveryStatusBadge document={document} t={t} /></div>
                  </button>
                  <button className="deliverySlotRemove" type="button" aria-label={`${t.removeFromDelivery}: ${localized(slot, language)}`} title={t.removeFromDelivery} onClick={() => setDocumentsInclusion([document.id], false)} disabled={selectionBusy}><CircleMinus size={14} /></button>
                </article>
              );
            })}
            </div>
            {removedDocuments.length ? (
              <details className="deliveryRemovedTray">
                <summary><span>{t.removedItems(removedDocuments.length)}</span><small>{t.removedHint}</small></summary>
                <div>
                  {removedDocuments.map((document) => {
                    const slot = slotById.get(document.slotId);
                    const generation = generationById.get(document.sourceGenerationId);
                    return (
                      <article key={document.id}>
                        <span>{generation?.imageUrl ? <img src={generation.imageUrl} alt="" /> : <FileImage size={17} />}</span>
                        <div><strong>{localized(slot, language)}</strong><small>{document.sourceGenerationId ? t.removedHint : t.missingSource}</small></div>
                        <button type="button" aria-label={`${t.restoreToDelivery}: ${localized(slot, language)}`} title={t.restoreToDelivery} onClick={() => setDocumentsInclusion([document.id], true)} disabled={selectionBusy}><RotateCcw size={13} /></button>
                      </article>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </aside>

          {selectedDocument && selectedSlot ? (
            <>
              <section className="deliveryPreviewStage">
                <header><span>{t.livePreview}</span><strong>{localized(selectedSlot, language)}</strong><em>{t.selectedSource} · V{selectedGeneration?.versionNumber || selectedDocument.moduleOrder}</em></header>
                <div className="deliveryArtboardShell">
                  <DeliveryArtboard
                    document={selectedDocument}
                    generation={selectedGeneration}
                    slotName={localized(selectedSlot, language)}
                    logoUrl={selectedLogo?.imageUrl}
                    t={t}
                    editable={canEditTextObjects}
                    selectedObject={selectedCanvasObject}
                    onSelectObject={selectOrRestoreCanvasObject}
                    onBeginInteraction={beginCanvasObjectInteraction}
                    onRemoveObject={removeCanvasObject}
                    onOpenLarge={() => { setActiveWorkflowStage(2); setActiveTab('editor'); setLargePreviewOpen(true); }}
                  />
                </div>
                <span className="deliveryPreviewHint"><Maximize2 size={12} />{t.doubleClickPreview}</span>
                {canEditTextObjects ? (
                  <div className="deliveryObjectToolbar">
                    <div>
                      <button className={`${selectedCanvasObject === 'mask' && selectedMaskVisible ? 'active' : ''} ${!selectedMaskVisible ? 'hiddenLayer' : ''}`} type="button" title={!selectedMaskVisible ? t.restoreObject : undefined} onClick={() => selectOrRestoreCanvasObject('mask')}>{selectedMaskVisible ? <Layers3 size={13} /> : <Plus size={13} />}{t.maskObject}</button>
                      <button className={`${selectedCanvasObject === 'text' && selectedTextVisible ? 'active' : ''} ${!selectedTextVisible ? 'hiddenLayer' : ''}`} type="button" title={!selectedTextVisible ? t.restoreObject : undefined} onClick={() => selectOrRestoreCanvasObject('text')}>{selectedTextVisible ? <Type size={13} /> : <Plus size={13} />}{t.textObject}</button>
                    </div>
                    <label>
                      <span>{t.objectOpacity}</span>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={selectedObjectOpacity}
                        disabled={!selectedObjectVisible}
                        onInput={(event) => updateSelectedObjectOpacity(event.currentTarget.value)}
                        onChange={(event) => updateSelectedObjectOpacity(event.currentTarget.value)}
                      />
                      <em>{Math.round(selectedObjectOpacity * 100)}%</em>
                    </label>
                    <button className="reset" type="button" onClick={() => resetCanvasObject(selectedCanvasObject)} disabled={!selectedObjectVisible}><RotateCcw size={13} />{t.resetObject}</button>
                  </div>
                ) : null}
                <div className="deliveryPreviewActions">
                  <button type="button" onClick={() => checkDocuments(selectedDocument.id)} disabled={status === 'checking' || !selectedDocument.sourceGenerationId}>
                    {status === 'checking' ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />}{status === 'checking' ? t.checking : t.check}
                  </button>
                  <button type="button" onClick={exportCurrentDocument} disabled={!selectedDocument.sourceGenerationId || status === 'exporting'}>
                    <Download size={14} /> {t.exportCurrent}
                  </button>
                </div>
              </section>

              <aside className="deliveryInspector">
                <header><div><span>{t.editorTitle}</span><strong>{localized(selectedSlot, language)}</strong></div><button type="button" onClick={restoreRecommended}><WandSparkles size={14} /> {t.smartReset}</button></header>
                <label className="deliveryField"><span>{t.type}</span><select value={selectedDocument.documentType} onChange={(event) => changeDocumentType(event.target.value)}>{DELIVERY_TYPES.map((type) => <option value={type.id} key={type.id}>{localized(type, language)}</option>)}</select></label>
                <div className="deliveryFieldGrid">
                  <label className="deliveryField wide"><span>{t.headline}</span><input value={selectedDocument.content.headline || ''} onChange={(event) => updateContent('headline', event.target.value)} /></label>
                  <label className="deliveryField wide"><span>{t.subtitle}</span><input value={selectedDocument.content.subtitle || ''} onChange={(event) => updateContent('subtitle', event.target.value)} /></label>
                  {['benefit', 'campaign', 'video-cover', 'detail-module'].includes(selectedDocument.documentType) ? <><label className="deliveryField"><span>{t.price}</span><input value={selectedDocument.content.price || ''} onChange={(event) => updateContent('price', event.target.value)} /></label><label className="deliveryField"><span>{t.badge}</span><input value={selectedDocument.content.badge || ''} onChange={(event) => updateContent('badge', event.target.value)} /></label></> : null}
                  <label className="deliveryField wide"><span>{t.bullets}</span><textarea value={listToText(selectedDocument.content.bullets)} onChange={(event) => updateContent('bullets', textToList(event.target.value, 5))} /></label>
                  {selectedDocument.documentType === 'dimensions' ? (
                    <div className="deliverySubPanel wide"><strong>{t.dimensions}</strong><div className="deliveryFieldGrid">{['width', 'height', 'depth', 'weight'].map((field) => <label className="deliveryField" key={field}><span>{t[field]}</span><input value={selectedDocument.content.dimensions?.[field] || ''} onChange={(event) => updateNestedContent('dimensions', field, event.target.value)} /></label>)}</div></div>
                  ) : null}
                  {selectedDocument.documentType === 'package-contents' ? <label className="deliveryField wide"><span>{t.packageItems}</span><textarea value={listToText(selectedDocument.content.packageItems)} onChange={(event) => updateContent('packageItems', textToList(event.target.value, 10))} /></label> : null}
                  {selectedDocument.documentType === 'comparison' ? (
                    <div className="deliveryComparisonEditor wide">
                      <div className="leftRegion"><header><span>{t.comparisonLeftRegion}</span><b>50%</b></header><label className="deliveryField"><span>{t.leftTitle}</span><textarea className="compact" rows="2" value={selectedDocument.content.comparison?.leftTitle || ''} onChange={(event) => updateNestedContent('comparison', 'leftTitle', event.target.value)} /></label><label className="deliveryField"><span>{t.comparisonLeft}</span><textarea value={listToText(selectedDocument.content.comparison?.leftItems)} onChange={(event) => updateNestedContent('comparison', 'leftItems', editableTextToList(event.target.value, 6))} /></label></div>
                      <div className="rightRegion"><header><span>{t.comparisonRightRegion}</span><b>50%</b></header><label className="deliveryField"><span>{t.rightTitle}</span><textarea className="compact" rows="2" value={selectedDocument.content.comparison?.rightTitle || ''} onChange={(event) => updateNestedContent('comparison', 'rightTitle', event.target.value)} /></label><label className="deliveryField"><span>{t.comparisonRight}</span><textarea value={listToText(selectedDocument.content.comparison?.rightItems)} onChange={(event) => updateNestedContent('comparison', 'rightItems', editableTextToList(event.target.value, 6))} /></label></div>
                    </div>
                  ) : null}
                  {selectedDocument.documentType === 'variants' ? <label className="deliveryField wide"><span>{t.variants}</span><textarea value={listToText(selectedDocument.content.variants)} onChange={(event) => updateContent('variants', textToList(event.target.value, 10))} /></label> : null}
                  {['storyboard', 'how-to'].includes(selectedDocument.documentType) ? <label className="deliveryField wide"><span>{t.stepsList}</span><textarea value={listToText(selectedDocument.content.steps)} onChange={(event) => updateContent('steps', textToList(event.target.value, 8))} /></label> : null}
                  <label className="deliveryField wide"><span>{t.logo}</span><select value={selectedDocument.content.logoAssetId || ''} onChange={(event) => updateContent('logoAssetId', event.target.value)}><option value="">{t.noLogo}</option>{logoAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.fileName}</option>)}</select></label>
                </div>

                <div className={`deliveryAdvanced ${advancedOpen ? 'open' : ''}`}>
                  <button type="button" onClick={() => setAdvancedOpen((current) => !current)}><span>{t.advanced}</span><ChevronDown size={15} /></button>
                  {advancedOpen ? (
                    <div>
                      <span className="deliveryFieldTitle">{t.theme}</span>
                      <div className="deliveryThemeGrid">{DELIVERY_THEMES.map((theme) => <button className={selectedDocument.themeId === theme.id ? 'active' : ''} type="button" onClick={() => updateSelectedDocument({ themeId: theme.id })} style={{ '--theme-a': theme.panel, '--theme-b': theme.accent }} key={theme.id}><i /><span>{localized(theme, language)}</span></button>)}</div>
                      <div className="deliveryFieldGrid">
                        <label className="deliveryField"><span>{t.layout}</span><select value={selectedDocument.layoutId} onChange={(event) => changeLayout(event.target.value)}>{DELIVERY_LAYOUTS.map((layout) => <option value={layout.id} key={layout.id}>{localized(layout, language)}</option>)}</select></label>
                        <label className="deliveryField"><span>{t.format}</span><select value={selectedDocument.outputFormat} onChange={(event) => updateSelectedDocument({ outputFormat: event.target.value })}>{DELIVERY_FORMATS.map((format) => <option value={format} key={format}>{format.toUpperCase()}</option>)}</select></label>
                        <label className="deliveryField"><span>{t.imageFit}</span><select value={selectedDocument.advanced?.imageFit || 'cover'} onChange={(event) => updateAdvanced('imageFit', event.target.value)}><option value="cover">{t.cover}</option><option value="contain">{t.contain}</option></select></label>
                      </div>
                      <div className="deliverySwitches">
                        <label><input type="checkbox" checked={selectedMaskVisible} onChange={(event) => updateAdvanced('showMask', event.target.checked)} /><span>{t.showMask}</span></label>
                        <label><input type="checkbox" checked={selectedDocument.advanced?.showText !== false} onChange={(event) => updateAdvanced('showText', event.target.checked)} /><span>{t.showText}</span></label>
                        <label><input type="checkbox" checked={selectedDocument.safeArea} onChange={(event) => updateSelectedDocument({ safeArea: event.target.checked })} /><span>{t.safeArea}</span></label>
                        <label><input type="checkbox" checked={Boolean(selectedDocument.advanced?.showSafeArea)} onChange={(event) => updateAdvanced('showSafeArea', event.target.checked)} /><span>{t.showSafeArea}</span></label>
                        <label><input type="checkbox" checked={selectedDocument.includeInExport} onChange={(event) => setDocumentsInclusion([selectedDocument.id], event.target.checked)} disabled={selectionBusy} /><span>{t.includeExport}</span></label>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="deliveryInspectorActions">
                  <button className="primary" type="button" onClick={() => saveDocument()} disabled={!dirty || status === 'saving'}>{status === 'saving' ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{status === 'saving' ? t.saving : t.save}</button>
                </div>
                <section className="deliveryValidationPanel"><header><span>{t.platformRules}</span>{selectedDocument.validation?.score != null ? <strong>{selectedDocument.validation.score}/100</strong> : null}</header><ValidationPanel document={selectedDocument} language={language} t={t} /></section>
              </aside>
            </>
          ) : <div className="deliveryNoIncluded"><CircleMinus size={28} /><strong>{t.noIncludedTitle}</strong><span>{t.noIncludedText}</span></div>}
        </div>
      ) : null}

      {activeTab === 'sequence' ? (
        <div className="deliverySequenceWorkspace">
          <header><div><strong>{t.sequenceTitle}</strong><span>{t.sequenceText}</span></div><div><button className="primary" type="button" onClick={() => exportDocuments()} disabled={status === 'exporting' || !exportCount}>{status === 'exporting' ? <LoaderCircle className="spin" size={14} /> : <FileArchive size={14} />}{t.exportAll}</button></div></header>
          <div className="deliverySequenceStats"><span><BadgeCheck size={15} /> {t.checkSummary(readyCount, includedDocuments.length)}</span><span><Layers3 size={15} /> {t.selectedCount(exportCount)}</span><label><input type="checkbox" checked={includeDetailPage} onChange={(event) => setIncludeDetailPage(event.target.checked)} />{t.includeDetailPage}</label></div>
          <div className="deliverySequenceGrid">
            <div className="deliverySequenceList">
              {includedDocuments.length ? includedDocuments.map((document, index) => {
                const slot = slotById.get(document.slotId);
                const generation = generationById.get(document.sourceGenerationId);
                return (
                  <article className={document.includeInExport ? 'included' : ''} key={document.id}>
                    <span>{generation?.imageUrl ? <img src={generation.imageUrl} alt="" /> : <FileImage size={21} />}</span>
                    <div><strong>{index + 1}. {localized(slot, language)}</strong><small>{localized(DELIVERY_TYPES.find((type) => type.id === document.documentType), language)} · {document.targetWidth}×{document.targetHeight}</small><DeliveryStatusBadge document={document} t={t} /></div>
                    <label><input type="checkbox" checked={document.includeInExport} onChange={(event) => toggleInclude(document.id, event.target.checked)} /><span>{t.includeExport}</span></label>
                    <div className="deliveryOrderButtons"><button type="button" aria-label={t.moveUp} onClick={() => moveDocument(document.id, -1)} disabled={index === 0}><ArrowUp size={14} /></button><button type="button" aria-label={t.moveDown} onClick={() => moveDocument(document.id, 1)} disabled={index === includedDocuments.length - 1}><ArrowDown size={14} /></button></div>
                  </article>
                );
              }) : <div className="deliverySequenceEmpty"><CircleMinus size={24} /><strong>{t.noIncludedTitle}</strong><span>{t.noIncludedText}</span></div>}
            </div>
            <div className="deliveryLongPreview">{includedDocuments.map((document) => { const generation = generationById.get(document.sourceGenerationId); return generation?.imageUrl ? <img src={generation.imageUrl} alt={document.slotId} key={document.id} /> : null; })}</div>
          </div>
        </div>
      ) : null}

      {message ? <p className={status === 'error' ? 'deliveryMessage error' : 'deliveryMessage'}>{message}</p> : null}

      {reuseEnabled && documents.length ? (
        <section className={`deliveryReuseFooter ${reuseOpen ? 'open' : ''}`}>
          <button
            className="deliveryReuseToggle"
            type="button"
            aria-expanded={reuseOpen}
            aria-label={reuseOpen ? t.closeReuse : t.openReuse}
            onClick={() => setReuseOpen((current) => !current)}
          >
            <span><Copy size={18} /><span><strong>{t.reuse}</strong><small>{t.reuseTitle}</small></span></span>
            <ChevronDown size={18} />
          </button>
          {reuseOpen ? <div className="deliveryReuseWorkspace">
          <header><strong>{t.reuseTitle}</strong></header>
          <div className="deliveryReuseGrid">
            <article><span><Copy size={21} /></span><div><strong>{t.duplicate}</strong><p>{t.duplicateText}</p></div><button type="button" onClick={() => createProjectAction('duplicate')} disabled={status === 'creating'}>{status === 'creating' ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{t.duplicate}</button></article>
            <article><span><Store size={21} /></span><div><strong>{t.adapt}</strong><p>{t.adaptText}</p><label className="deliveryField"><span>{t.targetPlatform}</span><select value={targetPlatformId} onChange={(event) => setTargetPlatformId(event.target.value)}>{ECOMMERCE_PLATFORMS.filter((item) => item.id !== project.platformId).map((item) => <option value={item.id} key={item.id}>{localized(item, language)}</option>)}</select></label></div><button type="button" onClick={() => createProjectAction('adapt')} disabled={status === 'creating'}>{status === 'creating' ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}{t.createAdapted}</button></article>
            <article><span><LayoutTemplate size={21} /></span><div><strong>{t.saveTemplate}</strong><p>{t.saveTemplateText}</p><label className="deliveryField"><span>{t.templateName}</span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder={t.templatePlaceholder} /></label></div><button type="button" onClick={saveTemplate} disabled={!templateName.trim() || status === 'saving-template'}>{status === 'saving-template' ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{t.saveTemplate}</button></article>
          </div>
          <section className="deliveryMyTemplates"><header><strong>{t.myTemplates}</strong><span>{t.itemCount(templates.length)}</span></header>{templates.length ? <div>{templates.map((template) => <article key={template.id}><span><LayoutTemplate size={18} /></span><div><strong>{template.name}</strong><small>{localized(ECOMMERCE_PLATFORMS.find((item) => item.id === template.platformId), language)} · {template.deliveryConfig?.length || 0} {language === 'zh' ? '张交付设置' : 'delivery layouts'}</small></div><button type="button" onClick={() => createFromTemplate(template.id)}>{t.createFromTemplate}</button><button className="danger" type="button" aria-label={t.deleteTemplate} onClick={() => deleteTemplate(template.id)}><Trash2 size={14} /></button></article>)}</div> : <p>{t.noTemplates}</p>}</section>
          </div> : null}
        </section>
      ) : null}
      {largePreviewOpen && selectedDocument && selectedSlot ? (
        <DeliveryArtboardLightbox
          document={selectedDocument}
          generation={selectedGeneration}
          slotName={localized(selectedSlot, language)}
          logoUrl={selectedLogo?.imageUrl}
          language={language}
          t={t}
          project={project}
          assets={assets}
          selectedObject={selectedCanvasObject}
          selectedObjectOpacity={selectedObjectOpacity}
          canEditTextObjects={canEditTextObjects}
          maskVisible={selectedMaskVisible}
          textVisible={selectedTextVisible}
          dirty={dirty}
          status={status}
          onSelectObject={selectOrRestoreCanvasObject}
          onBeginInteraction={beginCanvasObjectInteraction}
          onRemoveObject={removeCanvasObject}
          onUpdateOpacity={updateSelectedObjectOpacity}
          onResetObject={resetCanvasObject}
          onSave={saveDocument}
          refinementPricing={selectedRefinementPricing}
          refinementPricingLoading={selectedRefinementPricingLoading}
          onRefine={selectedOutput?.locked ? null : refineSelectedImage}
          onUploadAssets={onUploadRefinementAssets}
          onClose={() => setLargePreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}
