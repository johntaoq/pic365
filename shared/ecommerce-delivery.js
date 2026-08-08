import { getEcommercePlatform } from './ecommerce-catalog.js';

export const DELIVERY_FORMATS = ['png', 'jpeg', 'webp'];

export const DELIVERY_THEMES = [
  {
    id: 'minimal-light',
    nameEn: 'Minimal light',
    nameZh: '极简浅色',
    foreground: '#102033',
    muted: '#516178',
    accent: '#1d8f7a',
    panel: 'rgba(248,251,255,0.88)',
    line: 'rgba(18,40,64,0.2)'
  },
  {
    id: 'glass-dark',
    nameEn: 'Premium glass',
    nameZh: '高级玻璃质感',
    foreground: '#f7fbff',
    muted: '#c2d1e3',
    accent: '#9df6d2',
    panel: 'rgba(6,13,25,0.72)',
    line: 'rgba(255,255,255,0.2)'
  },
  {
    id: 'brand-gradient',
    nameEn: 'Brand gradient',
    nameZh: '品牌渐变',
    foreground: '#ffffff',
    muted: '#e7efff',
    accent: '#9df6d2',
    panel: 'rgba(39,49,96,0.76)',
    line: 'rgba(255,255,255,0.22)'
  },
  {
    id: 'conversion-pop',
    nameEn: 'Conversion pop',
    nameZh: '高转化强调',
    foreground: '#111727',
    muted: '#4b5263',
    accent: '#ff5f6d',
    panel: 'rgba(255,247,229,0.92)',
    line: 'rgba(17,23,39,0.2)'
  }
];

export const DELIVERY_LAYOUTS = [
  { id: 'bottom-left', nameEn: 'Bottom left', nameZh: '左下信息区' },
  { id: 'top-left', nameEn: 'Top left', nameZh: '左上信息区' },
  { id: 'top-center', nameEn: 'Top center', nameZh: '顶部居中' },
  { id: 'bottom-center', nameEn: 'Bottom center', nameZh: '底部居中' },
  { id: 'split-left', nameEn: 'Left split panel', nameZh: '左侧分栏' }
];

export const DELIVERY_TYPES = [
  { id: 'clean-product', nameEn: 'Clean product image', nameZh: '纯商品交付图' },
  { id: 'benefit', nameEn: 'Benefit image', nameZh: '核心卖点图' },
  { id: 'material-detail', nameEn: 'Material detail', nameZh: '材质细节图' },
  { id: 'lifestyle', nameEn: 'Lifestyle image', nameZh: '场景图' },
  { id: 'dimensions', nameEn: 'Dimensions', nameZh: '尺寸参数图' },
  { id: 'package-contents', nameEn: 'Package contents', nameZh: '包装清单图' },
  { id: 'comparison', nameEn: 'Comparison', nameZh: '对比图' },
  { id: 'variants', nameEn: 'SKU variants', nameZh: 'SKU 变体图' },
  { id: 'campaign', nameEn: 'Campaign image', nameZh: '活动营销图' },
  { id: 'video-cover', nameEn: 'Video cover', nameZh: '视频封面' },
  { id: 'storyboard', nameEn: 'Storyboard', nameZh: '视频分镜板' },
  { id: 'how-to', nameEn: 'How-to sequence', nameZh: '使用步骤图' },
  { id: 'detail-module', nameEn: 'Detail-page module', nameZh: '详情页模块' },
  { id: 'model-brief', nameEn: '3D model brief', nameZh: '3D 制作说明' }
];

