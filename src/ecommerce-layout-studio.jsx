import React, { useEffect, useMemo, useRef, useState } from 'react';
import { submitLayoutGenerationTasks } from './ecommerce-layout-requests.js';
import EcommerceWatermarkSettings, { useEcommerceWatermarkSettings } from './ecommerce-watermark-settings.jsx';
import { useEcommerceLayoutFavorites } from './ecommerce-layout-favorites.jsx';
import { layoutsForCategory } from '../shared/ecommerce-layout-favorites.js';
import {
  Check,
  ChevronRight,
  Heart,
  ImagePlus,
  Images,
  LoaderCircle,
  Maximize2,
  ShoppingBag,
  Star,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';
import {
  MAX_LAYOUT_IMAGES,
  MAX_LAYOUT_PRODUCT_IMAGES,
  LAYOUT_IMAGE_TYPES,
  LAYOUT_TEMPLATES,
  SELLING_LAYOUT_GROUPS,
  buildEcommerceLayoutPrompt,
  createDefaultLayoutSelections,
  layoutReferenceCount,
  layoutSlots,
  promoteLayoutProduct,
  toggleSelectedLayout
} from '../shared/ecommerce-layout-studio.js';
import { getImageModelConstraints } from '../shared/image-generation.js';
import { activeEcommerceWatermarkSettings } from '../shared/ecommerce-layout-watermark.js';
import { useImagePricingAccess, useServerImagePricingBatch } from './image-pricing-client.jsx';
import { MAX_ACTIVE_IMAGE_TASKS } from './image-task-list.js';
import FreeImageSettings from './free-image-settings.jsx';
import EcommerceLayoutResults from './ecommerce-layout-results.jsx';
import ImageStudioFeedback, { useImageStudioFeedback } from './image-studio-feedback.jsx';
import './ecommerce-layout-studio.css';

const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
const layoutArtworkUrls = import.meta.glob('./assets/ecommerce-layouts/generated/*.webp', {
  eager: true,
  query: '?url',
  import: 'default'
});

const COPY = {
  zh: {
    title: '电商版式',
    subtitle: '从图库勾选 1–10 个版式；每个版式生成一张独立图片，不必凑成固定套图。',
    source: '商品原图',
    sourceHint: '最多 3 张 · 第一张为主图',
    upload: '上传商品图',
    library: '从资源库选择',
    drop: '拖入图片、点击上传，或粘贴参考图',
    pasteHint: '点击参考图区后按 Ctrl+V，也可在本页直接粘贴图片',
    fileLimit: 'JPG / PNG / WebP · 单张不超过 10 MB',
    primary: '主图',
    supporting: '辅助图',
    makePrimary: '设为主图',
    sourceLimit: '最多添加 3 张商品参考图。',
    duplicateSource: '这张商品图已经添加。',
    replace: '更换图片',
    remove: '移除商品图',
    sample: '商品版式示例 · 非你的商品',
    productInfo: '商品信息',
    productName: '商品名称',
    productPlaceholder: '例如：通勤斜挎包',
    points: '商品卖点（可选）',
    pointsHint: '每行一条，最多 3 条；生成时由 AI 补足不足的卖点',
    pointsPlaceholder: '例如：肩带可调\n外部拉链口袋\n轻巧易携带',
    scene: '使用场景（可选）',
    scenePlaceholder: '例如：日常通勤、现代家居',
    noProvider: '暂无支持当前参考图数量的生图服务',
    selectedLayouts: '已选版式',
    clearSelection: '清空',
    total: '张',
    gallery: '勾选版式',
    galleryHint: '可跨类型勾选；按勾选顺序，每款分别生成一张',
    galleryCount: (shown, total) => `显示 ${shown} / ${total} 款 · 可滚动浏览`,
    preview: '构图预览',
    previewHint: '示例商品仅用于展示版式，实际商品以原图为准。',
    handbagPreviewHint: '浅蓝手提包仅为版式示例；实际生成以你上传的商品为准。',
    newLayout: '新',
    selectLayout: '勾选此版式',
    unselectLayout: '取消勾选',
    emptySelection: '还没有勾选版式，从下方图库选择即可。',
    noSelection: '请先勾选至少一个版式。',
    limitSelection: '最多选择 10 个版式；取消一个后可继续选择。',
    allLayouts: '全部',
    favoriteLayouts: '收藏',
    addFavorite: '收藏版式',
    removeFavorite: '取消收藏',
    emptyFavorites: '还没有收藏版式，点击版式底部的心形图标即可收藏。',
    signInFavorites: '登录后查看和保存自己的收藏版式。',
    favoritesLoading: '正在加载收藏版式…',
    favoritesLoadFailed: '收藏版式加载失败，请重试。',
    favoritesSaveFailed: '收藏保存失败，本次更改已撤回，请重试。',
    retryFavorites: '重试',
    bill: '预计预留',
    billNeedSource: '上传商品图后报价',
    billNeedSelection: '勾选版式后报价',
    billPending: '报价中…',
    billError: '暂时无法获取报价',
    generate: (count) => `生成 ${count} 张图片`,
    generating: '正在提交…',
    signIn: '登录后生成',
    billedByServer: '每个勾选版式分别生成，费用由当前生图服务实时计算。',
    missingSource: '请先上传商品原图，或从资源库选择。',
    tooManyPoints: '最多填写 3 条卖点，请删掉多余内容后再生成。',
    invalidFile: '请选择 JPG、PNG 或 WebP 图片。',
    tooLarge: '商品参考图不能超过 10 MB。',
    unsupportedFile: '当前生图服务不支持这张图片的格式，请更换图片或服务。',
    invalidProvider: '请选择支持当前参考图数量和输出尺寸的生图服务。',
    insufficient: '积分不足，请先充值或改用其他生图服务。',
    queueFull: '生成队列已满，请先完成现有任务。',
    quoteFailed: '无法确认生图费用，请稍后重试。',
    submitFailed: '提交失败，请稍后重试。未创建新的生成任务。',
    serviceUnavailable: '暂时无法确认生图服务，请稍后重试。尚未提交任务。',
    sessionExpired: '登录已过期，请重新登录后重试。',
    batchTooLarge: '本次图片数据过大，请减少勾选的版式数量后重试。',
    missingReferences: '商品参考图不完整，已停止提交。请重新添加商品原图。',
    watermarkScope: '应用于本轮全部版式',
    watermarkSelectType: '请选择文字或图片水印。',
    watermarkTextRequired: '请输入水印文字，最多 19 个字符。',
    watermarkImageRequired: '请上传图片水印后再生成。',
    watermarkSaveFailed: '个人水印配置尚未保存，请重试。',
    watermarkUnsupported: '当前生图服务尚不支持水印，请更新服务后重试。',
    watermarkInvalid: '水印设置无效，请检查文字和图片。',
    saved: '已加入生成队列。',
    pickerTitle: '选择商品原图',
    pickerSearch: '搜索图片名称',
    pickerEmpty: '资源库里暂无可用图片，可先从文件夹上传。',
    pickerLoading: '正在读取资源库…',
    close: '关闭',
    previewIdentity: '仅按真实商品图保持外观；版式不会改变商品结构。',
    layoutCount: (selected, total) => `${selected}/${total} 款已勾选`
  },
  en: {
    title: 'Commerce layouts',
    subtitle: 'Select 1–10 layouts. Each selected layout generates one independent image, with no fixed set.',
    source: 'Product photo',
    sourceHint: 'Up to 3 photos · first photo is primary',
    upload: 'Upload photo',
    library: 'Choose from library',
    drop: 'Drop, upload, or paste a reference photo',
    pasteHint: 'Click the reference area and press Ctrl+V, or paste an image anywhere on this page',
    fileLimit: 'JPG / PNG / WebP · up to 10 MB each',
    primary: 'Primary',
    supporting: 'Supporting',
    makePrimary: 'Make primary',
    sourceLimit: 'Add up to three product photos.',
    duplicateSource: 'This product photo is already added.',
    replace: 'Replace photo',
    remove: 'Remove photo',
    sample: 'Product layout example · not your product',
    productInfo: 'Product information',
    productName: 'Product name',
    productPlaceholder: 'For example: commuter crossbody bag',
    points: 'Product benefits (optional)',
    pointsHint: 'One per line, up to three; AI drafts missing benefits when generating',
    pointsPlaceholder: 'For example: adjustable strap\nExternal zip pocket\nEasy to carry',
    scene: 'Use setting (optional)',
    scenePlaceholder: 'For example: daily commute, modern home',
    noProvider: 'No service supports the current reference count',
    selectedLayouts: 'Selected layouts',
    clearSelection: 'Clear',
    total: 'images',
    gallery: 'Select layouts',
    galleryHint: 'Select across categories; each layout generates one image in selection order',
    galleryCount: (shown, total) => `Showing ${shown} / ${total} · scroll to browse`,
    preview: 'Composition preview',
    previewHint: 'The sample illustrates the layout. Your photo determines the actual product.',
    handbagPreviewHint: 'The blue handbag illustrates the layout. Your uploaded photo determines the actual product.',
    newLayout: 'New',
    selectLayout: 'Select this layout',
    unselectLayout: 'Deselect layout',
    emptySelection: 'No layouts selected. Choose one or more from the gallery below.',
    noSelection: 'Select at least one layout.',
    limitSelection: 'Choose at most 10 layouts. Deselect one to add another.',
    allLayouts: 'All',
    favoriteLayouts: 'Favorites',
    addFavorite: 'Favorite layout',
    removeFavorite: 'Remove favorite',
    emptyFavorites: 'No favorite layouts yet. Click the heart at the bottom of a layout to save it.',
    signInFavorites: 'Sign in to view and save your favorite layouts.',
    favoritesLoading: 'Loading favorite layouts…',
    favoritesLoadFailed: 'Unable to load your favorites. Please retry.',
    favoritesSaveFailed: 'Unable to save this change. It has been reverted; please retry.',
    retryFavorites: 'Retry',
    bill: 'Estimated reserve',
    billNeedSource: 'Quote after adding a photo',
    billNeedSelection: 'Quote after selecting layouts',
    billPending: 'Quoting…',
    billError: 'Quote unavailable',
    generate: (count) => `Generate ${count} images`,
    generating: 'Submitting…',
    signIn: 'Sign in to generate',
    billedByServer: 'Each selected layout generates separately. The current service determines the price.',
    missingSource: 'Upload a product photo or choose one from the library.',
    tooManyPoints: 'Use at most three benefits before generating.',
    invalidFile: 'Choose a JPG, PNG, or WebP image.',
    tooLarge: 'The product reference photo cannot exceed 10 MB.',
    unsupportedFile: 'This image format is unsupported by the current service. Change the photo or service.',
    invalidProvider: 'Choose a service supporting the current references and output size.',
    insufficient: 'Insufficient credits. Add credits or choose another service.',
    queueFull: 'The generation queue is full. Finish existing tasks first.',
    quoteFailed: 'Unable to confirm the image price. Please retry later.',
    submitFailed: 'Submission failed. No new generation tasks were created.',
    serviceUnavailable: 'Unable to reach the generation service. Please retry. No tasks were submitted.',
    sessionExpired: 'Your session has expired. Please sign in again.',
    batchTooLarge: 'The image batch is too large. Select fewer layouts and retry.',
    missingReferences: 'Product references are incomplete. Add the product photos again.',
    watermarkScope: 'Apply to all layouts in this run',
    watermarkSelectType: 'Choose a text or image watermark.',
    watermarkTextRequired: 'Enter watermark text (up to 19 characters).',
    watermarkImageRequired: 'Upload a watermark image before generating.',
    watermarkSaveFailed: 'Your watermark settings could not be saved. Please retry.',
    watermarkUnsupported: 'This image service does not support watermarks yet. Update it and retry.',
    watermarkInvalid: 'Check the watermark text and image.',
    saved: 'Added to the generation queue.',
    pickerTitle: 'Select product photo',
    pickerSearch: 'Search image names',
    pickerEmpty: 'No eligible images yet. Upload a photo instead.',
    pickerLoading: 'Loading your library…',
    close: 'Close',
    previewIdentity: 'The real product photo governs appearance; a layout does not change its structure.',
    layoutCount: (selected, total) => `${selected}/${total} selected`
  }
};

function LayoutArtwork({ layoutId, compact = false, language = 'zh' }) {
  const layout = LAYOUT_TEMPLATES.find((item) => item.id === layoutId);
  const artworkUrl = layoutArtworkUrls[`./assets/ecommerce-layouts/generated/${layout?.artwork}`];
  return <div className={`layoutArtwork layoutArtworkRaster ${compact ? 'compact' : ''}`}>
    {artworkUrl ? <img
      src={artworkUrl}
      alt={compact ? '' : `${language === 'zh' ? layout.name : layout.nameEn} · Pic365`}
      loading={compact ? 'lazy' : 'eager'}
      decoding="async"
      width={1024}
      height={1024}
      draggable={false}
    /> : <LoaderCircle className="spin" size={24} aria-hidden="true" />}
  </div>;
}

function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('IMAGE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

function formatCredits(value) {
  return Number(Number(value || 0).toFixed(2));
}

export default function EcommerceLayoutStudio({
  language = 'zh',
  visible = true,
  session,
  profile,
  providers = [],
  imageSettings,
  activeQueueTaskCount = 0,
  onSignIn,
  onBilling,
  onTasksQueued,
  tasks = [],
  onOpenPreview,
  onOpenTasks
}) {
  const t = COPY[language] || COPY.en;
  const fileRef = useRef(null);
  const uploadButtonRef = useRef(null);
  const submittingRef = useRef(false);
  const [sources, setSources] = useState([]);
  const sourceReadRef = useRef(false);
  const [sourceReading, setSourceReading] = useState(false);
  const [sourceDragging, setSourceDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [assetItems, setAssetItems] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [productName, setProductName] = useState('');
  const [sellingPoints, setSellingPoints] = useState('');
  const [scene, setScene] = useState('');
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkReading, setWatermarkReading] = useState(false);
  const watermarkUserId = session?.user?.id || profile?.id || '';
  const watermarkSettings = useEcommerceWatermarkSettings(watermarkUserId);
  const [selections, setSelections] = useState(createDefaultLayoutSelections);
  const [activeType, setActiveType] = useState('all');
  const favoritesUserId = session?.user || session?.access_token
    ? session?.user?.id || profile?.id || '' : '';
  const favorites = useEcommerceLayoutFavorites(favoritesUserId);
  const [previewLayoutId, setPreviewLayoutId] = useState(LAYOUT_TEMPLATES[0].id);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [submittedBatchId, setSubmittedBatchId] = useState('');
  const [pendingLayouts, setPendingLayouts] = useState([]);
  const [galleryGroup, setGalleryGroup] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [{ message, tone: messageTone }, setMessage] = useImageStudioFeedback();

  useEffect(() => {
    setWatermarkEnabled(false);
  }, [watermarkUserId]);

  const { providerId, size, quality, width, height, sizeMode, sizeCheck } = imageSettings;
  const slots = useMemo(() => layoutSlots(selections), [selections]);
  const requiredReferenceCount = slots.length
    ? Math.max(...slots.map((slot) => layoutReferenceCount(sources.length || 1, slot.layoutId)))
    : sources.length || 1;
  const supportedProviders = useMemo(
    () => providers.filter((item) => getImageModelConstraints(item.model).maxReferenceImages >= requiredReferenceCount),
    [providers, requiredReferenceCount]
  );
  const provider = supportedProviders.find((item) => item.id === providerId) || null;
  const allowedMimeTypes = getImageModelConstraints(provider?.model).referenceMimeTypes;
  const currentLayout = LAYOUT_TEMPLATES.find((item) => item.id === previewLayoutId);
  const availableLayouts = layoutsForCategory(activeType, favorites.ids);
  const visibleLayouts = activeType === 'selling' && galleryGroup !== 'all'
    ? availableLayouts.filter((item) => item.group === galleryGroup) : availableLayouts;
  const enteredPoints = sellingPoints.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const isSignedIn = Boolean(session?.user || session?.access_token);
  const { skipImagePricing, showImagePricing, requestImagePricingBatch } = useImagePricingAccess();
  const canQuote = isSignedIn && Boolean(profile?.isSuperAdmin || Number(profile?.creditBalance || 0) > 0);
  const quoteItems = useMemo(() => slots.map((slot) => ({
    key: slot.key,
    providerId,
    size,
    quality,
    count: 1,
    chargeTextTokens: provider?.chargeTextTokens,
    referenceCount: layoutReferenceCount(sources.length || 1, slot.layoutId),
    prompt: buildEcommerceLayoutPrompt({ slot, productName, sellingPoints, scene, copyLanguage: language, productReferenceCount: sources.length || 1 })
  })), [slots, providerId, size, quality, productName, sellingPoints, scene, language, sources.length, provider?.chargeTextTokens]);
  const { pricingByKey, loading: pricingLoading, error: pricingError } = useServerImagePricingBatch(quoteItems, {
    enabled: visible && canQuote && sizeCheck.valid && Boolean(sources.length && provider && slots.length),
    debounceMs: 220
  });
  const hasQuotes = quoteItems.length > 0 && quoteItems.every((item) => Boolean(pricingByKey[item.key]));
  const estimatedCredits = hasQuotes
    ? formatCredits(quoteItems.reduce((sum, item) => sum + Number(pricingByKey[item.key]?.credits || 0), 0))
    : null;

  useEffect(() => {
    if (visible && supportedProviders.length && !provider && !submitting) {
      imageSettings.setProviderId(supportedProviders[0].id);
    }
  }, [visible, supportedProviders, providerId, submitting]);

  useEffect(() => {
    if (!pickerOpen || !isSignedIn) return undefined;
    const controller = new AbortController();
    setAssetsLoading(true);
    const params = new URLSearchParams({ limit: '80', mediaType: 'image' });
    if (pickerSearch.trim()) params.set('q', pickerSearch.trim());
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/assets?${params}`, { signal: controller.signal, cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!controller.signal.aborted) setAssetItems(response.ok && payload.ok
          ? (payload.assets || []).filter((asset) => asset.mediaType === 'image'
            && !asset.deletedAt && ['ready', 'completed'].includes(asset.status)
            && Number(asset.fileSize || 0) > 0
            && Number(asset.fileSize || 0) <= MAX_PRODUCT_IMAGE_BYTES
            && allowedMimeTypes.includes(String(asset.mimeType || '').split(';')[0].trim().toLowerCase()))
          : []);
      } catch {
        if (!controller.signal.aborted) setAssetItems([]);
      } finally {
        if (!controller.signal.aborted) setAssetsLoading(false);
      }
    }, 180);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [pickerOpen, pickerSearch, isSignedIn, provider?.model]);

  async function addProductFiles(input) {
    if (sourceReadRef.current || submittingRef.current) return;
    const files = Array.from(input || []);
    if (fileRef.current) fileRef.current.value = '';
    if (!files.length) return;
    if (files.length + sources.length > MAX_LAYOUT_PRODUCT_IMAGES) {
      setMessage(t.sourceLimit);
      return;
    }
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setMessage(t.invalidFile);
      return;
    }
    if (files.some((file) => file.size > MAX_PRODUCT_IMAGE_BYTES)) {
      setMessage(t.tooLarge);
      return;
    }
    if (provider && files.some((file) => !allowedMimeTypes.includes(file.type))) {
      setMessage(t.unsupportedFile);
      return;
    }
    sourceReadRef.current = true;
    setSourceReading(true);
    try {
      const added = await Promise.all(files.map(async (file) => {
        const imageDataUrl = await imageFileToDataUrl(file);
        return {
          id: globalThis.crypto.randomUUID(),
          source: 'upload', imageDataUrl, previewUrl: imageDataUrl,
          mimeType: file.type, name: file.name, byteLength: file.size
        };
      }));
      setSources((current) => [...current, ...added].slice(0, MAX_LAYOUT_PRODUCT_IMAGES));
      setMessage('');
    } catch {
      setMessage(t.invalidFile);
    } finally {
      sourceReadRef.current = false;
      setSourceReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  useEffect(() => {
    if (!visible || pickerOpen || sampleOpen) return undefined;
    function pasteProductImage(event) {
      if (event.defaultPrevented) return;
      const images = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === 'file' && String(item.type || '').startsWith('image/'))
        .map((item) => item.getAsFile()).filter(Boolean);
      if (!images.length) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable]')
        && event.clipboardData?.getData('text/plain')) return;
      event.preventDefault();
      void addProductFiles(images);
    }
    document.addEventListener('paste', pasteProductImage);
    return () => document.removeEventListener('paste', pasteProductImage);
  }, [visible, pickerOpen, sampleOpen, provider?.model, language, sources.length]);

  function chooseAsset(asset) {
    if (sourceReadRef.current || submittingRef.current) return;
    if (sources.length >= MAX_LAYOUT_PRODUCT_IMAGES) { setMessage(t.sourceLimit); setPickerOpen(false); return; }
    if (sources.some((item) => item.assetId === asset.id)) { setMessage(t.duplicateSource); setPickerOpen(false); return; }
    setSources((current) => [...current, {
      id: globalThis.crypto.randomUUID(),
      source: 'asset',
      assetId: asset.id,
      previewUrl: asset.thumbnailUrl || asset.previewUrl || asset.originalUrl,
      mimeType: asset.mimeType,
      name: asset.name || asset.originalName || t.source,
      byteLength: Number(asset.fileSize || 0)
    }]);
    setPickerOpen(false);
    setMessage('');
  }

  function toggleLayout(layoutId) {
    if (submitting) return;
    if (!selections.includes(layoutId) && selections.length >= MAX_LAYOUT_IMAGES) {
      setMessage(t.limitSelection);
      return;
    }
    setSelections((current) => toggleSelectedLayout(current, layoutId));
    setPreviewLayoutId(layoutId);
    setMessage('');
  }

  async function submitLayouts() {
    if (submittingRef.current || sourceReadRef.current || watermarkReading) return;
    if (!slots.length) { setMessage(t.noSelection); return; }
    if (!sources.length) { setMessage(t.missingSource); uploadButtonRef.current?.focus(); return; }
    if (enteredPoints.length > 3) { setMessage(t.tooManyPoints); return; }
    if (!isSignedIn) { onSignIn?.(); return; }
    if (!skipImagePricing && !canQuote) { onBilling?.(); setMessage(t.insufficient); return; }
    if (!provider || !size || !sizeCheck.valid) { setMessage(t.invalidProvider); return; }
    if (sources.some((source) => !allowedMimeTypes.includes(source.mimeType))) { setMessage(t.unsupportedFile); return; }
    if (activeQueueTaskCount + slots.length > MAX_ACTIVE_IMAGE_TASKS) { setMessage(t.queueFull); return; }
    let layoutWatermark = null;
    if (watermarkEnabled) {
      if (!watermarkSettings.ready) { setMessage(t.watermarkSaveFailed); return; }
      const settings = watermarkSettings.settings;
      if (!settings.textEnabled && !settings.imageEnabled) { setMessage(t.watermarkSelectType); return; }
      if (settings.textEnabled && !settings.text.trim()) { setMessage(t.watermarkTextRequired); return; }
      if (settings.imageEnabled && !settings.imageDataUrl) {
        setMessage(t.watermarkImageRequired);
        return;
      }
      try {
        layoutWatermark = activeEcommerceWatermarkSettings(await watermarkSettings.flush());
      } catch {
        setMessage(t.watermarkSaveFailed);
        return;
      }
    }
    const batchId = `layout-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
    setSubmittedBatchId(batchId);
    setPendingLayouts(slots.map((slot) => slot.layoutId));
    submittingRef.current = true;
    setSubmitting(true);
    setMessage('');
    try {
      if (!skipImagePricing) {
        const quotes = await requestImagePricingBatch(quoteItems);
        const requiredCredits = formatCredits(quotes.reduce((sum, item) => sum + Number(item.pricing?.credits || 0), 0));
        if (!profile?.isSuperAdmin && Number(profile?.creditBalance || 0) < requiredCredits) {
          onBilling?.();
          setMessage(t.insufficient);
          return;
        }
      }
      const productReferences = sources.map((source) => source.source === 'asset'
        ? { assetId: source.assetId, annotations: [] }
        : { clientId: source.id, imageDataUrl: source.imageDataUrl, annotations: [] });
      const tasks = quoteItems.map((item, index) => ({
        clientTaskId: `${batchId}-${String(index + 1).padStart(2, '0')}`,
        batchId,
        batchIndex: index,
        layoutId: slots[index].layoutId,
        prompt: item.prompt,
        size,
        quality,
        count: 1,
        providerId,
        layoutProductReferenceCount: productReferences.length,
        layoutReferenceMode: 'prompt-only',
        ...(layoutWatermark ? { layoutWatermark } : {}),
        references: []
      }));
      const { response, payload } = await submitLayoutGenerationTasks(tasks, productReferences);
      if (!response.ok || !payload.ok) {
        setMessage(['TASK_LIST_FULL', 'TASK_ACTIVE_LIMIT'].includes(payload.error)
          ? t.queueFull
          : payload.error === 'CREDITS_REQUIRED' ? t.insufficient
              : payload.error === 'AUTH_REQUIRED' ? t.sessionExpired
              : payload.error === 'REQUEST_BODY_TOO_LARGE' ? t.batchTooLarge
                : payload.error === 'LAYOUT_WATERMARK_INVALID' ? t.watermarkInvalid
                : payload.error === 'LAYOUT_REFERENCES_INCOMPLETE' ? t.missingReferences : t.submitFailed);
        return;
      }
      setMessage(t.saved, 'status');
      onTasksQueued?.(payload.tasks || []);
    } catch (error) {
      setMessage(error?.message === 'PRICING_LOAD_FAILED' ? t.quoteFailed
        : error?.message === 'AUTH_REQUIRED' ? t.sessionExpired
          : error?.message === 'REQUEST_BODY_TOO_LARGE' ? t.batchTooLarge
            : error?.message === 'LAYOUT_WATERMARK_UNSUPPORTED' ? t.watermarkUnsupported
            : error?.message === 'LAYOUT_REFERENCE_CHECK_FAILED' ? t.serviceUnavailable
              : error?.message === 'LAYOUT_REFERENCES_INCOMPLETE' ? t.missingReferences : t.submitFailed);
    } finally {
      setPendingLayouts([]);
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return <section className="ecommerceLayoutStudio" aria-label={t.title}>
    <div className="layoutStudioGrid">
      <aside className="layoutStudioInputs">
        <div className="layoutStudioInputScroll">
        <section className="layoutStudioSection">
          <div className="layoutStudioSectionHead"><span className="layoutStudioIndex">01</span><div><h2>{t.source}</h2><p>{t.sourceHint}</p></div></div>
          <input
            ref={fileRef}
            className="layoutStudioFileInput"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => void addProductFiles(event.target.files)}
          />
          <div
            className={`layoutStudioDropzone ${sourceDragging ? 'dragging' : ''} ${sources.length ? 'hasImages' : ''}`}
            tabIndex={0}
            aria-label={`${t.source} · ${t.pasteHint}`}
            onDragOver={(event) => { event.preventDefault(); setSourceDragging(true); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSourceDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setSourceDragging(false); void addProductFiles(event.dataTransfer?.files); }}
          >
            {sources.length ? <div className="layoutStudioProductGrid">
              {sources.map((source, index) => <div className={`layoutStudioProduct ${index === 0 ? 'primary' : ''}`} key={source.id}>
                <img src={source.previewUrl} alt={source.name || `${t.source} ${index + 1}`} />
                <span className="layoutStudioProductBadge">{index === 0 ? t.primary : `${t.supporting} ${index}`}</span>
                <div className="layoutStudioProductTools">
                  {index > 0 ? <button type="button" disabled={sourceReading || submitting} onClick={() => setSources((current) => promoteLayoutProduct(current, source.id))} aria-label={`${t.makePrimary} ${index + 1}`} title={t.makePrimary}><Star size={13} /></button> : null}
                  <button type="button" disabled={sourceReading || submitting} onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))} aria-label={`${t.remove} ${index + 1}`} title={t.remove}><X size={13} /></button>
                </div>
              </div>)}
              {sources.length < MAX_LAYOUT_PRODUCT_IMAGES ? <button className="layoutStudioAddProduct" type="button" disabled={sourceReading || submitting} onClick={() => fileRef.current?.click()} aria-label={t.upload} title={t.upload}><ImagePlus size={23} /></button> : null}
            </div> : <button className="layoutStudioEmptyUpload" type="button" disabled={sourceReading || submitting} onClick={() => fileRef.current?.click()}>
              <UploadCloud size={29} />
              <strong>{t.drop}</strong>
              <small>{t.fileLimit}</small>
            </button>}
          </div>
          <div className="layoutStudioSourceActions">
            <button ref={uploadButtonRef} type="button" disabled={sourceReading || submitting || sources.length >= MAX_LAYOUT_PRODUCT_IMAGES} onClick={() => fileRef.current?.click()}>{sourceReading ? <LoaderCircle className="spin" size={16} /> : <ImagePlus size={16} />}{t.upload}</button>
            <button type="button" disabled={sourceReading || submitting || sources.length >= MAX_LAYOUT_PRODUCT_IMAGES} onClick={() => {
              if (!isSignedIn) { onSignIn?.(); return; }
              setPickerOpen(true);
            }}><Images size={16} />{t.library}</button>
          </div>
        </section>
        <section className="layoutStudioSection">
          <div className="layoutStudioSectionHead"><span className="layoutStudioIndex">02</span><div><h2>{t.productInfo}</h2></div></div>
          <label className="layoutStudioField"><span>{t.productName}</span><input value={productName} onChange={(event) => setProductName(event.target.value)} maxLength={100} placeholder={t.productPlaceholder} /></label>
          <label className="layoutStudioField"><span>{t.points}</span><textarea value={sellingPoints} onChange={(event) => setSellingPoints(event.target.value)} maxLength={600} rows={3} placeholder={t.pointsPlaceholder} aria-invalid={enteredPoints.length > 3} /><small className={enteredPoints.length > 3 ? 'layoutStudioFieldError' : ''}>{enteredPoints.length > 3 ? t.tooManyPoints : `${t.pointsHint} · ${enteredPoints.length}/3`}</small></label>
          <label className="layoutStudioField"><span>{t.scene}</span><input value={scene} onChange={(event) => setScene(event.target.value)} maxLength={180} placeholder={t.scenePlaceholder} /></label>
        </section>
        <section className="layoutStudioSection layoutStudioSettingSection">
          <div className="layoutStudioSectionHead"><span className="layoutStudioIndex">03</span><div><h2>{language === 'zh' ? '生成设置' : 'Generation settings'}</h2></div></div>
          {supportedProviders.length ? <FreeImageSettings
            {...imageSettings}
            language={language}
            providers={supportedProviders}
            isGenerating={imageSettings.isGenerating || submitting}
            batch={false}
            hideCount
          >
            {!sizeCheck.valid ? <p className="freeImageSizeError">{language === 'zh' ? '当前服务不支持此尺寸，请调整画幅比例或像素长宽。' : 'This size is unsupported. Adjust the ratio or pixel dimensions.'}</p> : null}
          </FreeImageSettings> : <ImageStudioFeedback className="layoutStudioMessage">{t.noProvider}</ImageStudioFeedback>}
          <EcommerceWatermarkSettings language={language} scope={t.watermarkScope}
            className="layoutStudioWatermark" active={watermarkEnabled}
            onActiveChange={setWatermarkEnabled} state={watermarkSettings}
            disabled={submitting} onBusyChange={setWatermarkReading} onMessage={setMessage} />
        </section>
        </div>
        <div className="layoutStudioSubmit">
          {showImagePricing && <div className="layoutStudioEstimate">
            <span>{t.bill} · {slots.length} {t.total}</span>
            <strong className={pricingError || !provider || !sizeCheck.valid ? 'error' : ''}>{!slots.length ? t.billNeedSelection : !sources.length ? t.billNeedSource : !canQuote ? '—' : !provider || !sizeCheck.valid ? t.invalidProvider : pricingError ? t.billError : pricingLoading || !hasQuotes ? t.billPending : `${estimatedCredits} ${language === 'zh' ? '积分' : 'credits'}`}</strong>
          </div>}
          <button className="layoutStudioGenerate" type="button" onClick={() => void submitLayouts()} disabled={submitting || sourceReading || watermarkReading || !provider || !slots.length || !sizeCheck.valid} aria-busy={submitting}>
            {submitting ? <LoaderCircle className="spin" size={18} /> : <ShoppingBag size={18} />}
            <span>{submitting ? t.generating : isSignedIn ? t.generate(slots.length) : t.signIn}</span>
            <ChevronRight size={17} />
          </button>
          <ImageStudioFeedback className="layoutStudioMessage" tone={messageTone}>{message}</ImageStudioFeedback>
        </div>
      </aside>

      <div className="layoutStudioWork">
        <section className="layoutStudioSelection">
          <div className="layoutStudioPanelHead">
            <div><h2>{t.gallery}</h2></div>
            <small>{t.layoutCount(slots.length, MAX_LAYOUT_IMAGES)}</small>
          </div>
          <div className="layoutStudioSelected">
            <div className="layoutStudioSelectedHeader">
              <strong>{t.selectedLayouts}</strong>
              <button type="button" disabled={!slots.length || submitting} onClick={() => { setSelections([]); setMessage(''); }} title={t.clearSelection}><Trash2 size={13} />{t.clearSelection}</button>
            </div>
            {slots.length ? <div className="layoutStudioSelectedRail" role="group" aria-label={t.selectedLayouts}>
              {slots.map((slot, index) => {
                const layout = LAYOUT_TEMPLATES.find((item) => item.id === slot.layoutId);
                return <button type="button" key={slot.key} disabled={submitting} onClick={() => toggleLayout(layout.id)} title={language === 'zh' ? layout.name : layout.nameEn} aria-label={`${t.unselectLayout}：${language === 'zh' ? layout.name : layout.nameEn}`}><span>{index + 1}</span>{language === 'zh' ? layout.name : layout.nameEn}<X size={12} /></button>;
              })}
            </div> : <span className="layoutStudioSelectionEmpty">{t.emptySelection}</span>}
          </div>
          <div className="layoutStudioCategoryTabs" role="group" aria-label={language === 'zh' ? '版式类型' : 'Layout types'}>
            {[{ id: 'all', label: t.allLayouts, labelEn: t.allLayouts },
              { id: 'favorites', label: t.favoriteLayouts, labelEn: t.favoriteLayouts }, ...LAYOUT_IMAGE_TYPES].map((type) => <button
              type="button"
              key={type.id}
              className={activeType === type.id ? 'active' : ''}
              aria-pressed={activeType === type.id}
              onClick={() => {
                setActiveType(type.id);
                setGalleryGroup('all');
                setPreviewLayoutId(layoutsForCategory(type.id, favorites.ids)[0]?.id || '');
              }}
            >{language === 'zh' ? type.label : type.labelEn}<span>{layoutsForCategory(type.id, favorites.ids).length}</span></button>)}
          </div>
          {activeType === 'selling' ? <div className="layoutStudioGalleryGroups" role="group" aria-label={language === 'zh' ? '卖点版式分类' : 'Benefit layout categories'}>
            {SELLING_LAYOUT_GROUPS.map((group) => <button
              type="button"
              key={group.id}
              className={galleryGroup === group.id ? 'active' : ''}
              aria-pressed={galleryGroup === group.id}
              onClick={() => {
                setGalleryGroup(group.id);
                setPreviewLayoutId((group.id === 'all' ? availableLayouts : availableLayouts.filter((layout) => layout.group === group.id))[0]?.id || '');
              }}
            >
              {language === 'zh' ? group.label : group.labelEn}
              <span>{group.id === 'all' ? availableLayouts.length : availableLayouts.filter((item) => item.group === group.id).length}</span>
            </button>)}
          </div> : null}
            {favorites.error ? <div className="layoutStudioFavoritesNotice" role="alert">
              <span>{favorites.status === 'loadError' ? t.favoritesLoadFailed : t.favoritesSaveFailed}</span>
              {favorites.status === 'loadError' ? <button type="button" onClick={() => void favorites.reload().catch(() => {})}>{t.retryFavorites}</button> : null}
            </div> : null}
            <div className="layoutStudioGallery" role="group" aria-label={t.gallery}>
              {activeType === 'favorites' && !visibleLayouts.length ? <div className="layoutStudioGalleryEmpty" role="status">
                {isSignedIn && !favorites.ready && favorites.status !== 'loadError'
                  ? <LoaderCircle className="spin" size={24} aria-hidden="true" /> : <Heart size={24} aria-hidden="true" />}
                <span>{!isSignedIn ? t.signInFavorites : !favorites.ready
                  ? favorites.status === 'loadError' ? t.favoritesLoadFailed : t.favoritesLoading
                  : t.emptyFavorites}</span>
                {!isSignedIn ? <button type="button" onClick={() => onSignIn?.()}>{language === 'zh' ? '登录' : 'Sign in'}</button> : null}
              </div> : null}
              {visibleLayouts.map((layout) => {
                const selected = selections.includes(layout.id);
                const favorited = favorites.ids.includes(layout.id);
                return <article
                  key={layout.id}
                  className={`layoutStudioLayoutCard ${selected ? 'selected' : ''}`}
                ><button
                  type="button"
                  className="layoutStudioLayoutSelect"
                  role="checkbox"
                  aria-checked={selected}
                  aria-label={`${selected ? t.unselectLayout : t.selectLayout}：${language === 'zh' ? layout.name : layout.nameEn}`}
                  disabled={submitting}
                  onClick={() => toggleLayout(layout.id)}
                >
                  <span className="layoutStudioCardCheck" aria-hidden="true">{selected ? <Check size={13} /> : null}</span>
                  <LayoutArtwork layoutId={layout.id} compact language={language} />
                  <span className="layoutStudioLayoutCaption"><strong>{language === 'zh' ? layout.name : layout.nameEn}</strong><small>{layout.collection === '20261108' ? <span className="layoutStudioNewBadge">{t.newLayout}</span> : null}{String(layout.reference).padStart(2, '0')}</small></span>
                </button>
                  <button className={`layoutStudioFavorite ${favorited ? 'active' : ''}`} type="button"
                    aria-pressed={favorited} aria-busy={favorites.pending.includes(layout.id)}
                    aria-label={`${favorited ? t.removeFavorite : t.addFavorite}：${language === 'zh' ? layout.name : layout.nameEn}`}
                    title={favorited ? t.removeFavorite : t.addFavorite}
                    disabled={isSignedIn && (!favorites.ready || favorites.pending.includes(layout.id))}
                    onClick={() => {
                      if (!isSignedIn) { onSignIn?.(); return; }
                      void favorites.toggle(layout.id).catch(() => {});
                    }}><Heart size={18} fill={favorited ? 'currentColor' : 'none'} aria-hidden="true" /></button>
                  <button className="layoutStudioSampleExpand" type="button" onClick={() => { setPreviewLayoutId(layout.id); setSampleOpen(true); }} aria-label={`${language === 'zh' ? '查看样板' : 'View sample'}：${language === 'zh' ? layout.name : layout.nameEn}`} title={language === 'zh' ? '查看样板' : 'View sample'}><Maximize2 size={14} /></button>
                </article>;
              })}
            </div>
        </section>
      </div>
      <EcommerceLayoutResults language={language} tasks={tasks} pendingLayouts={pendingLayouts} onOpenPreview={onOpenPreview} onOpenTasks={onOpenTasks} submittedBatchId={submittedBatchId} />
    </div>
    {sampleOpen && currentLayout ? <div className="layoutStudioModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSampleOpen(false); }}>
      <section className="layoutStudioModal layoutStudioSampleModal" role="dialog" aria-modal="true" aria-label={language === 'zh' ? currentLayout.name : currentLayout.nameEn} onKeyDown={(event) => { if (event.key === 'Escape') setSampleOpen(false); }}>
        <header><h2>{language === 'zh' ? currentLayout.name : currentLayout.nameEn}</h2><button autoFocus type="button" aria-label={t.close} onClick={() => setSampleOpen(false)}><X size={18} /></button></header>
        {currentLayout.sampleSubject === 'handbag' ? <p className="layoutStudioSampleHint">{t.handbagPreviewHint}</p> : null}
        <LayoutArtwork layoutId={currentLayout.id} language={language} />
        <button className="layoutStudioPreviewToggle" type="button" disabled={submitting} aria-pressed={selections.includes(currentLayout.id)} onClick={() => toggleLayout(currentLayout.id)}><Check size={15} />{selections.includes(currentLayout.id) ? t.unselectLayout : t.selectLayout}</button>
      </section>
    </div> : null}
    {pickerOpen ? <div className="layoutStudioModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}>
      <section className="layoutStudioModal" role="dialog" aria-modal="true" aria-label={t.pickerTitle} onKeyDown={(event) => { if (event.key === 'Escape') setPickerOpen(false); }}>
        <header><h2>{t.pickerTitle}</h2><button type="button" aria-label={t.close} onClick={() => setPickerOpen(false)}><X size={18} /></button></header>
        <input type="search" value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder={t.pickerSearch} aria-label={t.pickerSearch} autoFocus />
        {assetsLoading ? <p className="layoutStudioModalEmpty"><LoaderCircle className="spin" size={18} />{t.pickerLoading}</p> : assetItems.length ? (
          <div className="layoutStudioAssetGrid">{assetItems.map((asset) => <button type="button" key={asset.id} onClick={() => chooseAsset(asset)}>
            <img src={asset.thumbnailUrl || asset.previewUrl || asset.originalUrl} alt="" loading="lazy" />
            <span>{asset.name || asset.originalName || t.source}</span>
          </button>)}</div>
        ) : <p className="layoutStudioModalEmpty">{t.pickerEmpty}</p>}
      </section>
    </div> : null}
  </section>;
}
