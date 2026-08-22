import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Check,
  Copy,
  Download,
  Edit3,
  Eye,
  ImagePlus,
  ListTodo,
  LockKeyhole,
  LoaderCircle,
  Maximize2,
  Minus,
  RotateCcw,
  Trash2,
  Upload,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

import {
  alignImageDimension,
  COMMON_IMAGE_SIZES,
  dimensionsForImageModelRatio,
  dimensionsFromLockedValue,
  GEMINI_IMAGE_COMMON_SIZES,
  GEMINI_IMAGE_RATIO_PRESETS,
  getImageModelConstraints,
  IMAGE_RATIO_PRESETS,
  parseImageSize,
  resolveReferenceImageSize,
  resolveSourceImageSizeForModel,
  validateImageSizeForModel
} from '../shared/image-generation.js';
import { generatedImageUrl, GENERATED_THUMBNAIL_VARIANT } from '../shared/image-thumbnails.js';
import FreeImageReferenceEditor from './free-image-reference-editor';
import { fetchImageGeneration, isImageGenerationTimeout } from './image-generation-client.js';
import { ImageCreditPrice, requestImagePricing, useServerImagePricing, useServerImagePricingBatch } from './image-pricing-client.jsx';
import { clampImagePanOffset } from './image-pan-zoom.js';
import { IMAGE_QUALITY_VALUES, imageQualityLabel } from './image-quality-labels.js';
import { imageReferenceIdentity, resolveImageReferenceTarget } from './image-reference-routing.js';
import {
  isActiveImageTask,
  MAX_IMAGE_TASKS
} from './image-task-list.js';

function isAuthenticatedSession(session) {
  return Boolean(session?.user || session?.access_token);
}

function mentionAtCursor(value, cursor) {
  const before = value.slice(0, cursor);
  const match = before.match(/@([^\s@]*)$/);
  if (!match) return null;
  return { start: cursor - match[0].length, end: cursor, query: match[1].toLowerCase() };
}

function compactPrompt(value, maxLength = 72) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function ratioForSize(width, height, presets = IMAGE_RATIO_PRESETS) {
  return presets.find((preset) => width * preset.height === height * preset.width)?.id || 'free';
}

function workspaceQualityLabel(value, language, constraints) {
  if (!constraints?.isGeminiImage) return imageQualityLabel(value, language);
  if (value === 'low') return '1K';
  if (value === 'medium') return '2K';
  if (value === 'high') return '4K';
  return language === 'zh' ? '自动' : 'Auto';
}

function greatestCommonDivisor(left, right) {
  let a = Math.max(1, Math.round(Math.abs(Number(left) || 1)));
  let b = Math.max(1, Math.round(Math.abs(Number(right) || 1)));
  while (b) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function reducedCanvasRatio(width, height) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const divisor = greatestCommonDivisor(safeWidth, safeHeight);
  return { width: safeWidth / divisor, height: safeHeight / divisor };
}

const CanvasRatioGraphic = memo(function CanvasRatioGraphic({ ratioWidth, ratioHeight }) {
  const availableWidth = 48;
  const availableHeight = 30;
  const ratio = Math.max(0.01, Number(ratioWidth) / Math.max(1, Number(ratioHeight)));
  const rectangleWidth = ratio >= availableWidth / availableHeight
    ? availableWidth
    : availableHeight * ratio;
  const rectangleHeight = ratio >= availableWidth / availableHeight
    ? availableWidth / ratio
    : availableHeight;
  return <span className="freeImageRatioGraphic" aria-hidden="true">
    <i style={{ width: `${rectangleWidth}px`, height: `${rectangleHeight}px` }} />
  </span>;
});

function referenceSourceDimensions(item) {
  const width = Math.round(Number(item?.width || 0));
  const height = Math.round(Number(item?.height || 0));
  if (width > 0 && height > 0) return { width, height };
  const parsed = parseImageSize(item?.size);
  return parsed && !parsed.auto ? { width: parsed.width, height: parsed.height } : { width: 0, height: 0 };
}

const MAX_QUEUE_TASKS = MAX_IMAGE_TASKS;
const HISTORY_PAGE_SIZE = 12;
const MAX_REFERENCE_SOURCE_BYTES = 40 * 1024 * 1024;
const REFERENCE_TARGET_BYTES = 1.2 * 1024 * 1024;
const REFERENCE_MAX_SIDE = 1600;
const MAX_BATCH_REPAIR_IMAGES = 20;
const BATCH_REPAIR_TARGET_BYTES = 700 * 1024;
const BATCH_REPAIR_THUMBNAIL_SIDE = 180;
const REFERENCE_FILE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAI_COMMON_IMAGE_SIZES = ['768x768', '768x1024', '1024x768', '1024x1024'];
const SIZE_TEMPLATES_STORAGE_KEY = 'pic365.free-image.size-templates.v1';

function loadProviderSizeTemplates() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(SIZE_TEMPLATES_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([providerId, size]) => providerId && parseImageSize(size) && size !== 'auto')
        .map(([providerId, size]) => [providerId, String(size).toLowerCase()])
    );
  } catch {
    return {};
  }
}

function normalizedImageMimeType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  return type === 'image/jpg' ? 'image/jpeg' : type;
}

function imageItemMimeType(item) {
  const explicit = normalizedImageMimeType(item?.mimeType || item?.contentType);
  if (explicit) return explicit;
  const dataUrlType = String(item?.imageDataUrl || item?.imageUrl || '').match(/^data:([^;,]+)/i)?.[1];
  if (dataUrlType) return normalizedImageMimeType(dataUrlType);
  return '';
}

function imageFileExtension(item) {
  const mimeType = imageItemMimeType(item);
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function previewDownloadFilename(item) {
  const identity = String(item?.generationId || item?.id || 'image')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
  return `pic365-${identity}.${imageFileExtension(item)}`;
}

async function writeClipboardText(value) {
  const text = String(value || '');
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Embedded browsers may block the async clipboard API.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function referenceAllowedForModel(item, constraints) {
  if (!constraints?.maxReferenceImages) return false;
  const mimeType = imageItemMimeType(item);
  if (!mimeType) return !constraints.isMai && !constraints.isGeminiImage;
  return constraints.referenceMimeTypes.includes(mimeType);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('REFERENCE_READ_FAILED'));
    reader.readAsDataURL(blob);
  });
}

function loadReferenceFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('REFERENCE_DECODE_FAILED'));
    };
    image.src = objectUrl;
  });
}

function canvasToImageBlob(canvas, contentType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('REFERENCE_ENCODE_FAILED'));
    }, contentType, quality);
  });
}

async function prepareReferenceFile(file, constraints, options = {}) {
  const sourceType = normalizedImageMimeType(file?.type);
  const allowedTypes = new Set(constraints?.referenceMimeTypes || [...REFERENCE_FILE_TYPES]);
  if (!allowedTypes.has(sourceType) || file.size <= 0 || file.size > MAX_REFERENCE_SOURCE_BYTES) {
    throw new Error('INVALID_REFERENCE_FILE');
  }
  const outputType = options.preserveSourceType || constraints?.isMai ? sourceType : 'image/webp';
  const image = await loadReferenceFile(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const targetBytes = Number(options.targetBytes || REFERENCE_TARGET_BYTES);
  let maxSide = Number(options.maxSide || REFERENCE_MAX_SIDE);
  let quality = 0.86;
  let blob;
  let width;
  let height;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    width = Math.max(1, Math.round(image.naturalWidth * scale));
    height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: outputType === 'image/png' });
    if (outputType === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    blob = await canvasToImageBlob(canvas, outputType, quality);
    if (blob.size <= targetBytes || maxSide <= 512) break;
    maxSide = Math.max(512, Math.round(maxSide * 0.82));
    quality = Math.max(0.66, quality - 0.07);
  }
  if (!blob) throw new Error('REFERENCE_ENCODE_FAILED');
  let thumbnailDataUrl = '';
  if (options.includeThumbnail) {
    const thumbnailScale = Math.min(1, BATCH_REPAIR_THUMBNAIL_SIDE / Math.max(sourceWidth, sourceHeight));
    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = Math.max(1, Math.round(sourceWidth * thumbnailScale));
    thumbnailCanvas.height = Math.max(1, Math.round(sourceHeight * thumbnailScale));
    thumbnailCanvas.getContext('2d')?.drawImage(image, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    const thumbnailBlob = await canvasToImageBlob(thumbnailCanvas, 'image/webp', 0.72);
    thumbnailDataUrl = await blobToDataUrl(thumbnailBlob);
  }
  return {
    dataUrl: await blobToDataUrl(blob),
    mimeType: outputType,
    width: sourceWidth,
    height: sourceHeight,
    processedWidth: width,
    processedHeight: height,
    byteLength: blob.size,
    thumbnailDataUrl
  };
}