const TYPE_BY_SLOT = {
  'white-background': 'clean-product',
  'compliant-main': 'clean-product',
  'main-square': 'clean-product',
  'main-portrait': 'clean-product',
  'cover-square': 'clean-product',
  'material-portrait': 'clean-product',
  'product-hero': 'benefit',
  'collection-card': 'clean-product',
  'gallery-angle': 'clean-product',
  'multi-angle': 'clean-product',
  'key-benefit': 'benefit',
  'three-second-benefit': 'benefit',
  feature: 'benefit',
  'detail-material': 'material-detail',
  'detail-closeup': 'material-detail',
  'material-detail': 'material-detail',
  lifestyle: 'lifestyle',
  'usage-scene': 'lifestyle',
  'person-scene': 'lifestyle',
  dimensions: 'dimensions',
  'spec-bundle': 'package-contents',
  'package-contents': 'package-contents',
  comparison: 'comparison',
  'sku-variant': 'variants',
  variant: 'variants',
  campaign: 'campaign',
  'promotion-label': 'campaign',
  'social-share': 'campaign',
  'video-cover': 'video-cover',
  'video-storyboard': 'storyboard',
  'how-to': 'how-to',
  'detail-page': 'detail-module',
  'bundle-cross-sell': 'package-contents',
  'model-brief': 'model-brief'
};

const TYPE_DEFAULTS = {
  'clean-product': { themeId: 'minimal-light', layoutId: 'bottom-left', showText: false },
  benefit: { themeId: 'glass-dark', layoutId: 'bottom-left', showText: true },
  'material-detail': { themeId: 'glass-dark', layoutId: 'bottom-left', showText: true },
  lifestyle: { themeId: 'glass-dark', layoutId: 'bottom-left', showText: true },
  dimensions: { themeId: 'minimal-light', layoutId: 'bottom-left', showText: true },
  'package-contents': { themeId: 'minimal-light', layoutId: 'bottom-left', showText: true },
  comparison: { themeId: 'minimal-light', layoutId: 'bottom-center', showText: true },
  variants: { themeId: 'minimal-light', layoutId: 'bottom-center', showText: true },
  campaign: { themeId: 'conversion-pop', layoutId: 'top-left', showText: true },
  'video-cover': { themeId: 'brand-gradient', layoutId: 'bottom-left', showText: true },
  storyboard: { themeId: 'glass-dark', layoutId: 'top-left', showText: true },
  'how-to': { themeId: 'minimal-light', layoutId: 'bottom-left', showText: true },
  'detail-module': { themeId: 'minimal-light', layoutId: 'bottom-left', showText: true },
  'model-brief': { themeId: 'minimal-light', layoutId: 'split-left', showText: true }
};

function uniqueTextItems(value, limit = 8) {
  const values = Array.isArray(value)
    ? value
    : String(value || '').split(/\r?\n|[，,；;、]/);
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}

