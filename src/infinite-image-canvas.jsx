import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Edit3,
  Eye,
  Focus,
  FolderOpen,
  FolderPlus,
  GripHorizontal,
  House,
  ImagePlus,
  Images,
  LayoutGrid,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Map as MapIcon,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Redo2,
  Save,
  Search,
  Sparkles,
  Star,
  StopCircle,
  Trash2,
  Upload,
  Undo2,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

import {
  arrangeCanvasNodes,
  assignCanvasNodeNames,
  CANVAS_REFERENCE_ROLES,
  canvasBatchResultPlacements,
  canvasReferenceConnectorPath,
  canvasReferenceEdges,
  canvasReferencePrompt,
  clipboardImageFiles,
  canvasConnectorPath,
  canvasNodeBounds,
  clampCanvasZoom,
  createCanvasIdeaNode,
  INFINITE_CANVAS_NODE_HEIGHT,
  INFINITE_CANVAS_NODE_WIDTH,
  isCanvasUiTarget,
  normalizeCanvasState,
  orderedCanvasReferenceNodes,
  replaceCanvasTaskForRetry,
  viewportRightMiddlePosition,
  viewportForCanvasNodes
} from '../shared/infinite-canvas.js';
import {
  getImageModelConstraints,
  validateImageReferenceInputsForModel,
  validateImageSizeForModel
} from '../shared/image-generation.js';
import {
  dimensionsForImageSizeTemplateRatio,
  imageSizeTemplateForModel,
  loadImageSizePreferences,
  preferredImageSize,
  ratioIdForImageSize,
  saveImageSizePreferences
} from '../shared/image-size-templates.js';
import FreeImageReferenceEditor from './free-image-reference-editor.jsx';
import { ImageCreditPrice, requestImagePricing, useServerImagePricing } from './image-pricing-client.jsx';
import './infinite-image-canvas.css';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const STORAGE_PREFIX = 'pic365.infinite-image-canvas.v2';
const ACTIVE_TASK_STATUSES = new Set(['queued', 'running', 'cancelling']);

const copy = {
  zh: {
    eyebrow: 'PIC365 CANVAS', title: '无限画布', subtitle: '围绕一张图持续生成、修改、比较并选定最终作品。',
    unnamedProject: '未命名画布', newProject: '新建画布', saveSaved: '已保存', saveSaving: '保存中…',
    copyProject: '复制', archiveProject: '归档', restoreProject: '恢复', archived: '已归档', deleteProject: '删除', archiveConfirm: '确定归档当前画布吗？归档后仍可恢复。', deleteProjectConfirm: '确定删除当前画布吗？此操作会将项目移入回收状态。',
    deleted: '回收站', retryUpload: '重试上传', dropUpload: '可直接拖入或粘贴图片', uploadProgress: '上传进度',
    sidebarTitle: '素材与画布', recentTab: '最近作品', projectsTab: '我的画布', projectsEmpty: '还没有画布作业。', projectLoading: '正在读取画布作业…',
    projectCount: (count) => `${count} 个作业`, projectNodes: (count) => `${count || 0} 个实体`, currentProjectLabel: '当前', refreshProjects: '刷新画布作业',
    moveToTrash: '移到回收站', moveToTrashConfirm: (name) => `确定将“${name || '未命名画布'}”移到回收站吗？`, trashEmpty: '回收站为空。',
    restoreFromTrash: '恢复画布', permanentDelete: '彻底删除', permanentDeleteConfirm: (name) => `确定彻底删除“${name || '未命名画布'}”吗？此操作无法恢复，但不会删除资产库和历史作品。`,
    saveFailed: '保存失败，正在保留本地改动', saveConflict: '其他页面已修改此画布，请重新载入后继续。', reload: '重新载入',
    newIdea: '新建想法', history: '历史素材', historyEmpty: '还没有可加入画布的历史作品。', historyLoading: '正在读取历史素材…',
    historyMore: '加载更多', searchHistory: '搜索历史提示词', addToCanvas: '加入画布', onCanvas: '已加入', upload: '上传图片', uploading: '正在上传…',
    deleteHistory: '从最近作品移除', deleteHistoryConfirm: '确定从最近作品中移除这张图片吗？画布上的实体、资产库文件和云端原图不会被删除。', deleteHistoryFailed: '移除最近作品失败，请稍后重试。',
    arrange: '自动整理', fitView: '适应内容', clearCanvas: '清空画布', clearConfirm: '确定清空当前画布吗？素材库、历史生图和云端文件不会被删除。',
    removeConfirm: '确定将此节点移出画布吗？云端图片和历史记录不会被删除。', protectedRemoveConfirm: '这是已采用或锁定版本，确定仍要移出画布吗？',
    emptyTitle: '从一个想法开始', emptyText: '输入提示词直接生成，或从左侧加入一张历史图片继续创作。', idea: '创作起点', generated: '生成结果',
    uploaded: '上传素材', task: '生成任务', selected: '当前选中', selectHint: '选择图片或创作卡，再描述下一步修改要求。',
    promptPlaceholder: '描述要生成的画面，或说明如何修改当前图片…', provider: '生图服务', size: '尺寸', quality: '质量', low: '低', medium: '中等', high: '高',
    count: '数量', regenerate: '再做一份',
    compareSelected: '比较所选', retryTask: '重试任务', retryingTask: '正在原位重试…', parentVersion: '上级版本', childVersions: '子版本',
    allNodes: '全部节点', favoriteNodes: '仅收藏', lockedNodes: '仅锁定', adoptedNodes: '仅最终稿', activeTasks: '运行任务', failedTasks: '失败任务',
    generate: '生成分支', submitting: '正在提交', signIn: '登录后可保存画布、上传素材并生成图片。', creditsRequired: '积分不足，请先充值。',
    providerMissing: '当前没有可用的生图服务。', promptRequired: '请先输入创作要求。', referenceUnsupported: '当前服务不支持这张参考图，请切换服务或取消选择。',
    sizeUnsupported: '当前服务不支持这个尺寸，请选择其他尺寸。', taskListFull: '任务列表已满，请先删除已完成或失败的任务。', failed: '生成任务提交失败，请稍后重试。',
    uploadedTooLarge: '图片不能超过 8 MB。', uploadedInvalid: '无法读取或上传这张图片。', refine: '到灵感生图精修', useAsBranch: '基于此图创作',
    download: '下载原图', preview: '预览', localEdit: '标记局部', adopt: '设为最终稿', adopted: '当前最终稿', lock: '锁定', unlock: '解锁', favorite: '收藏',
    compare: '对比', compareHint: '再选择一张图片进行对比。', compareTitle: '版本对比', remove: '移出画布', chooseIdea: '选中创作', cancelTask: '取消任务',
    comparisonPosition: '对比分割线', adoptedDownload: '下载最终稿', originalSize: '原始尺寸',
    duplicate: '复制节点', copyImage: '复制图片', copyingImage: '正在复制…', imageCopied: '图片已复制到剪贴板，可直接粘贴。', imageCopyFailed: '图片复制失败，请检查浏览器剪贴板权限。', copyImageShortcut: 'Ctrl / ⌘ + C', undo: '撤销', redo: '重做', focusSelected: '聚焦选中',
    collapseComposer: '收起创作托盘', expandComposer: '展开创作托盘',
    selectedCount: '已选', batchDelete: '删除所选', batchDeleteConfirm: '确定将所选节点移出画布吗？云端图片和历史记录不会被删除。', searchCanvas: '搜索画布', searchPlaceholder: '搜索名称或提示词', noSearchResults: '没有匹配节点', minimap: '缩略地图',
    queued: '排队中', running: '生成中', cancelling: '取消中', failedTask: '生成失败', cancelled: '已取消', interrupted: '任务中断，可重新提交',
    uploadDone: '图片已安全保存到素材库。', localEditReady: '局部标记已保存。请描述标记区域需要如何修改，再生成新分支。',
    branchPresets: ['更换为高级商业背景，保持主体完全不变', '扩展画面并保持原图风格与主体一致', '生成一个构图不同但主体一致的新方案', '优化光影、质感和商业摄影表现，其他内容不变'],
    zoomHint: '空白处拖动平移 · 滚轮缩放 · 拖动卡片整理', home: '首页', backStudio: '灵感生图', hideAssets: '隐藏素材栏', showAssets: '显示素材栏',
    ratio: '比例', saveSizeTemplate: '保存为此服务的默认尺寸', confirmAction: '确认', cancelAction: '取消', minimapMove: '拖动导航框',
    folderUpload: '文件夹', assetLibrary: '资源库', referenceTray: '辅助参考', referenceHint: '这里只展示额外加入的参考图。', referencePromptHint: '提示词称呼：当前选中图写“母版”；右侧图片依次写“参考图1、参考图2……”。不要使用文件名表示图片角色。', addReference: '加入参考', addReferenceImages: '添加参考图', removeReference: '移出参考', referenceLimit: '参考图数量已达到当前模型上限。', referenceTooMany: '参考图数量超过当前模型上限，请移除后再生成。', noAssets: '资源库中还没有可用图片。', assetSearch: '搜索资源库图片', addAssetReference: '加入画布并设为参考', assetAdd: '添加', assetRemove: '移除', closeLibrary: '关闭资源库', assetSelected: (count, limit) => `已选 ${count}/${limit}`, confirmAssets: (count) => `确认加入${count ? `（${count}）` : ''}`,
    roleGeneral: '普通', roleSubject: '主体', roleStyle: '风格', roleComposition: '构图', roleColor: '色彩', dropReference: '松开后加入画布和辅助参考', primaryImage: '母版', dragToReference: '拖到辅助参考托盘', dropIntoReference: '松开后设为当前母版的参考', pasteReferenceDone: '剪贴板图片已加入参考图。'
  },
  en: {
    eyebrow: 'PIC365 CANVAS', title: 'Infinite Canvas', subtitle: 'Generate, refine, compare, and choose one final image without losing the creative trail.',
    unnamedProject: 'Untitled canvas', newProject: 'New canvas', saveSaved: 'Saved', saveSaving: 'Saving…', saveFailed: 'Save failed. Local changes are retained.',
    copyProject: 'Copy', archiveProject: 'Archive', restoreProject: 'Restore', archived: 'Archived', deleteProject: 'Delete', archiveConfirm: 'Archive this canvas? It can be restored later.', deleteProjectConfirm: 'Delete this canvas and move it to the recoverable trash state?',
    deleted: 'Trash', retryUpload: 'Retry upload', dropUpload: 'Drop or paste an image', uploadProgress: 'Upload progress',
    sidebarTitle: 'Assets & canvases', recentTab: 'Recent images', projectsTab: 'My canvases', projectsEmpty: 'No canvas projects yet.', projectLoading: 'Loading canvas projects…',
    projectCount: (count) => `${count} projects`, projectNodes: (count) => `${count || 0} items`, currentProjectLabel: 'Current', refreshProjects: 'Refresh canvases',
    moveToTrash: 'Move to trash', moveToTrashConfirm: (name) => `Move “${name || 'Untitled canvas'}” to trash?`, trashEmpty: 'Trash is empty.',
    restoreFromTrash: 'Restore canvas', permanentDelete: 'Delete forever', permanentDeleteConfirm: (name) => `Permanently delete “${name || 'Untitled canvas'}”? This cannot be undone, but library assets and generation history will remain.`,
    saveConflict: 'This canvas changed elsewhere. Reload it before continuing.', reload: 'Reload', newIdea: 'New idea', history: 'History', historyEmpty: 'No previous images are available yet.',
    historyLoading: 'Loading history…', historyMore: 'Load more', searchHistory: 'Search history prompts', addToCanvas: 'Add to canvas', onCanvas: 'Added', upload: 'Upload image', uploading: 'Uploading…',
    deleteHistory: 'Remove from recent images', deleteHistoryConfirm: 'Remove this image from recent images? Canvas nodes, library assets, and the cloud original will remain.', deleteHistoryFailed: 'Could not remove this recent image. Try again.',
    arrange: 'Auto arrange', fitView: 'Fit content', clearCanvas: 'Clear canvas', clearConfirm: 'Clear this canvas? Cloud assets and generation history will remain.',
    removeConfirm: 'Remove this node from the canvas? The cloud image and history remain.', protectedRemoveConfirm: 'This version is adopted or locked. Remove it from the canvas anyway?',
    emptyTitle: 'Start with an idea', emptyText: 'Enter a prompt or add an image from history to continue creating.', idea: 'Starting idea', generated: 'Generated image', uploaded: 'Uploaded image',
    task: 'Generation task', selected: 'Selected', selectHint: 'Select an image or idea, then describe the next change.', promptPlaceholder: 'Describe a new image or how the selected image should change…',
    provider: 'Image service', size: 'Size', quality: 'Quality', low: 'Low', medium: 'Medium', high: 'High', generate: 'Generate branch', submitting: 'Submitting',
    count: 'Count', regenerate: 'Make another',
    compareSelected: 'Compare selected', retryTask: 'Retry task', retryingTask: 'Retrying in place…', parentVersion: 'Parent', childVersions: 'children',
    allNodes: 'All nodes', favoriteNodes: 'Favorites', lockedNodes: 'Locked', adoptedNodes: 'Final only', activeTasks: 'Active tasks', failedTasks: 'Failed tasks',
    signIn: 'Sign in to save canvases, upload assets, and generate images.', creditsRequired: 'Not enough credits. Recharge first.', providerMissing: 'No image service is available.',
    promptRequired: 'Enter a creation request first.', referenceUnsupported: 'This service cannot use the selected reference image.', sizeUnsupported: 'This service does not support the selected size.',
    taskListFull: 'The task list is full. Remove completed or failed tasks first.', failed: 'The generation task could not be submitted.', uploadedTooLarge: 'Images must be no larger than 8 MB.',
    uploadedInvalid: 'This image could not be read or uploaded.', refine: 'Refine in Image Studio', useAsBranch: 'Create from this image', download: 'Download original', preview: 'Preview',
    localEdit: 'Mark region', adopt: 'Set as final', adopted: 'Current final', lock: 'Lock', unlock: 'Unlock', favorite: 'Favorite', compare: 'Compare', compareHint: 'Choose one more image to compare.',
    comparisonPosition: 'Comparison divider', adoptedDownload: 'Download final', originalSize: 'Original size',
    duplicate: 'Duplicate node', copyImage: 'Copy image', copyingImage: 'Copying…', imageCopied: 'Image copied to the clipboard.', imageCopyFailed: 'Could not copy the image. Check browser clipboard permission.', copyImageShortcut: 'Ctrl / ⌘ + C', undo: 'Undo', redo: 'Redo', focusSelected: 'Focus selected',
    collapseComposer: 'Collapse creation tray', expandComposer: 'Expand creation tray',
    selectedCount: 'selected', batchDelete: 'Delete selected', batchDeleteConfirm: 'Remove the selected nodes from the canvas? Cloud images and history remain.', searchCanvas: 'Search canvas', searchPlaceholder: 'Search names or prompts', noSearchResults: 'No matching nodes', minimap: 'Minimap',
    compareTitle: 'Version comparison', remove: 'Remove from canvas', chooseIdea: 'Select idea', cancelTask: 'Cancel task', queued: 'Queued', running: 'Generating', cancelling: 'Cancelling',
    failedTask: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted; it can be submitted again', uploadDone: 'The image is safely stored in your asset library.',
    localEditReady: 'The edit marks are saved. Describe the change and generate a new branch.',
    branchPresets: ['Replace the background with a premium commercial scene while preserving the subject', 'Extend the canvas while preserving the original style and subject', 'Create a different composition with the same subject', 'Improve lighting, texture, and commercial polish without changing other content'],
    zoomHint: 'Drag empty space to pan · wheel to zoom · drag cards to organize', home: 'Home', backStudio: 'Image Studio', hideAssets: 'Hide assets', showAssets: 'Show assets',
    ratio: 'Ratio', saveSizeTemplate: 'Save as the default size for this service', confirmAction: 'Confirm', cancelAction: 'Cancel', minimapMove: 'Drag minimap',
    folderUpload: 'Folder', assetLibrary: 'Library', referenceTray: 'Supporting references', referenceHint: 'Only additional reference images appear here.', referencePromptHint: 'Prompt names: call the selected image “Master”; call the images on the right “Reference 1, Reference 2…” in order. Do not use filenames as image roles.', addReference: 'Add reference', addReferenceImages: 'Add references', removeReference: 'Remove reference', referenceLimit: 'This model has reached its reference-image limit.', referenceTooMany: 'Too many reference images for this model. Remove some before generating.', noAssets: 'No usable images are available in the library.', assetSearch: 'Search library images', addAssetReference: 'Add to canvas as reference', assetAdd: 'Add', assetRemove: 'Remove', closeLibrary: 'Close library', assetSelected: (count, limit) => `${count}/${limit} selected`, confirmAssets: (count) => `Add selected${count ? ` (${count})` : ''}`,
    roleGeneral: 'General', roleSubject: 'Subject', roleStyle: 'Style', roleComposition: 'Composition', roleColor: 'Color', dropReference: 'Drop to add to canvas and references', primaryImage: 'Master', dragToReference: 'Drag to supporting references', dropIntoReference: 'Drop to reference the current master image', pasteReferenceDone: 'Clipboard image added as a reference.'
  }
};

function isAuthenticatedSession(session) {
  return Boolean(session?.user || session?.access_token);
}

function authHeaders(session, json = false) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
  };
}

function randomId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function compactText(value, maxLength = 82) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function formatCanvasProjectTime(value, language) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function normalizedMimeType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  return type === 'image/jpg' ? 'image/jpeg' : type;
}

