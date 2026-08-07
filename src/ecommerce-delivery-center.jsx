import { useEffect, useMemo, useState } from 'react';
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
  Layers3,
  LayoutTemplate,
  LoaderCircle,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  TriangleAlert,
  WandSparkles
} from 'lucide-react';
import {
  DELIVERY_FORMATS,
  DELIVERY_LAYOUTS,
  DELIVERY_THEMES,
  DELIVERY_TYPES,
  createDeliveryDocumentDraft,
  getDeliveryDefaultsForType,
  getDeliveryTheme
} from '../shared/ecommerce-delivery.js';
import { ECOMMERCE_PLATFORMS } from '../shared/ecommerce-catalog.js';

const copy = {
  zh: {
    title: '6. 专业交付',
    summaryEmpty: '等待准备',
    summaryReady: (ready, total) => `${ready}/${total} 可交付`,
    prepare: '一键准备交付',
    preparing: '正在准备……',
    sync: '同步采用版本',
    tabs: { editor: '单图精修', sequence: '详情页编排', reuse: '项目复用' },
    steps: ['准备交付', '编辑内容', '平台检查', '批量导出'],
    noOutputTitle: '先完成至少一张套图',
    noOutputText: '交付中心会使用每个槽位的“当前采用版本”，失败尝试不会覆盖正式成果。',
    selectedSource: '当前采用版本',
    missingSource: '缺少采用图片',
    ready: '可交付',
    unchecked: '未检查',
    hasIssues: '需处理',
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
    leftTitle: '左侧标题',
    rightTitle: '右侧标题',
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
    exportAll: '导出交付包',
    exporting: '正在打包……',
    includeDetailPage: '同时生成详情长图',
    checkAll: '检查全部',
    checkSummary: (ready, total) => `${ready}/${total} 张通过`,
    platformRules: '平台交付检查',
    noCheck: '保存后点击检查，系统会核对尺寸、格式、安全区和专业制图完整性。',
    passed: '通过',
    warning: '建议优化',
    failed: '必须修正',
    sequenceTitle: '详情页与素材顺序',
    sequenceText: '按消费者阅读顺序编排，导出 ZIP 和详情长图都会沿用这里的次序。',
    moveUp: '前移',
    moveDown: '后移',
    reuseTitle: '把成熟流程复用到下一个商品',
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
    checkSuccess: '平台检查已完成。',
    prepareSuccess: '交付工作台已准备完成。',
    exportBlocked: '仍有必须修正的交付问题，请先查看检查结果。',
    actionFailed: '操作未完成，请稍后重试。',
    templateSaved: '已保存为个人模板。',
    projectCreated: '新项目已创建。',
    livePreview: '实时预览',
    generatedPreview: '采用图',
    safeAreaLabel: '安全区',
    itemCount: (count) => `${count} 项`,
    selectedCount: (count) => `已选 ${count} 张`,
    requiresSave: '修改后请先保存本图设置。'
  },
  en: {
    title: '6. Professional delivery',
    summaryEmpty: 'Not prepared',
    summaryReady: (ready, total) => `${ready}/${total} ready`,
    prepare: 'Prepare delivery',
    preparing: 'Preparing...',
    sync: 'Sync adopted versions',
    tabs: { editor: 'Image finishing', sequence: 'Detail-page order', reuse: 'Reuse' },
    steps: ['Prepare', 'Edit', 'Check', 'Export'],
    noOutputTitle: 'Finish at least one project image first',
    noOutputText: 'Delivery uses each slot’s adopted version. A failed attempt never replaces the approved result.',
    selectedSource: 'Adopted version',
    missingSource: 'No adopted image',
    ready: 'Ready',
    unchecked: 'Unchecked',
    hasIssues: 'Needs work',
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
    leftTitle: 'Left title',
    rightTitle: 'Right title',
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
    exportAll: 'Export delivery ZIP',
    exporting: 'Packaging...',
    includeDetailPage: 'Also create a long detail page',
    checkAll: 'Check all',
    checkSummary: (ready, total) => `${ready}/${total} passed`,
    platformRules: 'Platform delivery checks',
    noCheck: 'Save and check to verify dimensions, format, safe area, and professional component completeness.',
    passed: 'Passed',
    warning: 'Improve',
    failed: 'Fix required',
    sequenceTitle: 'Detail-page and asset order',
    sequenceText: 'The ZIP and long detail page use this customer-reading order.',
    moveUp: 'Move earlier',
    moveDown: 'Move later',
    reuseTitle: 'Reuse a proven workflow for the next product',
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
    checkSuccess: 'Platform checks completed.',
    prepareSuccess: 'Delivery workspace is ready.',
    exportBlocked: 'Fix the required delivery issues before export.',
    actionFailed: 'The action could not be completed.',
    templateSaved: 'Saved as a personal template.',
    projectCreated: 'New project created.',
    livePreview: 'Live preview',
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

function GeneralPreviewPanel({ document }) {
  const content = document.content || {};
  if (document.advanced?.showText === false) return null;
  return (
    <div className={`deliveryPreviewPanel ${document.layoutId}`}>
      {content.badge ? <em>{content.badge}</em> : null}
      {content.headline ? <strong>{content.headline}</strong> : null}
      {content.subtitle ? <span>{content.subtitle}</span> : null}
      {content.bullets?.length ? <ul>{content.bullets.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul> : null}
      {content.price ? <b>{content.price}</b> : null}
    </div>
  );
}

function DeliveryPreviewOverlay({ document, logoUrl, t }) {
  const content = document.content || {};
  return (
    <div className={`deliveryPreviewOverlay type-${document.documentType}`}>
      {document.advanced?.showSafeArea ? <div className="deliverySafeArea"><span>{t.safeAreaLabel}</span></div> : null}
      {logoUrl ? <img className="deliveryPreviewLogo" src={logoUrl} alt="Logo" /> : null}
      {document.documentType !== 'comparison' ? <GeneralPreviewPanel document={document} /> : null}
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
          <div><strong>{content.comparison?.leftTitle}</strong>{content.comparison?.leftItems?.map((item) => <span key={item}>{item}</span>)}</div>
          <div><strong>{content.comparison?.rightTitle}</strong>{content.comparison?.rightItems?.map((item) => <span key={item}>{item}</span>)}</div>
        </div>
      ) : null}
      {['storyboard', 'how-to'].includes(document.documentType) ? (
        <div className="deliveryStepsPreview">{content.steps?.slice(0, 6).map((item, index) => <span key={`${index}-${item}`}><b>{index + 1}</b>{item}</span>)}</div>
      ) : null}
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
  onProjectCreated
}) {
  const t = copy[language] || copy.zh;
  const [documents, setDocuments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState('editor');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [includeDetailPage, setIncludeDetailPage] = useState(true);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [targetPlatformId, setTargetPlatformId] = useState(() => ECOMMERCE_PLATFORMS.find((item) => item.id !== project.platformId)?.id || project.platformId);
  const [templateName, setTemplateName] = useState('');

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
  const selectedLogo = selectedDocument?.content?.logoAssetId
    ? assets.find((asset) => asset.id === selectedDocument.content.logoAssetId)
    : null;
  const readyCount = includedDocuments.filter((document) => document.validation?.ready).length;
  const exportCount = includedDocuments.length;
  const hasOutputs = (outputs || []).some((output) => output.selectedGenerationId);
  const workflowStep = !includedDocuments.length
    ? 0
    : includedDocuments.some((document) => !document.validation?.checkedAt)
      ? 1
      : readyCount < includedDocuments.length
        ? 2
        : 3;

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
      setStatus('idle');
    } catch {
      setStatus('error');
      setMessage(t.actionFailed);
    }
  }

  useEffect(() => {
    setDocuments([]);
    setSelectedDocumentId('');
    setTargetPlatformId(ECOMMERCE_PLATFORMS.find((item) => item.id !== project.platformId)?.id || project.platformId);
    setTemplateName('');
    setDirty(false);
    loadWorkspace();
  }, [project.id]);

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
      advanced: { ...selectedDocument.advanced, showText: defaults.showText },
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

  async function checkDocuments(documentId = '') {
    if (dirty && documentId) {
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
        if (payload.error === 'DELIVERY_NOT_READY') setMessage(t.exportBlocked);
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
      <header className="deliveryCenterHeader">
        <div>
          <span><PackageCheck size={17} /> {localized(platform, language)}</span>
          <strong>{includedDocuments.length ? t.summaryReady(readyCount, includedDocuments.length) : t.summaryEmpty}</strong>
        </div>
        <div className="deliveryWorkflow">
          {t.steps.map((label, index) => (
            <span className={index < workflowStep ? 'completed' : index === workflowStep ? 'active' : ''} key={label}>
              <i>{index < workflowStep ? <Check size={11} /> : index + 1}</i>{label}
            </span>
          ))}
        </div>
        <button type="button" onClick={() => prepareWorkspace(true)} disabled={status === 'preparing'}>
          {status === 'preparing' ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
          {documents.length ? t.sync : t.prepare}
        </button>
      </header>

      <nav className="deliveryTabs" aria-label={t.title}>
        {Object.entries(t.tabs).map(([id, label]) => (
          <button className={activeTab === id ? 'active' : ''} type="button" onClick={() => setActiveTab(id)} key={id}>
            {id === 'editor' ? <Layers3 size={15} /> : id === 'sequence' ? <LayoutTemplate size={15} /> : <Copy size={15} />}{label}
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
                  <div
                    className={`deliveryArtboard theme-${selectedDocument.themeId}`}
                    style={{
                      aspectRatio: `${selectedDocument.targetWidth} / ${selectedDocument.targetHeight}`,
                      '--delivery-foreground': getDeliveryTheme(selectedDocument.themeId).foreground,
                      '--delivery-muted': getDeliveryTheme(selectedDocument.themeId).muted,
                      '--delivery-accent': getDeliveryTheme(selectedDocument.themeId).accent,
                      '--delivery-panel': getDeliveryTheme(selectedDocument.themeId).panel
                    }}
                  >
                    {selectedGeneration?.imageUrl ? <img className={selectedDocument.advanced?.imageFit === 'contain' ? 'contain' : 'cover'} src={selectedGeneration.imageUrl} alt={localized(selectedSlot, language)} /> : <div className="deliveryMissingArt"><FileImage size={34} /><span>{t.missingSource}</span></div>}
                    <DeliveryPreviewOverlay document={selectedDocument} logoUrl={selectedLogo?.imageUrl} t={t} />
                  </div>
                </div>
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
                      <div><label className="deliveryField"><span>{t.leftTitle}</span><input value={selectedDocument.content.comparison?.leftTitle || ''} onChange={(event) => updateNestedContent('comparison', 'leftTitle', event.target.value)} /></label><label className="deliveryField"><span>{t.comparisonLeft}</span><textarea value={listToText(selectedDocument.content.comparison?.leftItems)} onChange={(event) => updateNestedContent('comparison', 'leftItems', textToList(event.target.value, 6))} /></label></div>
                      <div><label className="deliveryField"><span>{t.rightTitle}</span><input value={selectedDocument.content.comparison?.rightTitle || ''} onChange={(event) => updateNestedContent('comparison', 'rightTitle', event.target.value)} /></label><label className="deliveryField"><span>{t.comparisonRight}</span><textarea value={listToText(selectedDocument.content.comparison?.rightItems)} onChange={(event) => updateNestedContent('comparison', 'rightItems', textToList(event.target.value, 6))} /></label></div>
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
                        <label className="deliveryField"><span>{t.layout}</span><select value={selectedDocument.layoutId} onChange={(event) => updateSelectedDocument({ layoutId: event.target.value })}>{DELIVERY_LAYOUTS.map((layout) => <option value={layout.id} key={layout.id}>{localized(layout, language)}</option>)}</select></label>
                        <label className="deliveryField"><span>{t.format}</span><select value={selectedDocument.outputFormat} onChange={(event) => updateSelectedDocument({ outputFormat: event.target.value })}>{DELIVERY_FORMATS.map((format) => <option value={format} key={format}>{format.toUpperCase()}</option>)}</select></label>
                        <label className="deliveryField"><span>{t.imageFit}</span><select value={selectedDocument.advanced?.imageFit || 'cover'} onChange={(event) => updateAdvanced('imageFit', event.target.value)}><option value="cover">{t.cover}</option><option value="contain">{t.contain}</option></select></label>
                      </div>
                      <div className="deliverySwitches">
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
          <header><div><strong>{t.sequenceTitle}</strong><span>{t.sequenceText}</span></div><div><button type="button" onClick={() => checkDocuments()} disabled={status === 'checking' || !exportCount}>{status === 'checking' ? <LoaderCircle className="spin" size={14} /> : <FileCheck2 size={14} />}{t.checkAll}</button><button className="primary" type="button" onClick={() => exportDocuments()} disabled={status === 'exporting' || !exportCount}>{status === 'exporting' ? <LoaderCircle className="spin" size={14} /> : <FileArchive size={14} />}{t.exportAll}</button></div></header>
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

      {activeTab === 'reuse' ? (
        <div className="deliveryReuseWorkspace">
          <header><strong>{t.reuseTitle}</strong></header>
          <div className="deliveryReuseGrid">
            <article><span><Copy size={21} /></span><div><strong>{t.duplicate}</strong><p>{t.duplicateText}</p></div><button type="button" onClick={() => createProjectAction('duplicate')} disabled={status === 'creating'}>{status === 'creating' ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{t.duplicate}</button></article>
            <article><span><Store size={21} /></span><div><strong>{t.adapt}</strong><p>{t.adaptText}</p><label className="deliveryField"><span>{t.targetPlatform}</span><select value={targetPlatformId} onChange={(event) => setTargetPlatformId(event.target.value)}>{ECOMMERCE_PLATFORMS.filter((item) => item.id !== project.platformId).map((item) => <option value={item.id} key={item.id}>{localized(item, language)}</option>)}</select></label></div><button type="button" onClick={() => createProjectAction('adapt')} disabled={status === 'creating'}>{status === 'creating' ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}{t.createAdapted}</button></article>
            <article><span><LayoutTemplate size={21} /></span><div><strong>{t.saveTemplate}</strong><p>{t.saveTemplateText}</p><label className="deliveryField"><span>{t.templateName}</span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder={t.templatePlaceholder} /></label></div><button type="button" onClick={saveTemplate} disabled={!templateName.trim() || status === 'saving-template'}>{status === 'saving-template' ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{t.saveTemplate}</button></article>
          </div>
          <section className="deliveryMyTemplates"><header><strong>{t.myTemplates}</strong><span>{t.itemCount(templates.length)}</span></header>{templates.length ? <div>{templates.map((template) => <article key={template.id}><span><LayoutTemplate size={18} /></span><div><strong>{template.name}</strong><small>{localized(ECOMMERCE_PLATFORMS.find((item) => item.id === template.platformId), language)} · {template.deliveryConfig?.length || 0} {language === 'zh' ? '张交付设置' : 'delivery layouts'}</small></div><button type="button" onClick={() => createFromTemplate(template.id)}>{t.createFromTemplate}</button><button className="danger" type="button" aria-label={t.deleteTemplate} onClick={() => deleteTemplate(template.id)}><Trash2 size={14} /></button></article>)}</div> : <p>{t.noTemplates}</p>}</section>
        </div>
      ) : null}

      {message ? <p className={status === 'error' ? 'deliveryMessage error' : 'deliveryMessage'}>{message}</p> : null}
    </div>
  );
}