export function parseDeliverySize(value, fallback = { width: 1024, height: 1024 }) {
  const match = String(value || '').match(/^(\d{2,5})x(\d{2,5})$/i);
  if (!match) return { ...fallback };
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function getDeliveryTypeForSlot(slotId) {
  return TYPE_BY_SLOT[slotId] || 'benefit';
}

export function getDeliveryType(typeId) {
  return DELIVERY_TYPES.find((item) => item.id === typeId) || DELIVERY_TYPES[0];
}

export function getDeliveryTheme(themeId) {
  return DELIVERY_THEMES.find((item) => item.id === themeId) || DELIVERY_THEMES[0];
}

export function getDeliveryLayout(layoutId) {
  return DELIVERY_LAYOUTS.find((item) => item.id === layoutId) || DELIVERY_LAYOUTS[0];
}

export function getDeliveryDefaultsForType(typeId) {
  return { ...(TYPE_DEFAULTS[typeId] || TYPE_DEFAULTS.benefit) };
}

export function getDefaultDeliveryContent(project, slot, language = 'zh') {
  const type = getDeliveryTypeForSlot(slot.id);
  const sellingPoints = uniqueTextItems(project.sellingPoints, 4);
  const specificationItems = uniqueTextItems(project.specifications, 8);
  const isZh = language === 'zh';
  const headline = sellingPoints[0] || project.productName || (isZh ? '商品亮点' : 'Product highlight');
  const subtitle = project.brandName
    ? `${project.brandName} · ${project.productName}`
    : project.productName;
  return {
    headline,
    subtitle,
    price: '',
    badge: '',
    bullets: sellingPoints.slice(0, 3),
    specs: specificationItems.slice(0, 5),
    dimensions: { width: '', height: '', depth: '', weight: '' },
    packageItems: specificationItems.slice(0, 6),
    comparison: {
      leftTitle: isZh ? '本商品' : 'This product',
      leftItems: sellingPoints.slice(0, 3),
      rightTitle: isZh ? '普通方案' : 'Typical option',
      rightItems: []
    },
    variants: [],
    steps: type === 'storyboard'
      ? (isZh
          ? ['开场钩子', '商品出现', '核心卖点', '细节证据', '使用场景', '行动引导']
          : ['Hook', 'Product', 'Key benefit', 'Proof', 'Usage', 'Call to action'])
      : (isZh ? ['准备', '操作', '完成'] : ['Prepare', 'Use', 'Finish']),
    disclaimer: project.prohibitedContent || '',
    logoAssetId: ''
  };
}

export function createDeliveryDocumentDraft({ project, slot, output, language = 'zh', order = 0 }) {
  const type = getDeliveryTypeForSlot(slot.id);
  const defaults = TYPE_DEFAULTS[type] || TYPE_DEFAULTS.benefit;
  const target = parseDeliverySize(slot.recommendedSize);
  return {
    projectId: project.id,
    slotId: slot.id,
    sourceGenerationId: output?.selectedGenerationId || '',
    documentType: type,
    targetWidth: target.width,
    targetHeight: target.height,
    outputFormat: 'png',
    themeId: defaults.themeId,
    layoutId: defaults.layoutId,
    safeArea: true,
    includeInExport: true,
    moduleOrder: order,
    content: getDefaultDeliveryContent(project, slot, language),
    advanced: {
      showText: defaults.showText,
      showSafeArea: false,
      overlayOpacity: 0.9,
      maskOpacity: 0.9,
      textOpacity: 1,
      maskBox: null,
      textBox: null,
      imageFit: 'cover',
      contentWidth: 0.7,
      padding: 0.055
    }
  };
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

function normalizeDeliveryBox(value, minimumWidth, minimumHeight) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const width = clampNumber(value.width, minimumWidth, 1, minimumWidth);
  const height = clampNumber(value.height, minimumHeight, 1, minimumHeight);
  return {
    x: Number(clampNumber(value.x, 0, 1 - width, 0).toFixed(5)),
    y: Number(clampNumber(value.y, 0, 1 - height, 0).toFixed(5)),
    width: Number(width.toFixed(5)),
    height: Number(height.toFixed(5))
  };
}

export function normalizeDeliveryContent(value) {
  const content = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const comparison = content.comparison && typeof content.comparison === 'object' ? content.comparison : {};
  const dimensions = content.dimensions && typeof content.dimensions === 'object' ? content.dimensions : {};
  const text = (input, maxLength = 500) => String(input || '').trim().slice(0, maxLength);
  return {
    headline: text(content.headline, 160),
    subtitle: text(content.subtitle, 240),
    price: text(content.price, 60),
    badge: text(content.badge, 60),
    bullets: uniqueTextItems(content.bullets, 5).map((item) => text(item, 160)),
    specs: uniqueTextItems(content.specs, 8).map((item) => text(item, 160)),
    dimensions: {
      width: text(dimensions.width, 60),
      height: text(dimensions.height, 60),
      depth: text(dimensions.depth, 60),
      weight: text(dimensions.weight, 60)
    },
    packageItems: uniqueTextItems(content.packageItems, 10).map((item) => text(item, 160)),
    comparison: {
      leftTitle: text(comparison.leftTitle, 80),
      leftItems: uniqueTextItems(comparison.leftItems, 6).map((item) => text(item, 140)),
      rightTitle: text(comparison.rightTitle, 80),
      rightItems: uniqueTextItems(comparison.rightItems, 6).map((item) => text(item, 140))
    },
    variants: uniqueTextItems(content.variants, 10).map((item) => text(item, 100)),
    steps: uniqueTextItems(content.steps, 8).map((item) => text(item, 120)),
    disclaimer: text(content.disclaimer, 500),
    logoAssetId: text(content.logoAssetId, 80)
  };
}

export function normalizeDeliveryAdvanced(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const maskOpacity = clampNumber(input.maskOpacity ?? input.overlayOpacity, 0.05, 1, 0.9);
  return {
    showText: input.showText !== false,
    showSafeArea: Boolean(input.showSafeArea),
    overlayOpacity: maskOpacity,
    maskOpacity,
    textOpacity: clampNumber(input.textOpacity, 0.1, 1, 1),
    maskBox: normalizeDeliveryBox(input.maskBox, 0.18, 0.1),
    textBox: normalizeDeliveryBox(input.textBox, 0.12, 0.07),
    imageFit: input.imageFit === 'contain' ? 'contain' : 'cover',
    contentWidth: Math.max(0.42, Math.min(0.9, Number(input.contentWidth) || 0.7)),
    padding: Math.max(0.03, Math.min(0.12, Number(input.padding) || 0.055))
  };
}

export function resolveDeliveryOverlayBoxes(document) {
  const advanced = normalizeDeliveryAdvanced(document?.advanced);
  const targetWidth = Math.max(1, Number(document?.targetWidth) || 1024);
  const targetHeight = Math.max(1, Number(document?.targetHeight) || 1024);
  const padding = advanced.padding;
  const safeWidth = 1 - padding * 2;
  const safeHeight = 1 - padding * 2;
  const panelWidth = Math.min(safeWidth, advanced.contentWidth);
  const panelHeight = Math.min(safeHeight * 0.58, Math.max(210 / targetHeight, 0.31));
  let maskBox;
  switch (document?.layoutId) {
    case 'top-left':
      maskBox = { x: padding, y: padding, width: panelWidth, height: panelHeight };
      break;
    case 'top-center':
      maskBox = { x: (1 - panelWidth) / 2, y: padding, width: panelWidth, height: panelHeight };
      break;
    case 'bottom-center':
      maskBox = { x: (1 - panelWidth) / 2, y: 1 - padding - panelHeight, width: panelWidth, height: panelHeight };
      break;
    case 'split-left':
      maskBox = { x: padding, y: padding, width: safeWidth * 0.42, height: safeHeight };
      break;
    default:
      maskBox = { x: padding, y: 1 - padding - panelHeight, width: panelWidth, height: panelHeight };
      break;
  }
  maskBox = normalizeDeliveryBox(maskBox, 0.18, 0.1);
  const insetPixels = Math.min(targetWidth, targetHeight) * 0.035;
  const insetX = Math.min(maskBox.width * 0.16, insetPixels / targetWidth);
  const insetY = Math.min(maskBox.height * 0.2, insetPixels / targetHeight);
  const textBox = normalizeDeliveryBox({
    x: maskBox.x + insetX,
    y: maskBox.y + insetY,
    width: Math.max(0.12, maskBox.width - insetX * 2),
    height: Math.max(0.07, maskBox.height - insetY * 2)
  }, 0.12, 0.07);
  return {
    maskBox: advanced.maskBox || maskBox,
    textBox: advanced.textBox || textBox,
    maskOpacity: advanced.maskOpacity,
    textOpacity: advanced.textOpacity
  };
}

export function getDeliveryTextScale(content, box) {
  const normalized = normalizeDeliveryContent(content);
  const units = [normalized.headline, normalized.subtitle, normalized.price, normalized.badge]
    .join('')
    .length + normalized.bullets.join('').length * 0.85 + normalized.bullets.length * 8;
  const area = Math.max(0.01, Number(box?.width || 0.5) * Number(box?.height || 0.2));
  const areaScale = Math.sqrt(area / 0.15);
  const densityScale = Math.sqrt(92 / Math.max(48, units || 48));
  return Math.max(0.42, Math.min(1.18, areaScale * densityScale));
}

function rule(id, severity, status, titleEn, titleZh, detailEn, detailZh) {
  return { id, severity, status, titleEn, titleZh, detailEn, detailZh };
}

export function validateDeliveryDocument({ document, project, slot, diagnostics = {} }) {
  const rules = [];
  const content = normalizeDeliveryContent(document.content);
  const advanced = normalizeDeliveryAdvanced(document.advanced);
  const expected = parseDeliverySize(slot.recommendedSize);
  const hasCopy = Boolean(content.headline || content.subtitle || content.price || content.badge || content.bullets.length);
  rules.push(rule(
    'source', 'error', document.sourceGenerationId ? 'passed' : 'failed',
    'Adopted source image', '已采用源图',
    document.sourceGenerationId ? 'The document uses an adopted project version.' : 'Choose or generate a project image first.',
    document.sourceGenerationId ? '当前交付图已绑定项目采用版本。' : '请先生成或采用一张项目图片。'
  ));
  const sizeMatches = Number(document.targetWidth) === expected.width && Number(document.targetHeight) === expected.height;
  rules.push(rule(
    'size', 'error', sizeMatches ? 'passed' : 'failed',
    'Platform dimensions', '平台尺寸',
    sizeMatches ? `${expected.width} × ${expected.height}` : `Expected ${expected.width} × ${expected.height}.`,
    sizeMatches ? `${expected.width} × ${expected.height}` : `应为 ${expected.width} × ${expected.height}。`
  ));
  const formatValid = DELIVERY_FORMATS.includes(document.outputFormat);
  rules.push(rule(
    'format', 'error', formatValid ? 'passed' : 'failed',
    'File format', '文件格式',
    formatValid ? document.outputFormat.toUpperCase() : 'Use PNG, JPEG, or WebP.',
    formatValid ? document.outputFormat.toUpperCase() : '请使用 PNG、JPEG 或 WebP。'
  ));
  if (hasCopy && advanced.showText) {
    rules.push(rule(
      'safe-area', 'warning', document.safeArea ? 'passed' : 'warning',
      'Text safe area', '文字安全区',
      document.safeArea ? 'Copy stays inside the recommended safe area.' : 'Enable the safe area before export.',
      document.safeArea ? '文案位于建议安全区内。' : '导出前建议开启文字安全区。'
    ));
    const copyLength = `${content.headline}${content.subtitle}${content.bullets.join('')}`.length;
    rules.push(rule(
      'copy-length', 'warning', copyLength <= 180 && content.headline.length <= 48 ? 'passed' : 'warning',
      'Copy density', '文案密度',
      copyLength <= 180 && content.headline.length <= 48 ? 'Copy is concise enough for an image.' : 'Shorten the headline or bullet list.',
      copyLength <= 180 && content.headline.length <= 48 ? '文案长度适合图片阅读。' : '建议缩短标题或卖点列表。'
    ));
  }
  if (document.documentType === 'dimensions') {
    const values = Object.values(content.dimensions).filter(Boolean);
    rules.push(rule(
      'dimensions', 'error', values.length >= 2 ? 'passed' : 'failed',
      'Dimension data', '尺寸数据',
      values.length >= 2 ? 'At least two dimensions are defined.' : 'Enter at least two real measurements.',
      values.length >= 2 ? '已填写至少两个尺寸数据。' : '请至少填写两个真实尺寸。'
    ));
  }
  if (document.documentType === 'package-contents') {
    rules.push(rule(
      'package-items', 'error', content.packageItems.length ? 'passed' : 'failed',
      'Package contents', '包装清单',
      content.packageItems.length ? `${content.packageItems.length} items listed.` : 'List the actual items in the package.',
      content.packageItems.length ? `已列出 ${content.packageItems.length} 项包含物。` : '请填写包装内实际包含物。'
    ));
  }
  if (document.documentType === 'comparison') {
    const complete = content.comparison.leftItems.length > 0 && content.comparison.rightItems.length > 0;
    rules.push(rule(
      'comparison', 'error', complete ? 'passed' : 'failed',
      'Verifiable comparison', '可验证对比',
      complete ? 'Both comparison columns contain evidence.' : 'Complete both columns with verifiable facts.',
      complete ? '两侧均已填写可验证信息。' : '请用可验证事实补全对比两侧。'
    ));
  }
  if (document.documentType === 'variants') {
    rules.push(rule(
      'variants', 'error', content.variants.length >= 2 ? 'passed' : 'failed',
      'SKU variants', 'SKU 变体',
      content.variants.length >= 2 ? `${content.variants.length} variants listed.` : 'Enter at least two real variants.',
      content.variants.length >= 2 ? `已列出 ${content.variants.length} 个变体。` : '请至少填写两个真实变体。'
    ));
  }
  if (document.documentType === 'storyboard' || document.documentType === 'how-to') {
    rules.push(rule(
      'sequence', 'warning', content.steps.length >= 3 ? 'passed' : 'warning',
      'Sequence completeness', '步骤完整性',
      content.steps.length >= 3 ? `${content.steps.length} steps are defined.` : 'Use at least three clear steps.',
      content.steps.length >= 3 ? `已定义 ${content.steps.length} 个步骤。` : '建议至少填写三个清晰步骤。'
    ));
  }
  if (project.platformId === 'amazon' && slot.id === 'compliant-main') {
    const cleanMain = !advanced.showText && !content.logoAssetId && !content.price && !content.badge;
    rules.push(rule(
      'amazon-main-overlays', 'error', cleanMain ? 'passed' : 'failed',
      'Amazon main-image overlays', 'Amazon 主图叠加元素',
      cleanMain ? 'No promotional overlays are present.' : 'Remove text, logo, price, and badges from the main image.',
      cleanMain ? '主图未叠加营销元素。' : '请移除主图上的文字、Logo、价格和标签。'
    ));
    if (diagnostics.whiteCornerRatio != null) {
      const whiteEnough = diagnostics.whiteCornerRatio >= 0.88;
      rules.push(rule(
        'amazon-white-background', 'error', whiteEnough ? 'passed' : 'failed',
        'White background', '白底检测',
        whiteEnough ? 'The image corners are predominantly white.' : 'The detected background is not sufficiently white.',
        whiteEnough ? '图片边角区域以白色为主。' : '检测到背景白度不足。'
      ));
    }
  }
  if (diagnostics.sourceWidth && diagnostics.sourceHeight) {
    const enoughPixels = diagnostics.sourceWidth >= 900 && diagnostics.sourceHeight >= 900;
    rules.push(rule(
      'source-resolution', 'warning', enoughPixels ? 'passed' : 'warning',
      'Source resolution', '源图分辨率',
      enoughPixels ? `${diagnostics.sourceWidth} × ${diagnostics.sourceHeight}` : 'The source image may look soft after export.',
      enoughPixels ? `${diagnostics.sourceWidth} × ${diagnostics.sourceHeight}` : '源图导出后可能不够清晰。'
    ));
  }
  const failed = rules.filter((item) => item.status === 'failed').length;
  const warnings = rules.filter((item) => item.status === 'warning').length;
  const score = Math.max(0, 100 - failed * 20 - warnings * 7);
  return { ready: failed === 0, score, failed, warnings, rules };
}

export function buildDeliveryFilename({ productName, slotName, platformId, versionNumber = 1, language = 'zh', format = 'png' }) {
  const platform = getEcommercePlatform(platformId);
  const platformName = language === 'zh' ? platform.nameZh : platform.nameEn;
  const safe = (value, fallback) => String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return `${safe(productName, language === 'zh' ? '商品' : 'product')}-${safe(slotName, language === 'zh' ? '分图' : 'image')}-${safe(platformName, 'platform')}-V${Math.max(1, Number(versionNumber) || 1)}.${format === 'jpeg' ? 'jpg' : format}`;
}