async function imageItemToFile(item) {
  const imageUrl = item?.originalImageUrl || item?.imageUrl;
  if (!imageUrl) throw new Error('REFERENCE_READ_FAILED');
  const response = await fetch(imageUrl, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('REFERENCE_READ_FAILED');
  const blob = await response.blob();
  const mimeType = normalizedImageMimeType(blob.type) || imageItemMimeType(item);
  if (!REFERENCE_FILE_TYPES.has(mimeType)) throw new Error('INVALID_REFERENCE_FILE');
  return new File([blob], item?.sourceName || previewDownloadFilename({ ...item, mimeType }), { type: mimeType });
}

function localPromptPolish(prompt, language, referenceCount, hasAnnotations) {
  const additions = language === 'zh'
    ? [
        '主体明确，构图关系清晰；光线、材质、色彩、背景和细节自然协调。',
        referenceCount ? `按输入顺序使用 ${referenceCount} 张参考图，保留用户指向的关键视觉特征。` : '',
        hasAnnotations ? '彩色线框仅标记需要修改的区域，成图中不保留标记，未标记区域尽量保持不变。' : ''
      ]
    : [
        'Keep the subject clear and the composition intentional, with coherent lighting, materials, color, background, and natural detail.',
        referenceCount ? `Use all ${referenceCount} reference images in input order and preserve the visual features the user points to.` : '',
        hasAnnotations ? 'Colored outlines only mark regions to change; remove the marks from the final image and preserve unmarked areas where possible.' : ''
      ];
  return [prompt, ...additions.filter(Boolean)].join('\n\n').slice(0, 6000);
}

const copy = {
  zh: {
    taskList: '任务列表',
    queueNow: '加入队列',
    queueing: '排队中',
    queueRunning: '生成中',
    queueCompleted: '已完成',
    queueFailed: '失败',
    queueCancelling: '取消中',
    queueCancelled: '已取消',
    queueEmpty: '暂时没有排队任务。',
    queueFull: '任务列表已满 20 个，请先删除旧任务。',
    queueFullButton: '任务已满 20/20',
    deleteTask: '删除任务',
    cancelTask: '取消任务',
    cancelTaskDone: '任务已取消，预留积分已退回。',
    cancelTaskFailed: '取消失败，任务仍在进行，请重试。',
    redoTask: '重做',
    redoQueued: '已按原提示词、参考图和设置加入新的排队任务。',
    redoUnavailable: '该旧任务没有保留完整参考图，无法原样重做。',
    redoFailed: '重做任务创建失败，请稍后重试。',
    queuePeople: '打开任务队列',
    viewImage: '查看图片',
    useReference: '引用为参考图',
    editPreviewPrompt: '编辑提示词',
    previewPromptHint: '修改后可直接带回单图创作，或结合局部框选继续编辑。',
    copyPrompt: '复制提示词',
    copiedPrompt: '已复制',
    applyPrompt: '应用提示词',
    regionEdit: '框选局部编辑',
    localEditPrompt: '请描述涂抹区域内需要替换、移除、修复或调整的具体内容。',
    localEditLockedRule: '只修改涂抹区域。未涂抹区域全部锁定，保持原构图、主体、背景、光线、颜色、材质、文字、Logo、阴影和细节不变。',
    localEditReady: '已创建局部修图任务。请补充涂抹区域内需要修改的具体内容。',
    downloadOriginal: '下载原图',
    resetZoom: '还原',
    zoomIn: '放大',
    zoomOut: '缩小',
    title: '自由画坊',
    prompt: '提示词',
    placeholder: '输入画面主体、构图、风格、光线、文字和需要修改的内容。输入 @ 可引用历史生图。',
    placeholderNoReferences: '输入画面主体、构图、风格、光线、文字和细节要求。',
    optimize: 'AI 魔笔 · 1 积分',
    optimizing: '优化中',
    references: '参考图',
    referenceHint: '点击上传，或粘贴、拖拽多张图片；也可从历史生图中点击 @ 添加',
    uploadReference: '上传图片',
    uploadingReferences: '处理中',
    referenceUploadFailed: '部分参考图无法读取，请检查图片格式。',
    maiReferenceUploadFailed: 'MAI 参考图仅支持 JPEG 或 PNG。',
    referenceUnsupported: 'MAI-Image-2 不支持参考图编辑。',
    maiReferenceHint: 'MAI-Image-2.5 最多使用 1 张 JPEG 或 PNG 参考图',
    geminiReferenceHint: '香蕉模型支持 JPEG、PNG、WebP；Pic365 最多使用 9 张参考图',
    addReference: '作为参考',
    editMarks: '标记区域',
    maxReferences: (count) => `最多选择 ${count} 张参考图`,
    size: '画布尺寸',
    auto: 'Auto',
    commonSizes: '常用尺寸',
    customSize: '自定义尺寸',
    sizeTemplate: '模板',
    lockTemplate: '锁定尺寸',
    ratio: '比例锁定',
    free: '自由',
    width: '宽',
    height: '高',
    quality: '质量',
    drawCount: '抽卡张数',
    generate: '立即生图',
    generateFree: '免费生成 1 张',
    generating: '生成中',
    credits: '积分',
    creditCost: '预计消耗',
    perImage: '每张',
    emptyPrompt: '请先输入提示词。',
    invalidSize: '当前尺寸不符合生图要求。',
    sizeStep: '宽高必须为 16 的倍数。',
    sizeSide: '宽高均需在 480～3840 之间。',
    sizePixels: '总像素必须在 655,360～8,294,400 之间。',
    sizeAspect: '宽高比需在 1:3～3:1 之间。',
    maiAutoSize: 'MAI 模型不支持 Auto 尺寸，请选择具体宽高。',
    maiSizeSide: 'MAI 图片宽高均需至少 768 像素。',
    maiSizePixels: 'MAI 图片总像素不得超过 1,048,576。',
    geminiResolution: '输出分辨率',
    geminiSizeSide: '香蕉模型画布边长需在 512～4096 之间。',
    geminiSizePixels: '香蕉模型画布像素不能超过 4096×4096。',
    geminiAspect: '香蕉模型仅支持列表中的固定画面比例。',
    failed: '生成未完成，请重试。',
    providerUnavailable: (name, model) => `当前生图服务${name ? `“${name}”` : ''}没有可用的 ${model || '图像'} 渠道，请联系管理员检查服务配置。`,
    providerAuthFailed: '当前生图服务的 API Key 无效或无权限，请联系管理员。',
    providerBalanceError: '当前生图服务的上游余额或额度不足，请联系管理员。',
    providerTimeout: '生图服务请求超时，本次积分已退回，请稍后重试。',
    providerBusy: '生图服务当前繁忙，本次积分已退回，请稍后重试。',
    timeout: '生成等待超过 300 秒，请稍后查看历史记录或重新尝试。',
    partial: (done, total) => `${total} 张中已完成 ${done} 张，失败任务已退回积分。`,
    result: '生成结果',
    noResult: '生成结果会显示在这里',
    download: '下载',
    history: '历史生图',
    historyHint: '点击 @ 作为参考图',
    deleteHistory: '删除历史图',
    clearHistory: '清空历史',
    clearHistoryConfirm: '确定清空全部历史生图吗？图片资产和项目引用不会被删除。',
    historyDeleteFailed: '历史生图删除失败，请重试。',
    loadMoreHistory: '加载更多',
    loadingHistory: '正在加载',
    noHistory: '登录并生成图片后，历史记录会显示在这里。',
    fullLocked: '登录并拥有积分后可使用参考图、自定义尺寸、AI 魔笔和多张抽卡。',
    guestUsed: '游客免费次数已使用，请登录继续。',
    creditsRequired: '积分不足，请先充值。',
    signIn: '登录使用完整功能',
    caseTitle: '范例美图',
    caseAll: '全部',
    browseCases: '查看全部',
    openCase: '查看',
    referenceMissing: '所选历史图已不存在，请重新选择。',
    singleCreate: '单图创作',
    batchRepair: '批量改图',
    sharedRepairPrompt: '批量改图指令',
    batchRepairPlaceholder: '输入所有图片共用的修复要求。每张原图会独立调用一次，不会相互拼接。',
    batchUpload: '上传待修图片',
    batchUploadHint: '点击上传，或粘贴、拖拽最多 20 张；每张图独立生成 1 张结果',
    batchUploading: '正在处理图片',
    batchEmpty: '先上传需要修复的图片。',
    batchQueue: '批量改图',
    batchSubmitting: '正在提交',
    batchProcessingNotice: '任务正在处理，到任务列表查看结果。',
    batchQueued: (queued, unsupported) => `已加入 ${queued} 个修图任务${unsupported ? `，${unsupported} 张尺寸不受支持` : ''}。`,
    batchSourceSize: '原图',
    batchOutputSize: '输出',
    batchTotal: '合计',
    clearBatch: '清空',
    providerSourceSizeUnsupported: '该图片提供商不支持原始图片尺寸',
    providerReferenceUnsupported: '当前图片提供商不支持参考图修复。'
  },
  en: {
    title: 'Free Drawing Workshop',
    prompt: 'Prompt',
    placeholder: 'Describe the subject, composition, style, lighting, text, and edits. Type @ to reference a previous generation.',
    placeholderNoReferences: 'Describe the subject, composition, style, lighting, text, and visual details.',
    optimize: 'AI polish · 1 credit',
    optimizing: 'Polishing',
    references: 'References',
    referenceHint: 'Upload, paste, or drop multiple images; or click @ on a previous generation',
    uploadReference: 'Upload images',
    uploadingReferences: 'Processing',
    referenceUploadFailed: 'Some references could not be read. Check the image format.',
    maiReferenceUploadFailed: 'MAI references must be JPEG or PNG.',
    referenceUnsupported: 'MAI-Image-2 does not support reference-image editing.',
    maiReferenceHint: 'MAI-Image-2.5 accepts one JPEG or PNG reference image',
    geminiReferenceHint: 'Gemini image accepts JPEG, PNG, and WebP; Pic365 allows up to 9 references',
    addReference: 'Use as reference',
    editMarks: 'Mark regions',
    maxReferences: (count) => `Select up to ${count} reference image${count === 1 ? '' : 's'}`,
    size: 'Canvas size',
    auto: 'Auto',
    commonSizes: 'Common sizes',
    customSize: 'Custom size',
    sizeTemplate: 'Template',
    lockTemplate: 'Lock size',
    ratio: 'Lock ratio',
    free: 'Free',
    width: 'Width',
    height: 'Height',
    quality: 'Quality',
    drawCount: 'Images',
    generate: 'Generate now',
    generateFree: 'Generate 1 free image',
    generating: 'Generating',
    credits: 'credits',
    creditCost: 'Estimated cost',
    perImage: 'each',
    emptyPrompt: 'Write a prompt first.',
    invalidSize: 'The current dimensions are not valid.',
    sizeStep: 'Width and height must be divisible by 16.',
    sizeSide: 'Width and height must each be between 480 and 3840.',
    sizePixels: 'Total pixels must stay between 655,360 and 8,294,400.',
    sizeAspect: 'Aspect ratio must stay between 1:3 and 3:1.',
    maiAutoSize: 'MAI models require explicit dimensions; Auto is not supported.',
    maiSizeSide: 'MAI image width and height must each be at least 768 pixels.',
    maiSizePixels: 'MAI images may not exceed 1,048,576 total pixels.',
    geminiResolution: 'Output resolution',
    geminiSizeSide: 'Gemini image canvas sides must stay between 512 and 4096.',
    geminiSizePixels: 'Gemini image canvas may not exceed 4096×4096.',
    geminiAspect: 'Gemini image only supports the listed fixed aspect ratios.',
    failed: 'Generation did not complete. Please try again.',
    providerUnavailable: (name, model) => `The image service${name ? ` "${name}"` : ''} has no available ${model || 'image'} channel. Please ask an administrator to check its configuration.`,
    providerAuthFailed: 'The image service API key is invalid or unauthorized. Please contact an administrator.',
    providerBalanceError: 'The upstream image service has insufficient balance or quota. Please contact an administrator.',
    providerTimeout: 'The image service timed out. Your credits were refunded; please try again later.',
    providerBusy: 'The image service is busy. Your credits were refunded; please try again later.',
    timeout: 'Generation exceeded the 300-second wait limit. Check history shortly or try again.',
    partial: (done, total) => `${done} of ${total} images completed. Failed jobs were refunded.`,
    result: 'Results',
    noResult: 'Generated images will appear here',
    download: 'Download',
    history: 'Generation history',
    historyHint: 'Click @ to use an image as reference',
    deleteHistory: 'Remove from history',
    clearHistory: 'Clear history',
    clearHistoryConfirm: 'Clear all generation history? Asset files and project references will be preserved.',
    historyDeleteFailed: 'Could not remove the image from history. Try again.',
    loadMoreHistory: 'Load more',
    loadingHistory: 'Loading',
    noHistory: 'Sign in and generate an image to build your history.',
    fullLocked: 'Sign in with credits to use references, custom sizes, AI polish, and multi-image draws.',
    guestUsed: 'Your free guest image has been used. Sign in to continue.',
    creditsRequired: 'More credits are required.',
    signIn: 'Sign in for full tools',
    caseTitle: 'Example images',
    caseAll: 'All',
    browseCases: 'View all',
    openCase: 'View',
    referenceMissing: 'A selected history image is no longer available. Select it again.',
    taskList: 'Task list',
    queueNow: 'Add to queue',
    queueing: 'Queued',
    queueRunning: 'Generating',
    queueCompleted: 'Completed',
    queueFailed: 'Failed',
    queueCancelling: 'Cancelling',
    queueCancelled: 'Cancelled',
    queueEmpty: 'No queued tasks yet.',
    queueFull: 'The task list is full at 20. Remove an old task first.',
    queueFullButton: 'Task list full 20/20',
    deleteTask: 'Remove task',
    cancelTask: 'Cancel task',
    cancelTaskDone: 'Task cancelled. Reserved credits were refunded.',
    cancelTaskFailed: 'Cancellation failed and the task is still running. Please try again.',
    redoTask: 'Redo',
    redoQueued: 'A new task was queued with the same prompt, references, and settings.',
    redoUnavailable: 'This older task did not retain its full reference inputs and cannot be reproduced exactly.',
    redoFailed: 'The redo task could not be queued. Please try again.',
    queuePeople: 'Open task queue',
    viewImage: 'View image',
    useReference: 'Use as reference',
    editPreviewPrompt: 'Edit prompt',
    previewPromptHint: 'Send the revised prompt back to the control panel, or combine it with marked edit regions.',
    copyPrompt: 'Copy prompt',
    copiedPrompt: 'Copied',
    applyPrompt: 'Use prompt',
    regionEdit: 'Mark region to edit',
    localEditPrompt: 'Describe exactly what should be replaced, removed, repaired, or adjusted inside the painted region.',
    localEditLockedRule: 'Modify only the painted region. Lock every unpainted area and preserve the original composition, subject, background, lighting, colors, materials, text, logos, shadows, and fine details.',
    localEditReady: 'A new local-edit task is ready. Describe the exact change required inside the painted region.',
    downloadOriginal: 'Download original',
    resetZoom: 'Reset',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    singleCreate: 'Single image',
    batchRepair: 'Batch edit',
    sharedRepairPrompt: 'Batch edit instructions',
    batchRepairPlaceholder: 'Describe one repair instruction shared by every image. Each source runs as an independent task and is never combined with another.',
    batchUpload: 'Upload images to repair',
    batchUploadHint: 'Upload, paste, or drop up to 20 images; each source produces one independent result',
    batchUploading: 'Processing images',
    batchEmpty: 'Upload images to repair first.',
    batchQueue: 'Batch edit',
    batchSubmitting: 'Submitting',
    batchProcessingNotice: 'Tasks are processing. Open the task list to view results.',
    batchQueued: (queued, unsupported) => `${queued} repair task${queued === 1 ? '' : 's'} queued${unsupported ? `; ${unsupported} unsupported source size${unsupported === 1 ? '' : 's'}` : ''}.`,
    batchSourceSize: 'Source',
    batchOutputSize: 'Output',
    batchTotal: 'Total',
    clearBatch: 'Clear',
    providerSourceSizeUnsupported: 'This image provider does not support the original image size',
    providerReferenceUnsupported: 'The selected image provider does not support reference-image repair.'
  }
};

function sizeErrorText(result, t) {
  if (!result || result.valid) return '';
  if (result.error === 'STEP') return t.sizeStep;
  if (result.error === 'AUTO_SIZE_UNSUPPORTED') return t.maiAutoSize;
  if (result.error === 'MAI_MIN_SIDE') return t.maiSizeSide;
  if (result.error === 'MAI_MAX_PIXELS') return t.maiSizePixels;
  if (result.error === 'GEMINI_MIN_SIDE' || result.error === 'GEMINI_MAX_SIDE') return t.geminiSizeSide;
  if (result.error === 'GEMINI_MAX_PIXELS') return t.geminiSizePixels;
  if (result.error === 'GEMINI_ASPECT_RATIO') return t.geminiAspect;
  if (result.error === 'MIN_SIDE' || result.error === 'MAX_SIDE') return t.sizeSide;
  if (result.error === 'MIN_PIXELS' || result.error === 'MAX_PIXELS') return t.sizePixels;
  if (result.error === 'ASPECT') return t.sizeAspect;
  return t.invalidSize;
}

function generationFailureText(payload, t) {
  const code = typeof payload === 'string' ? payload : payload?.error;
  if (code === 'REFERENCE_IMAGES_UNSUPPORTED') return t.referenceUnsupported;
  if (code === 'TOO_MANY_REFERENCE_IMAGES') return t.maxReferences(1);
  if (code === 'INVALID_REFERENCE_IMAGE_FORMAT') return t.maiReferenceUploadFailed;
  if (code === 'INVALID_SIZE' && payload?.reason) return sizeErrorText({ valid: false, error: payload.reason }, t);
  if (code === 'IMAGE_PROVIDER_UNAVAILABLE') return t.providerUnavailable(payload?.providerName, payload?.providerModel);
  if (code === 'IMAGE_PROVIDER_AUTH_FAILED') return t.providerAuthFailed;
  if (code === 'IMAGE_PROVIDER_BALANCE_ERROR') return t.providerBalanceError;
  if (code === 'IMAGE_PROVIDER_TIMEOUT') return t.providerTimeout;
  if (code === 'UPSTREAM_BUSY') return t.providerBusy;
  return t.failed;
}

function taskFailureText(task, t) {
  if (task?.error === 'PROVIDER_SOURCE_SIZE_UNSUPPORTED') return t.providerSourceSizeUnsupported;
  if (task?.error === 'INVALID_REFERENCE_IMAGE_FORMAT') return t.maiReferenceUploadFailed;
  if (task?.error === 'PROVIDER_REFERENCE_UNSUPPORTED') return t.providerReferenceUnsupported;
  return generationFailureText({ error: task?.error }, t);
}

export default function FreeImageWorkspace({
  language,
  session,
  profile,
  cases = [],
  categoryOptions = [],
  category = 'All',
  onCategoryChange,
  onOpenCase,
  onBrowseCases,
  onSignIn,
  onBilling,
  onProfileChange,
  pendingReferenceAsset,
  onReferenceAssetConsumed
}) {
  const t = copy[language] || copy.en;
  const textareaRef = useRef(null);
  const referenceUploadRef = useRef(null);
  const batchRepairUploadRef = useRef(null);
  const [referenceDragging, setReferenceDragging] = useState(false);
  const [batchRepairDragging, setBatchRepairDragging] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [promptOptimized, setPromptOptimized] = useState(false);
  const [sizeMode, setSizeMode] = useState('custom');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [dimensionDrafts, setDimensionDrafts] = useState({ width: '1024', height: '1024' });
  const [sizeTemplatesByProvider, setSizeTemplatesByProvider] = useState(loadProviderSizeTemplates);
  const [ratioLock, setRatioLock] = useState('1:1');
  const [quality, setQuality] = useState('low');
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [count, setCount] = useState(1);
  const [guestUsed, setGuestUsed] = useState(false);
  const [state, setState] = useState({ status: 'idle', results: [], message: '' });
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyDeletingIds, setHistoryDeletingIds] = useState(() => new Set());
  const [historyClearing, setHistoryClearing] = useState(false);
  const [references, setReferences] = useState([]);
  const [creationMode, setCreationMode] = useState('single');
  const [batchRepairImages, setBatchRepairImages] = useState([]);
  const [batchRepairUploading, setBatchRepairUploading] = useState(false);
  const [batchRepairSubmitting, setBatchRepairSubmitting] = useState(false);
  const [batchQueueNotice, setBatchQueueNotice] = useState('');
  const [mention, setMention] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [editingReferenceId, setEditingReferenceId] = useState('');
  const [uploadingReferences, setUploadingReferences] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState('control');
  const [queueTasks, setQueueTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const [previewPanning, setPreviewPanning] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState('');
  const [previewPromptCopied, setPreviewPromptCopied] = useState(false);
  const [previewEditReference, setPreviewEditReference] = useState(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const historyRequestRef = useRef(0);
  const pendingReferenceAssetProcessingRef = useRef('');
  const previewCopyTimerRef = useRef(null);
  const batchRepairSubmittingRef = useRef(false);
  const batchQueueNoticeTimerRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const previewImageRef = useRef(null);
  const previewPanRef = useRef(null);
  const isSignedIn = isAuthenticatedSession(session);
  const hasFullWorkspace = isSignedIn && Boolean(profile?.isSuperAdmin || Number(profile?.creditBalance || 0) > 0);
  const isGuest = !isSignedIn;
  const isGenerating = state.status === 'generating';
  const visibleHistory = history.filter((item) => item.status === 'succeeded' && item.imageUrl);
  const selectedEditorReference = references.find((item) => item.id === editingReferenceId) || null;
  const selectedProvider = providers.find((item) => item.id === providerId) || null;
  const sizeTemplate = providerId ? sizeTemplatesByProvider[providerId] || '' : '';
  const modelConstraints = useMemo(
    () => getImageModelConstraints(selectedProvider?.model),
    [selectedProvider?.model]
  );
  const maxReferenceImages = modelConstraints.maxReferenceImages;
  const batchProviderSupported = maxReferenceImages >= 1;
  const ratioPresetOptions = modelConstraints.isGeminiImage ? GEMINI_IMAGE_RATIO_PRESETS : IMAGE_RATIO_PRESETS;
  const commonSizeOptions = modelConstraints.isGeminiImage
    ? GEMINI_IMAGE_COMMON_SIZES
    : modelConstraints.isMai
      ? MAI_COMMON_IMAGE_SIZES
      : COMMON_IMAGE_SIZES;
  const ratioOptions = useMemo(
    () => ratioPresetOptions.filter((preset) => Boolean(
      dimensionsForImageModelRatio(selectedProvider?.model, preset.width, preset.height, modelConstraints.isMai ? 1024 : 1536)
    )),
    [modelConstraints.isMai, modelConstraints.isGeminiImage, selectedProvider?.model]
  );

  useEffect(() => {
    if (!previewImage) return undefined;
    const keepPreviewInBounds = () => setPreviewOffset((current) => clampPreviewOffset(current, previewZoom));
    globalThis.addEventListener?.('resize', keepPreviewInBounds);
    return () => globalThis.removeEventListener?.('resize', keepPreviewInBounds);
  }, [previewImage, previewZoom]);

  useEffect(() => () => {
    if (batchQueueNoticeTimerRef.current) clearTimeout(batchQueueNoticeTimerRef.current);
  }, []);
  const referenceAccept = modelConstraints.referenceMimeTypes.join(',');
  const referenceHintText = maxReferenceImages === 0
    ? t.referenceUnsupported
    : modelConstraints.isGeminiImage
      ? t.geminiReferenceHint
    : modelConstraints.isMai
      ? t.maiReferenceHint
      : t.referenceHint;
  const referenceLimitMessage = maxReferenceImages === 0
    ? t.referenceUnsupported
    : t.maxReferences(maxReferenceImages);
  const referencesValid = references.length <= maxReferenceImages
    && references.every((reference) => referenceAllowedForModel(reference, modelConstraints));
  const size = sizeMode === 'auto' ? 'auto' : `${width}x${height}`;
  const selectedSizeOption = sizeMode === 'auto'
    ? 'auto'
    : sizeTemplate === size
      ? 'template'
    : commonSizeOptions.includes(size)
      ? size
      : 'custom';
  const sizeCheck = useMemo(
    () => validateImageSizeForModel(size, selectedProvider?.model),
    [selectedProvider?.model, size]
  );
  const { pricing, loading: pricingLoading } = useServerImagePricing(
    { size, quality, providerId },
    { enabled: hasFullWorkspace && sizeCheck.valid && Boolean(providerId) }
  );
  const batchRepairItems = useMemo(() => batchRepairImages.map((item) => {
    const referenceSupported = referenceAllowedForModel(item, modelConstraints);
    const sizing = referenceSupported
      ? resolveSourceImageSizeForModel(item, selectedProvider?.model)
      : { valid: false, error: 'INVALID_REFERENCE_IMAGE_FORMAT' };
    return { ...item, referenceSupported, sizing };
  }), [batchRepairImages, modelConstraints, selectedProvider?.model]);
  const batchPricingRequests = useMemo(() => batchRepairItems
    .filter((item) => item.sizing.valid)
    .map((item) => ({ key: item.id, size: item.sizing.size, quality, count: 1, providerId })),
  [batchRepairItems, providerId, quality]);
  const {
    pricingByKey: batchPricingByKey,
    loading: batchPricingLoading,
    error: batchPricingError
  } = useServerImagePricingBatch(batchPricingRequests, {
    enabled: creationMode === 'batch-repair' && hasFullWorkspace && Boolean(providerId) && batchPricingRequests.length > 0
  });
  const batchRepairTotalCredits = batchRepairItems.reduce(
    (total, item) => total + Number(batchPricingByKey[item.id]?.credits || 0),
    0
  );
  const imageReferenceTarget = resolveImageReferenceTarget(workspaceTab, creationMode);
  const displayedQueueTasks = useMemo(() => [...queueTasks].sort((left, right) => {
    if (left.batchId && left.batchId === right.batchId) return left.batchIndex - right.batchIndex;
    const createdOrder = String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
    return createdOrder || String(right.id || '').localeCompare(String(left.id || ''));
  }), [queueTasks]);
  const canvasRatio = useMemo(
    () => reducedCanvasRatio(sizeMode === 'auto' ? 1 : width, sizeMode === 'auto' ? 1 : height),
    [height, sizeMode, width]
  );
  const activeRatio = ratioOptions.find((preset) => preset.id === ratioLock);
  const categoryLabels = new Map(categoryOptions.map((option) => [option.value, option.label]));
  const mentionMatches = mention
    ? visibleHistory.filter((item) => {
        const identity = imageReferenceIdentity(item);
        if (imageReferenceTarget === 'batch-repair') {
          if (batchRepairImages.some((reference) => reference.sourceItemId === identity)) return false;
        } else if (references.some((reference) => reference.id === item.id)) return false;
        if (!referenceAllowedForModel(item, modelConstraints)) return false;
        const haystack = `${item.id} ${item.prompt}`.toLowerCase();
        return !mention.query || haystack.includes(mention.query);
      }).slice(0, 8)
    : [];
  const localEditLockedRule = references.some((reference) => reference.annotations?.length)
    ? t.localEditLockedRule
    : '';

  useEffect(() => {
    fetch('/api/image-providers', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload?.ok) return;
        const nextProviders = payload.providers || [];
        setProviders(nextProviders);
        setProviderId((current) => current || nextProviders.find((item) => item.isDefault)?.id || nextProviders[0]?.id || '');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(SIZE_TEMPLATES_STORAGE_KEY, JSON.stringify(sizeTemplatesByProvider));
    } catch {
      // A private browser profile may block storage; templates still work for this session.
    }
  }, [sizeTemplatesByProvider]);

  useEffect(() => () => {
    if (previewCopyTimerRef.current) clearTimeout(previewCopyTimerRef.current);
  }, []);

  useEffect(() => {
    if (!selectedProvider) return;

    const compatibleReferences = references
      .filter((reference) => referenceAllowedForModel(reference, modelConstraints))
      .slice(0, maxReferenceImages);
    if (compatibleReferences.length) {
      applyReferenceCanvasSize(compatibleReferences[0], selectedProvider);
    } else if (!validateImageSizeForModel(size, selectedProvider.model).valid) {
      setSizeMode('custom');
      setWidth(1024);
      setHeight(1024);
      setDimensionDrafts({ width: '1024', height: '1024' });
      setRatioLock('1:1');
    } else if (ratioLock !== 'free' && !ratioOptions.some((preset) => preset.id === ratioLock)) {
      const nextRatio = ratioForSize(width, height, ratioPresetOptions);
      setRatioLock(modelConstraints.isGeminiImage && nextRatio === 'free' ? '1:1' : nextRatio);
    }

    if (sizeTemplate && !validateImageSizeForModel(sizeTemplate, selectedProvider.model).valid) {
      setSizeTemplatesByProvider((current) => {
        if (!current[selectedProvider.id]) return current;
        const next = { ...current };
        delete next[selectedProvider.id];
        return next;
      });
    }

    if (compatibleReferences.length !== references.length) {
      const retainedIds = new Set(compatibleReferences.map((reference) => reference.id));
      const removed = references.filter((reference) => !retainedIds.has(reference.id));
      setReferences(compatibleReferences);
      setPrompt((current) => removed.reduce(
        (next, reference) => next.split(reference.token).join(''),
        current
      ).replace(/[ \t]{2,}/g, ' ').trimStart());
      if (removed.some((reference) => reference.id === editingReferenceId)) setEditingReferenceId('');
      setState((current) => ({ ...current, message: referenceLimitMessage }));
    }
  }, [selectedProvider?.id, selectedProvider?.model]);

  useEffect(() => {
    if (!pendingReferenceAsset?.id || !selectedProvider || !hasFullWorkspace) return;
    const identity = `asset-${pendingReferenceAsset.id}`;
    if (pendingReferenceAssetProcessingRef.current === identity) return;
    const candidate = {
      id: identity,
      assetId: pendingReferenceAsset.id,
      source: 'asset',
      imageUrl: pendingReferenceAsset.originalUrl,
      originalImageUrl: pendingReferenceAsset.originalUrl,
      thumbnailUrl: pendingReferenceAsset.thumbnailUrl || pendingReferenceAsset.originalUrl,
      prompt: pendingReferenceAsset.prompt || pendingReferenceAsset.name || '',
      promptHidden: Boolean(pendingReferenceAsset.promptHidden),
      mimeType: pendingReferenceAsset.mimeType,
      width: Number(pendingReferenceAsset.width || 0),
      height: Number(pendingReferenceAsset.height || 0),
      token: `@资产${String(pendingReferenceAsset.id).slice(0, 6)}`,
      annotations: []
    };
    if (imageReferenceTarget === 'batch-repair') {
      if (batchRepairImages.some((reference) => reference.sourceItemId === identity)) {
        onReferenceAssetConsumed?.();
        return;
      }
      pendingReferenceAssetProcessingRef.current = identity;
      void addBatchRepairImageItem(candidate).finally(() => {
        pendingReferenceAssetProcessingRef.current = '';
        onReferenceAssetConsumed?.();
      });
      return;
    }
    if (references.some((reference) => reference.id === identity)) {
      onReferenceAssetConsumed?.();
      return;
    }
    if (!maxReferenceImages || !referenceAllowedForModel(candidate, modelConstraints) || references.length >= maxReferenceImages) {
      setState((current) => ({ ...current, message: referenceLimitMessage }));
      onReferenceAssetConsumed?.();
      return;
    }
    if (!references.length) applyReferenceCanvasSize(candidate, selectedProvider);
    setReferences((current) => [...current, candidate].slice(0, maxReferenceImages));
    setPrompt((current) => `${current}${current && !/\s$/.test(current) ? ' ' : ''}${candidate.token} `);
    setWorkspaceTab('control');
    setPromptOptimized(false);
    onReferenceAssetConsumed?.();
  }, [pendingReferenceAsset?.id, selectedProvider?.id, hasFullWorkspace, maxReferenceImages, imageReferenceTarget]);

  useEffect(() => {
    if (!isSignedIn || !hasFullWorkspace) {
      setQueueTasks([]);
      return undefined;
    }
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/generation-tasks', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (active && response.ok && payload?.ok) setQueueTasks(payload.tasks || []);
      } catch {
        // A later poll retries without disrupting the active editor.
      }
    };
    void refresh();
    const timer = setInterval(refresh, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hasFullWorkspace, isSignedIn]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const selected = queueTasks.find((task) => task.id === selectedTaskId);
    if (selected?.results?.length) {
      setState((current) => ({ ...current, status: 'success', results: selected.results }));
    }
  }, [queueTasks, selectedTaskId]);

  useEffect(() => {
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    if (!isSignedIn || !hasFullWorkspace) {
      setHistory([]);
      setHistoryLoading(false);
      setHistoryHasMore(false);
      setHistoryOffset(0);
      setReferences([]);
      return undefined;
    }
    setHistory([]);
    setHistoryLoading(true);
    setHistoryHasMore(false);
    setHistoryOffset(0);
    fetch(`/api/generations?limit=${HISTORY_PAGE_SIZE}&offset=0`)
      .then((response) => response.json())
      .then((payload) => {
        if (historyRequestRef.current !== requestId || !payload?.ok) return;
        setHistory(payload.generations || []);
        setHistoryHasMore(Boolean(payload.hasMore));
        setHistoryOffset(Number(payload.nextOffset || payload.generations?.length || 0));
      })
      .catch(() => undefined)
      .finally(() => {
        if (historyRequestRef.current === requestId) setHistoryLoading(false);
      });
    return undefined;
  }, [isSignedIn, hasFullWorkspace]);

  async function loadMoreHistory() {
    if (!hasFullWorkspace || historyLoading || !historyHasMore) return;
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/generations?limit=${HISTORY_PAGE_SIZE}&offset=${historyOffset}`);
      const payload = await response.json().catch(() => ({}));
      if (historyRequestRef.current !== requestId || !response.ok || !payload?.ok) return;
      const nextItems = payload.generations || [];
      setHistory((current) => [
        ...current,
        ...nextItems.filter((item) => !current.some((entry) => entry.id === item.id))
      ]);
      setHistoryHasMore(Boolean(payload.hasMore));
      setHistoryOffset(Number(payload.nextOffset || historyOffset + nextItems.length));
    } finally {
      if (historyRequestRef.current === requestId) setHistoryLoading(false);
    }
  }

  async function deleteHistoryItem(item) {
    const identity = String(item?.id || item?.generationId || '');
    if (!identity || historyDeletingIds.has(identity) || historyClearing) return;
    setHistoryDeletingIds((current) => new Set(current).add(identity));
    try {
      const response = await fetch('/api/generations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: identity })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'HISTORY_DELETE_FAILED');
      setHistory((current) => current.filter((entry) => (entry.id || entry.generationId) !== identity));
      setHistoryOffset((current) => Math.max(0, current - 1));
      if (selectedHistoryId === identity) setSelectedHistoryId('');
    } catch {
      setState((current) => ({ ...current, message: t.historyDeleteFailed }));
    } finally {
      setHistoryDeletingIds((current) => {
        const next = new Set(current);
        next.delete(identity);
        return next;
      });
    }
  }

  async function clearHistory() {
    if (historyClearing || (!visibleHistory.length && !historyHasMore)) return;
    if (!globalThis.confirm?.(t.clearHistoryConfirm)) return;
    setHistoryClearing(true);
    try {
      const response = await fetch('/api/generations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'HISTORY_CLEAR_FAILED');
      setHistory([]);
      setHistoryOffset(0);
      setHistoryHasMore(false);
      setSelectedHistoryId('');
    } catch {
      setState((current) => ({ ...current, message: t.historyDeleteFailed }));
    } finally {
      setHistoryClearing(false);
    }
  }

  useEffect(() => {
    if (isSignedIn) return undefined;
    let active = true;
    fetch('/api/generate-image')
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.ok) setGuestUsed(Boolean(payload.guestFreeUsed));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isSignedIn]);

  function updatePrompt(value, cursor = value.length) {
    setPrompt(value);
    setPromptOptimized(false);
    setMention(mentionAtCursor(value, cursor));
  }

  function setRatio(presetId) {
    if (!hasFullWorkspace || isGenerating) return;
    setSizeMode('custom');
    setRatioLock(presetId);
    if (presetId === 'free') return;
    const preset = ratioOptions.find((item) => item.id === presetId);
    if (!preset) return;
    const next = dimensionsForImageModelRatio(
      selectedProvider?.model,
      preset.width,
      preset.height,
      modelConstraints.isMai ? 1024 : 1536
    );
    if (!next) return;
    applyDimensions(next);
  }

  function applyDimensions(next) {
    setWidth(next.width);
    setHeight(next.height);
    setDimensionDrafts({ width: String(next.width), height: String(next.height) });
  }

  function applyReferenceCanvasSize(reference, provider = selectedProvider) {
    const next = resolveReferenceImageSize(reference, provider?.model, '1024x1024');
    setSizeMode('custom');
    applyDimensions(next);
    const nextRatio = ratioForSize(next.width, next.height, ratioPresetOptions);
    setRatioLock(modelConstraints.isGeminiImage && nextRatio === 'free' ? '1:1' : nextRatio);
    return next;
  }

  function updateDimension(changed, rawValue) {
    if (!hasFullWorkspace || isGenerating) return;
    setSizeMode('custom');
    if (!activeRatio) {
      const otherValue = changed === 'width' ? height : width;
      const maxByPixels = Math.floor(
        modelConstraints.maxPixels / Math.max(modelConstraints.minSide, otherValue) / 16
      ) * 16;
      const nextValue = alignImageDimension(rawValue, {
        min: modelConstraints.minSide,
        max: Math.max(modelConstraints.minSide, Math.min(modelConstraints.maxSide, maxByPixels))
      });
      applyDimensions({
        width: changed === 'width' ? nextValue : width,
        height: changed === 'height' ? nextValue : height
      });
      return;
    }
    const next = dimensionsFromLockedValue({
      changed,
      value: rawValue,
      ratioWidth: activeRatio.width,
      ratioHeight: activeRatio.height,
      constraints: modelConstraints
    });
    if (next) applyDimensions(next);
  }

  function updateDimensionDraft(changed, value) {
    if (!hasFullWorkspace || isGenerating) return;
    setSizeMode('custom');
    setDimensionDrafts((current) => ({ ...current, [changed]: value }));
  }

  function commitDimensionDraft(changed) {
    if (!hasFullWorkspace || isGenerating) return;
    const rawValue = String(dimensionDrafts[changed] ?? '').trim();
    const numericValue = Number(rawValue);
    if (!rawValue || !Number.isFinite(numericValue)) {
      setDimensionDrafts((current) => ({
        ...current,
        [changed]: String(changed === 'width' ? width : height)
      }));
      return;
    }
    updateDimension(changed, numericValue);
  }

  function selectCommonSize(value) {
    if (!hasFullWorkspace || isGenerating) return;
    const check = validateImageSizeForModel(value, selectedProvider?.model);
    if (!check.valid) {
      setState((current) => ({ ...current, message: sizeErrorText(check, t) }));
      return;
    }
    const parsed = parseImageSize(value);
    if (!parsed || parsed.auto) return;
    setSizeMode('custom');
    applyDimensions({ width: parsed.width, height: parsed.height });
    const nextRatio = ratioForSize(parsed.width, parsed.height, ratioPresetOptions);
    setRatioLock(modelConstraints.isGeminiImage && nextRatio === 'free' ? '1:1' : nextRatio);
  }

  function selectSizeOption(value) {
    if (!hasFullWorkspace || isGenerating) return;
    if (value === 'auto') {
      if (!modelConstraints.allowAutoSize) {
        setState((current) => ({ ...current, message: t.maiAutoSize }));
        return;
      }
      setSizeMode('auto');
      return;
    }
    if (value === 'custom') {
      setSizeMode('custom');
      return;
    }
    if (value === 'template' && sizeTemplate) {
      selectCommonSize(sizeTemplate);
      return;
    }
    selectCommonSize(value);
  }

  function lockCurrentSizeTemplate() {
    if (!hasFullWorkspace || isGenerating || !providerId || !sizeCheck.valid || sizeMode === 'auto') return;
    setSizeTemplatesByProvider((current) => ({
      ...current,
      [providerId]: `${width}x${height}`
    }));
    setState((current) => ({ ...current, message: '' }));
  }

  function insertReference(item, { fromMention = false, promptOverride = null } = {}) {
    if (!hasFullWorkspace) {
      if (!isSignedIn) onSignIn?.();
      else onBilling?.();
      return;
    }
    const existing = references.find((reference) => reference.id === item.id);
    if (!existing) {
      if (!maxReferenceImages) {
        setState((current) => ({ ...current, message: t.referenceUnsupported }));
        return;
      }
      if (!referenceAllowedForModel(item, modelConstraints)) {
        setState((current) => ({ ...current, message: t.maiReferenceUploadFailed }));
        return;
      }
      if (references.length >= maxReferenceImages) {
        setState((current) => ({ ...current, message: referenceLimitMessage }));
        return;
      }
    }
    const token = existing?.token || `@图-${String(item.id).slice(0, 6)}`;
    if (!existing) {
      const dimensions = referenceSourceDimensions(item);
      const candidate = {
        id: item.id,
        generationId: item.generationId || item.id,
        source: 'history',
        imageUrl: item.originalImageUrl || item.imageUrl,
        thumbnailUrl: item.markedImageUrl || item.thumbnailUrl || item.imageUrl,
        markedImageUrl: item.markedImageUrl || (item.originalImageUrl ? item.imageUrl : ''),
        prompt: item.prompt,
        promptHidden: Boolean(item.promptHidden),
        mimeType: imageItemMimeType(item),
        width: dimensions.width,
        height: dimensions.height,
        size: item.size || (dimensions.width && dimensions.height ? `${dimensions.width}x${dimensions.height}` : ''),
        token,
        annotations: Array.isArray(item.annotations) ? item.annotations : []
      };
      if (!references.length) applyReferenceCanvasSize(candidate);
      setReferences((current) => [...current, candidate]);
    } else if (Array.isArray(item.annotations)) {
      setReferences((current) => current.map((reference) => reference.id === existing.id
        ? {
            ...reference,
            annotations: item.annotations,
            markedImageUrl: item.markedImageUrl || reference.markedImageUrl || '',
            thumbnailUrl: item.markedImageUrl || reference.thumbnailUrl
          }
        : reference));
    }
    const sourcePrompt = promptOverride == null ? prompt : String(promptOverride);
    let nextPrompt = sourcePrompt;
    let nextCursor = sourcePrompt.length;
    if (fromMention && mention) {
      nextPrompt = `${sourcePrompt.slice(0, mention.start)}${token} ${sourcePrompt.slice(mention.end)}`;
      nextCursor = mention.start + token.length + 1;
    } else if (!sourcePrompt.includes(token)) {
      nextPrompt = `${sourcePrompt}${sourcePrompt && !/\s$/.test(sourcePrompt) ? ' ' : ''}${token} `;
      nextCursor = nextPrompt.length;
    }
    setPrompt(nextPrompt);
    setPromptOptimized(false);
    setMention(null);
    setState((current) => ({ ...current, message: '' }));
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function removeMentionQuery() {
    if (!mention) return;
    const mentionText = prompt.slice(mention.start, mention.end);
    setPrompt((current) => {
      const index = current.lastIndexOf(mentionText);
      if (index < 0) return current;
      return `${current.slice(0, index)}${current.slice(index + mentionText.length)}`.replace(/[ \t]{2,}/g, ' ');
    });
    setMention(null);
    setPromptOptimized(false);
  }

  async function addBatchRepairImageItem(item, { fromMention = false } = {}) {
    if (!hasFullWorkspace) {
      if (!isSignedIn) onSignIn?.();
      else onBilling?.();
      return false;
    }
    const identity = imageReferenceIdentity(item);
    if (batchRepairImages.some((reference) => reference.sourceItemId === identity)) {
      if (fromMention) removeMentionQuery();
      return true;
    }
    if (!batchProviderSupported) {
      setState((current) => ({ ...current, message: t.providerReferenceUnsupported }));
      return false;
    }
    if (!referenceAllowedForModel(item, modelConstraints)) {
      setState((current) => ({ ...current, message: t.maiReferenceUploadFailed }));
      return false;
    }
    if (batchRepairImages.length >= MAX_BATCH_REPAIR_IMAGES || batchRepairUploading) {
      setState((current) => ({ ...current, message: t.maxReferences(MAX_BATCH_REPAIR_IMAGES) }));
      return false;
    }
    setBatchRepairUploading(true);
    try {
      const file = await imageItemToFile(item);
      await addBatchRepairImages([file], { sourceItems: [item], manageLoading: false });
      if (fromMention) removeMentionQuery();
      setWorkspaceTab('control');
      return true;
    } catch {
      setState((current) => ({ ...current, message: t.referenceUploadFailed }));
      return false;
    } finally {
      setBatchRepairUploading(false);
    }
  }

  async function useImageAsReference(item, options = {}) {
    if (resolveImageReferenceTarget(workspaceTab, creationMode) === 'batch-repair') {
      return addBatchRepairImageItem(item, options);
    }
    setCreationMode('single');
    setWorkspaceTab('control');
    insertReference(item, options);
    return true;
  }

  function removeReference(reference) {
    setReferences((current) => current.filter((item) => item.id !== reference.id));
    setPrompt((current) => current.split(reference.token).join('').replace(/[ \t]{2,}/g, ' ').trimStart());
    if (editingReferenceId === reference.id) setEditingReferenceId('');
  }

  function openReferenceUpload() {
    if (!hasFullWorkspace) {
      if (!isSignedIn) onSignIn?.();
      else onBilling?.();
      return;
    }
    if (!maxReferenceImages || references.length >= maxReferenceImages || isGenerating || uploadingReferences) {
      if (!maxReferenceImages || references.length >= maxReferenceImages) {
        setState((current) => ({ ...current, message: referenceLimitMessage }));
      }
      return;
    }
    referenceUploadRef.current?.click();
  }

  async function addUploadedReferences(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!hasFullWorkspace) {
      if (!isSignedIn) onSignIn?.();
      else onBilling?.();
      return;
    }
    if (!maxReferenceImages || isGenerating || uploadingReferences) {
      if (!maxReferenceImages) setState((current) => ({ ...current, message: referenceLimitMessage }));
      return;
    }
    const remaining = Math.max(0, maxReferenceImages - references.length);
    if (!remaining) {
      setState((current) => ({ ...current, message: referenceLimitMessage }));
      return;
    }
    setUploadingReferences(true);
    const added = [];
    let failed = false;
    try {
      for (const file of files.slice(0, remaining)) {
        try {
          const prepared = await prepareReferenceFile(file, modelConstraints);
          const id = `upload-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${added.length}`}`;
          added.push({
            id,
            source: 'upload',
            imageUrl: prepared.dataUrl,
            imageDataUrl: prepared.dataUrl,
            prompt: file.name,
            token: `@参考-${id.slice(-6)}`,
            annotations: [],
            mimeType: prepared.mimeType,
            width: prepared.width,
            height: prepared.height,
            byteLength: prepared.byteLength
          });
        } catch {
          failed = true;
        }
      }
      if (added.length) {
        if (!references.length) applyReferenceCanvasSize(added[0]);
        setReferences((current) => [...current, ...added].slice(0, maxReferenceImages));
        setPrompt((current) => {
          const tokens = added.map((reference) => reference.token).join(' ');
          return `${current}${current && !/\s$/.test(current) ? ' ' : ''}${tokens} `;
        });
        setPromptOptimized(false);
      }
      const exceeded = files.length > remaining;
      setState((current) => ({
        ...current,
        message: failed
          ? modelConstraints.isMai ? t.maiReferenceUploadFailed : t.referenceUploadFailed
          : exceeded ? referenceLimitMessage : ''
      }));
    } finally {
      setUploadingReferences(false);
      if (referenceUploadRef.current) referenceUploadRef.current.value = '';
    }
  }

  function pastedImageFiles(event) {
    return Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === 'file' && String(item.type || '').startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
  }

  function droppedImageFiles(event) {
    return Array.from(event.dataTransfer?.files || []).filter((file) => String(file.type || '').startsWith('image/'));
  }

  function handleComposerPaste(event) {
    const files = pastedImageFiles(event);
    if (!files.length) return;
    event.preventDefault();
    if (creationMode === 'batch-repair') void addBatchRepairImages(files);
    else void addUploadedReferences(files);
  }

  function handleReferenceDrop(event) {
    event.preventDefault();
    setReferenceDragging(false);
    const files = droppedImageFiles(event);
    if (files.length) void addUploadedReferences(files);
  }

  function handleBatchRepairDrop(event) {
    event.preventDefault();
    setBatchRepairDragging(false);
    const files = droppedImageFiles(event);
    if (files.length) void addBatchRepairImages(files);
  }

  function switchCreationMode(nextMode) {
    if (nextMode !== 'single' && nextMode !== 'batch-repair') return;
    setCreationMode(nextMode);
    setWorkspaceTab('control');
    setMention(null);
    setState((current) => ({ ...current, message: '' }));
  }

  function openBatchRepairUpload() {
    if (!hasFullWorkspace) {
      if (!isSignedIn) onSignIn?.();
      else onBilling?.();
      return;
    }
    if (!batchProviderSupported) {
      setState((current) => ({ ...current, message: t.providerReferenceUnsupported }));
      return;
    }
    if (batchRepairImages.length >= MAX_BATCH_REPAIR_IMAGES || batchRepairUploading) return;
    batchRepairUploadRef.current?.click();
  }

  async function addBatchRepairImages(fileList, { sourceItems = [], manageLoading = true } = {}) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!hasFullWorkspace) {
      if (!isSignedIn) onSignIn?.();
      else onBilling?.();
      return;
    }
    const remaining = Math.max(0, MAX_BATCH_REPAIR_IMAGES - batchRepairImages.length);
    if (!remaining) return;
    if (!batchProviderSupported) {
      setState((current) => ({ ...current, message: t.providerReferenceUnsupported }));
      return;
    }
    if (manageLoading) setBatchRepairUploading(true);
    const added = [];
    let failed = false;
    try {
      for (const [index, file] of files.slice(0, remaining).entries()) {
        try {
          const sourceItem = sourceItems[index] || null;
          const prepared = await prepareReferenceFile(file, modelConstraints, {
            targetBytes: BATCH_REPAIR_TARGET_BYTES,
            maxSide: REFERENCE_MAX_SIDE,
            includeThumbnail: true,
            preserveSourceType: true
          });
          const id = `batch-source-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${added.length}`}`;
          added.push({
            id,
            source: sourceItem?.source || 'upload',
            sourceItemId: sourceItem ? imageReferenceIdentity(sourceItem) : '',
            sourceName: sourceItem?.sourceName || sourceItem?.prompt || file.name,
            imageUrl: prepared.thumbnailDataUrl || prepared.dataUrl,
            thumbnailUrl: prepared.thumbnailDataUrl || prepared.dataUrl,
            imageDataUrl: prepared.dataUrl,
            mimeType: prepared.mimeType,
            width: prepared.width,
            height: prepared.height,
            byteLength: prepared.byteLength,
            annotations: []
          });
        } catch {
          failed = true;
        }
      }
      if (added.length) setBatchRepairImages((current) => [...current, ...added].slice(0, MAX_BATCH_REPAIR_IMAGES));
      setState((current) => ({
        ...current,
        message: failed ? t.referenceUploadFailed : files.length > remaining ? t.maxReferences(MAX_BATCH_REPAIR_IMAGES) : ''
      }));
    } finally {
      if (manageLoading) setBatchRepairUploading(false);
      if (batchRepairUploadRef.current) batchRepairUploadRef.current.value = '';
    }
  }

  function removeBatchRepairImage(id) {
    setBatchRepairImages((current) => current.filter((item) => item.id !== id));
  }

  function showBatchQueueNotice(message) {
    if (batchQueueNoticeTimerRef.current) clearTimeout(batchQueueNoticeTimerRef.current);
    setBatchQueueNotice(message);
    batchQueueNoticeTimerRef.current = setTimeout(() => {
      setBatchQueueNotice('');
      batchQueueNoticeTimerRef.current = null;
    }, 5000);
  }

  function clearBatchQueueNotice() {
    if (batchQueueNoticeTimerRef.current) clearTimeout(batchQueueNoticeTimerRef.current);
    batchQueueNoticeTimerRef.current = null;
    setBatchQueueNotice('');
  }

  async function queueBatchRepair(event) {
    event?.preventDefault?.();
    if (batchRepairSubmittingRef.current) return;
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setState((current) => ({ ...current, message: t.emptyPrompt }));
      return;
    }
    if (!hasFullWorkspace) {
      if (!isSignedIn) onSignIn?.();
      else onBilling?.();
      return;
    }
    if (!batchProviderSupported) {
      setState((current) => ({ ...current, message: t.providerReferenceUnsupported }));
      return;
    }
    if (!batchRepairItems.length) {
      setState((current) => ({ ...current, message: t.batchEmpty }));
      return;
    }
    if (queueTasks.length + batchRepairItems.length > MAX_QUEUE_TASKS) {
      setState((current) => ({ ...current, message: t.queueFull }));
      return;
    }
    const supportedItems = batchRepairItems.filter((item) => item.sizing.valid);
    if (supportedItems.length && (batchPricingLoading || batchPricingError
      || supportedItems.some((item) => !batchPricingByKey[item.id]))) {
      setState((current) => ({ ...current, message: t.failed }));
      return;
    }
    if (!profile?.isSuperAdmin && Number(profile?.creditBalance || 0) < batchRepairTotalCredits) {
      onBilling?.();
      setState((current) => ({ ...current, message: t.creditsRequired }));
      return;
    }

    batchRepairSubmittingRef.current = true;
    setBatchRepairSubmitting(true);
    setState((current) => ({ ...current, message: '' }));
    showBatchQueueNotice(t.batchProcessingNotice);

    const batchId = `repair-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
    const tasks = batchRepairItems.map((item, index) => ({
      clientTaskId: `${batchId}-${String(index + 1).padStart(2, '0')}`,
      taskMode: 'batch-repair',
      batchId,
      batchIndex: index,
      sourceName: item.sourceName,
      sourceWidth: item.width,
      sourceHeight: item.height,
      sourceThumbnail: item.thumbnailUrl || item.imageUrl,
      prompt: trimmedPrompt,
      size: item.sizing.valid ? item.sizing.size : '1024x1024',
      quality,
      count: 1,
      providerId,
      references: item.sizing.valid ? [{ clientId: item.id, imageDataUrl: item.imageDataUrl, annotations: [] }] : [],
      preflightError: item.sizing.valid
        ? ''
        : item.referenceSupported ? 'PROVIDER_SOURCE_SIZE_UNSUPPORTED' : 'INVALID_REFERENCE_IMAGE_FORMAT'
    }));
    try {
      const response = await fetch('/api/generation-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        clearBatchQueueNotice();
        setState((current) => ({ ...current, message: payload.error === 'TASK_LIST_FULL' ? t.queueFull : generationFailureText(payload, t) }));
        return;
      }
      setQueueTasks((current) => [
        ...current.filter((task) => !(payload.tasks || []).some((created) => created.id === task.id)),
        ...(payload.tasks || [])
      ]);
      setBatchRepairImages([]);
      setState((current) => ({
        ...current,
        message: batchRepairItems.length > supportedItems.length
          ? t.batchQueued(supportedItems.length, batchRepairItems.length - supportedItems.length)
          : ''
      }));
      showBatchQueueNotice(t.batchProcessingNotice);
      setWorkspaceTab('tasks');
    } catch {
      clearBatchQueueNotice();
      setState((current) => ({ ...current, message: t.failed }));
    } finally {
      batchRepairSubmittingRef.current = false;
      setBatchRepairSubmitting(false);
    }
  }

  function buildGenerationItems(payload, task) {
    return (payload.images?.length ? payload.images : [payload]).map((item, index) => ({
      id: item.generationId || `${task.id}-${index}`,
      generationId: item.generationId || '',
      imageUrl: item.image,
      mimeType: normalizedImageMimeType(item.contentType || item.mimeType) || 'image/png',
      thumbnailUrl: item.thumbnailUrl || (item.generationId
        ? generatedImageUrl(item.generationId, GENERATED_THUMBNAIL_VARIANT)
        : item.image),
      prompt: task.prompt,
      size: item.size || task.size,
      quality: item.quality || task.quality,
      downloadAllowed: Boolean(item.downloadAllowed && hasFullWorkspace),
      cloudSaved: Boolean(item.cloudSaved && hasFullWorkspace),
      storageBackend: item.storageBackend || '',
      createdAt: new Date().toISOString(),
      status: 'succeeded'
    }));
  }

  function showGeneratedItems(items, message = '', { syncHistory = true } = {}) {
    setState({ status: 'success', results: items, message });
    if (!items.length || !syncHistory) return;
    setHistory((current) => [
      ...items.map((item) => ({ ...item })),
      ...current.filter((entry) => !items.some((item) => item.id === entry.id))
    ]);
  }

  async function queueCurrentGeneration() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setState((current) => ({ ...current, message: t.emptyPrompt }));
      return;
    }
    if (!hasFullWorkspace) {
      if (!isSignedIn) onSignIn?.();
      else onBilling?.();
      return;
    }
    if (!sizeCheck.valid) {
      setState((current) => ({ ...current, message: sizeErrorText(sizeCheck, t) }));
      return;
    }
    if (!referencesValid) {
      setState((current) => ({ ...current, message: modelConstraints.isMai ? t.maiReferenceUploadFailed : referenceLimitMessage }));
      return;
    }
    if (queueTasks.length >= MAX_QUEUE_TASKS) {
      setState((current) => ({ ...current, message: t.queueFull }));
      return;
    }
    const taskId = `queue-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${queueTasks.length}`}`;
    const taskRequest = {
      prompt: trimmedPrompt,
      size,
      quality,
      count,
      references: references.map((reference) => reference.source === 'upload'
        ? { clientId: reference.id, imageDataUrl: reference.imageDataUrl, annotations: reference.annotations }
        : reference.source === 'asset'
          ? { assetId: reference.assetId, annotations: reference.annotations }
          : { generationId: reference.generationId || reference.id, annotations: reference.annotations }),
      providerId,
      clientTaskId: taskId
    };
    try {
      const response = await fetch('/api/generation-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskRequest)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        setState((current) => ({ ...current, message: payload.error === 'TASK_LIST_FULL' ? t.queueFull : generationFailureText(payload, t) }));
        return;
      }
      setQueueTasks((current) => [...current.filter((item) => item.id !== payload.task.id), payload.task]);
      setState((current) => ({ ...current, message: '' }));
      setWorkspaceTab('tasks');
    } catch {
      setState((current) => ({ ...current, message: t.failed }));
    }
  }

  async function deleteQueueTask(event, taskId) {
    event.stopPropagation();
    try {
      const response = await fetch('/api/generation-tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      if (!response.ok) return;
      setQueueTasks((current) => current.filter((task) => task.id !== taskId));
      setSelectedTaskId((current) => current === taskId ? '' : current);
      setState((current) => ({ ...current, message: '' }));
    } catch {
      setState((current) => ({ ...current, message: t.failed }));
    }
  }

  async function cancelQueueTask(event, task) {
    event.stopPropagation();
    if (!isActiveImageTask(task) || task.status === 'cancelling') return;
    setQueueTasks((current) => current.map((item) => item.id === task.id
      ? { ...item, status: 'cancelling' }
      : item));
    try {
      const response = await fetch('/api/generation-tasks/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'TASK_CANCEL_FAILED');
      setQueueTasks((current) => current.map((item) => item.id === task.id
        ? { ...item, ...(payload.task || {}), status: payload.status || payload.task?.status || 'cancelling' }
        : item));
      setState((current) => ({ ...current, status: 'idle', message: t.cancelTaskDone }));
    } catch {
      setQueueTasks((current) => current.map((item) => item.id === task.id
        ? { ...item, status: 'running' }
        : item));
      setState((current) => ({ ...current, status: 'error', message: t.cancelTaskFailed }));
    }
  }

  async function redoQueueTask(event, task) {
    event.stopPropagation();
    if (isActiveImageTask(task)) return;
    if (queueTasks.length >= MAX_QUEUE_TASKS) {
      setState((current) => ({ ...current, message: t.queueFull }));
      return;
    }
    try {
      const response = await fetch('/api/generation-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redo', taskId: task.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.task) {
        const message = payload.error === 'TASK_LIST_FULL'
          ? t.queueFull
          : payload.error === 'TASK_REDO_DATA_UNAVAILABLE'
            ? t.redoUnavailable
            : t.redoFailed;
        setState((current) => ({ ...current, status: 'error', message }));
        return;
      }
      setQueueTasks((current) => [...current.filter((item) => item.id !== payload.task.id), payload.task]);
      setSelectedTaskId(payload.task.id);
      setState((current) => ({ ...current, status: 'idle', message: t.redoQueued }));
      setWorkspaceTab('tasks');
    } catch {
      setState((current) => ({ ...current, status: 'error', message: t.redoFailed }));
    }
  }

  function openImagePreview(item) {
    if (!item?.imageUrl) return;
    setPreviewZoom(1);
    setPreviewOffset({ x: 0, y: 0 });
    setPreviewPanning(false);
    setPreviewPrompt(item.promptHidden ? '' : String(item.prompt || ''));
    setPreviewPromptCopied(false);
    setPreviewImage(item);
  }

  function closeImagePreview() {
    setPreviewImage(null);
    setPreviewOffset({ x: 0, y: 0 });
    setPreviewPanning(false);
    previewPanRef.current = null;
    setPreviewPromptCopied(false);
  }

  function clampPreviewOffset(nextOffset, zoomValue = previewZoom) {
    const canvas = previewCanvasRef.current;
    const image = previewImageRef.current;
    if (!canvas || !image || zoomValue <= 1) return { x: 0, y: 0 };
    return clampImagePanOffset(nextOffset, {
      viewportWidth: canvas.clientWidth,
      viewportHeight: canvas.clientHeight,
      contentWidth: image.offsetWidth,
      contentHeight: image.offsetHeight,
      zoom: zoomValue
    });
  }

  function setPreviewZoomValue(nextValue) {
    const nextZoom = Math.max(0.5, Math.min(4, Number(nextValue) || 1));
    setPreviewZoom(nextZoom);
    setPreviewOffset((current) => clampPreviewOffset(current, nextZoom));
  }

  function beginPreviewPan(event) {
    if (previewZoom <= 1 || (event.pointerType === 'mouse' && event.button !== 0)) return;
    previewPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: previewOffset.x,
      originY: previewOffset.y
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPreviewPanning(true);
  }

  function movePreviewPan(event) {
    const pan = previewPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPreviewOffset(clampPreviewOffset({
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY
    }));
  }

  function endPreviewPan(event) {
    const pan = previewPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    previewPanRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setPreviewPanning(false);
  }

  async function copyPreviewPrompt() {
    await writeClipboardText(previewPrompt);
    setPreviewPromptCopied(true);
    if (previewCopyTimerRef.current) clearTimeout(previewCopyTimerRef.current);
    previewCopyTimerRef.current = setTimeout(() => setPreviewPromptCopied(false), 1800);
  }

  function applyPreviewPrompt() {
    setPrompt(previewPrompt);
    setPromptOptimized(false);
    setMention(null);
    closeImagePreview();
    setWorkspaceTab('control');
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(previewPrompt.length, previewPrompt.length);
    });
  }

  function startPreviewRegionEdit() {
    if (!previewImage) return;
    const identity = previewImage.id || previewImage.generationId;
    const existing = references.find((reference) => reference.id === identity);
    const candidate = {
      ...previewImage,
      id: identity,
      generationId: previewImage.generationId || previewImage.id,
      source: 'history',
      originalImageUrl: previewImage.originalImageUrl || existing?.imageUrl || previewImage.imageUrl,
      imageUrl: previewImage.originalImageUrl || existing?.imageUrl || previewImage.imageUrl,
      markedImageUrl: previewImage.markedImageUrl || (previewImage.originalImageUrl ? previewImage.imageUrl : ''),
      annotations: existing?.annotations || previewImage.annotations || []
    };
    if (!referenceAllowedForModel(candidate, modelConstraints)) {
      setState((current) => ({
        ...current,
        message: maxReferenceImages ? t.maiReferenceUploadFailed : t.referenceUnsupported
      }));
      return;
    }
    const localEditPrompt = t.localEditPrompt;
    setPreviewPrompt(localEditPrompt);
    setPreviewEditReference({ ...candidate, localEditPrompt });
    setPreviewImage(null);
  }

  function createLocalEditTask(reference, annotations, markedImageUrl = '') {
    const identity = reference.id || reference.generationId;
    const token = `@图-${String(identity).slice(0, 6)}`;
    const localEditPrompt = String(reference.localEditPrompt || t.localEditPrompt).trim();
    const originalImageUrl = reference.originalImageUrl || reference.imageUrl;
    const displayImageUrl = markedImageUrl || reference.markedImageUrl || originalImageUrl;
    const localReference = {
      ...reference,
      id: identity,
      generationId: reference.generationId || reference.id,
      source: 'history',
      imageUrl: originalImageUrl,
      originalImageUrl,
      thumbnailUrl: displayImageUrl,
      markedImageUrl: displayImageUrl,
      token,
      annotations,
      mimeType: imageItemMimeType(reference)
    };
    applyReferenceCanvasSize(localReference);
    setReferences([localReference]);
    setPrompt(`${localEditPrompt}\n${token} `);
    setPromptOptimized(false);
    setMention(null);
    setCount(1);
    setState({
      status: 'success',
      message: t.localEditReady,
      results: [{
        ...reference,
        id: identity,
        generationId: reference.generationId || reference.id,
        imageUrl: displayImageUrl,
        originalImageUrl,
        markedImageUrl: displayImageUrl,
        thumbnailUrl: displayImageUrl,
        annotations,
        prompt: localEditPrompt,
        promptHidden: false,
        downloadAllowed: false,
        status: 'edit-guide'
      }]
    });
    setWorkspaceTab('control');
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(0, localEditPrompt.length);
    });
  }

  function showHistoryImage(item) {
    if (!item?.imageUrl) return;
    setSelectedHistoryId(item.id || item.generationId || '');
    showGeneratedItems(
      [{ ...item, downloadAllowed: Boolean(item.downloadAllowed ?? hasFullWorkspace) }],
      '',
      { syncHistory: false }
    );
  }

  function openTaskResults(task) {
    if (!task?.results?.length) return;
    setSelectedTaskId(task.id);
    showGeneratedItems(task.results);
  }

  async function usePreviewAsReference() {
    if (!previewImage) return;
    await useImageAsReference({
      ...previewImage,
      id: previewImage.id || previewImage.generationId,
      generationId: previewImage.generationId || previewImage.id,
      source: 'history'
    }, { promptOverride: previewPrompt });
    closeImagePreview();
    setWorkspaceTab('control');
  }

  async function optimizePrompt() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setState((current) => ({ ...current, message: t.emptyPrompt }));
      textareaRef.current?.focus();
      return;
    }
    if (!hasFullWorkspace) {
      if (!isSignedIn) onSignIn?.();
      else onBilling?.();
      return;
    }
    setOptimizing(true);
    setState((current) => ({ ...current, message: '' }));
    const hasAnnotations = creationMode === 'single' && references.some((reference) => reference.annotations.length);
    const optimizationReferenceCount = creationMode === 'batch-repair'
      ? (batchRepairImages.length ? 1 : 0)
      : references.length;
    try {
      const response = await fetch('/api/optimize-image-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          language,
          referenceCount: optimizationReferenceCount,
          hasAnnotations
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.user) onProfileChange?.(payload.user);
      if (!response.ok || !payload?.ok) {
        if (payload.error === 'CREDITS_REQUIRED') {
          onBilling?.();
          setState((current) => ({ ...current, message: t.creditsRequired }));
          return;
        }
        throw new Error(payload.error || 'PROMPT_OPTIMIZATION_FAILED');
      }
      const optimizedPrompt = payload?.ok && payload.prompt
        ? payload.prompt
        : localPromptPolish(trimmed, language, optimizationReferenceCount, hasAnnotations);
      setPrompt(optimizedPrompt);
      setPromptOptimized(true);
      setMention(null);
    } catch {
      setPrompt(localPromptPolish(trimmed, language, optimizationReferenceCount, hasAnnotations));
      setPromptOptimized(true);
      setMention(null);
    } finally {
      setOptimizing(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setState((current) => ({ ...current, message: t.emptyPrompt }));
      return;
    }
    if (isSignedIn && !profile) {
      setState((current) => ({ ...current, message: t.signIn }));
      return;
    }
    if (isSignedIn && !hasFullWorkspace) {
      onBilling?.();
      setState((current) => ({ ...current, message: t.creditsRequired }));
      return;
    }
    if (isGuest && guestUsed) {
      onSignIn?.();
      setState((current) => ({ ...current, message: t.guestUsed }));
      return;
    }
    if (hasFullWorkspace && !sizeCheck.valid) {
      setState((current) => ({ ...current, message: sizeErrorText(sizeCheck, t) }));
      return;
    }
    if (hasFullWorkspace && !referencesValid) {
      setState((current) => ({ ...current, message: modelConstraints.isMai ? t.maiReferenceUploadFailed : referenceLimitMessage }));
      return;
    }
    const requestedCount = hasFullWorkspace ? count : 1;
    if (hasFullWorkspace) {
      let confirmedPricing;
      try {
        confirmedPricing = await requestImagePricing({ size, quality, providerId });
      } catch {
        setState((current) => ({ ...current, message: t.failed }));
        return;
      }
      const confirmedCredits = Number(confirmedPricing.credits || 0) * requestedCount;
      if (!profile?.isSuperAdmin && Number(profile?.creditBalance || 0) < confirmedCredits) {
        onBilling?.();
        setState((current) => ({ ...current, message: t.creditsRequired }));
        return;
      }
    }

    setMention(null);
    setState((current) => ({ ...current, status: 'generating', message: '' }));
    try {
      const response = await fetchImageGeneration('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          size: hasFullWorkspace ? size : '1024x1024',
          quality: hasFullWorkspace ? quality : 'low',
          count: requestedCount,
          providerId,
          references: hasFullWorkspace
            ? references.map((reference) => reference.source === 'upload'
              ? {
                  clientId: reference.id,
                  imageDataUrl: reference.imageDataUrl,
                  annotations: reference.annotations
                }
              : reference.source === 'asset'
                ? {
                    assetId: reference.assetId,
                    annotations: reference.annotations
                  }
                : {
                    generationId: reference.generationId || reference.id,
                    annotations: reference.annotations
                  })
            : []
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        if (payload.user) onProfileChange?.(payload.user);
        if (payload.error === 'CREDITS_REQUIRED') {
          onBilling?.();
          setState((current) => ({ ...current, status: 'idle', message: t.creditsRequired }));
          return;
        }
        if (payload.error === 'GUEST_FREE_LIMIT_REACHED') {
          setGuestUsed(true);
          onSignIn?.();
          setState((current) => ({ ...current, status: 'error', message: t.guestUsed }));
          return;
        }
        if (payload.error === 'REFERENCE_IMAGE_NOT_FOUND') {
          setState((current) => ({ ...current, status: 'error', message: t.referenceMissing }));
          return;
        }
        const error = new Error(payload.error || 'GENERATION_FAILED');
        error.userMessage = generationFailureText(payload, t);
        throw error;
      }

      const resultItems = (payload.images?.length ? payload.images : [payload]).map((item, index) => ({
        id: item.generationId || `guest-${Date.now()}-${index}`,
        generationId: item.generationId || '',
        imageUrl: item.image,
        mimeType: normalizedImageMimeType(item.contentType || item.mimeType) || 'image/png',
        thumbnailUrl: item.thumbnailUrl || (item.generationId
          ? generatedImageUrl(item.generationId, GENERATED_THUMBNAIL_VARIANT)
          : item.image),
        prompt: trimmedPrompt,
        size: item.size || (hasFullWorkspace ? size : '1024x1024'),
        quality: item.quality || (hasFullWorkspace ? quality : 'low'),
        downloadAllowed: Boolean(item.downloadAllowed && hasFullWorkspace),
        cloudSaved: Boolean(item.cloudSaved && hasFullWorkspace),
        storageBackend: item.storageBackend || '',
        createdAt: new Date().toISOString(),
        status: 'succeeded'
      }));
      if (payload.guest) setGuestUsed(true);
      else {
        setHistory((current) => [
          ...resultItems.map((item) => ({ ...item, imageUrl: item.imageUrl })),
          ...current.filter((entry) => !resultItems.some((item) => item.id === entry.id))
        ]);
      }
      setState({
        status: 'success',
        results: resultItems,
        message: payload.partial ? t.partial(resultItems.length, requestedCount) : ''
      });
      if (payload.user) onProfileChange?.(payload.user);
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'error',
        message: isImageGenerationTimeout(error) ? t.timeout : error?.userMessage || generationFailureText(error?.message, t)
      }));
    }
  }

  return (
    <div className="freeImageWorkspace">
      {batchQueueNotice ? (
        <div className="toastNotice freeImageBatchQueueToast" role="status" aria-live="polite">
          <LoaderCircle size={16} className="spin" />
          <span>{batchQueueNotice}</span>
        </div>
      ) : null}
      <header className="freeImageHeader">
        <div className="freeImageHeaderContent">
          <h2>{t.title}</h2>
        </div>
        <div className="freeImageHeaderActions">
          {hasFullWorkspace && profile ? (
            <div className="freeImageHeaderStatus">
              <strong>{profile.creditBalance || 0}</strong>
              <span>{t.credits}</span>
            </div>
          ) : null}
          <button className="freeImageQueuePeople" type="button" onClick={() => setWorkspaceTab('tasks')} aria-label={t.queuePeople} title={t.queuePeople}>
            {Array.from({ length: MAX_QUEUE_TASKS }, (_, index) => {
              const activeCount = queueTasks.filter((task) => ['queued', 'running'].includes(task.status)).length;
              return <span className={index < activeCount ? 'lit' : ''} key={index} aria-hidden="true" />;
            })}
            <ListTodo size={16} />
          </button>
        </div>
      </header>

      <div className="freeImageWorkspaceTabs" role="tablist" aria-label={t.title}>
        <button className={workspaceTab === 'control' && creationMode === 'single' ? 'active' : ''} type="button" role="tab" aria-selected={workspaceTab === 'control' && creationMode === 'single'} onClick={() => switchCreationMode('single')}>
          <ImagePlus size={16} /> {t.singleCreate}
        </button>
        <button className={workspaceTab === 'control' && creationMode === 'batch-repair' ? 'active' : ''} type="button" role="tab" aria-selected={workspaceTab === 'control' && creationMode === 'batch-repair'} onClick={() => switchCreationMode('batch-repair')}>
          <WandSparkles size={16} /> {t.batchRepair}
        </button>
        <button className={workspaceTab === 'tasks' ? 'active' : ''} type="button" role="tab" aria-selected={workspaceTab === 'tasks'} onClick={() => setWorkspaceTab('tasks')}>
          <ListTodo size={16} /> {t.taskList} <span>{queueTasks.filter((task) => ['queued', 'running'].includes(task.status)).length}</span>
        </button>
      </div>

      <div className="freeImageMainGrid">
        {workspaceTab === 'control' ? (
          <form className="freeImageComposer" onPaste={handleComposerPaste} onSubmit={creationMode === 'batch-repair' ? queueBatchRepair : handleSubmit}>
          <div className="freeImagePromptHeader">
            <label htmlFor="free-image-prompt">{creationMode === 'batch-repair' ? t.sharedRepairPrompt : t.prompt}</label>
            <button className="freeImageMagicButton" type="button" onClick={optimizePrompt} disabled={optimizing || isGenerating}>
              {optimizing ? <LoaderCircle size={17} className="spin" /> : <WandSparkles size={18} />}
              <span>{optimizing ? t.optimizing : t.optimize}</span>
            </button>
          </div>
          <div className={`freeImagePromptWrap ${creationMode === 'batch-repair' ? 'batchRepairPrompt' : ''}`}>
            {creationMode === 'single' && localEditLockedRule ? (
              <div className="freeImageLockedPromptRule" role="note" aria-label={localEditLockedRule}>
                <LockKeyhole size={15} aria-hidden="true" />
                <span>{localEditLockedRule}</span>
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              id="free-image-prompt"
              className={promptOptimized ? 'optimized' : ''}
              value={prompt}
              onChange={(event) => updatePrompt(event.target.value, event.target.selectionStart)}
              onClick={(event) => setMention(mentionAtCursor(event.currentTarget.value, event.currentTarget.selectionStart))}
              onKeyUp={(event) => {
                if (event.key === 'Escape') setMention(null);
                else setMention(mentionAtCursor(event.currentTarget.value, event.currentTarget.selectionStart));
              }}
              placeholder={creationMode === 'batch-repair'
                ? t.batchRepairPlaceholder
                : maxReferenceImages ? t.placeholder : t.placeholderNoReferences}
              maxLength={6000}
              disabled={isGenerating}
            />
            {mention && (imageReferenceTarget === 'batch-repair'
              ? batchProviderSupported && batchRepairImages.length < MAX_BATCH_REPAIR_IMAGES
              : maxReferenceImages) ? (
              <div className="freeImageMentionMenu">
                <strong><AtSign size={15} /> {t.history}</strong>
                {mentionMatches.length ? mentionMatches.map((item) => (
                  <button type="button" onClick={() => useImageAsReference(item, { fromMention: true })} key={item.id}>
                    <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" decoding="async" />
                    {item.prompt ? <span>{compactPrompt(item.prompt)}</span> : null}
                  </button>
                )) : <em>{t.noHistory}</em>}
              </div>
            ) : null}
          </div>

          {creationMode === 'single' ? (
          <section
            className={`freeImageReferenceTray ${referenceDragging ? 'dragActive' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setReferenceDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setReferenceDragging(true); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setReferenceDragging(false); }}
            onDrop={handleReferenceDrop}
          >
            <div className="freeImageReferenceHeading">
              <div>
                <strong>{t.references}</strong>
                {modelConstraints.isMai || !maxReferenceImages ? <small>{referenceHintText}</small> : null}
              </div>
              <span>{references.length}/{maxReferenceImages}</span>
            </div>
            <input
              ref={referenceUploadRef}
              className="freeImageReferenceInput"
              type="file"
              accept={referenceAccept}
              multiple={maxReferenceImages > 1}
              disabled={!maxReferenceImages}
              onChange={(event) => addUploadedReferences(event.target.files)}
            />
            <div className="freeImageReferenceList">
              <button
                className="freeImageReferenceUpload"
                type="button"
                onClick={openReferenceUpload}
                disabled={isGenerating || uploadingReferences || !maxReferenceImages || references.length >= maxReferenceImages}
              >
                {uploadingReferences ? <LoaderCircle size={18} className="spin" /> : <Upload size={18} />}
                <span>{uploadingReferences ? t.uploadingReferences : t.uploadReference}</span>
              </button>
              {references.map((reference, index) => (
                <article className={reference.annotations.length ? 'marked' : ''} key={reference.id}>
                  <img src={reference.markedImageUrl || reference.thumbnailUrl || reference.imageUrl} alt={reference.prompt || ''} loading="lazy" decoding="async" />
                  <span>{index + 1}</span>
                  <button className="edit" type="button" onClick={() => setEditingReferenceId(reference.id)} title={t.editMarks}>
                    <Edit3 size={14} />
                  </button>
                  <button className="remove" type="button" onClick={() => removeReference(reference)} aria-label="Remove reference">
                    <X size={13} />
                  </button>
                  {reference.annotations.length ? <em>{reference.annotations.length}</em> : null}
                </article>
              ))}
            </div>
          </section>
          ) : (
          <section
            className={`freeImageBatchRepairTray ${batchRepairDragging ? 'dragActive' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setBatchRepairDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setBatchRepairDragging(true); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setBatchRepairDragging(false); }}
            onDrop={handleBatchRepairDrop}
          >
            <div className="freeImageReferenceHeading">
              <div>
                <strong>{t.batchUpload}</strong>
              </div>
              <span>{batchRepairImages.length}/{MAX_BATCH_REPAIR_IMAGES}</span>
            </div>
            <input
              ref={batchRepairUploadRef}
              className="freeImageReferenceInput"
              type="file"
              accept={referenceAccept}
              multiple
              disabled={!batchProviderSupported}
              onChange={(event) => addBatchRepairImages(event.target.files)}
            />
            <div className="freeImageBatchRepairGrid">
              <button
                className="freeImageBatchRepairUpload"
                type="button"
                onClick={openBatchRepairUpload}
                disabled={batchRepairUploading || !batchProviderSupported || batchRepairImages.length >= MAX_BATCH_REPAIR_IMAGES}
              >
                {batchRepairUploading ? <LoaderCircle size={22} className="spin" /> : <Upload size={22} />}
                <strong>{batchRepairUploading ? t.batchUploading : t.batchUpload}</strong>
              </button>
              {batchRepairItems.map((item, index) => (
                <article className={item.sizing.valid ? '' : 'unsupported'} key={item.id}>
                  <img src={item.thumbnailUrl || item.imageUrl} alt={item.sourceName || ''} />
                  <span className="freeImageBatchIndex">{index + 1}</span>
                  <button type="button" onClick={() => removeBatchRepairImage(item.id)} aria-label={t.deleteTask} title={t.deleteTask}>
                    <X size={13} />
                  </button>
                  <footer>
                    <strong title={item.sourceName}>{item.sourceName}</strong>
                    <small>{t.batchSourceSize} {item.width}×{item.height}</small>
                    {item.sizing.valid ? (
                      <small>{t.batchOutputSize} {item.sizing.width}×{item.sizing.height}</small>
                    ) : (
                      <em>{item.referenceSupported ? t.providerSourceSizeUnsupported : t.maiReferenceUploadFailed}</em>
                    )}
                    {item.sizing.valid && batchPricingByKey[item.id] ? (
                      <ImageCreditPrice pricing={batchPricingByKey[item.id]} language={language} compact showPromotionName={false} />
                    ) : null}
                  </footer>
                </article>
              ))}
            </div>
          </section>
          )}

          {creationMode === 'single' ? (
          <section className="freeImageControlsPanel">
            <div className="freeImageControlRail">
              <label>
                <span>{language === 'zh' ? '生图服务' : 'Image service'}</span>
                <select value={providerId} onChange={(event) => setProviderId(event.target.value)} disabled={isGenerating || !providers.length}>
                  {providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}
                </select>
              </label>
              <label>
                <span>{t.size}</span>
                <select
                  value={hasFullWorkspace ? selectedSizeOption : '1024x1024'}
                  onChange={(event) => selectSizeOption(event.target.value)}
                  disabled={!hasFullWorkspace || isGenerating}
                >
                  {sizeTemplate ? <option value="template">{t.sizeTemplate} {sizeTemplate.replace('x', '×')}</option> : null}
                  {modelConstraints.allowAutoSize ? <option value="auto">{t.auto}</option> : null}
                  {commonSizeOptions.map((item) => <option value={item} key={item}>{item.replace('x', '×')}</option>)}
                  <option value="custom">{t.customSize} · {width}×{height}</option>
                </select>
              </label>
              <label>
                <span>{t.ratio}</span>
                <select
                  value={hasFullWorkspace ? ratioLock : '1:1'}
                  onChange={(event) => setRatio(event.target.value)}
                  disabled={!hasFullWorkspace || isGenerating || sizeMode === 'auto'}
                >
                  {ratioOptions.map((preset) => <option value={preset.id} key={preset.id}>{preset.id}</option>)}
                  {!modelConstraints.isGeminiImage ? <option value="free">{t.free}</option> : null}
                </select>
              </label>
              <label>
                <span>{modelConstraints.isGeminiImage ? t.geminiResolution : t.quality}</span>
                <select
                  value={hasFullWorkspace ? quality : 'low'}
                  onChange={(event) => setQuality(event.target.value)}
                  disabled={!hasFullWorkspace || isGenerating}
                >
                  {IMAGE_QUALITY_VALUES.map((item) => (
                    <option value={item} key={item}>{workspaceQualityLabel(item, language, modelConstraints)}</option>
                  ))}
                </select>
              </label>
              <div className="freeImageCountPreview">
                <label>
                  <span>{t.drawCount}</span>
                  <select
                    value={hasFullWorkspace ? count : 1}
                    onChange={(event) => setCount(Number(event.target.value))}
                    disabled={!hasFullWorkspace || isGenerating}
                  >
                    {[1, 2, 3, 4].map((item) => <option value={item} key={item}>{item}</option>)}
                  </select>
                </label>
                <div
                  className="freeImageRatioPreview"
                  data-ratio={`${canvasRatio.width}:${canvasRatio.height}`}
                  aria-label={sizeMode === 'auto' ? 'Auto' : `${canvasRatio.width}:${canvasRatio.height}`}
                >
                  <CanvasRatioGraphic ratioWidth={canvasRatio.width} ratioHeight={canvasRatio.height} />
                </div>
              </div>
            </div>

            {sizeMode === 'custom' ? (
              <div className="freeImageDimensionRail">
                {[
                  { key: 'width', label: t.width, value: hasFullWorkspace ? width : 1024 },
                  { key: 'height', label: t.height, value: hasFullWorkspace ? height : 1024 }
                ].map((dimension) => (
                  <label key={dimension.key}>
                    <span>{dimension.label}</span>
                    <input
                      type="range"
                      min={modelConstraints.minSide}
                      max={modelConstraints.maxSide}
                      step="16"
                      value={dimension.value}
                      onChange={(event) => updateDimension(dimension.key, event.target.value)}
                      disabled={!hasFullWorkspace || isGenerating}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      step="1"
                      min={modelConstraints.minSide}
                      max={modelConstraints.maxSide}
                      value={hasFullWorkspace ? dimensionDrafts[dimension.key] : '1024'}
                      onChange={(event) => updateDimensionDraft(dimension.key, event.target.value)}
                      onBlur={() => commitDimensionDraft(dimension.key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitDimensionDraft(dimension.key);
                          event.currentTarget.blur();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          setDimensionDrafts((current) => ({
                            ...current,
                            [dimension.key]: String(dimension.key === 'width' ? width : height)
                          }));
                          event.currentTarget.blur();
                        }
                      }}
                      disabled={!hasFullWorkspace || isGenerating}
                    />
                  </label>
                ))}
                <button
                  className="freeImageTemplateLock"
                  type="button"
                  onClick={lockCurrentSizeTemplate}
                  disabled={!hasFullWorkspace || isGenerating || !sizeCheck.valid}
                  title={t.lockTemplate}
                >
                  <LockKeyhole size={14} />
                  <span>{t.lockTemplate}</span>
                </button>
              </div>
            ) : null}

            {hasFullWorkspace && !sizeCheck.valid ? <div className="freeImageControlFooter"><p className="freeImageSizeError">{sizeErrorText(sizeCheck, t)}</p></div> : null}
          </section>
          ) : (
          <section className="freeImageControlsPanel freeImageBatchRepairControls">
            <div className="freeImageBatchControlRail">
              <label>
                <span>{language === 'zh' ? '生图服务' : 'Image service'}</span>
                <select value={providerId} onChange={(event) => setProviderId(event.target.value)} disabled={batchRepairUploading || !providers.length}>
                  {providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}
                </select>
              </label>
              <label>
                <span>{modelConstraints.isGeminiImage ? t.geminiResolution : t.quality}</span>
                <select value={quality} onChange={(event) => setQuality(event.target.value)} disabled={batchRepairUploading}>
                  {IMAGE_QUALITY_VALUES.map((item) => (
                    <option value={item} key={item}>{workspaceQualityLabel(item, language, modelConstraints)}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => setBatchRepairImages([])} disabled={!batchRepairImages.length || batchRepairUploading}>
                <X size={14} /> {t.clearBatch}
              </button>
            </div>
            {!batchProviderSupported ? <p className="freeImageSizeError">{t.providerReferenceUnsupported}</p> : null}
            {batchPricingError ? <p className="freeImageSizeError">{t.failed}</p> : null}
          </section>
          )}

          {!hasFullWorkspace ? <p className="freeImageAccessNote">{isGuest ? t.fullLocked : t.creditsRequired}</p> : null}
          {creationMode === 'single' ? (
          <div className="freeImageGenerateActions">
          <button className="freeImageGenerateButton" type="submit" disabled={isGenerating || uploadingReferences || (hasFullWorkspace && (!sizeCheck.valid || !referencesValid || pricingLoading || !pricing))}>
            {isGenerating ? <LoaderCircle size={19} className="spin" /> : <ImagePlus size={19} />}
            {isGenerating ? (
              <><span className="freeImageGenerateLabel">{t.generating}</span>{hasFullWorkspace ? <ImageCreditPrice pricing={pricing} quantity={count} language={language} compact showPromotionName={false} /> : null}</>
            ) : hasFullWorkspace ? (
              <><span className="freeImageGenerateLabel">{t.generate}</span><ImageCreditPrice pricing={pricing} quantity={count} language={language} compact showPromotionName={false} /></>
            ) : guestUsed ? t.signIn : t.generateFree}
          </button>
          <button
            className="freeImageQueueButton"
            type="button"
            onClick={queueCurrentGeneration}
            disabled={isGenerating || uploadingReferences || !hasFullWorkspace || !sizeCheck.valid || !referencesValid || queueTasks.length >= MAX_QUEUE_TASKS}
            title={queueTasks.length >= MAX_QUEUE_TASKS ? t.queueFull : t.queueNow}
          >
            <ListTodo size={18} /> {queueTasks.length >= MAX_QUEUE_TASKS ? t.queueFullButton : t.queueNow}
          </button>
          </div>
          ) : (
          <button
            className={`freeImageGenerateButton freeImageBatchQueueButton ${batchRepairSubmitting ? 'submitting' : ''}`}
            type="submit"
            disabled={batchRepairSubmitting || batchRepairUploading || !hasFullWorkspace || !batchProviderSupported || !batchRepairItems.length
              || queueTasks.length + batchRepairItems.length > MAX_QUEUE_TASKS || batchPricingLoading
              || Boolean(batchPricingError) || batchRepairItems.some((item) => item.sizing.valid && !batchPricingByKey[item.id])}
            aria-busy={batchRepairSubmitting}
          >
            {batchRepairSubmitting || batchRepairUploading || batchPricingLoading ? <LoaderCircle size={19} className="spin" /> : <ListTodo size={19} />}
            <span>{queueTasks.length + batchRepairItems.length > MAX_QUEUE_TASKS ? t.queueFullButton : batchRepairSubmitting ? t.batchSubmitting : t.batchQueue}</span>
            {batchRepairTotalCredits > 0 ? <strong>{batchRepairTotalCredits} {t.credits}</strong> : null}
          </button>
          )}
          {state.message ? <p className="freeImageMessage">{state.message}</p> : null}
          </form>
        ) : (
          <section className="freeImageTaskPanel">
            <header>
              <div><strong>{t.taskList}</strong><span>{queueTasks.length}/{MAX_QUEUE_TASKS}</span></div>
            </header>
            {queueTasks.length ? (
              <div className="freeImageTaskList">
                {displayedQueueTasks.map((task) => {
                  const canView = Boolean(task.results?.length);
                  const selected = selectedTaskId === task.id;
                  const activeTask = isActiveImageTask(task);
                  return (
                    <article
                      className={`freeImageTaskItem ${task.status} ${selected ? 'selected' : ''}`}
                      key={task.id}
                      onClick={() => openTaskResults(task)}
                      onKeyDown={(event) => {
                        if (canView && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          openTaskResults(task);
                        }
                      }}
                      role={canView ? 'button' : undefined}
                      tabIndex={canView ? 0 : undefined}
                      aria-current={selected ? 'true' : undefined}
                    >
                      <button
                        className={activeTask ? 'freeImageTaskCancel' : 'freeImageTaskDelete'}
                        type="button"
                        onClick={(event) => activeTask ? cancelQueueTask(event, task) : deleteQueueTask(event, task.id)}
                        aria-label={activeTask ? t.cancelTask : t.deleteTask}
                        title={activeTask ? t.cancelTask : t.deleteTask}
                        disabled={task.status === 'cancelling'}
                      >
                        {activeTask ? <X size={15} /> : <Minus size={15} />}
                      </button>
                      {task.results?.[0]?.imageUrl || task.sourceThumbnail ? (
                        <img className="freeImageTaskThumbnail" src={task.results?.[0]?.thumbnailUrl || task.results?.[0]?.imageUrl || task.sourceThumbnail} alt="" loading="lazy" decoding="async" />
                      ) : null}
                      <div className="freeImageTaskBody">
                        <div className="freeImageTaskStatus">
                          <span>{task.status === 'queued'
                            ? t.queueing
                            : task.status === 'running'
                              ? t.queueRunning
                              : task.status === 'cancelling'
                                ? t.queueCancelling
                                : task.status === 'completed'
                                  ? t.queueCompleted
                                  : task.status === 'cancelled'
                                    ? t.queueCancelled
                                    : t.queueFailed}</span>
                          <em>{task.taskMode === 'batch-repair'
                            ? `${task.sourceWidth}×${task.sourceHeight} → ${task.error === 'PROVIDER_SOURCE_SIZE_UNSUPPORTED' ? '—' : task.size.replace('x', '×')}`
                            : `${task.count} · ${task.size} · ${imageQualityLabel(task.quality, language)}`}</em>
                        </div>
                        <p>{task.taskMode === 'batch-repair' ? task.sourceName : compactPrompt(task.prompt, 120)}</p>
                        {task.taskMode === 'batch-repair' ? <small>{compactPrompt(task.prompt, 90)}</small> : null}
                        {task.status === 'failed' && task.error ? <small className="freeImageTaskError">{taskFailureText(task, t)}</small> : null}
                      </div>
                      {!activeTask || task.results?.length ? (
                        <div className="freeImageTaskActions">
                          {!activeTask ? (
                            <button
                              className="freeImageTaskRedoButton"
                              type="button"
                              onClick={(event) => redoQueueTask(event, task)}
                              disabled={!task.redoAvailable}
                              title={task.redoAvailable ? t.redoTask : t.redoUnavailable}
                            >
                              <RotateCcw size={15} /> {t.redoTask}
                            </button>
                          ) : null}
                          {task.results?.length ? (
                            <button className="freeImageTaskViewButton" type="button" onClick={(event) => { event.stopPropagation(); openTaskResults(task); }}>
                              <Maximize2 size={15} /> {t.viewImage}
                            </button>
                          ) : null}
                        </div>
                      ) : task.status === 'running' ? <LoaderCircle size={19} className="spin freeImageTaskSpinner" /> : null}
                    </article>
                  );
                })}
              </div>
            ) : <div className="freeImageTaskEmpty"><ListTodo size={30} /><span>{t.queueEmpty}</span></div>}
          </section>
        )}

        <section className={`freeImageResults ${isGenerating ? 'generating' : ''}`}>
          <div className="freeImageSectionTitle">
            <strong>{t.result}</strong>
            {state.results.length ? <span>{state.results.length}</span> : null}
          </div>
          {state.results.length ? (
            <div className={`freeImageResultGrid count-${state.results.length}`}>
              {state.results.map((item, index) => (
                <article key={item.id}>
                  <img
                    src={item.imageUrl}
                    alt={`${item.prompt || prompt || t.result} ${index + 1}`}
                    decoding="async"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    onContextMenu={(event) => {
                      if (!item.downloadAllowed) event.preventDefault();
                    }}
                    onDoubleClick={() => openImagePreview(item)}
                  />
                  <footer>
                    <span>{item.size?.replace('x', '×')} · {imageQualityLabel(item.quality, language)}</span>
                    <button
                      type="button"
                      onClick={() => useImageAsReference(item)}
                      disabled={!hasFullWorkspace || !referenceAllowedForModel(item, modelConstraints) || (
                        imageReferenceTarget === 'batch-repair'
                          ? batchRepairUploading || batchRepairImages.length >= MAX_BATCH_REPAIR_IMAGES
                          : references.length >= maxReferenceImages
                      )}
                    >
                      <AtSign size={15} /> {t.useReference}
                    </button>
                    {item.downloadAllowed ? (
                      <a href={item.imageUrl} download={`gpt-image-${item.generationId || index + 1}.png`}>
                        <Download size={15} /> {t.download}
                      </a>
                    ) : null}
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className="freeImageResultEmpty">
              {isGenerating ? <LoaderCircle size={30} className="spin" /> : <ImagePlus size={30} />}
              <span>{isGenerating ? t.generating : t.noResult}</span>
            </div>
          )}
        </section>
      </div>

      <section className="freeImageHistory">
        <header>
          <div><h3>{t.history}</h3><span>{maxReferenceImages ? t.historyHint : t.referenceUnsupported}</span></div>
          {hasFullWorkspace ? <div className="freeImageHistoryActions">
            <strong>{visibleHistory.length}</strong>
            {(visibleHistory.length || historyHasMore) ? <button type="button" onClick={clearHistory} disabled={historyClearing}>
              {historyClearing ? <LoaderCircle size={13} className="spin" /> : <Trash2 size={13} />}
              {t.clearHistory}
            </button> : null}
          </div> : null}
        </header>
        {hasFullWorkspace && visibleHistory.length ? (
          <div className="freeImageHistoryGrid">
            {visibleHistory.map((item) => {
              const identity = imageReferenceIdentity(item);
              const selectedBatchReference = batchRepairImages.find((reference) => reference.sourceItemId === identity);
              const selectedSingleReference = references.find((reference) => reference.id === item.id);
              const selected = imageReferenceTarget === 'batch-repair'
                ? Boolean(selectedBatchReference)
                : Boolean(selectedSingleReference);
              return (
                <article className={`${selected ? 'selected' : ''} ${selectedHistoryId === item.id ? 'activePreview' : ''}`.trim()} key={item.id}>
                  <img
                    src={item.thumbnailUrl || item.imageUrl}
                    alt={item.prompt}
                    loading="lazy"
                    decoding="async"
                    onClick={() => showHistoryImage(item)}
                    onDoubleClick={() => openImagePreview(item)}
                  />
                  <button className="freeImageHistoryReference" type="button" onClick={() => selected
                    ? imageReferenceTarget === 'batch-repair'
                      ? removeBatchRepairImage(selectedBatchReference.id)
                      : removeReference(selectedSingleReference)
                    : useImageAsReference(item)} aria-pressed={selected} disabled={!selected && (
                      !referenceAllowedForModel(item, modelConstraints) || (imageReferenceTarget === 'batch-repair'
                        ? batchRepairUploading || batchRepairImages.length >= MAX_BATCH_REPAIR_IMAGES
                        : references.length >= maxReferenceImages)
                    )}>
                    {selected ? <X size={15} /> : <AtSign size={16} />}
                    {selected ? (language === 'zh' ? '移除参考' : 'Remove') : t.addReference}
                  </button>
                  <button
                    className="freeImageHistoryDelete"
                    type="button"
                    onClick={() => deleteHistoryItem(item)}
                    disabled={historyDeletingIds.has(item.id)}
                    aria-label={t.deleteHistory}
                    title={t.deleteHistory}
                  >
                    {historyDeletingIds.has(item.id) ? <LoaderCircle size={13} className="spin" /> : <X size={14} />}
                  </button>
                  {item.prompt ? <p>{compactPrompt(item.prompt, 88)}</p> : null}
                </article>
              );
            })}
            {historyHasMore ? (
              <button className="freeImageHistoryMore" type="button" onClick={loadMoreHistory} disabled={historyLoading}>
                {historyLoading ? <LoaderCircle size={18} className="spin" /> : <ImagePlus size={18} />}
                <span>{historyLoading ? t.loadingHistory : t.loadMoreHistory}</span>
              </button>
            ) : null}
          </div>
        ) : <p className="freeImageHistoryEmpty">{historyLoading ? t.loadingHistory : t.noHistory}</p>}
      </section>

      <section className="createCaseLibrary">
        <div className="createCaseLibraryHeader">
          <div><h3>{t.caseTitle}</h3></div>
          <button type="button" onClick={onBrowseCases}>{t.browseCases}</button>
        </div>
        <div className="createQuickFilters" role="tablist" aria-label={t.caseTitle}>
          <button className={category === 'All' ? 'active' : ''} type="button" onClick={() => onCategoryChange?.('All')}>{t.caseAll}</button>
          {categoryOptions.map((option) => (
            <button className={category === option.value ? 'active' : ''} type="button" onClick={() => onCategoryChange?.(option.value)} key={option.value}>{option.label}</button>
          ))}
        </div>
        {cases.length ? (
          <div className="createCaseGrid">
            {cases.map((item) => (
              <button className="createCaseCard" type="button" onClick={() => onOpenCase?.(item)} key={item.id}>
                <img src={item.thumbnail || item.image} alt={item.imageAlt || item.title} loading="lazy" decoding="async" fetchPriority="low" />
                <span>{categoryLabels.get(item.category) || item.category}</span>
                <strong>{item.title}</strong>
                <em><Eye size={14} />{t.openCase}</em>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {selectedEditorReference ? (
        <FreeImageReferenceEditor
          reference={selectedEditorReference}
          language={language}
          onClose={() => setEditingReferenceId('')}
          onSave={(annotations, markedImageUrl) => {
            setReferences((current) => current.map((item) => item.id === selectedEditorReference.id ? {
              ...item,
              annotations,
              markedImageUrl: markedImageUrl || item.markedImageUrl || '',
              thumbnailUrl: markedImageUrl || item.thumbnailUrl
            } : item));
            setEditingReferenceId('');
          }}
        />
      ) : null}
      {previewEditReference ? (
        <FreeImageReferenceEditor
          reference={previewEditReference}
          language={language}
          onClose={() => {
            setPreviewImage(previewEditReference);
            setPreviewEditReference(null);
          }}
          onSave={(annotations, markedImageUrl) => {
            createLocalEditTask(previewEditReference, annotations, markedImageUrl);
            setPreviewEditReference(null);
          }}
        />
      ) : null}
      {previewImage ? (
        <div className="freeImagePreviewBackdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeImagePreview();
        }}>
          <section className="freeImagePreviewDialog" role="dialog" aria-modal="true" aria-label={t.viewImage}>
            <header>
              <div><strong>{t.viewImage}</strong><span>{previewImage.size?.replace('x', '×')} · {imageQualityLabel(previewImage.quality, language)}</span></div>
              <button type="button" onClick={closeImagePreview} aria-label="Close"><X size={18} /></button>
            </header>
            <div className={`freeImagePreviewBody ${previewImage.promptHidden ? 'imageOnly' : ''}`}>
              <div
                ref={previewCanvasRef}
                className={`freeImagePreviewCanvas ${previewZoom > 1 ? 'zoomed' : ''} ${previewPanning ? 'panning' : ''}`}
                onWheel={(event) => {
                  event.preventDefault();
                  setPreviewZoomValue(previewZoom + (event.deltaY < 0 ? 0.25 : -0.25));
                }}
                onPointerDown={beginPreviewPan}
                onPointerMove={movePreviewPan}
                onPointerUp={endPreviewPan}
                onPointerCancel={endPreviewPan}
              >
                <img
                  ref={previewImageRef}
                  src={previewImage.imageUrl}
                  alt={previewImage.prompt || t.result}
                  decoding="async"
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onLoad={() => setPreviewOffset((current) => clampPreviewOffset(current, previewZoom))}
                  onDoubleClick={() => setPreviewZoomValue(previewZoom === 1 ? 2 : 1)}
                  className={previewPanning ? 'panning' : ''}
                  style={{ transform: `translate3d(${previewOffset.x}px, ${previewOffset.y}px, 0) scale(${previewZoom})` }}
                />
              </div>
              {!previewImage.promptHidden ? <aside className="freeImagePreviewPromptPanel">
                <div>
                  <strong>{t.editPreviewPrompt}</strong>
                  <span>{t.previewPromptHint}</span>
                </div>
                <textarea
                  value={previewPrompt}
                  onChange={(event) => {
                    setPreviewPrompt(event.target.value);
                    setPreviewPromptCopied(false);
                  }}
                  maxLength={6000}
                />
                <div>
                  <button type="button" onClick={copyPreviewPrompt} disabled={!previewPrompt.trim()}>
                    {previewPromptCopied ? <Check size={16} /> : <Copy size={16} />}
                    {previewPromptCopied ? t.copiedPrompt : t.copyPrompt}
                  </button>
                  <button type="button" onClick={applyPreviewPrompt} disabled={!previewPrompt.trim()}>
                    <Edit3 size={16} /> {t.applyPrompt}
                  </button>
                </div>
              </aside> : null}
            </div>
            <footer>
              <div className="freeImagePreviewZoomControls">
                <button type="button" onClick={() => setPreviewZoomValue(previewZoom - 0.25)}><ZoomOut size={16} /> {t.zoomOut}</button>
                <button type="button" onClick={() => setPreviewZoomValue(1)}>{Math.round(previewZoom * 100)}% · {t.resetZoom}</button>
                <button type="button" onClick={() => setPreviewZoomValue(previewZoom + 0.25)}><ZoomIn size={16} /> {t.zoomIn}</button>
              </div>
              <div className="freeImagePreviewActions">
                <button
                  type="button"
                  onClick={startPreviewRegionEdit}
                  disabled={!hasFullWorkspace || !referenceAllowedForModel(previewImage, modelConstraints)}
                ><Edit3 size={16} /> {t.regionEdit}</button>
                <button
                  type="button"
                  onClick={usePreviewAsReference}
                  disabled={!hasFullWorkspace || !referenceAllowedForModel(previewImage, modelConstraints) || (
                    imageReferenceTarget === 'batch-repair'
                      ? batchRepairUploading || (
                          !batchRepairImages.some((reference) => reference.sourceItemId === imageReferenceIdentity(previewImage))
                          && batchRepairImages.length >= MAX_BATCH_REPAIR_IMAGES
                        )
                      : !references.some((reference) => reference.id === (previewImage.id || previewImage.generationId))
                        && references.length >= maxReferenceImages
                  )}
                ><AtSign size={16} /> {t.useReference}</button>
                {previewImage.downloadAllowed ? (
                  <a href={previewImage.imageUrl} download={previewDownloadFilename(previewImage)}>
                    <Download size={16} /> {t.downloadOriginal}
                  </a>
                ) : null}
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