async function imageBlobAsPng(blob) {
  if (normalizedMimeType(blob?.type) === 'image/png') return blob;
  const bitmap = await globalThis.createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    context.drawImage(bitmap, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(
      (pngBlob) => pngBlob ? resolve(pngBlob) : reject(new Error('IMAGE_CONVERSION_FAILED')),
      'image/png'
    ));
  } finally {
    bitmap.close?.();
  }
}

async function canvasNodeClipboardBlob(node) {
  const sources = [...new Set([node?.imageUrl, node?.downloadUrl, node?.thumbnailUrl].filter(Boolean))];
  let lastError = null;
  for (const source of sources) {
    try {
      const response = await fetch(source, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(`IMAGE_FETCH_${response.status}`);
      return imageBlobAsPng(await response.blob());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('IMAGE_SOURCE_UNAVAILABLE');
}

function uploadAssetFile(file, session, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/assets?fileName=${encodeURIComponent(file.name)}&sourceType=upload`);
    for (const [name, value] of Object.entries(authHeaders(session))) xhr.setRequestHeader(name, value);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };
    xhr.onerror = () => reject(new Error('ASSET_UPLOAD_NETWORK_FAILED'));
    xhr.onload = () => {
      let payload = {};
      try { payload = JSON.parse(xhr.responseText || '{}'); } catch { payload = {}; }
      if (xhr.status < 200 || xhr.status >= 300 || !payload.ok) return reject(new Error(payload.error || 'ASSET_UPLOAD_FAILED'));
      onProgress?.(100);
      resolve(payload);
    };
    xhr.send(file);
  });
}

function nodeLabel(node, t) {
  if (String(node.name || '').trim()) return compactText(node.name, 24);
  if (String(node.autoName || '').trim()) return compactText(node.autoName, 24);
  if (String(node.title || '').trim()) return compactText(node.title, 24);
  if (node.type === 'idea') return t.idea;
  if (node.type === 'task') return t.task;
  return node.assetId && !node.generationId ? t.uploaded : t.generated;
}

function taskStatusLabel(status, t) {
  if (status === 'running') return t.running;
  if (status === 'cancelling') return t.cancelling;
  if (status === 'failed') return t.failedTask;
  if (status === 'cancelled') return t.cancelled;
  if (status === 'interrupted') return t.interrupted;
  return t.queued;
}

function referenceRoleLabel(role, t) {
  if (role === 'subject') return t.roleSubject;
  if (role === 'style') return t.roleStyle;
  if (role === 'composition') return t.roleComposition;
  if (role === 'color') return t.roleColor;
  return t.roleGeneral;
}

function versionMeta(node, providers, language) {
  const provider = providers.find((item) => item.id === node.providerId);
  const parts = [provider?.name || node.providerId, node.size?.replace('x', '×'), node.quality];
  if (Number(node.creditsCharged || 0) > 0) parts.push(`${node.creditsCharged}${language === 'zh' ? '积分' : ' credits'}`);
  if (node.createdAt) {
    const timestamp = Date.parse(node.createdAt);
    if (Number.isFinite(timestamp)) parts.push(new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(timestamp));
  }
  return parts.filter(Boolean).join(' · ');
}

function generationErrorMessage(code, t) {
  if (code === 'TASK_LIST_FULL') return t.taskListFull;
  if (['INVALID_IMAGE_SIZE', 'INVALID_SIZE', 'PROVIDER_SOURCE_SIZE_UNSUPPORTED'].includes(code)) return t.sizeUnsupported;
  if (['REFERENCE_IMAGES_UNSUPPORTED', 'TOO_MANY_REFERENCE_IMAGES', 'INVALID_REFERENCE_IMAGE_FORMAT', 'PROVIDER_REFERENCE_UNSUPPORTED'].includes(code)) return t.referenceUnsupported;
  if (['INSUFFICIENT_CREDITS', 'GROUP_BUDGET_EXCEEDED'].includes(code)) return t.creditsRequired;
  return t.failed;
}

function worldRect(nodes) {
  const bounds = canvasNodeBounds(nodes);
  const padding = 1200;
  return {
    left: Math.min(-padding, bounds.left - padding),
    top: Math.min(-padding, bounds.top - padding),
    width: Math.max(2400, bounds.width + padding * 2),
    height: Math.max(1800, bounds.height + padding * 2)
  };
}

function loadMinimapPosition() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(`${STORAGE_PREFIX}.minimap-position`) || 'null');
    if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) return null;
    return { x: Math.max(8, parsed.x), y: Math.max(8, parsed.y) };
  } catch {
    return null;
  }
}

function CanvasRatioGraphic({ ratioWidth, ratioHeight }) {
  const availableWidth = 42;
  const availableHeight = 26;
  const ratio = Math.max(0.01, Number(ratioWidth) / Math.max(1, Number(ratioHeight)));
  const width = ratio >= availableWidth / availableHeight ? availableWidth : availableHeight * ratio;
  const height = ratio >= availableWidth / availableHeight ? availableWidth / ratio : availableHeight;
  return <span className="infiniteCanvasRatioGraphic" aria-hidden="true"><i style={{ width: `${width}px`, height: `${height}px` }} /></span>;
}

export default function InfiniteImageCanvas({ language, theme = 'dark', session, profile, onSignIn, onBilling, onProfileChange, onOpenInStudio, onExitCanvas, onGoHome }) {
  const t = copy[language] || copy.en;
  const stageRef = useRef(null);
  const referenceTrayRef = useRef(null);
  const uploadRef = useRef(null);
  const folderUploadRef = useRef(null);
  const referenceFolderUploadRef = useRef(null);
  const interactionRef = useRef(null);
  const saveTimerRef = useRef(null);
  const saveRetryTimerRef = useRef(null);
  const saveRetryAttemptRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const saveAgainRef = useRef(false);
  const saveReadyRef = useRef(false);
  const projectRevisionRef = useRef(0);
  const projectIdRef = useRef('');
  const latestSnapshotRef = useRef(null);
  const settledTasksRef = useRef(new Set());
  const nodesRef = useRef([]);
  const adoptedNodeIdRef = useRef('');
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const taskPollTimerRef = useRef(null);
  const taskPollDelayRef = useRef(1800);
  const removedGenerationIdsRef = useRef(new Set());
  const removedTaskIdsRef = useRef(new Set());
  const confirmationActionRef = useRef(null);
  const isSignedIn = isAuthenticatedSession(session);
  const hasFullWorkspace = isSignedIn && Boolean(profile?.isSuperAdmin || Number(profile?.creditBalance || 0) > 0);
  const guestStorageKey = `${STORAGE_PREFIX}:${profile?.id || session?.user?.id || 'guest'}`;

  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [projectName, setProjectName] = useState(t.unnamedProject);
  const [projectLoading, setProjectLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [nodes, setNodes] = useState([]);
  const [viewport, setViewport] = useState({ x: 80, y: 70, zoom: 1 });
  const [adoptedNodeId, setAdoptedNodeId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [sizePreferences, setSizePreferences] = useState(loadImageSizePreferences);
  const [quality, setQuality] = useState('low');
  const [count, setCount] = useState(1);
  const [history, setHistory] = useState([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerLoading, setAssetPickerLoading] = useState(false);
  const [assetPickerQuery, setAssetPickerQuery] = useState('');
  const [assetPickerItems, setAssetPickerItems] = useState([]);
  const [assetPickerSelectedIds, setAssetPickerSelectedIds] = useState([]);
  const [referenceSourceMenuOpen, setReferenceSourceMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [draggingReferenceNodeId, setDraggingReferenceNodeId] = useState('');
  const [referenceDropActive, setReferenceDropActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [failedUpload, setFailedUpload] = useState(null);
  const [message, setMessage] = useState('');
  const [previewNode, setPreviewNode] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [editNode, setEditNode] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [comparePosition, setComparePosition] = useState(50);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [canvasSearchOpen, setCanvasSearchOpen] = useState(false);
  const [canvasQuery, setCanvasQuery] = useState('');
  const [canvasFilter, setCanvasFilter] = useState('all');
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [minimapPosition, setMinimapPosition] = useState(loadMinimapPosition);
  const [confirmation, setConfirmation] = useState(null);
  const [imageContextMenu, setImageContextMenu] = useState(null);
  const [copyingImageId, setCopyingImageId] = useState('');
  const [stageSize, setStageSize] = useState({ width: 900, height: 620 });
  const [selectionBox, setSelectionBox] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => globalThis.localStorage?.getItem(`${STORAGE_PREFIX}.sidebar`) !== 'closed');
  const [sidebarTab, setSidebarTab] = useState(() => globalThis.localStorage?.getItem(`${STORAGE_PREFIX}.sidebar-tab`) === 'projects' ? 'projects' : 'recent');
  const [trashOpen, setTrashOpen] = useState(false);
  const [projectListLoading, setProjectListLoading] = useState(false);
  const [projectActionId, setProjectActionId] = useState('');
  const [composerCollapsed, setComposerCollapsed] = useState(() => globalThis.localStorage?.getItem(`${STORAGE_PREFIX}.composer`) === 'collapsed');

  const selectedNode = nodes.find((node) => node.id === selectedId) || null;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedImageNodes = useMemo(() => selectedIds.map((id) => nodes.find((node) => node.id === id)).filter((node) => node?.type === 'image'), [nodes, selectedIds]);
  const currentProject = projects.find((project) => project.id === currentProjectId) || null;
  const availableProjects = projects.filter((project) => project.status !== 'deleted');
  const trashedProjects = projects.filter((project) => project.status === 'deleted');
  const projectArchived = currentProject?.status === 'archived';
  const projectDeleted = currentProject?.status === 'deleted';
  const projectReadOnly = projectArchived || projectDeleted;
  const selectedProvider = providers.find((provider) => provider.id === providerId) || null;
  const sizeTemplate = useMemo(() => imageSizeTemplateForModel(selectedProvider?.model), [selectedProvider?.model]);
  const preferredSize = providerId ? preferredImageSize(sizePreferences, providerId, selectedProvider?.model) : sizeTemplate.defaultSize;
  const savedSizeTemplate = providerId && validateImageSizeForModel(sizePreferences[providerId], selectedProvider?.model).valid ? sizePreferences[providerId] : '';
  const sizeOptions = useMemo(() => [...new Set([savedSizeTemplate, ...sizeTemplate.sizes, size].filter(Boolean))]
    .filter((item) => validateImageSizeForModel(item, selectedProvider?.model).valid), [savedSizeTemplate, selectedProvider?.model, size, sizeTemplate.sizes]);
  const selectedRatio = ratioIdForImageSize(size, sizeTemplate.ratios);
  const parsedSize = String(size).match(/^(\d+)x(\d+)$/i);
  const ratioGraphic = parsedSize ? { width: Number(parsedSize[1]), height: Number(parsedSize[2]) } : { width: 1, height: 1 };
  const referenceSelected = selectedNode?.type === 'image';
  const modelConstraints = getImageModelConstraints(selectedProvider?.model);
  const supportReferenceNodes = useMemo(() => referenceSelected ? orderedCanvasReferenceNodes(nodes, selectedNode.id).slice(1) : [], [nodes, referenceSelected, selectedNode?.id]);
  const activeReferenceNodes = useMemo(() => orderedCanvasReferenceNodes(nodes, referenceSelected ? selectedNode.id : ''), [nodes, referenceSelected, selectedNode?.id]);
  const maxSupportReferenceImages = Math.max(0, modelConstraints.maxReferenceImages - (referenceSelected ? 1 : 0));
  const assetPickerSelectionLimit = referenceSelected
    ? Math.max(0, maxSupportReferenceImages - supportReferenceNodes.length)
    : modelConstraints.maxReferenceImages;
  const showSupportingReferences = supportReferenceNodes.length > 0 || Boolean(draggingReferenceNodeId);
  const supportReferenceByAssetId = useMemo(() => new Map(supportReferenceNodes.filter((node) => node.assetId).map((node) => [node.assetId, node])), [supportReferenceNodes]);
  const canvasImageByAssetId = useMemo(() => new Map(nodes.filter((node) => node.type === 'image' && node.assetId).map((node) => [node.assetId, node])), [nodes]);
  const referenceEdges = useMemo(() => canvasReferenceEdges(nodes), [nodes]);
  const referencedSourceIds = useMemo(() => new Set(referenceEdges.map((edge) => edge.source.id)), [referenceEdges]);
  const sizeCheck = validateImageSizeForModel(size, selectedProvider?.model);
  const referenceCheck = validateImageReferenceInputsForModel({
    model: selectedProvider?.model,
    count: activeReferenceNodes.length,
    mimeTypes: activeReferenceNodes.map((node) => node.mimeType)
  });
  const { pricing, loading: pricingLoading } = useServerImagePricing(
    { size, quality, count, providerId },
    { enabled: hasFullWorkspace && Boolean(providerId) }
  );
  const historyIdsOnCanvas = useMemo(() => new Set(nodes.map((node) => node.generationId).filter(Boolean)), [nodes]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const world = useMemo(() => worldRect(nodes), [nodes]);
  const compareNodes = compareIds.map((id) => nodeById.get(id)).filter(Boolean);
  const adoptedNode = adoptedNodeId ? nodeById.get(adoptedNodeId) : null;
  const selectedParent = selectedNode?.parentId ? nodeById.get(selectedNode.parentId) : null;
  const selectedChildren = selectedNode ? nodes.filter((node) => node.parentId === selectedNode.id) : [];
  const canvasMatches = useMemo(() => {
    const query = canvasQuery.trim().toLowerCase();
    return nodes.filter((node) => {
      const queryMatches = !query || [node.name, node.autoName, node.prompt, node.draftPrompt, node.assetId, node.generationId]
        .some((value) => String(value || '').toLowerCase().includes(query));
      const filterMatches = canvasFilter === 'all'
        || (canvasFilter === 'favorite' && node.favorite)
        || (canvasFilter === 'locked' && node.locked)
        || (canvasFilter === 'adopted' && node.id === adoptedNodeId)
        || (canvasFilter === 'active' && node.type === 'task' && ACTIVE_TASK_STATUSES.has(node.status))
        || (canvasFilter === 'failed' && node.type === 'task' && ['failed', 'cancelled', 'interrupted'].includes(node.status));
      return queryMatches && filterMatches;
    }).slice(0, 40);
  }, [adoptedNodeId, canvasFilter, canvasQuery, nodes]);
  const minimapBounds = useMemo(() => {
    const bounds = canvasNodeBounds(nodes);
    const padding = 180;
    return {
      left: bounds.left - padding,
      top: bounds.top - padding,
      width: Math.max(600, bounds.width + padding * 2),
      height: Math.max(420, bounds.height + padding * 2)
    };
  }, [nodes]);
  const visibleWorld = {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: stageSize.width / viewport.zoom,
    height: stageSize.height / viewport.zoom
  };

  const namingSignature = useMemo(() => nodes.map((node) => [node.id, node.parentId, node.createdAt, node.name, node.autoName, node.pipelineCode, node.pipelineDepth, node.copyIndex].join(':')).join('|'), [nodes]);
  useEffect(() => {
    setNodes((current) => {
      const named = assignCanvasNodeNames(current);
      const changed = named.some((node, index) => {
        const previous = current[index];
        return node.name !== previous?.name || node.autoName !== previous?.autoName || node.pipelineCode !== previous?.pipelineCode
          || node.pipelineDepth !== previous?.pipelineDepth || node.copyIndex !== previous?.copyIndex;
      });
      return changed ? named : current;
    });
  }, [namingSignature]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { adoptedNodeIdRef.current = adoptedNodeId; }, [adoptedNodeId]);
  useEffect(() => {
    globalThis.localStorage?.setItem(`${STORAGE_PREFIX}.sidebar`, sidebarOpen ? 'open' : 'closed');
  }, [sidebarOpen]);
  useEffect(() => {
    globalThis.localStorage?.setItem(`${STORAGE_PREFIX}.sidebar-tab`, sidebarTab);
  }, [sidebarTab]);
  useEffect(() => {
    globalThis.localStorage?.setItem(`${STORAGE_PREFIX}.composer`, composerCollapsed ? 'collapsed' : 'open');
  }, [composerCollapsed]);
  useEffect(() => { saveImageSizePreferences(sizePreferences); }, [sizePreferences]);
  useEffect(() => {
    if (!minimapPosition) return;
    try { globalThis.localStorage?.setItem(`${STORAGE_PREFIX}.minimap-position`, JSON.stringify(minimapPosition)); } catch { /* best effort */ }
  }, [minimapPosition]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const update = () => setStageSize({ width: stage.clientWidth || 900, height: stage.clientHeight || 620 });
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(stage);
    globalThis.addEventListener?.('resize', update);
    return () => {
      observer?.disconnect();
      globalThis.removeEventListener?.('resize', update);
    };
  }, [sidebarOpen]);
  useEffect(() => {
    setMinimapPosition((current) => current ? {
      x: Math.max(8, Math.min(current.x, Math.max(8, stageSize.width - 192))),
      y: Math.max(8, Math.min(current.y, Math.max(8, stageSize.height - 154)))
    } : current);
  }, [stageSize.height, stageSize.width]);

  function canvasSnapshot() {
    return {
      nodes: nodesRef.current.map((node) => ({ ...node, annotations: Array.isArray(node.annotations) ? [...node.annotations] : [] })),
      adoptedNodeId: adoptedNodeIdRef.current,
      selectedId,
      selectedIds: [...selectedIds]
    };
  }

  function rememberCanvasState() {
    undoStackRef.current = [...undoStackRef.current.slice(-49), canvasSnapshot()];
    redoStackRef.current = [];
    setHistoryRevision((value) => value + 1);
  }

  function restoreCanvasSnapshot(snapshot) {
    if (!snapshot) return;
    setNodes(snapshot.nodes || []);
    setAdoptedNodeId(snapshot.adoptedNodeId || '');
    const restoredIds = (snapshot.selectedIds || []).filter((id) => (snapshot.nodes || []).some((node) => node.id === id));
    const nextSelected = (snapshot.nodes || []).some((node) => node.id === snapshot.selectedId)
      ? snapshot.selectedId
      : restoredIds.at(-1) || snapshot.nodes?.[0]?.id || '';
    setSelectedId(nextSelected);
    setSelectedIds(restoredIds.length ? restoredIds : nextSelected ? [nextSelected] : []);
    const selected = (snapshot.nodes || []).find((node) => node.id === nextSelected);
    setPrompt(selected?.draftPrompt || (selected?.type === 'idea' ? selected.prompt || '' : ''));
  }

  function undoCanvas() {
    const previous = undoStackRef.current.at(-1);
    if (!previous) return;
    redoStackRef.current = [...redoStackRef.current.slice(-49), canvasSnapshot()];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    restoreCanvasSnapshot(previous);
    setHistoryRevision((value) => value + 1);
  }

  function redoCanvas() {
    const next = redoStackRef.current.at(-1);
    if (!next) return;
    undoStackRef.current = [...undoStackRef.current.slice(-49), canvasSnapshot()];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    restoreCanvasSnapshot(next);
    setHistoryRevision((value) => value + 1);
  }

  const applyProject = useCallback((project) => {
    const normalized = normalizeCanvasState({ nodes: project?.nodes || [], viewport: project?.viewport });
    saveReadyRef.current = false;
    projectIdRef.current = project?.id || '';
    projectRevisionRef.current = Number(project?.revision || 1);
    setCurrentProjectId(project?.id || '');
    setProjectName(project?.name || t.unnamedProject);
    setAdoptedNodeId(project?.adoptedNodeId || '');
    setNodes(normalized.nodes);
    setViewport(normalized.viewport);
    setSelectedId(normalized.nodes[0]?.id || '');
    setSelectedIds(normalized.nodes[0]?.id ? [normalized.nodes[0].id] : []);
    setPrompt(normalized.nodes[0]?.draftPrompt || normalized.nodes[0]?.prompt || '');
    removedGenerationIdsRef.current = new Set();
    removedTaskIdsRef.current = new Set();
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryRevision((value) => value + 1);
    setSaveStatus('saved');
    globalThis.setTimeout(() => { saveReadyRef.current = true; }, 0);
  }, [t.unnamedProject]);

  const loadProject = useCallback(async (projectId) => {
    if (!projectId || !isSignedIn) return null;
    setProjectLoading(true);
    try {
      const response = await fetch(`/api/infinite-canvas/project?id=${encodeURIComponent(projectId)}&deleted=1`, { headers: authHeaders(session), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CANVAS_PROJECT_LOAD_FAILED');
      applyProject(payload.project);
      globalThis.localStorage?.setItem(`${STORAGE_PREFIX}.last:${session?.user?.id || 'user'}`, payload.project.id);
      return payload.project;
    } catch {
      setSaveStatus('failed');
      return null;
    } finally {
      setProjectLoading(false);
    }
  }, [applyProject, isSignedIn, session]);

  const createProject = useCallback(async () => {
    if (!isSignedIn) {
      onSignIn?.();
      setMessage(t.signIn);
      return null;
    }
    setProjectLoading(true);
    try {
      const response = await fetch('/api/infinite-canvas/projects', {
        method: 'POST', headers: authHeaders(session, true), body: JSON.stringify({ name: t.unnamedProject })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CANVAS_PROJECT_CREATE_FAILED');
      setProjects((current) => [payload.project, ...current.filter((item) => item.id !== payload.project.id)]);
      applyProject(payload.project);
      globalThis.localStorage?.setItem(`${STORAGE_PREFIX}.last:${session?.user?.id || 'user'}`, payload.project.id);
      return payload.project;
    } catch {
      setSaveStatus('failed');
      return null;
    } finally {
      setProjectLoading(false);
    }
  }, [applyProject, isSignedIn, onSignIn, session, t.signIn, t.unnamedProject]);

  const refreshProjects = useCallback(async () => {
    if (!isSignedIn) {
      setProjects([]);
      return [];
    }
    setProjectListLoading(true);
    try {
      const response = await fetch('/api/infinite-canvas/projects?deleted=1', { headers: authHeaders(session), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CANVAS_PROJECT_LIST_FAILED');
      const nextProjects = payload.projects || [];
      setProjects(nextProjects);
      return nextProjects;
    } catch {
      setSaveStatus('failed');
      return [];
    } finally {
      setProjectListLoading(false);
    }
  }, [isSignedIn, session]);

  useEffect(() => {
    let cancelled = false;
    setMessage('');
    if (!isSignedIn) {
      let restored = null;
      try { restored = JSON.parse(globalThis.localStorage?.getItem(guestStorageKey) || 'null'); } catch { restored = null; }
      const normalized = normalizeCanvasState(restored || {});
      const initialNodes = normalized.nodes.length ? normalized.nodes : [createCanvasIdeaNode({ id: randomId('idea'), x: 150, y: 170 })];
      projectIdRef.current = '';
      projectRevisionRef.current = 0;
      setProjects([]);
      setCurrentProjectId('');
      setProjectName(t.unnamedProject);
      setAdoptedNodeId('');
      setNodes(initialNodes);
      setViewport(normalized.viewport);
      setSelectedId(initialNodes[0]?.id || '');
      setSelectedIds(initialNodes[0]?.id ? [initialNodes[0].id] : []);
      setPrompt(initialNodes[0]?.prompt || '');
      setProjectLoading(false);
      saveReadyRef.current = true;
      return () => { cancelled = true; };
    }
    saveReadyRef.current = false;
    setProjectLoading(true);
    fetch('/api/infinite-canvas/projects?deleted=1', { headers: authHeaders(session), cache: 'no-store' })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(async ({ response, payload }) => {
        if (cancelled || !response.ok || !payload.ok) return;
        let nextProjects = payload.projects || [];
        if (!nextProjects.length) {
          const created = await createProject();
          if (cancelled || !created) return;
          nextProjects = [created];
        }
        if (cancelled) return;
        setProjects(nextProjects);
        const remembered = globalThis.localStorage?.getItem(`${STORAGE_PREFIX}.last:${session?.user?.id || 'user'}`);
        const rememberedProject = nextProjects.find((item) => item.id === remembered && item.status !== 'deleted');
        const target = rememberedProject?.id || nextProjects.find((item) => item.status === 'active')?.id || nextProjects.find((item) => item.status === 'archived')?.id;
        if (target) await loadProject(target); else await createProject();
      })
      .catch(() => { if (!cancelled) setSaveStatus('failed'); })
      .finally(() => { if (!cancelled) setProjectLoading(false); });
    return () => { cancelled = true; };
  }, [guestStorageKey, isSignedIn, session?.user?.id]);

  useEffect(() => {
    fetch('/api/image-providers', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload?.ok) return;
        const nextProviders = payload.providers || [];
        setProviders(nextProviders);
        setProviderId((current) => current || nextProviders.find((provider) => provider.isDefault)?.id || nextProviders[0]?.id || '');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedProvider) return;
    setSize(preferredSize);
  }, [preferredSize, selectedProvider?.id]);

  function requestConfirmation(message, action) {
    confirmationActionRef.current = action;
    setConfirmation({ message });
  }

  function cancelConfirmation() {
    confirmationActionRef.current = null;
    setConfirmation(null);
  }

  function confirmPendingAction() {
    const action = confirmationActionRef.current;
    confirmationActionRef.current = null;
    setConfirmation(null);
    if (action) void action();
  }

  const flushSave = useCallback(async () => {
    if (!isSignedIn || !projectIdRef.current || !latestSnapshotRef.current || !saveReadyRef.current) return;
    if (saveInFlightRef.current) {
      saveAgainRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    saveAgainRef.current = false;
    setSaveStatus('saving');
    const snapshot = latestSnapshotRef.current;
    try {
      const response = await fetch('/api/infinite-canvas/project', {
        method: 'PATCH', headers: authHeaders(session, true),
        body: JSON.stringify({ projectId: projectIdRef.current, revision: projectRevisionRef.current, ...snapshot })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) {
        globalThis.clearTimeout(saveRetryTimerRef.current);
        setSaveStatus('conflict');
        saveReadyRef.current = false;
        return;
      }
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CANVAS_PROJECT_UPDATE_FAILED');
      projectRevisionRef.current = Number(payload.project?.revision || projectRevisionRef.current + 1);
      setProjects((current) => current.map((item) => item.id === projectIdRef.current
        ? { ...item, name: snapshot.name, updatedAt: payload.project?.updatedAt, revision: projectRevisionRef.current, nodeCount: snapshot.nodes.length }
        : item));
      globalThis.clearTimeout(saveRetryTimerRef.current);
      saveRetryAttemptRef.current = 0;
      setSaveStatus('saved');
    } catch {
      setSaveStatus('failed');
      const delay = Math.min(30_000, 1_000 * (2 ** Math.min(saveRetryAttemptRef.current, 5)));
      saveRetryAttemptRef.current += 1;
      globalThis.clearTimeout(saveRetryTimerRef.current);
      saveRetryTimerRef.current = globalThis.setTimeout(() => {
        saveRetryTimerRef.current = null;
        void flushSave();
      }, delay);
    } finally {
      saveInFlightRef.current = false;
      if (saveAgainRef.current) void flushSave();
    }
  }, [isSignedIn, session]);

  async function switchProject(projectId) {
    if (projectId === currentProjectId) return;
    await flushSave();
    await loadProject(projectId);
  }

  async function moveProjectToTrash(project, confirmed = false) {
    if (!project?.id || !isSignedIn || project.status === 'deleted') return;
    if (!confirmed) {
      requestConfirmation(t.moveToTrashConfirm(project.name), () => moveProjectToTrash(project, true));
      return;
    }
    setProjectActionId(project.id);
    try {
      if (project.id === currentProjectId) await flushSave();
      const revision = project.id === currentProjectId ? projectRevisionRef.current : project.revision;
      const response = await fetch('/api/infinite-canvas/project', {
        method: 'DELETE', headers: authHeaders(session, true), body: JSON.stringify({ projectId: project.id, revision })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CANVAS_PROJECT_DELETE_FAILED');
      const movedProject = { ...project, ...payload.project, status: 'deleted' };
      setProjects((current) => current.map((item) => item.id === project.id ? movedProject : item));
      if (project.id === currentProjectId) {
        const next = projects.find((item) => item.id !== project.id && item.status !== 'deleted');
        if (next) await loadProject(next.id); else await createProject();
      }
      setTrashOpen(true);
    } catch {
      setSaveStatus('failed');
      void refreshProjects();
    } finally {
      setProjectActionId('');
    }
  }

  async function restoreTrashedProject(project) {
    if (!project?.id || project.status !== 'deleted' || !isSignedIn) return;
    setProjectActionId(project.id);
    try {
      const response = await fetch('/api/infinite-canvas/project', {
        method: 'PATCH', headers: authHeaders(session, true),
        body: JSON.stringify({ projectId: project.id, revision: project.revision, status: 'active' })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CANVAS_PROJECT_RESTORE_FAILED');
      setProjects((current) => current.map((item) => item.id === project.id ? { ...project, ...payload.project, nodeCount: project.nodeCount } : item));
    } catch {
      setSaveStatus('failed');
      void refreshProjects();
    } finally {
      setProjectActionId('');
    }
  }

  async function permanentlyDeleteProject(project, confirmed = false) {
    if (!project?.id || project.status !== 'deleted' || !isSignedIn) return;
    if (!confirmed) {
      requestConfirmation(t.permanentDeleteConfirm(project.name), () => permanentlyDeleteProject(project, true));
      return;
    }
    setProjectActionId(project.id);
    try {
      const response = await fetch('/api/infinite-canvas/project', {
        method: 'DELETE', headers: authHeaders(session, true),
        body: JSON.stringify({ projectId: project.id, revision: project.revision, permanent: true })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.permanent) throw new Error(payload.error || 'CANVAS_PROJECT_PERMANENT_DELETE_FAILED');
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch {
      setSaveStatus('failed');
      void refreshProjects();
    } finally {
      setProjectActionId('');
    }
  }

  async function copyCurrentProject() {
    if (!currentProjectId || !isSignedIn) return;
    await flushSave();
    setProjectLoading(true);
    try {
      const response = await fetch('/api/infinite-canvas/projects', {
        method: 'POST',
        headers: authHeaders(session, true),
        body: JSON.stringify({ sourceProjectId: currentProjectId, name: `${projectName} ${language === 'zh' ? '副本' : 'Copy'}` })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CANVAS_PROJECT_COPY_FAILED');
      setProjects((current) => [payload.project, ...current]);
      applyProject(payload.project);
      globalThis.localStorage?.setItem(`${STORAGE_PREFIX}.last:${session?.user?.id || 'user'}`, payload.project.id);
    } catch { setSaveStatus('failed'); } finally { setProjectLoading(false); }
  }

  async function removeCurrentProject(status, confirmed = false) {
    if (!currentProjectId || !isSignedIn) return;
    const confirmation = status === 'archived' ? t.archiveConfirm : status === 'deleted' ? t.deleteProjectConfirm : '';
    if (confirmation && !confirmed) {
      requestConfirmation(confirmation, () => removeCurrentProject(status, true));
      return;
    }
    await flushSave();
    const response = await fetch('/api/infinite-canvas/project', {
      method: status === 'deleted' ? 'DELETE' : 'PATCH',
      headers: authHeaders(session, true),
      body: JSON.stringify({
        projectId: currentProjectId,
        revision: projectRevisionRef.current,
        status,
        name: projectName,
        adoptedNodeId,
        nodes,
        viewport
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setSaveStatus(response.status === 409 ? 'conflict' : 'failed');
      return;
    }
    if (status === 'deleted') {
      const nextProjects = projects.map((project) => project.id === currentProjectId
        ? { ...project, status: 'deleted', revision: payload.project.revision, updatedAt: payload.project.updatedAt, deletedAt: payload.project.deletedAt }
        : project);
      setProjects(nextProjects);
      const next = nextProjects.find((project) => project.id !== currentProjectId && project.status === 'active');
      if (next) await loadProject(next.id); else await createProject();
      return;
    }
    setProjects((current) => current.map((project) => project.id === currentProjectId ? { ...project, status, revision: payload.project.revision, updatedAt: payload.project.updatedAt } : project));
    projectRevisionRef.current = Number(payload.project.revision || projectRevisionRef.current + 1);
    if (status === 'archived') {
      const next = projects.find((project) => project.id !== currentProjectId && project.status === 'active');
      if (next) await loadProject(next.id); else await createProject();
    } else {
      setSaveStatus('saved');
    }
  }

  useEffect(() => {
    latestSnapshotRef.current = { name: projectName, adoptedNodeId, nodes, viewport };
    if (!saveReadyRef.current) return undefined;
    if (!isSignedIn) {
      try { globalThis.localStorage?.setItem(guestStorageKey, JSON.stringify({ nodes, viewport })); } catch { /* best effort */ }
      return undefined;
    }
    if (!currentProjectId) return undefined;
    globalThis.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = globalThis.setTimeout(() => void flushSave(), 800);
    return () => globalThis.clearTimeout(saveTimerRef.current);
  }, [adoptedNodeId, currentProjectId, flushSave, guestStorageKey, isSignedIn, nodes, projectName, viewport]);

  useEffect(() => () => {
    globalThis.clearTimeout(saveTimerRef.current);
    globalThis.clearTimeout(saveRetryTimerRef.current);
  }, []);

  async function refreshHistory({ append = false } = {}) {
    if (!isSignedIn) return setHistory([]);
    const offset = append ? historyOffset : 0;
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/generations?limit=40&offset=${offset}`, { headers: authHeaders(session), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok) {
        const items = (payload.generations || []).filter((item) => item.status === 'succeeded' && item.imageUrl);
        setHistory((current) => append ? [...current, ...items.filter((item) => !current.some((entry) => entry.id === item.id))] : items);
        setHistoryOffset(payload.nextOffset || offset + items.length);
        setHistoryHasMore(Boolean(payload.hasMore));
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  async function removeHistoryItem(item) {
    if (!item?.id || !isSignedIn) return;
    try {
      const response = await fetch('/api/generations', {
        method: 'DELETE',
        headers: authHeaders(session, true),
        body: JSON.stringify({ generationId: item.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'GENERATION_HISTORY_REMOVE_FAILED');
      setHistory((current) => current.filter((entry) => entry.id !== item.id));
      setHistoryOffset((current) => Math.max(0, current - 1));
      setMessage('');
    } catch {
      setMessage(t.deleteHistoryFailed);
    }
  }

  useEffect(() => { void refreshHistory(); }, [isSignedIn, session?.user?.id]);

  useEffect(() => {
    if (!assetPickerOpen || !isSignedIn) return undefined;
    let cancelled = false;
    const timer = globalThis.setTimeout(async () => {
      setAssetPickerLoading(true);
      try {
        const params = new URLSearchParams({ limit: '80', mediaType: 'image' });
        if (assetPickerQuery.trim()) params.set('q', assetPickerQuery.trim());
        const response = await fetch(`/api/assets?${params.toString()}`, { headers: authHeaders(session), cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        const allowedTypes = new Set(modelConstraints.referenceMimeTypes);
        if (!cancelled && response.ok && payload.ok) setAssetPickerItems((payload.assets || []).filter((asset) => asset.mediaType === 'image'
          && !asset.deletedAt
          && ['ready', 'completed'].includes(asset.status)
          && allowedTypes.has(normalizedMimeType(asset.mimeType))));
      } finally {
        if (!cancelled) setAssetPickerLoading(false);
      }
    }, 180);
    return () => { cancelled = true; globalThis.clearTimeout(timer); };
  }, [assetPickerOpen, assetPickerQuery, isSignedIn, selectedProvider?.model, session]);

  function addAssetReference(asset, placementIndex = 0) {
    if (!asset || projectReadOnly) return;
    if (selectedNode?.assetId && selectedNode.assetId === asset.id) return;
    const activeReference = supportReferenceByAssetId.get(asset.id);
    if (activeReference) {
      toggleReference(activeReference);
      return;
    }
    const existingCanvasNode = canvasImageByAssetId.get(asset.id);
    if (existingCanvasNode) {
      addReference(existingCanvasNode);
      return;
    }
    const primaryCount = selectedNode?.type === 'image' ? 1 : 0;
    if (activeReferenceNodes.length + 1 > modelConstraints.maxReferenceImages) {
      setMessage(t.referenceLimit);
      return;
    }
    const center = canvasCenter();
    const position = nextOpenPosition({ x: center.x + placementIndex * 340, y: center.y });
    addImportedNodes([nodeFromAsset(asset, asset.name, position)], { asReferences: true, preservePrimary: Boolean(primaryCount) });
    setMessage('');
  }

  function toggleAssetPickerSelection(assetId) {
    setAssetPickerSelectedIds((current) => {
      if (current.includes(assetId)) return current.filter((id) => id !== assetId);
      if (current.length >= assetPickerSelectionLimit) return current;
      return [...current, assetId];
    });
  }

  function confirmAssetPickerSelection() {
    if (!assetPickerSelectedIds.length) return;
    const assetsById = new Map(assetPickerItems.map((asset) => [asset.id, asset]));
    const selectedAssets = assetPickerSelectedIds.map((id) => assetsById.get(id)).filter(Boolean).slice(0, assetPickerSelectionLimit);
    if (!selectedAssets.length) return;
    if (referenceSelected) {
      selectedAssets.forEach((asset, index) => addAssetReference(asset, index));
    } else {
      const center = canvasCenter();
      const workingNodes = [...nodes];
      const importedNodes = selectedAssets.filter((asset) => !canvasImageByAssetId.has(asset.id)).map((asset, index) => {
        const position = nextOpenPosition({ x: center.x + index * 340, y: center.y }, workingNodes);
        const node = nodeFromAsset(asset, asset.name, position);
        workingNodes.push(node);
        return node;
      });
      if (importedNodes.length) addImportedNodes(importedNodes, { asReferences: true, preservePrimary: false });
    }
    setAssetPickerSelectedIds([]);
    setAssetPickerOpen(false);
  }

  function taskResultNodes(task, baseNode, existingResultNodes = []) {
    const results = task.results || [];
    const parentId = task.canvasParentNodeId || baseNode?.parentId || '';
    const placements = canvasBatchResultPlacements({
      x: Number(baseNode?.x ?? task.canvasX ?? 120),
      y: Number(baseNode?.y ?? task.canvasY ?? 120),
      parentId,
      count: results.length
    });
    const existingByGenerationId = new Map(existingResultNodes.filter((node) => node.generationId).map((node) => [node.generationId, node]));
    return results.map((item, index) => {
      const existing = existingByGenerationId.get(item.generationId);
      const placement = existing ? { x: existing.x, y: existing.y, parentId } : placements[index];
      return {
        ...existing,
        id: existing?.id || (index === 0 ? (baseNode?.id || task.canvasTaskNodeId || `image-${item.generationId}`) : `image-${item.generationId || `${task.id}-${index}`}`),
        type: 'image', ...placement, prompt: task.canvasDisplayPrompt || task.prompt || '', draftPrompt: existing?.draftPrompt || '', imageUrl: item.imageUrl,
        thumbnailUrl: item.thumbnailUrl || item.imageUrl, downloadUrl: item.imageUrl, generationId: item.generationId || '', taskId: task.id,
        mimeType: item.mimeType || 'image/png', size: item.size || task.size, quality: item.quality || task.quality, providerId: task.providerId || '',
        title: `${compactText(task.canvasDisplayPrompt || task.prompt, 22)}${Number(task.count || task.results?.length || 1) > 1 ? ` · ${index + 1}` : ''}`,
        status: 'completed', batchId: task.id, batchSize: Number(task.count || task.results?.length || 1), variantIndex: index, referenceNodeIds: baseNode?.referenceNodeIds || task.canvasReferenceNodeIds || [],
        creditsCharged: Number(item.creditsCharged || 0), downloadAllowed: Boolean(item.downloadAllowed), cloudSaved: Boolean(item.cloudSaved), createdAt: task.completedAt || task.createdAt || new Date().toISOString()
      };
    });
  }

  const syncTasks = useCallback(async () => {
    if (!isSignedIn || !projectIdRef.current) return true;
    try {
      const response = await fetch('/api/generation-tasks', { headers: authHeaders(session), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) return false;
      const relevant = (payload.tasks || []).filter((task) => (
        task.canvasProjectId === projectIdRef.current && !removedTaskIdsRef.current.has(task.id)
      ));
      if (!relevant.length) return true;
      setNodes((current) => {
        let next = [...current];
        let changed = false;
        for (const task of relevant) {
          const matchingIndexes = next.map((node, index) => (node.taskId === task.id || node.id === task.canvasTaskNodeId) ? index : -1).filter((index) => index >= 0);
          const matchingNodes = matchingIndexes.map((index) => next[index]);
          const index = matchingIndexes[0] ?? -1;
          const existingTask = matchingNodes.find((node) => node.type === 'task') || null;
          const existingResults = matchingNodes.filter((node) => node.type === 'image');
          const existing = existingTask || existingResults[0] || null;
          if (task.status === 'completed' && task.results?.length) {
            const visibleResults = task.results.filter((item) => !removedGenerationIdsRef.current.has(item.generationId));
            if (!visibleResults.length) {
              if (matchingIndexes.length) { next = next.filter((node) => node.taskId !== task.id && node.id !== task.canvasTaskNodeId); changed = true; }
              continue;
            }
            if (!existingTask && visibleResults.every((item) => existingResults.some((node) => node.generationId && node.generationId === item.generationId))) continue;
            const results = taskResultNodes({ ...task, results: visibleResults }, existing, existingResults);
            if (index >= 0) {
              next = next.filter((node) => node.taskId !== task.id && node.id !== task.canvasTaskNodeId);
              next.splice(index, 0, ...results);
            } else next.push(...results);
            changed = true;
            continue;
          }
          const taskNode = {
            ...(existing || {}), id: existing?.id || task.canvasTaskNodeId || `task-${task.id}`, type: 'task',
            x: Number(existing?.x ?? task.canvasX ?? 120), y: Number(existing?.y ?? task.canvasY ?? 120), parentId: existing?.parentId || task.canvasParentNodeId || '',
            prompt: task.canvasDisplayPrompt || task.prompt, draftPrompt: existing?.draftPrompt || task.canvasDisplayPrompt || task.prompt, taskId: task.id, providerId: task.providerId, size: task.size, quality: task.quality,
            referenceNodeIds: existing?.referenceNodeIds || task.canvasReferenceNodeIds || [],
            count: task.count, status: task.status, error: task.error || '', createdAt: task.createdAt
          };
          if (!existing || existing.status !== taskNode.status || existing.error !== taskNode.error) {
            if (index >= 0) next[index] = taskNode; else next.push(taskNode);
            changed = true;
          }
        }
        return changed ? next : current;
      });
      const newlySettled = relevant.filter((task) => ['completed', 'failed', 'cancelled', 'interrupted'].includes(task.status) && !settledTasksRef.current.has(task.id));
      if (newlySettled.length) {
        newlySettled.forEach((task) => settledTasksRef.current.add(task.id));
        const profileResponse = await fetch('/api/me', { headers: authHeaders(session), cache: 'no-store' });
        const profilePayload = await profileResponse.json().catch(() => ({}));
        if (profileResponse.ok && profilePayload.ok) onProfileChange?.(profilePayload.user);
        if (newlySettled.some((task) => task.status === 'completed')) void refreshHistory();
      }
      return true;
    } catch { return false; }
  }, [isSignedIn, onProfileChange, session]);

  useEffect(() => {
    if (!isSignedIn || !currentProjectId) return undefined;
    let cancelled = false;
    const poll = async () => {
      const ok = await syncTasks();
      if (cancelled) return;
      taskPollDelayRef.current = ok ? 1800 : Math.min(30_000, Math.max(3600, taskPollDelayRef.current * 2));
      taskPollTimerRef.current = globalThis.setTimeout(poll, taskPollDelayRef.current);
    };
    void poll();
    return () => {
      cancelled = true;
      globalThis.clearTimeout(taskPollTimerRef.current);
    };
  }, [currentProjectId, isSignedIn, syncTasks]);

  useEffect(() => {
    function onOnline() {
      saveRetryAttemptRef.current = 0;
      taskPollDelayRef.current = 1800;
      globalThis.clearTimeout(saveRetryTimerRef.current);
      if (saveStatus === 'failed') void flushSave();
      void syncTasks();
    }
    globalThis.addEventListener?.('online', onOnline);
    return () => globalThis.removeEventListener?.('online', onOnline);
  }, [flushSave, saveStatus, syncTasks]);

  function canvasCenter() {
    const bounds = stageRef.current?.getBoundingClientRect();
    return {
      x: ((bounds?.width || 900) / 2 - viewport.x) / viewport.zoom - INFINITE_CANVAS_NODE_WIDTH / 2,
      y: ((bounds?.height || 620) / 2 - viewport.y) / viewport.zoom - INFINITE_CANVAS_NODE_HEIGHT / 2
    };
  }

  function nextOpenPosition(base, currentNodes = nodes) {
    let nextX = base.x;
    let nextY = base.y;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (!currentNodes.some((node) => Math.abs(node.x - nextX) < 310 && Math.abs(node.y - nextY) < 285)) break;
      nextX += 64;
      nextY += 296;
    }
    return { x: nextX, y: nextY };
  }

  function addIdeaNode() {
    if (projectReadOnly) return;
    rememberCanvasState();
    const position = nextOpenPosition(canvasCenter());
    const node = createCanvasIdeaNode({ id: randomId('idea'), x: position.x, y: position.y });
    setNodes((current) => [...current, node]);
    setSelectedId(node.id);
    setSelectedIds([node.id]);
    setPrompt('');
    setMessage('');
  }

  function selectNode(node, event) {
    const additive = Boolean(event?.shiftKey);
    if (additive) {
      const nextIds = selectedIdSet.has(node.id) ? selectedIds.filter((id) => id !== node.id) : [...selectedIds, node.id];
      const nextPrimary = nextIds.includes(node.id) ? node.id : nextIds.at(-1) || '';
      setSelectedIds(nextIds);
      setSelectedId(nextPrimary);
      const nextNode = nodeById.get(nextPrimary);
      setPrompt(nextNode?.draftPrompt || (nextNode?.type === 'idea' ? nextNode.prompt || '' : ''));
      return;
    }
    setSelectedId(node.id);
    setSelectedIds([node.id]);
    setPrompt(node.draftPrompt || (node.type === 'idea' ? node.prompt || '' : ''));
    const nodeProvider = node.providerId ? providers.find((provider) => provider.id === node.providerId) : selectedProvider;
    if (nodeProvider) setProviderId(nodeProvider.id);
    if (node.size && nodeProvider && validateImageSizeForModel(node.size, nodeProvider.model).valid) setSize(node.size);
    if (node.quality) setQuality(node.quality);
    setMessage('');
  }

  function addHistoryNode(item) {
    if (projectReadOnly) return;
    if (historyIdsOnCanvas.has(item.id)) {
      const existing = nodes.find((node) => node.generationId === item.id);
      if (existing) selectNode(existing);
      return;
    }
    const center = nextOpenPosition(canvasCenter());
    rememberCanvasState();
    const node = {
      id: randomId('image'), type: 'image', x: center.x, y: center.y, parentId: '', prompt: item.prompt || '', draftPrompt: '', imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl || item.imageUrl, downloadUrl: item.imageUrl, generationId: item.id, mimeType: item.mimeType || '', size: item.size || '',
      quality: item.quality || '', status: 'completed', createdAt: item.createdAt || new Date().toISOString()
    };
    setNodes((current) => [...current, node]);
    selectNode(node);
  }

  function nodeFromAsset(asset, fallbackName, position, overrides = {}) {
    return {
      id: randomId('upload'), type: 'image', x: position.x, y: position.y, parentId: '', prompt: asset.name || fallbackName || '', draftPrompt: '',
      imageUrl: asset.originalUrl || asset.previewUrl, thumbnailUrl: asset.thumbnailUrl || asset.previewUrl || asset.originalUrl, downloadUrl: asset.downloadUrl || asset.originalUrl, assetId: asset.id,
      mimeType: asset.mimeType || 'image/png', width: asset.width, height: asset.height, size: asset.width && asset.height ? `${asset.width}x${asset.height}` : '',
      status: 'completed', createdAt: asset.createdAt || new Date().toISOString(), ...overrides
    };
  }

  function addImportedNodes(importedNodes, { asReferences = false, preservePrimary = false } = {}) {
    if (!importedNodes.length) return;
    const existingPrimary = preservePrimary && selectedNode?.type === 'image' ? selectedNode : null;
    const prepared = importedNodes.map((node) => ({ ...node }));
    const primary = existingPrimary || (asReferences ? prepared[0] : null);
    const references = asReferences ? (existingPrimary ? prepared : prepared.slice(1)) : [];
    rememberCanvasState();
    setNodes((current) => {
      const next = [...current, ...prepared];
      if (!primary || !references.length) return next;
      return next.map((node) => node.id === primary.id ? {
        ...node,
        referenceLinks: [
          ...(node.referenceLinks || []),
          ...references.filter((reference) => !(node.referenceLinks || []).some((link) => link.nodeId === reference.id)).map((reference, index) => ({
            nodeId: reference.id,
            role: 'general',
            order: (node.referenceLinks || []).length + index + 1
          }))
        ]
      } : node);
    });
    if (!existingPrimary) {
      const nextPrimary = prepared[0];
      setSelectedId(nextPrimary.id);
      setSelectedIds([nextPrimary.id]);
      setPrompt(nextPrimary.draftPrompt || nextPrimary.prompt || '');
    }
  }

  async function handleUpload(files, { asReferences = false, preservePrimary = false, anchor = null } = {}) {
    const allowedTypes = new Set(modelConstraints.referenceMimeTypes);
    const imageFiles = Array.from(files || []).filter((file) => allowedTypes.has(normalizedMimeType(file.type)));
    if (!imageFiles.length) { setMessage(t.uploadedInvalid); return false; }
    if (projectReadOnly) return false;
    if (!isSignedIn) { onSignIn?.(); setMessage(t.signIn); return false; }
    if (imageFiles.some((file) => file.size > MAX_UPLOAD_BYTES)) {
      setMessage(t.uploadedTooLarge);
      return false;
    }
    if (asReferences && activeReferenceNodes.length + imageFiles.length > modelConstraints.maxReferenceImages) {
      setMessage(t.referenceTooMany);
      return false;
    }
    setUploading(true);
    setUploadProgress(1);
    setFailedUpload(null);
    const imported = [];
    let failedFile = null;
    let occupied = nodes;
    try {
      for (let index = 0; index < imageFiles.length; index += 1) {
        const file = imageFiles[index];
        let payload;
        try {
          payload = await uploadAssetFile(file, session, (progress) => setUploadProgress(Math.round(((index + progress / 100) / imageFiles.length) * 100)));
        } catch {
          failedFile = file;
          break;
        }
        const base = anchor || canvasCenter();
        const position = nextOpenPosition({ x: base.x + index * 42, y: base.y + index * 42 }, [...occupied, ...imported]);
        imported.push(nodeFromAsset(payload.asset, file.name, position, { mimeType: payload.asset.mimeType || file.type }));
        occupied = [...occupied, imported.at(-1)];
      }
      if (imported.length) addImportedNodes(imported, { asReferences, preservePrimary });
      setFailedUpload(failedFile);
      setMessage(failedFile ? t.uploadedInvalid : t.uploadDone);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (uploadRef.current) uploadRef.current.value = '';
      if (folderUploadRef.current) folderUploadRef.current.value = '';
    }
    return imported.length > 0 && !failedFile;
  }

  function toggleReference(node) {
    if (!node || node.type !== 'image' || !referenceSelected || node.id === selectedId) return;
    const existing = supportReferenceNodes.some((item) => item.id === node.id);
    if (!existing && activeReferenceNodes.length >= modelConstraints.maxReferenceImages) {
      setMessage(t.referenceLimit);
      return;
    }
    rememberCanvasState();
    setNodes((current) => current.map((item) => item.id === selectedId ? {
      ...item,
      referenceLinks: existing
        ? (item.referenceLinks || []).filter((link) => link.nodeId !== node.id).map((link, index) => ({ ...link, order: index + 1 }))
        : [...(item.referenceLinks || []), { nodeId: node.id, role: 'general', order: (item.referenceLinks || []).length + 1 }]
    } : item));
    setMessage('');
  }

  function addReference(node) {
    if (!node || node.type !== 'image' || !referenceSelected || node.id === selectedId) return;
    if (supportReferenceNodes.some((item) => item.id === node.id)) return;
    if (activeReferenceNodes.length >= modelConstraints.maxReferenceImages) {
      setMessage(t.referenceLimit);
      return;
    }
    rememberCanvasState();
    setNodes((current) => current.map((item) => item.id === selectedId ? {
      ...item,
      referenceLinks: [...(item.referenceLinks || []), { nodeId: node.id, role: 'general', order: (item.referenceLinks || []).length + 1 }]
    } : item));
    setMessage('');
  }

  function updateReferenceRole(nodeId, role) {
    if (!referenceSelected || !CANVAS_REFERENCE_ROLES.includes(role)) return;
    rememberCanvasState();
    setNodes((current) => current.map((node) => node.id === selectedId ? {
      ...node,
      referenceLinks: (node.referenceLinks || []).map((link) => link.nodeId === nodeId ? { ...link, role } : link)
    } : node));
  }

  function beginReferenceDrag(event, node) {
    if (!node || node.type !== 'image' || projectReadOnly || !referenceSelected || node.id === selectedId || event.button !== 0) return;
    event.stopPropagation();
    interactionRef.current = {
      type: 'reference-drag',
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    setDraggingReferenceNodeId(node.id);
  }

  function finishReferenceDrag() {
    if (interactionRef.current?.type === 'reference-drag') interactionRef.current = null;
    setDraggingReferenceNodeId('');
    setReferenceDropActive(false);
  }

  function dropReferenceNode(event) {
    event.preventDefault();
    event.stopPropagation();
    setReferenceDropActive(false);
    const nodeId = event.dataTransfer.getData('application/x-pic365-canvas-node') || draggingReferenceNodeId;
    const node = nodeById.get(nodeId);
    if (node && referenceSelected && node.id !== selectedId) addReference(node);
    finishReferenceDrag();
  }

  useEffect(() => {
    function onPaste(event) {
      if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
      const imageFile = clipboardImageFiles(event.clipboardData)[0];
      if (!imageFile) return;
      event.preventDefault();
      void handleUpload([imageFile], { asReferences: true, preservePrimary: referenceSelected }).then((uploaded) => { if (uploaded) setMessage(t.pasteReferenceDone); });
    }
    globalThis.addEventListener?.('paste', onPaste);
    return () => globalThis.removeEventListener?.('paste', onPaste);
  }, [isSignedIn, referenceSelected, selectedId, session]);

  function removeNodesById(ids) {
    const removing = new Set(ids);
    const removedNodes = nodesRef.current.filter((node) => removing.has(node.id));
    removedNodes.forEach((node) => {
      if (node.generationId) removedGenerationIdsRef.current.add(node.generationId);
      if (node.type === 'task' && node.taskId) removedTaskIdsRef.current.add(node.taskId);
    });
    rememberCanvasState();
    const nextNodes = nodesRef.current
      .filter((node) => !removing.has(node.id))
      .map((node) => ({
        ...node,
        parentId: removing.has(node.parentId) ? '' : node.parentId,
        referenceLinks: (node.referenceLinks || []).filter((link) => !removing.has(link.nodeId))
      }));
    const nextAdoptedNodeId = removing.has(adoptedNodeIdRef.current) ? '' : adoptedNodeIdRef.current;
    const remaining = selectedIds.filter((id) => !removing.has(id));
    const nextSelected = remaining.at(-1) || '';
    const nextNode = nextNodes.find((node) => node.id === nextSelected);
    nodesRef.current = nextNodes;
    adoptedNodeIdRef.current = nextAdoptedNodeId;
    latestSnapshotRef.current = { name: projectName, adoptedNodeId: nextAdoptedNodeId, nodes: nextNodes, viewport };
    setNodes(nextNodes);
    setAdoptedNodeId(nextAdoptedNodeId);
    setSelectedIds(remaining);
    setSelectedId(nextSelected);
    setPrompt(nextNode?.draftPrompt || (nextNode?.type === 'idea' ? nextNode.prompt || '' : ''));
    globalThis.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = globalThis.setTimeout(() => void flushSave(), 0);
  }

  function removeNode(node) {
    if (projectReadOnly) return;
    requestConfirmation(
      node.locked || node.id === adoptedNodeId ? t.protectedRemoveConfirm : t.removeConfirm,
      () => removeNodesById([node.id])
    );
  }

  function removeSelectedNodes() {
    if (projectReadOnly || !selectedIds.length) return;
    const selectedNodes = selectedIds.map((id) => nodeById.get(id)).filter(Boolean);
    const confirmation = selectedNodes.some((node) => node.locked || node.id === adoptedNodeId)
      ? t.protectedRemoveConfirm
      : t.batchDeleteConfirm;
    requestConfirmation(confirmation, () => removeNodesById(selectedIds));
  }

  function clearCanvas() {
    if (projectReadOnly) return;
    requestConfirmation(t.clearConfirm, () => {
      const ids = nodesRef.current.map((node) => node.id);
      removeNodesById(ids);
      const node = createCanvasIdeaNode({ id: randomId('idea'), x: 150, y: 170 });
      nodesRef.current = [node];
      adoptedNodeIdRef.current = '';
      latestSnapshotRef.current = { name: projectName, adoptedNodeId: '', nodes: [node], viewport: { x: 80, y: 70, zoom: 1 } };
      setNodes([node]);
      setAdoptedNodeId('');
      setSelectedId(node.id);
      setSelectedIds([node.id]);
      setPrompt('');
      setViewport({ x: 80, y: 70, zoom: 1 });
    });
  }

  function beginNodeDrag(event, node) {
    if (projectReadOnly || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    rememberCanvasState();
    const movingIds = selectedIdSet.has(node.id) ? selectedIds : [node.id];
    if (!selectedIdSet.has(node.id)) {
      setSelectedId(node.id);
      setSelectedIds([node.id]);
    }
    interactionRef.current = {
      type: 'node',
      ids: movingIds,
      startX: event.clientX,
      startY: event.clientY,
      origins: new Map(nodes.filter((item) => movingIds.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]))
    };
  }

  function stopCanvasUiPointer(event) {
    event.stopPropagation();
  }

  function beginPan(event) {
    if (event.button !== 0 || isCanvasUiTarget(event.target)) return;
    event.preventDefault();
    const stageBounds = stageRef.current?.getBoundingClientRect();
    if (event.shiftKey && stageBounds) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      interactionRef.current = {
        type: 'lasso',
        startX: event.clientX,
        startY: event.clientY,
        stageLeft: stageBounds.left,
        stageTop: stageBounds.top,
        baseIds: selectedIds
      };
      setSelectionBox({ left: event.clientX - stageBounds.left, top: event.clientY - stageBounds.top, width: 0, height: 0 });
      return;
    }
    if (!event.shiftKey) {
      setSelectedId('');
      setSelectedIds([]);
      setPrompt('');
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    interactionRef.current = { type: 'pan', startX: event.clientX, startY: event.clientY, originX: viewport.x, originY: viewport.y };
  }

  function beginMinimapDrag(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const stageBounds = stageRef.current?.getBoundingClientRect();
    const panelBounds = event.currentTarget.closest?.('.infiniteCanvasMinimap')?.getBoundingClientRect();
    if (!stageBounds || !panelBounds) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    interactionRef.current = {
      type: 'minimap',
      startX: event.clientX,
      startY: event.clientY,
      originX: panelBounds.left - stageBounds.left,
      originY: panelBounds.top - stageBounds.top,
      maxX: Math.max(8, stageBounds.width - panelBounds.width - 8),
      maxY: Math.max(8, stageBounds.height - panelBounds.height - 8)
    };
  }

  function movePointer(event) {
    const interaction = interactionRef.current;
    if (!interaction) return;
    event.preventDefault();
    if (interaction.type === 'reference-drag') {
      if (!interaction.moved && Math.hypot(event.clientX - interaction.startX, event.clientY - interaction.startY) >= 5) interaction.moved = true;
      const bounds = referenceTrayRef.current?.getBoundingClientRect();
      setReferenceDropActive(Boolean(interaction.moved && bounds
        && event.clientX >= bounds.left && event.clientX <= bounds.right
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom));
      return;
    }
    if (interaction.type === 'minimap') {
      setMinimapPosition({
        x: Math.max(8, Math.min(interaction.maxX, interaction.originX + event.clientX - interaction.startX)),
        y: Math.max(8, Math.min(interaction.maxY, interaction.originY + event.clientY - interaction.startY))
      });
      return;
    }
    if (interaction.type === 'pan') {
      setViewport((current) => ({ ...current, x: interaction.originX + event.clientX - interaction.startX, y: interaction.originY + event.clientY - interaction.startY }));
      return;
    }
    if (interaction.type === 'lasso') {
      const x1 = interaction.startX - interaction.stageLeft;
      const y1 = interaction.startY - interaction.stageTop;
      const x2 = event.clientX - interaction.stageLeft;
      const y2 = event.clientY - interaction.stageTop;
      setSelectionBox({ left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
      return;
    }
    const dx = (event.clientX - interaction.startX) / viewport.zoom;
    const dy = (event.clientY - interaction.startY) / viewport.zoom;
    setNodes((current) => current.map((node) => {
      const origin = interaction.origins?.get(node.id);
      return origin ? { ...node, x: origin.x + dx, y: origin.y + dy } : node;
    }));
  }

  function endPointer(event) {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (interaction?.type === 'reference-drag') {
      const bounds = referenceTrayRef.current?.getBoundingClientRect();
      const inside = Boolean(interaction.moved && bounds
        && event.clientX >= bounds.left && event.clientX <= bounds.right
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom);
      if (inside) addReference(nodeById.get(interaction.nodeId));
      else if (!interaction.moved) selectNode(nodeById.get(interaction.nodeId));
      setDraggingReferenceNodeId('');
      setReferenceDropActive(false);
      return;
    }
    if (interaction?.type === 'minimap') return;
    if (interaction?.type !== 'lasso') return;
    const x1 = (Math.min(interaction.startX, event.clientX) - interaction.stageLeft - viewport.x) / viewport.zoom;
    const y1 = (Math.min(interaction.startY, event.clientY) - interaction.stageTop - viewport.y) / viewport.zoom;
    const x2 = (Math.max(interaction.startX, event.clientX) - interaction.stageLeft - viewport.x) / viewport.zoom;
    const y2 = (Math.max(interaction.startY, event.clientY) - interaction.stageTop - viewport.y) / viewport.zoom;
    const hits = nodes.filter((node) => {
      const right = node.x + Number(node.cardWidth || INFINITE_CANVAS_NODE_WIDTH);
      const bottom = node.y + Number(node.cardHeight || INFINITE_CANVAS_NODE_HEIGHT);
      return node.x <= x2 && right >= x1 && node.y <= y2 && bottom >= y1;
    }).map((node) => node.id);
    const nextIds = [...new Set([...(interaction.baseIds || []), ...hits])];
    const nextPrimary = nextIds.at(-1) || '';
    setSelectedIds(nextIds);
    setSelectedId(nextPrimary);
    const nextNode = nodeById.get(nextPrimary);
    setPrompt(nextNode?.draftPrompt || (nextNode?.type === 'idea' ? nextNode.prompt || '' : ''));
    setSelectionBox(null);
  }

  function handleWheel(event) {
    event.preventDefault();
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const nextZoom = clampCanvasZoom(viewport.zoom * (event.deltaY > 0 ? 0.9 : 1.1));
    const mouseX = event.clientX - bounds.left;
    const mouseY = event.clientY - bounds.top;
    const worldX = (mouseX - viewport.x) / viewport.zoom;
    const worldY = (mouseY - viewport.y) / viewport.zoom;
    setViewport({ zoom: nextZoom, x: mouseX - worldX * nextZoom, y: mouseY - worldY * nextZoom });
  }

  function changeZoom(nextZoom) {
    const bounds = stageRef.current?.getBoundingClientRect();
    const centerX = (bounds?.width || 900) / 2;
    const centerY = (bounds?.height || 620) / 2;
    const zoom = clampCanvasZoom(nextZoom);
    const worldX = (centerX - viewport.x) / viewport.zoom;
    const worldY = (centerY - viewport.y) / viewport.zoom;
    setViewport({ zoom, x: centerX - worldX * zoom, y: centerY - worldY * zoom });
  }

  function fitContent() {
    const bounds = stageRef.current?.getBoundingClientRect();
    setViewport(viewportForCanvasNodes(nodes, bounds?.width || 900, bounds?.height || 620));
  }

  function autoArrange() {
    if (projectReadOnly) return;
    rememberCanvasState();
    const arranged = arrangeCanvasNodes(nodes);
    setNodes(arranged);
    const bounds = stageRef.current?.getBoundingClientRect();
    setViewport(viewportForCanvasNodes(arranged, bounds?.width || 900, bounds?.height || 620));
  }

  function applyPreset(value) {
    setPrompt(value);
    if (selectedNode) setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, draftPrompt: value } : node));
  }

  function selectCanvasRatio(ratioId) {
    const dimensions = dimensionsForImageSizeTemplateRatio(selectedProvider?.model, ratioId);
    if (dimensions) setSize(`${dimensions.width}x${dimensions.height}`);
  }

  function saveCurrentSizeTemplate() {
    if (!providerId || !sizeCheck.valid || size === 'auto') return;
    setSizePreferences((current) => ({ ...current, [providerId]: size }));
  }

  function focusNode(node) {
    if (!node) return fitContent();
    const bounds = stageRef.current?.getBoundingClientRect();
    const zoom = Math.max(0.7, Math.min(1.25, viewport.zoom));
    setViewport({
      zoom,
      x: (bounds?.width || 900) / 2 - (node.x + INFINITE_CANVAS_NODE_WIDTH / 2) * zoom,
      y: (bounds?.height || 620) / 2 - (node.y + INFINITE_CANVAS_NODE_HEIGHT / 2) * zoom
    });
  }

  function focusSelected() {
    focusNode(selectedNode);
  }

  function selectSearchResult(node) {
    selectNode(node);
    focusNode(node);
    setCanvasSearchOpen(false);
  }

  function jumpFromMinimap(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const worldX = minimapBounds.left + ((event.clientX - bounds.left) / bounds.width) * minimapBounds.width;
    const worldY = minimapBounds.top + ((event.clientY - bounds.top) / bounds.height) * minimapBounds.height;
    setViewport((current) => ({
      ...current,
      x: stageSize.width / 2 - worldX * current.zoom,
      y: stageSize.height / 2 - worldY * current.zoom
    }));
  }

  function duplicateNode(node) {
    if (projectReadOnly || !node || node.type === 'task') return;
    rememberCanvasState();
    const duplicate = {
      ...node,
      id: randomId(node.type),
      x: node.x + 42,
      y: node.y + 42,
      parentId: node.parentId || '',
      name: '',
      autoName: '',
      pipelineCode: '',
      pipelineDepth: undefined,
      copyIndex: undefined,
      locked: false,
      favorite: false,
      createdAt: new Date().toISOString()
    };
    setNodes((current) => [...current, duplicate]);
    setSelectedId(duplicate.id);
    setSelectedIds([duplicate.id]);
    setPrompt(duplicate.draftPrompt || (duplicate.type === 'idea' ? duplicate.prompt || '' : ''));
  }

  async function copyImageNode(node) {
    if (!node || node.type !== 'image' || copyingImageId) return;
    setCopyingImageId(node.id);
    setImageContextMenu(null);
    try {
      if (!globalThis.navigator?.clipboard?.write || !globalThis.ClipboardItem) throw new Error('CLIPBOARD_IMAGE_UNSUPPORTED');
      const pngPromise = canvasNodeClipboardBlob(node);
      await globalThis.navigator.clipboard.write([
        new globalThis.ClipboardItem({ 'image/png': pngPromise })
      ]);
      setMessage(t.imageCopied);
    } catch {
      setMessage(t.imageCopyFailed);
    } finally {
      setCopyingImageId('');
    }
  }

  function openImageContextMenu(event, node) {
    if (!node || node.type !== 'image') return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.focus?.({ preventScroll: true });
    selectNode(node);
    const width = 212;
    const height = 48;
    setImageContextMenu({
      nodeId: node.id,
      x: Math.max(8, Math.min(event.clientX, (globalThis.innerWidth || 1280) - width - 8)),
      y: Math.max(8, Math.min(event.clientY, (globalThis.innerHeight || 720) - height - 8))
    });
  }

  useEffect(() => {
    if (!imageContextMenu) return undefined;
    const closeMenu = (event) => {
      if (event?.target?.closest?.('.infiniteCanvasImageContextMenu')) return;
      setImageContextMenu(null);
    };
    globalThis.addEventListener?.('pointerdown', closeMenu);
    globalThis.addEventListener?.('blur', closeMenu);
    return () => {
      globalThis.removeEventListener?.('pointerdown', closeMenu);
      globalThis.removeEventListener?.('blur', closeMenu);
    };
  }, [imageContextMenu]);

  useEffect(() => {
    function onKeyDown(event) {
      const target = event.target;
      const editing = target?.matches?.('input, textarea, select, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        if (editing) return;
        event.preventDefault();
        if (event.shiftKey) redoCanvas(); else undoCanvas();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && !editing) {
        event.preventDefault();
        redoCanvas();
        return;
      }
      if (event.key === 'Escape' && imageContextMenu) {
        event.preventDefault();
        setImageContextMenu(null);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !editing && selectedNode) {
        event.preventDefault();
        if (selectedIds.length > 1) removeSelectedNodes(); else removeNode(selectedNode);
        return;
      }
      if (event.key.toLowerCase() === 'f' && !editing) {
        event.preventDefault();
        focusSelected();
      }
    }
    globalThis.addEventListener?.('keydown', onKeyDown);
    return () => globalThis.removeEventListener?.('keydown', onKeyDown);
  }, [selectedNode, selectedId, selectedIds, viewport.zoom, historyRevision, imageContextMenu, copyingImageId]);

  async function enqueueGeneration({
    sourceNode = selectedNode,
    requestPrompt = prompt,
    requestProviderId = providerId,
    requestSize = size,
    requestQuality = quality,
    requestCount = count,
    reuseParent = false,
    clearPrompt = true,
    referenceNodes = null,
    placement = 'branch'
  } = {}) {
    const trimmedPrompt = String(requestPrompt || '').trim();
    if (projectReadOnly) return;
    if (!trimmedPrompt) return setMessage(t.promptRequired);
    if (!isSignedIn) { onSignIn?.(); return setMessage(t.signIn); }
    if (!hasFullWorkspace) { if (!profile?.groupAccount) onBilling?.(); return setMessage(t.creditsRequired); }
    const requestProvider = providers.find((provider) => provider.id === requestProviderId);
    if (!requestProvider) return setMessage(t.providerMissing);
    const parent = reuseParent
      ? (sourceNode?.parentId ? nodeById.get(sourceNode.parentId) : null)
      : sourceNode?.type === 'task' ? nodeById.get(sourceNode.parentId) : (sourceNode || nodes[0] || null);
    const referenceSources = Array.isArray(referenceNodes)
      ? referenceNodes.filter((node) => node?.type === 'image')
      : reuseParent
        ? (parent?.type === 'image' ? [parent] : [])
        : activeReferenceNodes;
    const requestSizeCheck = validateImageSizeForModel(requestSize, requestProvider.model);
    const requestReferenceCheck = validateImageReferenceInputsForModel({
      model: requestProvider.model,
      count: referenceSources.length,
      mimeTypes: referenceSources.map((node) => node.mimeType)
    });
    if (!requestSizeCheck.valid) return setMessage(t.sizeUnsupported);
    if (!requestReferenceCheck.valid) return setMessage(t.referenceUnsupported);
    const imageCount = Math.max(1, Math.min(4, Math.round(Number(requestCount) || 1)));
    let confirmedPricing;
    try { confirmedPricing = await requestImagePricing({ size: requestSize, quality: requestQuality, count: imageCount, providerId: requestProviderId }); } catch { return setMessage(t.failed); }
    if (!profile?.isSuperAdmin && Number(profile?.creditBalance || 0) < Number(confirmedPricing.totalCredits || confirmedPricing.credits || 0)) {
      if (!profile?.groupAccount) onBilling?.();
      return setMessage(t.creditsRequired);
    }
    if (projectName.trim() === t.unnamedProject) setProjectName(compactText(trimmedPrompt, 40));

    const siblingCount = nodes.filter((node) => node.parentId === parent?.id).length;
    const taskId = randomId('canvas-generation');
    const taskNodeId = randomId('task');
    const position = placement === 'viewport-right'
      ? viewportRightMiddlePosition(viewport, stageSize.width, stageSize.height)
      : parent ? { x: parent.x + 370, y: parent.y + siblingCount * 300 } : nextOpenPosition(canvasCenter());
    const referenceNodeIds = referenceSources.map((node) => node.id);
    const primaryReferenceId = sourceNode?.type === 'image' ? sourceNode.id : '';
    const requestWithReferenceGuidance = canvasReferencePrompt(trimmedPrompt, referenceSources.map((node) => ({ ...node, isPrimaryReference: node.id === primaryReferenceId })), language);
    const taskNode = {
      id: taskNodeId, type: 'task', x: position.x, y: position.y, parentId: parent?.id || '', prompt: trimmedPrompt, draftPrompt: trimmedPrompt,
      taskId, providerId: requestProviderId, size: requestSize, quality: requestQuality, count: imageCount, referenceNodeIds, status: 'queued', createdAt: new Date().toISOString()
    };
    setNodes((current) => [...current, taskNode]);
    setSelectedId(taskNodeId);
    setSelectedIds([taskNodeId]);
    setSubmitting(true);
    setMessage('');
    try {
      const references = referenceSources.map((referenceSource) => (
        referenceSource.assetId ? { assetId: referenceSource.assetId, annotations: referenceSource.annotations || [] }
          : referenceSource.generationId ? { generationId: referenceSource.generationId, annotations: referenceSource.annotations || [] } : null
      )).filter(Boolean);
      const response = await fetch('/api/generation-tasks', {
        method: 'POST', headers: authHeaders(session, true),
        body: JSON.stringify({
          clientTaskId: taskId, prompt: requestWithReferenceGuidance, canvasDisplayPrompt: trimmedPrompt, size: requestSize, quality: requestQuality, count: imageCount, providerId: requestProviderId, references,
          canvasProjectId: currentProjectId, canvasParentNodeId: parent?.id || '', canvasTaskNodeId: taskNodeId, canvasReferenceNodeIds: referenceNodeIds, canvasX: position.x, canvasY: position.y
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'TASK_CREATE_FAILED');
      setNodes((current) => current.map((node) => node.id === taskNodeId ? { ...node, status: payload.task?.status || 'queued' } : node));
      if (clearPrompt) setPrompt('');
      void syncTasks();
    } catch (error) {
      setNodes((current) => current.map((node) => node.id === taskNodeId ? { ...node, status: 'failed', error: error.message } : node));
      setMessage(generationErrorMessage(error.message, t));
    } finally {
      setSubmitting(false);
    }
  }

  async function generateBranch() {
    await enqueueGeneration();
  }

  async function regenerateNode(node) {
    if (!node || node.type !== 'image') return;
    const originalReferences = Array.isArray(node.referenceNodeIds)
      ? node.referenceNodeIds.map((id) => nodeById.get(id)).filter((item) => item?.type === 'image')
      : [];
    const fallbackParent = node.parentId ? nodeById.get(node.parentId) : null;
    await enqueueGeneration({
      sourceNode: node,
      requestPrompt: node.prompt,
      requestProviderId: node.providerId || providerId,
      requestSize: node.size || size,
      requestQuality: node.quality || quality,
      requestCount: 1,
      reuseParent: true,
      clearPrompt: false,
      referenceNodes: originalReferences.length ? originalReferences : fallbackParent?.type === 'image' ? [fallbackParent] : [],
      placement: 'viewport-right'
    });
  }

  async function cancelTask(node) {
    if (!node.taskId || !ACTIVE_TASK_STATUSES.has(node.status)) return;
    setNodes((current) => current.map((item) => item.id === node.id ? { ...item, status: 'cancelling' } : item));
    try {
      await fetch('/api/generation-tasks/cancel', { method: 'POST', headers: authHeaders(session, true), body: JSON.stringify({ taskId: node.taskId }) });
      void syncTasks();
    } catch { setMessage(t.failed); }
  }

  function toggleCompare(node) {
    setCompareIds((current) => {
      const without = current.filter((id) => id !== node.id && nodeById.has(id));
      if (current.includes(node.id)) return without;
      const next = [...without, node.id].slice(-4);
      setMessage(next.length < 2 ? t.compareHint : '');
      return next;
    });
  }

  function compareSelectedImages() {
    if (selectedImageNodes.length < 2) return setMessage(t.compareHint);
    setComparePosition(50);
    setCompareIds(selectedImageNodes.slice(0, 4).map((node) => node.id));
  }

  async function retryTask(node) {
    if (!node?.taskId || !['failed', 'cancelled', 'interrupted'].includes(node.status) || submitting) return;
    const previousTaskId = node.taskId;
    const previousStatus = node.status;
    const previousError = node.error;
    const clientTaskId = randomId('canvas-retry');
    removedTaskIdsRef.current.add(previousTaskId);
    setSubmitting(true);
    setMessage(t.retryingTask);
    setNodes((current) => current.map((item) => item.id === node.id ? { ...item, status: 'queued', error: '' } : item));
    try {
      const response = await fetch('/api/generation-tasks', {
        method: 'POST',
        headers: authHeaders(session, true),
        body: JSON.stringify({
          action: 'redo',
          taskId: previousTaskId,
          clientTaskId,
          canvasProjectId: currentProjectId,
          canvasTaskNodeId: node.id,
          canvasX: node.x,
          canvasY: node.y,
          replaceTaskId: true
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'TASK_CREATE_FAILED');
      const nextTaskId = payload.task?.id || clientTaskId;
      setNodes((current) => replaceCanvasTaskForRetry(current, node.id, {
        ...payload.task,
        id: nextTaskId
      }));
      setMessage('');
      void syncTasks();
    } catch (error) {
      removedTaskIdsRef.current.delete(previousTaskId);
      setNodes((current) => current.map((item) => item.id === node.id ? { ...item, taskId: previousTaskId, status: previousStatus, error: previousError || error.message } : item));
      setMessage(generationErrorMessage(error.message, t));
    } finally {
      setSubmitting(false);
    }
  }

  const filteredHistory = history.filter((item) => !historyQuery.trim() || String(item.prompt || '').toLowerCase().includes(historyQuery.trim().toLowerCase()));

  function renderCanvasProject(project, { trashed = false } = {}) {
    const isCurrent = project.id === currentProjectId;
    const isBusy = projectActionId === project.id;
    return <article className={`infiniteCanvasProjectCard ${isCurrent ? 'current' : ''} ${trashed ? 'trashed' : ''}`} key={project.id}>
      <button className="infiniteCanvasProjectOpen" type="button" disabled={trashed || isBusy} aria-current={isCurrent ? 'page' : undefined} onClick={() => void switchProject(project.id)}>
        <span className="infiniteCanvasProjectIcon"><FolderOpen size={18} /></span>
        <span className="infiniteCanvasProjectInfo">
          <strong title={project.name}>{compactText(project.name, 28) || t.unnamedProject}</strong>
          <small>{t.projectNodes(project.nodeCount)}{formatCanvasProjectTime(project.updatedAt, language) ? ` · ${formatCanvasProjectTime(project.updatedAt, language)}` : ''}</small>
        </span>
        {isCurrent ? <em><Check size={12} />{t.currentProjectLabel}</em> : project.status === 'archived' ? <em>{t.archived}</em> : null}
      </button>
      {trashed ? <div className="infiniteCanvasProjectCardActions">
        <button type="button" disabled={isBusy} onClick={() => void restoreTrashedProject(project)} title={t.restoreFromTrash} aria-label={t.restoreFromTrash}>{isBusy ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}<span>{t.restoreProject}</span></button>
        <button className="danger" type="button" disabled={isBusy} onClick={() => void permanentlyDeleteProject(project)} title={t.permanentDelete} aria-label={t.permanentDelete}><Trash2 size={14} /><span>{t.permanentDelete}</span></button>
      </div> : <button className="infiniteCanvasProjectTrash" type="button" disabled={isBusy} onClick={() => void moveProjectToTrash(project)} title={t.moveToTrash} aria-label={t.moveToTrash}>{isBusy ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}</button>}
    </article>;
  }

  return (
    <section className={`infiniteCanvasPage ${theme === 'light' ? 'themeLight' : 'themeDark'} ${projectReadOnly ? 'projectArchived' : ''}`} data-theme={theme} aria-label={t.title}>
      <div className={`infiniteCanvasLayout ${sidebarOpen ? '' : 'sidebarCollapsed'}`} aria-busy={projectLoading}>
        {sidebarOpen ? <aside className="infiniteCanvasSidebar">
          <header className="infiniteCanvasSidebarHeader">
            <strong>{t.sidebarTitle}</strong>
            <button type="button" onClick={() => setSidebarOpen(false)} title={t.hideAssets} aria-label={t.hideAssets}><PanelLeftClose size={16} /></button>
          </header>
          <div className="infiniteCanvasSidebarActions">
            <button type="button" onClick={addIdeaNode} disabled={projectReadOnly}><Plus size={16} /> {t.newIdea}</button>
            <button type="button" onClick={() => uploadRef.current?.click()} disabled={projectReadOnly || uploading}>{uploading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} {uploading ? `${t.uploading} ${uploadProgress}%` : t.upload}</button>
            <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void handleUpload(event.target.files)} />
            <button type="button" onClick={() => folderUploadRef.current?.click()} disabled={projectReadOnly || uploading || modelConstraints.maxReferenceImages === 0}><FolderOpen size={16} /> {t.folderUpload}</button>
            <input ref={folderUploadRef} type="file" accept="image/jpeg,image/png,image/webp" multiple directory="" webkitdirectory="" hidden onChange={(event) => void handleUpload(event.target.files, { asReferences: true, preservePrimary: referenceSelected })} />
            <button type="button" onClick={() => { setAssetPickerSelectedIds([]); setAssetPickerOpen(true); }} disabled={projectReadOnly || !isSignedIn || modelConstraints.maxReferenceImages === 0}><Images size={16} /> {t.assetLibrary}</button>
          </div>
          <div className="infiniteCanvasUploadSupport"><span>{t.dropUpload}</span>{failedUpload ? <button type="button" onClick={() => void handleUpload([failedUpload])} disabled={uploading}><RefreshCw size={13} />{t.retryUpload}</button> : null}</div>
          {uploading ? <div className="infiniteCanvasUploadProgress" role="progressbar" aria-label={t.uploadProgress} aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress}><i style={{ width: `${uploadProgress}%` }} /></div> : null}
          <div className="infiniteCanvasSidebarTabs" role="tablist" aria-label={t.sidebarTitle}>
            <button className={sidebarTab === 'recent' ? 'active' : ''} type="button" role="tab" aria-selected={sidebarTab === 'recent'} onClick={() => setSidebarTab('recent')}><Images size={15} /><span>{t.recentTab}</span></button>
            <button className={sidebarTab === 'projects' ? 'active' : ''} type="button" role="tab" aria-selected={sidebarTab === 'projects'} onClick={() => setSidebarTab('projects')}><FolderOpen size={15} /><span>{t.projectsTab}</span><b>{availableProjects.length}</b></button>
          </div>
          {sidebarTab === 'recent' ? <div className="infiniteCanvasSidebarPanel" role="tabpanel">
            <div className="infiniteCanvasHistoryToolbar"><input className="infiniteCanvasHistorySearch" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder={t.searchHistory} /><button type="button" onClick={() => void refreshHistory()} aria-label={language === 'zh' ? '刷新历史素材' : 'Refresh history'}><RefreshCw size={14} /></button></div>
            {historyLoading && !history.length ? <p className="infiniteCanvasSidebarState"><LoaderCircle className="spin" size={16} /> {t.historyLoading}</p> : null}
            {!historyLoading && !filteredHistory.length ? <p className="infiniteCanvasSidebarState">{t.historyEmpty}</p> : null}
            <div className="infiniteCanvasHistoryList">
              {filteredHistory.map((item) => {
                const added = historyIdsOnCanvas.has(item.id);
                return <article className={added ? 'added' : ''} key={item.id}>
                  <button className="infiniteCanvasHistoryAdd" type="button" onClick={() => addHistoryNode(item)}>
                    <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" decoding="async" />
                    <span><strong>{compactText(item.prompt, 38) || t.generated}</strong><small>{item.size?.replace('x', '×')}</small></span>
                    <em>{added ? <Check size={13} /> : <Plus size={13} />}{added ? t.onCanvas : t.addToCanvas}</em>
                  </button>
                  <button className="infiniteCanvasHistoryDelete" type="button" title={t.deleteHistory} aria-label={t.deleteHistory} onClick={(event) => { event.stopPropagation(); requestConfirmation(t.deleteHistoryConfirm, () => removeHistoryItem(item)); }}><X size={13} /></button>
                </article>;
              })}
              {historyHasMore ? <button className="infiniteCanvasHistoryMore" type="button" onClick={() => void refreshHistory({ append: true })} disabled={historyLoading}>{historyLoading ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{t.historyMore}</button> : null}
            </div>
          </div> : <div className="infiniteCanvasSidebarPanel infiniteCanvasProjectsPanel" role="tabpanel">
            <div className="infiniteCanvasProjectsHeading">
              <div><button type="button" onClick={() => void createProject()} title={t.newProject} aria-label={t.newProject}><FolderPlus size={15} /></button><button type="button" onClick={() => void refreshProjects()} disabled={projectListLoading} title={t.refreshProjects} aria-label={t.refreshProjects}>{projectListLoading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}</button></div>
            </div>
            {!isSignedIn ? <p className="infiniteCanvasSidebarState">{t.signIn}</p> : null}
            {projectListLoading && !projects.length ? <p className="infiniteCanvasSidebarState"><LoaderCircle className="spin" size={16} /> {t.projectLoading}</p> : null}
            {!projectListLoading && isSignedIn && !availableProjects.length ? <p className="infiniteCanvasSidebarState">{t.projectsEmpty}</p> : null}
            <div className="infiniteCanvasProjectList">{availableProjects.map((project) => renderCanvasProject(project))}</div>
            <section className={`infiniteCanvasTrashSection ${trashOpen ? 'open' : ''}`}>
              <button className="infiniteCanvasTrashHeading" type="button" aria-expanded={trashOpen} onClick={() => setTrashOpen((value) => !value)}><span><Trash2 size={15} />{t.deleted}<b>{trashedProjects.length}</b></span>{trashOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
              {trashOpen ? <div className="infiniteCanvasTrashList">{trashedProjects.length ? trashedProjects.map((project) => renderCanvasProject(project, { trashed: true })) : <p className="infiniteCanvasSidebarState">{t.trashEmpty}</p>}</div> : null}
            </section>
          </div>}
        </aside> : null}

        <div className="infiniteCanvasWorkspace">
          <div className="infiniteCanvasStage" ref={stageRef} onPointerDown={beginPan} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={(event) => { endPointer(event); setSelectionBox(null); }} onWheel={handleWheel} onDragStart={(event) => { if (!event.target.closest?.('.infiniteCanvasNodeImage[draggable="true"]')) event.preventDefault(); }} onDragEnter={(event) => { if (event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); setDraggingFiles(true); } }} onDragOver={(event) => { if (event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); setDraggingFiles(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDraggingFiles(false); }} onDrop={(event) => {
            event.preventDefault();
            setDraggingFiles(false);
            const bounds = stageRef.current?.getBoundingClientRect();
            const anchor = bounds ? {
              x: (event.clientX - bounds.left - viewport.x) / viewport.zoom - INFINITE_CANVAS_NODE_WIDTH / 2,
              y: (event.clientY - bounds.top - viewport.y) / viewport.zoom - INFINITE_CANVAS_NODE_HEIGHT / 2
            } : canvasCenter();
            void handleUpload(event.dataTransfer?.files, { asReferences: true, preservePrimary: referenceSelected, anchor });
          }}>
            {draggingFiles ? <div className="infiniteCanvasDropReference"><ImagePlus size={24} /><strong>{t.dropReference}</strong></div> : null}
            <div className="infiniteCanvasProjectDock" data-canvas-ui="true" onPointerDown={stopCanvasUiPointer}>
              <button className="infiniteCanvasHome" type="button" onClick={onGoHome} title={t.home} aria-label={t.home}><House size={16} /><span>{t.home}</span></button>
              <button className="infiniteCanvasExit" type="button" onClick={onExitCanvas} title={t.backStudio} aria-label={t.backStudio}><ArrowLeft size={16} /><span>{t.backStudio}</span></button>
              {!sidebarOpen ? <button type="button" onClick={() => setSidebarOpen(true)} title={t.showAssets} aria-label={t.showAssets}><PanelLeftOpen size={16} /></button> : null}
              {isSignedIn ? <select value={currentProjectId} onChange={(event) => void switchProject(event.target.value)} aria-label={language === 'zh' ? '选择画布项目' : 'Choose canvas project'}>
                {availableProjects.map((project) => <option value={project.id} key={project.id}>{project.name}{project.status === 'archived' ? ` · ${t.archived}` : ''}</option>)}
              </select> : null}
              <input value={projectName} maxLength={120} disabled={projectDeleted} onChange={(event) => setProjectName(event.target.value)} aria-label={language === 'zh' ? '画布项目名称' : 'Canvas project name'} />
              <button type="button" onClick={() => void createProject()} title={t.newProject} aria-label={t.newProject}><FolderPlus size={15} /></button>
              {isSignedIn && currentProjectId ? <>
                {!projectDeleted ? <button type="button" onClick={() => void copyCurrentProject()} title={t.copyProject} aria-label={t.copyProject}><Copy size={15} /></button> : null}
                <button type="button" onClick={() => void removeCurrentProject(projectReadOnly ? 'active' : 'archived')} title={projectReadOnly ? t.restoreProject : t.archiveProject} aria-label={projectReadOnly ? t.restoreProject : t.archiveProject}>{projectReadOnly ? t.restoreProject : t.archiveProject}</button>
                {!projectDeleted ? <button className="danger" type="button" onClick={() => void moveProjectToTrash(currentProject)} title={t.moveToTrash} aria-label={t.moveToTrash}><Trash2 size={15} /></button> : null}
              </> : null}
              <div className={`infiniteCanvasSaveState ${saveStatus}`}>
                {saveStatus === 'saving' ? <LoaderCircle className="spin" size={13} /> : saveStatus === 'saved' ? <Save size={13} /> : <RefreshCw size={13} />}
                <span>{saveStatus === 'saving' ? t.saveSaving : saveStatus === 'conflict' ? t.saveConflict : saveStatus === 'failed' ? t.saveFailed : t.saveSaved}</span>
                {saveStatus === 'conflict' ? <button type="button" onClick={() => void loadProject(currentProjectId)}>{t.reload}</button> : null}
              </div>
              {profile ? <em><Sparkles size={14} />{profile.creditBalance || 0}</em> : null}
              {adoptedNode?.imageUrl ? <a className="infiniteCanvasAdoptedDownload" href={adoptedNode.downloadUrl || adoptedNode.imageUrl} download title={t.adoptedDownload} aria-label={t.adoptedDownload}><Download size={15} /></a> : null}
            </div>
            <div className="infiniteCanvasWorld" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
              <svg className="infiniteCanvasConnections" style={{ left: world.left, top: world.top, width: world.width, height: world.height }} viewBox={`${world.left} ${world.top} ${world.width} ${world.height}`} aria-hidden="true">
                {nodes.map((node) => {
                  const parent = node.parentId ? nodeById.get(node.parentId) : null;
                  return parent ? <path key={`${parent.id}-${node.id}`} d={canvasConnectorPath(parent, node)} /> : null;
                })}
                {referenceEdges.map((edge) => <path className="referenceLink" key={`reference-${edge.source.id}-${edge.target.id}`} d={canvasReferenceConnectorPath(edge.source, edge.target)} />)}
              </svg>
              {nodes.map((node) => <article
                className={`infiniteCanvasNode ${node.type} ${selectedIdSet.has(node.id) ? 'selected' : ''} ${node.id === selectedId ? 'primarySelected' : ''} ${node.id === selectedId && node.type === 'image' ? 'primaryImageSelected' : ''} ${referencedSourceIds.has(node.id) ? 'referencedEntity' : ''} ${node.id === adoptedNodeId ? 'adopted' : ''} ${node.locked ? 'locked' : ''}`}
                data-node-id={node.id} tabIndex="0" aria-label={nodeLabel(node, t)} style={{ left: node.x, top: node.y }} key={node.id} onClick={(event) => { event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); setImageContextMenu(null); selectNode(node, event); }} onDoubleClick={() => { if (node.type === 'image') setPreviewNode(node); }} onContextMenu={(event) => openImageContextMenu(event, node)} onKeyDown={(event) => {
                  if (node.type !== 'image' || (!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== 'c') return;
                  event.preventDefault();
                  event.stopPropagation();
                  void copyImageNode(node);
                }}
              >
                <header onPointerDown={(event) => beginNodeDrag(event, node)}>
                  <span>{node.type === 'idea' ? <Sparkles size={14} /> : node.type === 'task' ? <LoaderCircle className={ACTIVE_TASK_STATUSES.has(node.status) ? 'spin' : ''} size={14} /> : <ImagePlus size={14} />}{nodeLabel(node, t)}</span>
                  <span className="infiniteCanvasNodeBadges">
                    {node.id === selectedId && node.type === 'image' ? <i className="primaryImageBadge"><Sparkles size={11} />{t.primaryImage}</i> : null}{referencedSourceIds.has(node.id) ? <i className="referenceEntityBadge" title={t.addReference}><Link2 size={11} /></i> : null}{Number(node.batchSize || 1) > 1 ? <i className="batchIndex">{Number(node.variantIndex || 0) + 1}/{node.batchSize}</i> : null}{node.id === adoptedNodeId ? <i title={t.adopted}><CheckCircle2 size={13} /></i> : null}{node.favorite ? <i title={t.favorite}><Star size={13} /></i> : null}
                    <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); removeNode(node); }} aria-label={t.remove}><Trash2 size={14} /></button>
                  </span>
                </header>
                {node.type === 'image' ? <div
                  className="infiniteCanvasNodeImage"
                  onPointerDown={(event) => beginReferenceDrag(event, node)}
                  onPointerMove={(event) => {
                    if (interactionRef.current?.type !== 'reference-drag') return;
                    event.stopPropagation();
                    movePointer(event);
                  }}
                  onPointerUp={(event) => {
                    if (interactionRef.current?.type !== 'reference-drag') return;
                    event.stopPropagation();
                    endPointer(event);
                  }}
                  onPointerCancel={(event) => {
                    if (interactionRef.current?.type !== 'reference-drag') return;
                    event.stopPropagation();
                    endPointer(event);
                  }}
                  draggable={!projectReadOnly && referenceSelected && node.id !== selectedId}
                  onDragStart={(event) => {
                    if (projectReadOnly || !referenceSelected || node.id === selectedId) {
                      event.preventDefault();
                      return;
                    }
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = 'link';
                    event.dataTransfer.setData('application/x-pic365-canvas-node', node.id);
                    setDraggingReferenceNodeId(node.id);
                  }}
                  onDragEnd={finishReferenceDrag}
                  title={referenceSelected && node.id !== selectedId ? t.dragToReference : undefined}
                ><img src={node.thumbnailUrl || node.imageUrl} alt={compactText(node.prompt) || t.generated} draggable={false} loading="lazy" decoding="async" />{referenceSelected && node.id !== selectedId ? <i className="infiniteCanvasReferenceDragHint"><Link2 size={13} />{t.dragToReference}</i> : null}<span>{node.size?.replace('x', '×') || ''}</span></div>
                  : node.type === 'task' ? <div className={`infiniteCanvasTaskBody ${node.status || 'queued'}`}>{ACTIVE_TASK_STATUSES.has(node.status) ? <LoaderCircle className="spin" size={28} /> : <StopCircle size={28} />}<strong>{taskStatusLabel(node.status, t)}{Number(node.count || 1) > 1 ? ` · ${node.count}${language === 'zh' ? '张' : ''}` : ''}</strong><small>{compactText(node.error || node.prompt, 72)}</small></div>
                    : <div className="infiniteCanvasIdeaBody"><MousePointer2 size={24} /><strong>{t.chooseIdea}</strong><p>{compactText(node.prompt, 92) || t.promptPlaceholder}</p></div>}
                {node.type !== 'task' ? <p>{compactText(node.prompt, 96) || t.promptPlaceholder}</p> : null}
                {node.type !== 'idea' ? <footer>
                  {node.type === 'image' ? <>
                    {node.generationId ? <button className="nodePrimaryAction" type="button" title={t.regenerate} disabled={submitting || projectReadOnly} onClick={(event) => { event.stopPropagation(); void regenerateNode(node); }}><RefreshCw size={13} /><span>{t.regenerate}</span></button> : null}
                    {node.id !== selectedId && referenceSelected ? <button type="button" title={supportReferenceNodes.some((item) => item.id === node.id) ? t.removeReference : t.addReference} aria-label={supportReferenceNodes.some((item) => item.id === node.id) ? t.removeReference : t.addReference} className={supportReferenceNodes.some((item) => item.id === node.id) ? 'active' : ''} onClick={(event) => { event.stopPropagation(); toggleReference(node); }}><ImagePlus size={13} /></button> : null}
                    <button type="button" title={t.preview} aria-label={t.preview} onClick={(event) => { event.stopPropagation(); setPreviewZoom(1); setPreviewNode(node); }}><Eye size={13} /></button>
                    <button type="button" title={t.compare} aria-label={t.compare} className={compareIds.includes(node.id) ? 'active' : ''} onClick={(event) => { event.stopPropagation(); toggleCompare(node); }}><LayoutGrid size={13} /></button>
                    <button type="button" title={t.localEdit} aria-label={t.localEdit} onClick={(event) => { event.stopPropagation(); setEditNode(node); }}><Edit3 size={13} /></button>
                  </> : null}
                  {node.type === 'task' && ACTIVE_TASK_STATUSES.has(node.status) ? <button className="nodePrimaryAction" type="button" onClick={(event) => { event.stopPropagation(); void cancelTask(node); }}><StopCircle size={13} /><span>{t.cancelTask}</span></button> : null}
                  {node.type === 'task' && ['failed', 'cancelled', 'interrupted'].includes(node.status) ? <button className="nodePrimaryAction" type="button" disabled={submitting} onClick={(event) => { event.stopPropagation(); void retryTask(node); }}><RefreshCw size={13} /><span>{t.retryTask}</span></button> : null}
                </footer> : null}
              </article>)}
            </div>
            {selectionBox ? <div className="infiniteCanvasSelectionBox" style={selectionBox} aria-hidden="true" /> : null}
            {imageContextMenu ? <div
              className="infiniteCanvasImageContextMenu"
              data-canvas-ui="true"
              role="menu"
              style={{ left: imageContextMenu.x, top: imageContextMenu.y }}
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button type="button" role="menuitem" disabled={Boolean(copyingImageId)} onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void copyImageNode(nodeById.get(imageContextMenu.nodeId));
              }}>
                {copyingImageId ? <LoaderCircle className="spin" size={15} /> : <Copy size={15} />}
                <span>{copyingImageId ? t.copyingImage : t.copyImage}</span>
                <kbd>{t.copyImageShortcut}</kbd>
              </button>
            </div> : null}
            {!nodes.length ? <div className="infiniteCanvasEmpty"><Sparkles size={32} /><strong>{t.emptyTitle}</strong><p>{t.emptyText}</p></div> : null}
            {projectReadOnly ? <div className="infiniteCanvasArchivedNotice" data-canvas-ui="true" onPointerDown={stopCanvasUiPointer}><strong>{projectDeleted ? t.deleted : t.archived}</strong><button type="button" onClick={() => void removeCurrentProject('active')}>{t.restoreProject}</button></div> : null}
            {projectLoading ? <div className="infiniteCanvasLoading" data-canvas-ui="true"><LoaderCircle className="spin" size={30} /></div> : null}
            <div className="infiniteCanvasTools" data-canvas-ui="true" onPointerDown={stopCanvasUiPointer}><button type="button" onClick={undoCanvas} disabled={!undoStackRef.current.length} title={t.undo} aria-label={t.undo}><Undo2 size={17} /></button><button type="button" onClick={redoCanvas} disabled={!redoStackRef.current.length} title={t.redo} aria-label={t.redo}><Redo2 size={17} /></button><button type="button" onClick={() => changeZoom(viewport.zoom - 0.1)} aria-label={language === 'zh' ? '缩小' : 'Zoom out'}><ZoomOut size={17} /></button><span>{Math.round(viewport.zoom * 100)}%</span><button type="button" onClick={() => changeZoom(viewport.zoom + 0.1)} aria-label={language === 'zh' ? '放大' : 'Zoom in'}><ZoomIn size={17} /></button><button type="button" onClick={fitContent} title={t.fitView} aria-label={t.fitView}><Focus size={17} /></button><button type="button" onClick={focusSelected} title={t.focusSelected} aria-label={t.focusSelected}><MousePointer2 size={17} /></button><button type="button" className={canvasSearchOpen ? 'active' : ''} onClick={() => setCanvasSearchOpen((value) => !value)} title={t.searchCanvas} aria-label={t.searchCanvas}><Search size={17} /></button><button type="button" className={minimapOpen ? 'active' : ''} onClick={() => setMinimapOpen((value) => !value)} title={t.minimap} aria-label={t.minimap}><MapIcon size={17} /></button><button type="button" onClick={autoArrange} disabled={projectReadOnly} title={t.arrange} aria-label={t.arrange}><LayoutGrid size={17} /></button><button type="button" onClick={clearCanvas} disabled={projectReadOnly} title={t.clearCanvas} aria-label={t.clearCanvas}><Trash2 size={17} /></button></div>
            {canvasSearchOpen ? <div className="infiniteCanvasSearchPanel" data-canvas-ui="true" onPointerDown={stopCanvasUiPointer}><label><Search size={14} /><input autoFocus value={canvasQuery} onChange={(event) => setCanvasQuery(event.target.value)} placeholder={t.searchPlaceholder} /></label><select aria-label={language === 'zh' ? '筛选画布节点' : 'Filter canvas nodes'} value={canvasFilter} onChange={(event) => setCanvasFilter(event.target.value)}><option value="all">{t.allNodes}</option><option value="favorite">{t.favoriteNodes}</option><option value="locked">{t.lockedNodes}</option><option value="adopted">{t.adoptedNodes}</option><option value="active">{t.activeTasks}</option><option value="failed">{t.failedTasks}</option></select><div>{!canvasMatches.length ? <p>{t.noSearchResults}</p> : canvasMatches.map((node) => <button type="button" key={node.id} onClick={() => selectSearchResult(node)}><strong>{nodeLabel(node, t)}</strong><span>{compactText(node.prompt || node.draftPrompt, 52)}</span></button>)}</div></div> : null}
            {minimapOpen && nodes.length ? <div className="infiniteCanvasMinimap" data-canvas-ui="true" onPointerDown={stopCanvasUiPointer} style={minimapPosition ? { left: minimapPosition.x, top: minimapPosition.y, right: 'auto', bottom: 'auto' } : undefined} role="region" aria-label={t.minimap}>
              <button className="infiniteCanvasMinimapHandle" type="button" onPointerDown={beginMinimapDrag} title={t.minimapMove} aria-label={t.minimapMove}><GripHorizontal size={15} /><span>{t.minimap}</span></button>
              <button className="infiniteCanvasMinimapMap" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={jumpFromMinimap} aria-label={t.minimap}><svg viewBox={`${minimapBounds.left} ${minimapBounds.top} ${minimapBounds.width} ${minimapBounds.height}`} preserveAspectRatio="none">{nodes.map((node) => <rect className={selectedIdSet.has(node.id) ? 'selected' : ''} key={node.id} x={node.x} y={node.y} width={Number(node.cardWidth || INFINITE_CANVAS_NODE_WIDTH)} height={Number(node.cardHeight || INFINITE_CANVAS_NODE_HEIGHT)} rx="18" />)}<rect className="viewport" x={visibleWorld.x} y={visibleWorld.y} width={visibleWorld.width} height={visibleWorld.height} rx="12" /></svg></button>
            </div> : null}
          </div>

          <div className={`infiniteCanvasComposer ${composerCollapsed ? 'collapsed' : ''}`}>
            <div className="infiniteCanvasComposerTop">
              <div className="infiniteCanvasComposerContext">
                <span>{selectedIds.length > 1 ? `${selectedIds.length} ${t.selectedCount}` : selectedNode ? t.selected : t.selectHint}</span>{selectedNode ? <strong>{nodeLabel(selectedNode, t)}{selectedNode.prompt ? ` · ${compactText(selectedNode.prompt, 48)}` : ''}</strong> : null}
              </div>
              <div className="infiniteCanvasComposerNavigation">
                {referenceSelected ? <div className="infiniteCanvasReferenceSourceControl">
                  <button type="button" onClick={() => setReferenceSourceMenuOpen((current) => !current)} disabled={projectReadOnly || uploading}><ImagePlus size={13} />{t.addReferenceImages}</button>
                  {referenceSourceMenuOpen ? <div className="infiniteCanvasReferenceSourceMenu">
                    <button type="button" onClick={() => { setReferenceSourceMenuOpen(false); referenceFolderUploadRef.current?.click(); }}><FolderOpen size={14} />{t.folderUpload}</button>
                    <button type="button" onClick={() => { setReferenceSourceMenuOpen(false); setAssetPickerSelectedIds([]); setAssetPickerOpen(true); }}><Images size={14} />{t.assetLibrary}</button>
                  </div> : null}
                  <input ref={referenceFolderUploadRef} type="file" accept="image/jpeg,image/png,image/webp" multiple directory="" webkitdirectory="" hidden onChange={(event) => void handleUpload(event.target.files, { asReferences: true, preservePrimary: true })} />
                </div> : null}
                {selectedIds.length > 1 ? <div className="infiniteCanvasBatchActions">{selectedImageNodes.length >= 2 ? <button type="button" onClick={compareSelectedImages}><LayoutGrid size={13} />{t.compareSelected}</button> : null}<button className="danger" type="button" onClick={removeSelectedNodes}><Trash2 size={13} />{t.batchDelete}</button></div> : null}
                {selectedIds.length === 1 && selectedNode ? <div className="infiniteCanvasBranchNav">{selectedParent ? <button type="button" onClick={() => { selectNode(selectedParent); focusNode(selectedParent); }}>{t.parentVersion}</button> : null}{selectedChildren.length ? <button type="button" onClick={() => { selectNode(selectedChildren[0]); focusNode(selectedChildren[0]); }}>{selectedChildren.length} {t.childVersions}</button> : null}</div> : null}
              </div>
              {selectedNode?.type === 'image' ? <div className="infiniteCanvasVersionActions"><button className={selectedNode.id === adoptedNodeId ? 'active' : ''} type="button" onClick={() => { rememberCanvasState(); setAdoptedNodeId(selectedNode.id); }}><CheckCircle2 size={13} />{selectedNode.id === adoptedNodeId ? t.adopted : t.adopt}</button><button className={selectedNode.locked ? 'active' : ''} type="button" onClick={() => { rememberCanvasState(); setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, locked: !node.locked } : node)); }}><Save size={13} />{selectedNode.locked ? t.unlock : t.lock}</button><button className={selectedNode.favorite ? 'active' : ''} type="button" onClick={() => { rememberCanvasState(); setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, favorite: !node.favorite } : node)); }}><Star size={13} />{t.favorite}</button><button type="button" onClick={() => duplicateNode(selectedNode)}><Copy size={13} />{t.duplicate}</button>{selectedNode.downloadUrl || selectedNode.imageUrl ? <a href={selectedNode.downloadUrl || selectedNode.imageUrl} download><Download size={13} />{t.download}</a> : null}{onOpenInStudio ? <button className="primary" type="button" onClick={() => onOpenInStudio(selectedNode)}><WandSparkles size={13} />{t.refine}</button> : null}</div> : null}
              <button className="infiniteCanvasComposerCollapse" type="button" aria-expanded={!composerCollapsed} title={composerCollapsed ? t.expandComposer : t.collapseComposer} aria-label={composerCollapsed ? t.expandComposer : t.collapseComposer} onClick={() => setComposerCollapsed((current) => !current)}>{composerCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
            </div>
            {referenceSelected ? <div ref={referenceTrayRef} className={`infiniteCanvasReferenceTray ${showSupportingReferences ? 'hasSupportingReferences' : ''} ${referenceDropActive ? 'dropActive' : ''}`} onDragEnter={(event) => { event.preventDefault(); setReferenceDropActive(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'link'; setReferenceDropActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setReferenceDropActive(false); }} onDrop={dropReferenceNode}>
              <div className="infiniteCanvasPrimaryReference"><article><button type="button" onClick={() => { setPreviewZoom(1); setPreviewNode(selectedNode); }}><img src={selectedNode.thumbnailUrl || selectedNode.imageUrl} alt="" /><span>{t.primaryImage}</span></button><input aria-label={language === 'zh' ? '修改图片名称' : 'Rename image'} value={selectedNode.name || selectedNode.autoName || ''} maxLength={80} onFocus={rememberCanvasState} onChange={(event) => setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, name: event.target.value } : node))} /></article></div>
              {showSupportingReferences ? <div className="infiniteCanvasSupportingReferences">
                <header><span><Images size={14} />{t.referenceTray} <b>{supportReferenceNodes.length}/{maxSupportReferenceImages}</b></span><small>{t.referenceHint}</small></header>
                <div>
                  {supportReferenceNodes.filter((node) => node.id !== selectedId).map((node, index) => <article key={node.id}>
                    <button className="infiniteCanvasReferenceThumb" type="button" onClick={() => { setPreviewZoom(1); setPreviewNode(node); }} title={nodeLabel(node, t)}><img src={node.thumbnailUrl || node.imageUrl} alt="" /><i>{index + 1}</i></button>
                    <select aria-label={`${t.referenceTray} ${index + 1}`} value={node.referenceRole || 'general'} onChange={(event) => updateReferenceRole(node.id, event.target.value)}>{CANVAS_REFERENCE_ROLES.map((role) => <option value={role} key={role}>{referenceRoleLabel(role, t)}</option>)}</select>
                    <button className="danger" type="button" onClick={() => toggleReference(node)} aria-label={t.removeReference}><X size={13} /></button>
                  </article>)}
                  {draggingReferenceNodeId && !supportReferenceNodes.some((node) => node.id === draggingReferenceNodeId) ? <div className="infiniteCanvasReferenceDropTarget"><Link2 size={15} /><span>{t.dropIntoReference}</span></div> : null}
                </div>
              </div> : null}
            </div> : null}
            <div className="infiniteCanvasPromptRow">
              <textarea value={prompt} onChange={(event) => { const value = event.target.value; setPrompt(value); if (selectedNode) setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, draftPrompt: value, ...(node.type === 'idea' ? { prompt: value } : {}) } : node)); }} placeholder={t.promptPlaceholder} maxLength={6000} />
              {referenceSelected ? <small className="infiniteCanvasReferencePromptHint">{t.referencePromptHint}</small> : null}
              {referenceSelected ? <div className="infiniteCanvasPresets">{t.branchPresets.map((preset) => <button type="button" key={preset} onClick={() => applyPreset(preset)}>{compactText(preset, 20)}</button>)}</div> : null}
            </div>
            <div className="infiniteCanvasComposerFooter">
              <label><span>{t.provider}</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)}>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label>
              <label><span>{t.ratio}</span><select value={selectedRatio} onChange={(event) => selectCanvasRatio(event.target.value)}>{sizeTemplate.ratios.map((preset) => <option value={preset.id} key={preset.id}>{preset.id}</option>)}</select></label>
              <div className="infiniteCanvasSizeField"><span>{t.size}</span><div className="infiniteCanvasSizePicker"><span className="infiniteCanvasRatioPreview" title={`${selectedRatio} · ${size.replace('x', '×')}`}><CanvasRatioGraphic ratioWidth={ratioGraphic.width} ratioHeight={ratioGraphic.height} /></span><select aria-label={t.size} className={!sizeCheck.valid ? 'invalid' : ''} value={size} onChange={(event) => setSize(event.target.value)}>{sizeOptions.map((item) => <option value={item} key={item}>{savedSizeTemplate === item ? '★ ' : ''}{ratioIdForImageSize(item, sizeTemplate.ratios)} · {item.replace('x', '×')}</option>)}</select><button className={savedSizeTemplate === size ? 'active' : ''} type="button" onClick={saveCurrentSizeTemplate} title={t.saveSizeTemplate} aria-label={t.saveSizeTemplate}><LockKeyhole size={14} /></button></div></div>
              <label><span>{t.quality}</span><select value={quality} onChange={(event) => setQuality(event.target.value)}><option value="low">{t.low}</option><option value="medium">{t.medium}</option><option value="high">{t.high}</option></select></label>
              <label><span>{t.count}</span><select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
              <div className="infiniteCanvasPrice">{hasFullWorkspace ? <ImageCreditPrice pricing={pricing} quantity={count} language={language} compact /> : null}</div>
              <button className="infiniteCanvasGenerate" type="button" onClick={() => void generateBranch()} disabled={projectReadOnly || submitting || pricingLoading || !providerId || !sizeCheck.valid || !referenceCheck.valid}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{submitting ? t.submitting : t.generate}</button>
            </div>
            {!sizeCheck.valid ? <p className="infiniteCanvasMessage">{t.sizeUnsupported}</p> : !referenceCheck.valid ? <p className="infiniteCanvasMessage">{referenceCheck.error === 'TOO_MANY_REFERENCE_IMAGES' ? t.referenceTooMany : t.referenceUnsupported}</p> : message ? <p className="infiniteCanvasMessage">{message}</p> : null}
          </div>
        </div>
      </div>

      {assetPickerOpen ? <div className="infiniteCanvasModalBackdrop"><section className="infiniteCanvasAssetPicker" role="dialog" aria-modal="true" aria-label={t.assetLibrary}>
        <header><strong><Images size={17} />{t.assetLibrary} · {supportReferenceNodes.length}/{maxSupportReferenceImages}</strong><button type="button" onClick={() => { setAssetPickerSelectedIds([]); setAssetPickerOpen(false); }} aria-label={t.closeLibrary}><X size={17} /></button></header>
        <label><Search size={15} /><input autoFocus value={assetPickerQuery} onChange={(event) => setAssetPickerQuery(event.target.value)} placeholder={t.assetSearch} /></label>
        <div>{assetPickerLoading ? <p><LoaderCircle className="spin" size={22} /></p> : !assetPickerItems.length ? <p>{t.noAssets}</p> : assetPickerItems.map((asset) => {
          const activeReference = supportReferenceByAssetId.get(asset.id);
          const primaryAsset = selectedNode?.assetId === asset.id;
          const selected = assetPickerSelectedIds.includes(asset.id);
          const selectionFull = !selected && assetPickerSelectedIds.length >= assetPickerSelectionLimit;
          return <button type="button" key={asset.id} className={`${activeReference ? 'active' : primaryAsset ? 'primary' : ''} ${selected ? 'selected' : ''}`.trim()} disabled={primaryAsset || selectionFull} aria-pressed={selected} onClick={() => activeReference ? addAssetReference(asset) : toggleAssetPickerSelection(asset.id)} title={primaryAsset ? t.primaryImage : activeReference ? t.assetRemove : t.addAssetReference}>
            <span className="infiniteCanvasAssetPreview"><img src={asset.thumbnailUrl || asset.previewUrl || asset.originalUrl} alt={asset.name} />{activeReference || primaryAsset || selected ? <i>{activeReference ? t.assetRemove : primaryAsset ? t.primaryImage : t.assetAdd}</i> : null}</span>
            <span className="infiniteCanvasAssetMeta"><strong>{asset.name}</strong><small>{asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.mimeType}</small></span>
            <b className="infiniteCanvasAssetAction">{activeReference ? <X size={13} /> : primaryAsset || selected ? <Check size={13} /> : <Plus size={13} />}{activeReference ? t.assetRemove : primaryAsset ? t.primaryImage : t.assetAdd}</b>
          </button>;
        })}</div>
        <footer><span>{t.assetSelected(assetPickerSelectedIds.length, assetPickerSelectionLimit)}</span><button type="button" onClick={confirmAssetPickerSelection} disabled={!assetPickerSelectedIds.length}><Check size={15} />{t.confirmAssets(assetPickerSelectedIds.length)}</button></footer>
      </section></div> : null}
      {confirmation ? <div className="infiniteCanvasModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelConfirmation(); }}><section className="infiniteCanvasConfirm" role="alertdialog" aria-modal="true" aria-label={t.confirmAction}><Trash2 size={24} /><p>{confirmation.message}</p><div><button type="button" onClick={cancelConfirmation}>{t.cancelAction}</button><button className="danger" type="button" onClick={confirmPendingAction}>{t.confirmAction}</button></div></section></div> : null}
      {previewNode ? <div className="infiniteCanvasModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewNode(null); }}><section className="infiniteCanvasPreview" role="dialog" aria-modal="true" aria-label={t.preview}><header><strong>{previewNode.id === adoptedNodeId ? t.adopted : nodeLabel(previewNode, t)}</strong><div className="infiniteCanvasPreviewTools"><button type="button" aria-label={language === 'zh' ? '缩小预览' : 'Zoom preview out'} onClick={() => setPreviewZoom((value) => Math.max(0.5, value - 0.25))}><ZoomOut size={16} /></button><span>{Math.round(previewZoom * 100)}%</span><button type="button" aria-label={language === 'zh' ? '放大预览' : 'Zoom preview in'} onClick={() => setPreviewZoom((value) => Math.min(4, value + 0.25))}><ZoomIn size={16} /></button><button type="button" aria-label={language === 'zh' ? '重置预览' : 'Reset preview'} onClick={() => setPreviewZoom(1)}><Focus size={16} /></button><button type="button" aria-label={language === 'zh' ? '关闭预览' : 'Close preview'} onClick={() => setPreviewNode(null)}><X size={18} /></button></div></header><div className="infiniteCanvasPreviewViewport"><img style={{ width: `${previewZoom * 100}%` }} src={previewNode.imageUrl} alt={compactText(previewNode.prompt)} /></div><footer><p>{previewNode.prompt}<small>{t.originalSize}：{previewNode.size?.replace('x', '×') || '—'}</small></p><a href={previewNode.downloadUrl || previewNode.imageUrl} download><Download size={15} />{t.download}</a></footer></section></div> : null}
      {compareNodes.length >= 2 ? <div className="infiniteCanvasModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompareIds([]); }}><section className="infiniteCanvasCompare" role="dialog" aria-modal="true" aria-label={t.compareTitle}><header><strong>{t.compareTitle} · {compareNodes.length}</strong><button type="button" aria-label={language === 'zh' ? '关闭对比' : 'Close comparison'} onClick={() => setCompareIds([])}><X size={18} /></button></header>{compareNodes.length === 2 ? <><div className="infiniteCanvasCompareSlider"><img src={compareNodes[0].imageUrl} alt={compactText(compareNodes[0].prompt)} /><div style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}><img src={compareNodes[1].imageUrl} alt={compactText(compareNodes[1].prompt)} /></div><i style={{ left: `${comparePosition}%` }} /><input aria-label={t.comparisonPosition} type="range" min="0" max="100" value={comparePosition} onInput={(event) => setComparePosition(Number(event.currentTarget.value))} onChange={(event) => setComparePosition(Number(event.target.value))} /></div><div className="infiniteCanvasCompareDetails">{compareNodes.map((node) => <article key={node.id}><strong>{node.id === adoptedNodeId ? t.adopted : nodeLabel(node, t)}</strong><small>{versionMeta(node, providers, language)}</small><p>{node.prompt}</p><button type="button" onClick={() => { rememberCanvasState(); setAdoptedNodeId(node.id); setCompareIds([]); }}><CheckCircle2 size={14} />{t.adopt}</button></article>)}</div></> : <div className="infiniteCanvasCompareGrid">{compareNodes.map((node) => <article key={node.id}><img src={node.imageUrl} alt={compactText(node.prompt)} /><strong>{node.id === adoptedNodeId ? t.adopted : nodeLabel(node, t)}</strong><small>{versionMeta(node, providers, language)}</small><p>{node.prompt}</p><button type="button" onClick={() => { rememberCanvasState(); setAdoptedNodeId(node.id); setCompareIds([]); }}><CheckCircle2 size={14} />{t.adopt}</button></article>)}</div>}</section></div> : null}
      {editNode ? <FreeImageReferenceEditor reference={{ ...editNode, imageUrl: editNode.imageUrl, annotations: editNode.annotations || [] }} language={language} onClose={() => setEditNode(null)} onSave={(annotations) => {
        const localPrompt = language === 'zh' ? '仅修改已标记区域，未标记区域的主体、构图、背景、光影、颜色、文字与细节必须保持不变。' : 'Modify only the marked region. Preserve the subject, composition, background, lighting, colors, text, and detail everywhere else.';
        rememberCanvasState(); setNodes((current) => current.map((node) => node.id === editNode.id ? { ...node, annotations, draftPrompt: localPrompt } : node));
        setSelectedId(editNode.id); setSelectedIds([editNode.id]); setPrompt(localPrompt); setEditNode(null); setMessage(t.localEditReady);
      }} /> : null}
    </section>
  );
}
