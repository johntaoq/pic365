import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  ArrowDown,
  ArrowUp,
  Check,
  CircleCheck,
  ClipboardPaste,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Eraser,
  FolderOpen,
  ImagePlus,
  ImageUp,
  History,
  ListChecks,
  LoaderCircle,
  Lock,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  WandSparkles,
  X,
  Zap
} from 'lucide-react';
import {
  ECOMMERCE_INDUSTRIES,
  ECOMMERCE_PLATFORMS,
  getDefaultEcommercePlan,
  getEcommercePlatform,
  getEcommerceSubcategories,
  getEcommerceTemplate,
  getEcommerceTemplates,
  getEcommerceVisualStyle,
  getVisualStylesForIndustry,
  inferEcommerceIndustryId,
  inferEcommerceSubcategoryId,
  isValidSubcategory
} from '../shared/ecommerce-catalog.js';
import { mergeRefreshedAiIdentitySpec, normalizeEcommerceAiBrief } from '../shared/ecommerce-brief.js';
import {
  ECOMMERCE_PROJECT_ASSET_LIMIT,
  ECOMMERCE_PROJECT_ASSET_MAX_BYTES,
  ECOMMERCE_PROJECT_ASSET_MIME_TYPES,
  isSupportedEcommerceAssetMimeType
} from '../shared/ecommerce-assets.js';
import { resolveEcommerceRefinementSize, resolveEcommerceSlotGenerationSize } from '../shared/image-pricing.js';
import { getImageModelConstraints, validateImageReferenceInputsForModel } from '../shared/image-generation.js';
import { orderImageProviders, resolveImageProviderId } from '../shared/image-provider-selection.js';
import {
  readEcommerceProjectListCollapsed,
  writeEcommerceProjectListCollapsed
} from '../shared/ecommerce-ui-preferences.js';
import EcommerceDeliveryCenter from './ecommerce-delivery-center.jsx';
import EcommerceAssetLibraryPicker from './ecommerce-asset-library-picker.jsx';
import { clampImagePanOffset } from './image-pan-zoom.js';
import {
  ImageCreditPrice,
  requestImagePricing,
  requestImagePricingBatch,
  useServerImagePricing,
  useServerImagePricingBatch
} from './image-pricing-client.jsx';
import { countEcommerceReferenceImages } from '../shared/ecommerce-reference-selection.js';

function ecommerceProviderCompatibility(provider, assets = []) {
  if (!provider) return { valid: false, error: 'AI_PROVIDER_NOT_CONFIGURED' };
  const constraints = getImageModelConstraints(provider.model);
  if (!constraints.isMai) return { valid: true, constraints };
  const availableAssets = assets.filter((asset) => asset.available !== false);
  return validateImageReferenceInputsForModel({
    model: provider.model,
    count: availableAssets.length,
    mimeTypes: availableAssets.map((asset) => asset.mimeType)
  });
}

function ecommerceProviderCompatibilityText(result, t) {
  if (result?.valid) return '';
  if (result?.error === 'REFERENCE_IMAGES_UNSUPPORTED') return t.maiReferenceUnsupported;
  if (result?.error === 'TOO_MANY_REFERENCE_IMAGES') return t.maiReferenceLimit;
  if (result?.error === 'INVALID_REFERENCE_IMAGE_FORMAT') return t.maiReferenceFormat;
  if (result?.error === 'AI_PROVIDER_NOT_CONFIGURED') return t.providerRequired;
  return t.generationFailed;
}

const ECOMMERCE_IMAGE_QUALITIES = ['low', 'medium', 'high'];

function normalizeEcommerceImageQuality(value) {
  return ECOMMERCE_IMAGE_QUALITIES.includes(value) ? value : 'low';
}

function isGptImageProvider(provider) {
  const model = String(provider?.model || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  const name = String(provider?.name || '').trim().toLowerCase();
  return model.includes('gpt-image') || name === 'gpt' || name.startsWith('gpt ');
}

const copy = {
  en: {
    title: 'One image in, a full set out',
    projects: 'Product projects',
    collapseProjects: 'Collapse project list',
    expandProjects: 'Expand project list',
    newProject: 'New project',
    noProjects: 'Your saved product projects will appear here.',
    projectName: 'Project name',
    projectNamePlaceholder: 'Created automatically from the product name',
    platform: 'Sales platform',
    productBrief: 'Product',
    industry: 'Product category',
    industryAutoHint: 'Detected automatically; you can change it.',
    primaryCategory: 'Category',
    secondaryCategory: 'Subcategory',
    productName: 'Product name',
    productNamePlaceholder: 'For example: 30 oz insulated travel tumbler',
    brandName: 'Brand or series',
    brandNamePlaceholder: 'Optional; use a brand you own or are authorized to use',
    coreUser: 'Core customer',
    coreUserPlaceholder: 'Who is most likely to buy or use it? Describe relevant needs, preferences, or expertise.',
    coreScenario: 'Core use scenario',
    coreScenarioPlaceholder: 'Where, when, and for what task will the product be used?',
    sellingPoints: 'Core selling points',
    sellingPointsPlaceholder: 'Up to 4 concise benefits; no more than 4 words each',
    sourceAssets: 'Product images',
    sourceAssetsHint: 'Upload clear front, side, and detail images. The system automatically locks product structure, color, material, and visible packaging details.',
    saveBeforeUpload: 'Enter the product name. The project will be created automatically.',
    assetType: 'Material type',
    assetProduct: 'Product photo',
    assetPackaging: 'Packaging',
    assetLogo: 'Logo',
    assetReference: 'Visual reference',
    chooseImages: 'Choose images',
    pasteImages: 'Paste images',
    uploadFromDevice: 'Choose from folder',
    chooseFromLibrary: 'Choose from media library',
    assetLibraryLinkFailed: 'Some asset-library images could not be added.',
    assetLimit: 'Paste, drop, or choose PNG, JPG, or WebP images; up to 5 MB each and 9 images per project.',
    pasteEmpty: 'No supported image was found on the clipboard. Copy an image, then paste again.',
    pasteUnavailable: 'Clipboard access is unavailable here. Press Ctrl+V directly in this image area.',
    assetTooLarge: 'Each image must be 5 MB or smaller.',
    referenceTooLarge: 'Each reference image must be no larger than 7 MB.',
    assetCountLimit: 'Each product project supports up to 9 images.',
    uploadingAssets: 'Uploading...',
    uploadFailed: 'One or more files could not be uploaded.',
    deleteAsset: 'Delete material',
    assetUnavailable: 'Access expired',
    assetUnavailableHint: 'This shared asset is no longer available. Remove it or ask the owner to share it again.',
    masterAsset: 'Product master',
    setMaster: 'Use as master',
    masterHint: 'The first product image is selected automatically. Change the master only when another image is clearer.',
    assetPurpose: 'Reference purpose',
    assetPurposeOptions: {
      '': 'Follow material type', identity: 'Product identity', angle: 'Angle and geometry', packaging: 'Packaging',
      brand: 'Brand mark', material: 'Material', detail: 'Detail', composition: 'Composition only', lighting: 'Lighting only', scene: 'Scene only'
    },
    moveAssetUp: 'Move earlier',
    moveAssetDown: 'Move later',
    identitySpec: 'Lock product composition rules',
    identitySpecHint: 'These facts are hard constraints for every generated image.',
    buildIdentitySpec: 'AI inspect product rules',
    buildingIdentitySpec: 'AI is inspecting...',
    identitySpecUpdated: 'Product rules were refreshed from the current materials.',
    identitySpecManualPreserved: 'AI analysis finished. Existing manual rules were preserved.',
    identitySpecAssetsRequired: 'Upload at least one product image before AI inspection.',
    identitySpecFailed: 'Product-rule analysis could not be completed.',
    identityStructure: 'Structure and proportions',
    identityColorsMaterials: 'Colors and materials',
    identityBrandMarks: 'Brand marks',
    identityPackaging: 'Outer packaging and labels',
    identityIncludedItems: 'Included accessories and quantities',
    identityPackagingPlaceholder: 'Box, pouch, bottle, label layout, seals, colors, and existing package text...',
    identityIncludedItemsPlaceholder: 'For example: charging cable ×1, manual ×1, replacement head ×2; enter “None” when there are no accessories.',
    identityMustAvoidPlaceholder: 'Structures, colors, parts, text, claims, or visual errors that must never appear...',
    identityMustKeep: 'Must keep',
    identityMustAvoid: 'Must avoid',
    visualDirection: 'Image-set plan',
    visualStyle: 'Visual style',
    templates: 'Recommended image-set templates',
    applyTemplate: 'Apply template',
    templateApplied: 'Applied',
    outputSlots: 'Image list (optional)',
    slotHint: 'A recommended list is ready. Adjust it only when needed.',
    expandSection: 'Expand',
    collapseSection: 'Collapse',
    assetSummary: (count, hasMaster) => `${count} materials${hasMaster ? ' · master selected' : ''}`,
    required: 'Core',
    selectedCount: (count) => `${count} images selected`,
    production: 'Generate',
    productionSummary: (ready, total) => `${ready}/${total} adopted`,
    professionalDelivery: 'Refinement & delivery',
    deliverySummary: (count) => `${count} generated images`,
    selectAll: 'Select all',
    clearSelection: 'Clear selection',
    batchSelection: (count, credits) => `${count} selected · ${credits} credits`,
    batchSelectionLabel: (count) => `${count} selected`,
    generateSelected: 'Generate all selected',
    taskStartedTitle: 'Tasks started',
    taskStartedNotice: (count) => `${count} image generation task${count === 1 ? '' : 's'} started. Results will appear automatically on this page.`,
    generateFromOutputs: 'Generate image set',
    continueToAssets: 'Upload product images',
    openAssets: 'Upload product images',
    continueToPlan: 'Choose image-set plan',
    automaticContextHint: 'Customers, scenarios, and image constraints are prepared automatically in the background.',
    optionalStyles: 'Adjust visual style (optional)',
    visualStylePreviewHint: 'The same imagined “Pic365 Mineral Water” product is used to compare each style.',
    batchGenerating: 'Generating',
    generateSlot: (credits) => `Generate · ${credits} credits`,
    regenerateSlot: (credits) => `New version · ${credits} credits`,
    generateSlotLabel: 'Generate',
    regenerateSlotLabel: 'New version',
    queued: 'Queued',
    running: 'Generating',
    interrupted: 'Interrupted',
    taskAlreadyActive: 'This image already has a task in progress.',
    retry: (credits) => `Retry · ${credits} credits`,
    retryLabel: 'Retry',
    cancel: 'Cancel',
    cancelling: 'Cancelling...',
    selectAtLeastOne: 'Select at least one image.',
    insufficientBatchCredits: (required, available) => `${required} credits required; ${available} available.`,
    groupBudgetRequired: 'Your group budget is insufficient. Contact the group administrator.',
    groupBalanceRequired: 'The group balance is insufficient. Ask the administrator to add funds.',
    groupAccessSuspended: 'Your group access is paused or being removed.',
    masterRequired: 'Select a product master before generating.',
    generationFailed: 'This image could not be generated. Your reserved credit was returned.',
    maiReferenceLimit: 'MAI supports at most one uploaded source image for this workflow. Choose another image service or remove extra materials.',
    maiReferenceUnsupported: 'This MAI model does not support the product-reference workflow used by e-commerce image sets.',
    maiReferenceFormat: 'MAI product references must be JPEG or PNG.',
    providerSaving: 'Saving image service...',
    generationQuality: 'Quality',
    qualityLow: 'Low',
    qualityMedium: 'Medium',
    qualityHigh: 'High',
    providerRequired: 'Select an available image service before generating.',
    providerUnavailableChoice: 'Unavailable',
    providerUnavailable: (name, model) => `The image service${name ? ` "${name}"` : ''} has no available ${model || 'image'} channel. The reserved credits were refunded.`,
    providerAuthFailed: 'The image service API key is invalid or unauthorized. The reserved credits were refunded.',
    providerBalanceError: 'The upstream image service has insufficient balance or quota. The reserved credits were refunded.',
    providerBusy: 'The image service is busy. The reserved credits were refunded; please try again later.',
    providerTimeout: 'The image service timed out. The reserved credits were refunded; please try again later.',
    generationTimeout: 'Generation exceeded the 300-second wait limit. Check the task state before retrying.',
    serverRestarted: 'The local image service restarted while this task was running. Reserved credits were refunded; retry the task.',
    projectChanged: 'The project changed after this task was queued. Start generation again to use the latest saved version.',
    moderationBlocked: 'This slot needs safer product wording. Update the project facts or restricted-content field, save, and try again.',
    downloadOutput: 'Download',
    versions: 'Versions',
    versionCenter: 'Version center',
    adoptedVersion: 'Current version',
    adoptVersion: 'Use this version',
    archiveVersion: 'Remove version',
    outputLocked: 'Locked',
    lockOutput: 'Lock result',
    unlockOutput: 'Unlock result',
    slotLocked: 'Unlock this result before generating or changing versions.',
    latestAttemptFailed: 'Latest attempt failed; the adopted result is still preserved.',
    noVersions: 'No versions yet.',
    localRevision: 'Revise from this version',
    localRevisionPlaceholder: 'Describe only what should change; product identity remains locked.',
    createRevision: (credits) => `Create revised version · ${credits} credits`,
    createRevisionLabel: 'Create revised version',
    consistencyCheck: 'Check consistency',
    consistencyChecking: 'Checking...',
    consistencyUnchecked: 'Not checked',
    consistencyPassed: 'Consistent',
    consistencyWarning: 'Review suggested',
    consistencyFailed: 'Identity drift',
    consistencyFailedRequest: 'Consistency check failed. Try again later.',
    viewImage: 'Open image preview',
    imagePreview: 'Image preview',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetZoom: 'Reset zoom',
    closePreview: 'Close preview',
    version: (number) => `Version ${number}`,
    noOutput: 'Not generated yet',
    saving: 'Auto-saving...',
    loadFailed: 'Could not load product projects.',
    saveFailed: 'Could not save this project.',
    productRequired: 'Enter a product name first.',
    fieldHelp: 'Show guidance',
    clearField: 'Clear and show the default guidance',
    restoreAiField: 'Restore the original AI draft',
    aiFillBrief: 'AI autofill · 1 credit',
    aiFillingBrief: 'Writing brief...',
    aiBriefFilled: 'AI draft ready',
    aiBriefFailed: 'Could not prepare the product brief.',
    signInTitle: 'Sign in to save and continue',
    signInText: 'Saving projects and uploading product images are free. Credits are used only when AI generation starts.',
    signIn: 'Sign in',
    creditsTitle: 'Your image-set plan is ready',
    creditsText: 'Saving and uploading are free. Add credits only when you are ready to generate.',
    recharge: 'View credits',
    workflow: ['Product', 'Images', 'Plan', 'Generate', 'Deliver'],
    currentStage: 'Current',
    lockedStage: 'Complete previous steps',
    draft: 'Draft',
    updated: 'Updated'
  },
  zh: {
    title: '一图入，全套生',
    projects: '商品项目',
    collapseProjects: '收起项目列表',
    expandProjects: '展开项目列表',
    newProject: '新建项目',
    noProjects: '保存后的商品项目会显示在这里。',
    projectName: '项目名称',
    projectNamePlaceholder: '系统会根据商品名称自动创建',
    platform: '销售平台',
    productBrief: '商品',
    industry: '商品分类',
    industryAutoHint: '系统自动识别，可修改',
    primaryCategory: '一级类目',
    secondaryCategory: '二级类目',
    productName: '商品名称',
    productNamePlaceholder: '例如：30oz 大容量吸管保温杯',
    brandName: '品牌或系列',
    brandNamePlaceholder: '选填；只能使用自有或已获授权的品牌',
    coreUser: '核心用户',
    coreUserPlaceholder: '谁最可能购买或使用？填写相关需求、偏好、年龄层或专业程度，避免把场景混在这里。',
    coreScenario: '核心场景',
    coreScenarioPlaceholder: '商品在什么地点、时间和任务中使用？填写具体、可信且适合展示的场景。',
    sellingPoints: '核心卖点',
    sellingPointsPlaceholder: '最多4条短卖点；每条不超过4个词',
    sourceAssets: '商品图片',
    sourceAssetsHint: '上传清晰的正面、侧面和细节图。系统会自动锁定商品结构、颜色、材质和可见包装信息。',
    saveBeforeUpload: '填写商品名称后，系统会自动创建项目。',
    assetType: '素材类型',
    assetProduct: '商品原图',
    assetPackaging: '包装图',
    assetLogo: 'Logo',
    assetReference: '视觉参考图',
    chooseImages: '选择图片',
    pasteImages: '粘贴图片',
    uploadFromDevice: '从文件夹选择',
    chooseFromLibrary: '从媒资库选择',
    assetLibraryLinkFailed: '部分资产库图片未能加入项目。',
    assetLimit: '支持粘贴、拖拽、文件夹或媒资库选择 PNG、JPG、WebP 图片；单张不超过 5 MB，最多 9 张。',
    pasteEmpty: '剪贴板中没有可用图片，请复制图片后再粘贴。',
    pasteUnavailable: '当前浏览器无法主动读取剪贴板，请在商品图片区直接按 Ctrl+V。',
    assetTooLarge: '单张图片不能超过 5 MB。',
    referenceTooLarge: '每张参考图不能超过 7 MB。',
    assetCountLimit: '每个商品项目最多 9 张图片。',
    uploadingAssets: '正在上传……',
    uploadFailed: '部分素材上传失败。',
    deleteAsset: '删除素材',
    assetUnavailable: '共享权限已失效',
    assetUnavailableHint: '该共享素材已不可读取。请解除关联，或让素材所有者重新共享。',
    masterAsset: '商品母版',
    setMaster: '设为母版',
    masterHint: '系统会自动选第一张商品图作为母版；只有其他图片更清晰时才需要更换。',
    assetPurpose: '参考用途',
    assetPurposeOptions: {
      '': '按素材类型使用', identity: '商品身份', angle: '角度与几何', packaging: '包装结构',
      brand: '品牌标识', material: '材质', detail: '局部细节', composition: '仅参考构图', lighting: '仅参考光线', scene: '仅参考场景'
    },
    moveAssetUp: '向前移动',
    moveAssetDown: '向后移动',
    identitySpec: '锁定商品构图规则',
    identitySpecHint: '以下内容是整套图片必须遵守的硬约束。',
    buildIdentitySpec: 'AI 识别商品规则',
    buildingIdentitySpec: 'AI 正在识别……',
    identitySpecUpdated: '已根据当前商品素材更新构图规则。',
    identitySpecManualPreserved: 'AI 已完成分析，手工修改的规则已保留。',
    identitySpecAssetsRequired: '请先上传至少一张商品图片，再使用 AI 识别。',
    identitySpecFailed: '商品规则识别未完成，请稍后重试。',
    identityStructure: '结构与比例',
    identityColorsMaterials: '颜色与材质',
    identityBrandMarks: '品牌与标识',
    identityPackaging: '外包装与标签',
    identityIncludedItems: '随附配件与数量',
    identityPackagingPlaceholder: '包装盒、袋、瓶、标签版式、封口、颜色及原包装文字位置……',
    identityIncludedItemsPlaceholder: '例如：充电线×1、说明书×1、替换头×2；没有配件请填写“无”。',
    identityMustAvoidPlaceholder: '绝不能出现的错误结构、颜色、部件、文字、功效表述或画面问题……',
    identityMustKeep: '必须保留',
    identityMustAvoid: '必须避免',
    visualDirection: '套图方案',
    visualStyle: '视觉风格',
    templates: '推荐套图模板',
    applyTemplate: '应用模板',
    templateApplied: '已应用',
    outputSlots: '图片清单（可调整）',
    slotHint: '系统已经准备好推荐清单，不需要调整也可以直接生成。',
    expandSection: '展开',
    collapseSection: '收起',
    assetSummary: (count, hasMaster) => `${count} 张素材${hasMaster ? ' · 已设母版' : ''}`,
    required: '核心',
    selectedCount: (count) => `已选择 ${count} 张 / 组`,
    production: '生成',
    productionSummary: (ready, total) => `已采用 ${ready}/${total} 张`,
    professionalDelivery: '精修交付',
    deliverySummary: (count) => `${count} 张已生成图片`,
    selectAll: '全部选中',
    clearSelection: '取消全选',
    batchSelection: (count, credits) => `已选 ${count} · 预计 ${credits}积分`,
    batchSelectionLabel: (count) => `已选 ${count} · 预计`,
    generateSelected: '一键生成',
    taskStartedTitle: '任务已经开启',
    taskStartedNotice: (count) => `已启动 ${count} 个生图任务，生成结果会自动显示在当前页面。`,
    generateFromOutputs: '一键生图',
    continueToAssets: '上传商品图',
    openAssets: '上传商品图',
    continueToPlan: '选择套图方案',
    automaticContextHint: '目标用户、使用场景和图片约束由系统在后台自动完成。',
    optionalStyles: '调整视觉风格（可选）',
    visualStylePreviewHint: '统一使用假想商品“Pic365 矿泉水”，直观看出不同视觉风格。',
    batchGenerating: '生成中',
    generateSlot: (credits) => `生成此图 · ${credits}积分`,
    regenerateSlot: (credits) => `生成新版本 · ${credits}积分`,
    generateSlotLabel: '生成此图',
    regenerateSlotLabel: '生成新版本',
    queued: '排队中',
    running: '生成中',
    interrupted: '任务中断',
    taskAlreadyActive: '这张图片已有任务正在执行。',
    retry: (credits) => `重试 · ${credits}积分`,
    retryLabel: '重试',
    cancel: '取消',
    cancelling: '取消中……',
    selectAtLeastOne: '请至少选择一张图片。',
    insufficientBatchCredits: (required, available) => `需要 ${required} 积分，当前可用 ${available} 积分。`,
    groupBudgetRequired: '集团预算不足，请联系集团管理员增加预算。',
    groupBalanceRequired: '集团可用余额不足，请由集团管理员转入积分。',
    groupAccessSuspended: '你的集团账户已暂停或正在退出。',
    masterRequired: '请先选择商品母版。',
    generationFailed: '本张图片生成失败，预留积分已经退回。',
    maiReferenceLimit: 'MAI 在此工作流中最多使用 1 张上传素材。请删除多余素材或选择其他生图服务。',
    maiReferenceUnsupported: '该 MAI 模型不支持电商套图所需的商品参考图工作流。',
    maiReferenceFormat: 'MAI 商品参考图仅支持 JPEG 或 PNG。',
    providerSaving: '正在保存生图服务……',
    generationQuality: '质量',
    qualityLow: '低',
    qualityMedium: '中',
    qualityHigh: '高',
    providerRequired: '请选择可用的生图服务后再生成。',
    providerUnavailableChoice: '不可用',
    providerUnavailable: (name, model) => `当前生图服务${name ? `“${name}”` : ''}没有可用的 ${model || '图像'} 渠道，预留积分已退回，请联系管理员检查配置。`,
    providerAuthFailed: '生图服务的 API Key 无效或无权限，预留积分已退回，请联系管理员。',
    providerBalanceError: '生图服务的上游余额或额度不足，预留积分已退回，请联系管理员。',
    providerBusy: '生图服务当前繁忙，预留积分已退回，请稍后重试。',
    providerTimeout: '生图服务请求超时，预留积分已退回，请稍后重试。',
    generationTimeout: '生图等待超过 300 秒，请先检查任务状态再重试。',
    serverRestarted: '本地生图服务在任务执行期间重启，预留积分已退回，请重试该任务。',
    projectChanged: '任务排队后项目内容发生了变化。请重新生成，以使用最新保存版本。',
    moderationBlocked: '当前商品表述需要调整。请修改商品资料或禁止内容，保存后再试。',
    downloadOutput: '下载图片',
    versions: '版本',
    versionCenter: '版本中心',
    adoptedVersion: '当前采用',
    adoptVersion: '采用此版本',
    archiveVersion: '删除版本',
    outputLocked: '已锁定',
    lockOutput: '锁定结果',
    unlockOutput: '解除锁定',
    slotLocked: '请先解除锁定，再生成或切换版本。',
    latestAttemptFailed: '最近一次生成失败，当前采用结果已保留。',
    noVersions: '还没有生成版本。',
    localRevision: '基于此版本修改',
    localRevisionPlaceholder: '只描述要修改的部分；商品身份仍保持锁定。',
    createRevision: (credits) => `生成修改版本 · ${credits}积分`,
    createRevisionLabel: '生成修改版本',
    consistencyCheck: '一致性检查',
    consistencyChecking: '检查中……',
    consistencyUnchecked: '未检查',
    consistencyPassed: '一致',
    consistencyWarning: '建议复核',
    consistencyFailed: '商品身份漂移',
    consistencyFailedRequest: '一致性检查失败，请稍后重试。',
    viewImage: '放大查看图片',
    imagePreview: '图片预览',
    zoomIn: '放大',
    zoomOut: '缩小',
    resetZoom: '恢复原始比例',
    closePreview: '关闭预览',
    version: (number) => `版本 ${number}`,
    noOutput: '尚未生成',
    saving: '正在自动保存……',
    loadFailed: '商品项目加载失败。',
    saveFailed: '商品项目保存失败。',
    productRequired: '请先填写商品名称。',
    fieldHelp: '查看填写提示',
    clearField: '清空并恢复缺省提示',
    restoreAiField: '恢复 AI 原始生成内容',
    aiFillBrief: 'AI 智能填写 · 1 积分',
    aiFillingBrief: '正在生成商品资料……',
    aiBriefFilled: 'AI 初稿已生成',
    aiBriefFailed: '商品资料暂时无法生成。',
    signInTitle: '登录后保存并继续',
    signInText: '保存项目和上传商品图免费，只有开始 AI 生图时才消耗积分。',
    signIn: '登录',
    creditsTitle: '套图方案已准备好',
    creditsText: '保存和上传不扣积分，准备生成时再充值即可。',
    recharge: '查看积分',
    workflow: ['商品', '图片', '方案', '生成', '交付'],
    currentStage: '当前阶段',
    lockedStage: '请先完成前置步骤',
    draft: '草稿',
    updated: '更新于'
  }
};

const SECTION_KEYS = ['brief', 'assets', 'visual', 'outputs', 'production', 'delivery'];
const WORKFLOW_SECTIONS = [
  ['brief'],
  ['assets'],
  ['visual', 'outputs'],
  ['production'],
  ['delivery']
];
const SECTION_WORKFLOW_STEP = Object.fromEntries(
  WORKFLOW_SECTIONS.flatMap((sectionKeys, step) => sectionKeys.map((sectionKey) => [sectionKey, step]))
);
const IDENTITY_SPEC_FIELDS = [
  'structure', 'colorsMaterials', 'brandMarks', 'packaging', 'includedItems', 'mustKeep', 'mustAvoid'
];

function getCollapsedSectionsForStage(stage) {
  const numericStage = Number(stage);
  if (!Number.isFinite(numericStage) || numericStage < 0) {
    return Object.fromEntries(SECTION_KEYS.map((key) => [key, true]));
  }
  const activeSections = new Set(WORKFLOW_SECTIONS[Math.max(0, Math.min(WORKFLOW_SECTIONS.length - 1, numericStage))]);
  return Object.fromEntries(SECTION_KEYS.map((key) => [key, !activeSections.has(key)]));
}

function createEmptyForm(platformId = ECOMMERCE_PLATFORMS[0].id) {
  const industryId = 'general';
  const subcategoryId = inferEcommerceSubcategoryId(industryId, '');
  const plan = getDefaultEcommercePlan(platformId, industryId);
  return {
    id: '',
    projectName: '',
    platformId,
    industryId,
    subcategoryId,
    productName: '',
    brandName: '',
    coreUser: '',
    coreScenario: '',
    targetAudience: '',
    sellingPoints: '',
    specifications: '',
    prohibitedContent: '',
    identitySpec: {},
    templateId: plan.templateId,
    visualStyleId: plan.visualStyleId,
    imageProviderId: '',
    imageQuality: 'low',
    selectedSlots: plan.selectedSlotIds
  };
}

function projectToForm(project) {
  const industryId = project.industryId || inferEcommerceIndustryId(project.productName, project.brandName);
  const subcategoryId = isValidSubcategory(industryId, project.subcategoryId)
    ? project.subcategoryId
    : inferEcommerceSubcategoryId(industryId, project.productName, project.brandName);
  const plan = getDefaultEcommercePlan(project.platformId, industryId);
  const identitySpec = { ...(project.identitySpec || {}) };
  const coreUser = Object.prototype.hasOwnProperty.call(project, 'coreUser')
    ? project.coreUser || ''
    : project.targetAudience || '';
  const coreScenario = project.coreScenario || '';
  if (!String(identitySpec.mustKeep || '').trim() && String(project.specifications || '').trim()) {
    identitySpec.mustKeep = project.specifications;
  }
  if (!String(identitySpec.mustAvoid || '').trim() && String(project.prohibitedContent || '').trim()) {
    identitySpec.mustAvoid = project.prohibitedContent;
  }
  return {
    ...createEmptyForm(project.platformId),
    ...project,
    industryId,
    subcategoryId,
    coreUser,
    coreScenario,
    targetAudience: [coreUser, coreScenario].filter(Boolean).join('\n'),
    identitySpec,
    templateId: project.templateId || plan.templateId,
    visualStyleId: project.visualStyleId || plan.visualStyleId,
    imageQuality: normalizeEcommerceImageQuality(project.imageQuality),
    sellingPoints: (project.sellingPoints || []).join('\n'),
    selectedSlots: project.selectedSlots?.length ? project.selectedSlots : plan.selectedSlotIds
  };
}

function ecommerceProjectSavePayload(form, aiBriefOriginals) {
  return {
    id: form.id || '',
    projectName: form.projectName || '',
    platformId: form.platformId || '',
    industryId: form.industryId || '',
    subcategoryId: form.subcategoryId || '',
    productName: form.productName || '',
    brandName: form.brandName || '',
    coreUser: form.coreUser || '',
    coreScenario: form.coreScenario || '',
    targetAudience: form.targetAudience || '',
    sellingPoints: String(form.sellingPoints || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    specifications: form.specifications || '',
    prohibitedContent: form.prohibitedContent || '',
    aiBriefOriginals: normalizeAiBriefOriginals(aiBriefOriginals),
    identitySpec: form.identitySpec || {},
    templateId: form.templateId || '',
    visualStyleId: form.visualStyleId || '',
    imageProviderId: form.imageProviderId || '',
    imageQuality: normalizeEcommerceImageQuality(form.imageQuality),
    selectedSlots: Array.isArray(form.selectedSlots) ? form.selectedSlots : []
  };
}

function ecommerceProjectSaveFingerprint(form, aiBriefOriginals) {
  const { id, ...payload } = ecommerceProjectSavePayload(form, aiBriefOriginals);
  return JSON.stringify(payload);
}

function normalizeAiBriefOriginals(value) {
  const originals = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  if (!String(originals.coreUser || '').trim() && String(originals.targetAudience || '').trim()) {
    originals.coreUser = originals.targetAudience;
  }
  delete originals.targetAudience;
  originals.identitySpec = originals.identitySpec && typeof originals.identitySpec === 'object' && !Array.isArray(originals.identitySpec)
    ? Object.fromEntries(IDENTITY_SPEC_FIELDS
      .map((field) => [field, String(originals.identitySpec[field] || '').trim()])
      .filter(([, content]) => Boolean(content)))
    : {};
  if (!Object.keys(originals.identitySpec).length) delete originals.identitySpec;
  return originals;
}

function clearUneditedAiBrief(form, originals) {
  const normalized = normalizeAiBriefOriginals(originals);
  const next = { ...form, identitySpec: { ...(form.identitySpec || {}) } };
  for (const field of ['coreUser', 'coreScenario', 'sellingPoints']) {
    const original = String(normalized[field] || '').trim();
    if (original && String(next[field] || '').trim() === original) next[field] = '';
  }
  for (const field of IDENTITY_SPEC_FIELDS) {
    const original = String(normalized.identitySpec?.[field] || '').trim();
    if (original && String(next.identitySpec[field] || '').trim() === original) delete next.identitySpec[field];
  }
  return next;
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

function inferEcommerceAssetType(fileName) {
  const value = String(fileName || '').toLowerCase();
  if (/(?:logo|标志|商标)/i.test(value)) return 'logo';
  if (/(?:pack|package|packaging|包装|彩盒|外盒)/i.test(value)) return 'packaging';
  if (/(?:reference|参考|风格|氛围)/i.test(value)) return 'reference';
  return 'product';
}

function pastedImageFiles(clipboardData) {
  return Array.from(clipboardData?.items || [])
    .filter((item) => item.kind === 'file' && isSupportedEcommerceAssetMimeType(item.type))
    .map((item) => item.getAsFile())
    .filter(Boolean);
}

function clipboardImageFile(blob, index) {
  const mimeType = String(blob?.type || '').toLowerCase();
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
  return new File([blob], `pasted-product-${Date.now()}-${index + 1}.${extension}`, { type: mimeType });
}

function isTextEditingTarget(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, [contenteditable="true"], [role="textbox"]'));
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

function CollapsibleSectionLegend({ label, summary, collapsed, contentId, expandLabel, collapseLabel, onToggle, headerAction = null }) {
  const actionLabel = collapsed ? expandLabel : collapseLabel;
  return (
    <div className="ecommerceCollapsibleLegend">
      <button
        className="ecommerceCollapsibleLegendToggle"
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
      </button>
      <div className="ecommerceCollapsibleLegendControls">
        {headerAction}
        <button
          className="ecommerceCollapsibleLegendAction"
          type="button"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          aria-label={`${actionLabel}: ${label}`}
          title={`${actionLabel}: ${label}`}
          onClick={onToggle}
        >
          <span>{actionLabel}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function clampImageZoom(value) {
  return Math.min(4, Math.max(0.5, value));
}

function ecommerceThumbnailHoverPreviewLayout(target, sourceWidth, sourceHeight) {
  const rect = target?.getBoundingClientRect?.();
  if (!rect) return null;
  const viewportWidth = Math.max(320, Number(globalThis.innerWidth || 0));
  const viewportHeight = Math.max(320, Number(globalThis.innerHeight || 0));
  const fallbackWidth = Math.max(1, Number(target?.naturalWidth || rect.width || 1));
  const fallbackHeight = Math.max(1, Number(target?.naturalHeight || rect.height || 1));
  const ratio = Math.max(0.05, Number(sourceWidth || fallbackWidth) / Math.max(1, Number(sourceHeight || fallbackHeight)));
  const maxWidth = Math.min(520, viewportWidth - 32);
  const maxImageHeight = Math.max(150, viewportHeight - 58);
  let width = Math.min(maxWidth, Math.max(180, rect.width * 3));
  let height = width / ratio;
  if (height > maxImageHeight) {
    height = maxImageHeight;
    width = height * ratio;
  }
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }
  const totalHeight = height + 34;
  let left = rect.right + 12;
  if (left + width > viewportWidth - 12) left = rect.left - width - 12;
  left = Math.max(12, Math.min(left, viewportWidth - width - 12));
  const top = Math.max(12, Math.min(rect.top + (rect.height - totalHeight) / 2, viewportHeight - totalHeight - 12));
  return { left, top, width, height };
}

function EcommerceImageLightbox({ image, t, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

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

  useEffect(() => {
    if (!image) return undefined;
    const keepImageInBounds = () => setOffset((current) => boundedOffset(current, zoom));
    globalThis.addEventListener?.('resize', keepImageInBounds);
    return () => globalThis.removeEventListener?.('resize', keepImageInBounds);
  }, [image, zoom]);

  if (!image) return null;

  function boundedOffset(nextOffset, zoomValue = zoom) {
    const canvas = canvasRef.current;
    const imageElement = imageRef.current;
    if (!canvas || !imageElement || zoomValue <= 1) return { x: 0, y: 0 };
    return clampImagePanOffset(nextOffset, {
      viewportWidth: canvas.clientWidth,
      viewportHeight: canvas.clientHeight,
      contentWidth: imageElement.offsetWidth,
      contentHeight: imageElement.offsetHeight,
      zoom: zoomValue
    });
  }

  function setNextZoom(nextValue) {
    const nextZoom = clampImageZoom(nextValue);
    setZoom(nextZoom);
    setOffset((current) => boundedOffset(current, nextZoom));
  }

  function adjustZoom(delta) {
    setZoom((current) => {
      const nextZoom = clampImageZoom(Number((current + delta).toFixed(2)));
      setOffset((currentOffset) => boundedOffset(currentOffset, nextZoom));
      return nextZoom;
    });
  }

  function resetZoom() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function beginPan(event) {
    if (zoom <= 1 || (event.pointerType === 'mouse' && event.button !== 0)) return;
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
    setOffset(boundedOffset({
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY
    }));
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
          ref={canvasRef}
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
            ref={imageRef}
            src={image.imageUrl}
            alt={image.alt}
            draggable={false}
            className={panning ? 'panning' : ''}
            onLoad={() => setOffset((current) => boundedOffset(current, zoom))}
            style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})` }}
          />
        </div>
      </section>
    </div>
  );
}

function EcommerceVersionCenterModal({
  slot,
  versions,
  output,
  t,
  language,
  platformName,
  productName,
  project,
  assets,
  providerId,
  quality,
  actionState,
  onClose,
  onPreview,
  onSelect,
  onArchive,
  onLock,
  onCheck,
  onRevise
}) {
  const successfulVersions = versions.filter((item) => item.status === 'succeeded' && item.imageUrl);
  const [baseGenerationId, setBaseGenerationId] = useState(output?.selectedGenerationId || successfulVersions[0]?.id || '');
  const [adjustment, setAdjustment] = useState('');

  useEffect(() => {
    setBaseGenerationId(output?.selectedGenerationId || successfulVersions[0]?.id || '');
    setAdjustment('');
  }, [slot?.id, output?.selectedGenerationId]);

  const baseGeneration = versions.find((item) => item.id === baseGenerationId) || null;
  const revisionSize = slot ? resolveEcommerceRefinementSize(baseGeneration, slot) : '1024x1024';
  const referenceCount = countEcommerceReferenceImages({ project, slot, assets, baseGenerationId });
  const { pricing: revisionPricing, loading: revisionPricingLoading } = useServerImagePricing(
    { size: revisionSize, quality, providerId, referenceCount },
    { enabled: Boolean(slot) }
  );

  if (!slot) return null;
  const consistencyLabel = output?.consistencyStatus === 'passed'
    ? t.consistencyPassed
    : output?.consistencyStatus === 'warning'
      ? t.consistencyWarning
      : output?.consistencyStatus === 'failed'
        ? t.consistencyFailed
        : t.consistencyUnchecked;

  return (
    <div className="ecommerceVersionOverlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="ecommerceVersionDialog" role="dialog" aria-modal="true" aria-labelledby="ecommerce-version-title">
        <header className="ecommerceVersionHeader">
          <div>
            <small>{t.versionCenter}</small>
            <h3 id="ecommerce-version-title">{slot.name}</h3>
            <span>{slot.aspectRatio} · {slot.recommendedSize}</span>
          </div>
          <div>
            <button
              className={output?.locked ? 'locked' : ''}
              type="button"
              disabled={!output?.selectedGenerationId || actionState === 'lock'}
              onClick={() => onLock(!output?.locked)}
            >
              {actionState === 'lock' ? <LoaderCircle className="spin" size={16} /> : output?.locked ? <Unlock size={16} /> : <Lock size={16} />}
              {output?.locked ? t.unlockOutput : t.lockOutput}
            </button>
            <button className="close" type="button" onClick={onClose} aria-label={t.closePreview}><X size={19} /></button>
          </div>
        </header>

        <div className="ecommerceConsistencyBar">
          <span className={output?.consistencyStatus || 'unchecked'}>
            {output?.consistencyStatus === 'passed' ? <ShieldCheck size={17} /> : <ShieldAlert size={17} />}
            <strong>{consistencyLabel}</strong>
            {output?.consistencyScore != null ? <em>{output.consistencyScore}/100</em> : null}
          </span>
          {output?.consistencySummary ? <p>{output.consistencySummary}</p> : null}
          {output?.consistencyIssues?.length ? (
            <ul>{output.consistencyIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          ) : null}
          <button
            type="button"
            disabled={!output?.selectedGenerationId || actionState === 'check'}
            onClick={onCheck}
          >
            {actionState === 'check' ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}
            {actionState === 'check' ? t.consistencyChecking : t.consistencyCheck}
          </button>
        </div>

        <div className="ecommerceVersionGrid">
          {versions.length ? versions.map((version) => {
            const adopted = output?.selectedGenerationId === version.id;
            const busy = actionState === `select:${version.id}` || actionState === `archive:${version.id}`;
            return (
              <article className={`${adopted ? 'adopted' : ''} ${version.status}`} key={version.id}>
                <div className="ecommerceVersionImage">
                  {version.imageUrl ? (
                    <button type="button" onClick={() => onPreview(version)} aria-label={`${t.viewImage}: ${t.version(version.versionNumber)}`}>
                      <img src={version.imageUrl} alt={`${slot.name} ${t.version(version.versionNumber)}`} loading="lazy" />
                      <Maximize2 size={17} />
                    </button>
                  ) : <div><ShieldAlert size={22} /><span>{version.errorCode || version.status}</span></div>}
                  {adopted ? <em><Check size={12} /> {t.adoptedVersion}</em> : null}
                </div>
                <div className="ecommerceVersionMeta">
                  <strong>{t.version(version.versionNumber)}</strong>
                  <span>{version.quality} · {version.size}</span>
                  <time>{version.completedAt || version.createdAt}</time>
                </div>
                <div className="ecommerceVersionActions">
                  {version.status === 'succeeded' ? (
                    <button type="button" disabled={adopted || output?.locked || busy} onClick={() => onSelect(version.id)}>
                      {actionState === `select:${version.id}` ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}
                      {adopted ? t.adoptedVersion : t.adoptVersion}
                    </button>
                  ) : null}
                  <button className="danger" type="button" disabled={adopted || output?.locked || busy} onClick={() => onArchive(version.id)}>
                    {actionState === `archive:${version.id}` ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
                    {t.archiveVersion}
                  </button>
                  {version.imageUrl ? (
                    <a href={version.imageUrl} download={buildDownloadFilename({
                      productName,
                      slotName: slot.name,
                      platformName,
                      versionNumber: version.versionNumber,
                      language
                    })}><Download size={14} /> {t.downloadOutput}</a>
                  ) : null}
                </div>
              </article>
            );
          }) : <p className="ecommerceVersionEmpty">{t.noVersions}</p>}
        </div>

        <div className="ecommerceRevisionPanel">
          <div>
            <strong>{t.localRevision}</strong>
            <select value={baseGenerationId} onChange={(event) => setBaseGenerationId(event.target.value)} disabled={output?.locked}>
              {successfulVersions.map((version) => <option value={version.id} key={version.id}>{t.version(version.versionNumber)}</option>)}
            </select>
          </div>
          <textarea value={adjustment} onChange={(event) => setAdjustment(event.target.value)} placeholder={t.localRevisionPlaceholder} disabled={output?.locked} />
          <button
            type="button"
            disabled={output?.locked || revisionPricingLoading || !revisionPricing || !baseGenerationId || !adjustment.trim() || actionState === 'revise'}
            onClick={() => onRevise({ baseGenerationId, adjustment: adjustment.trim() })}
          >
            {actionState === 'revise' ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
            {t.createRevisionLabel} · <ImageCreditPrice pricing={revisionPricing} language={language} compact />
          </button>
          {output?.locked ? <p>{t.slotLocked}</p> : null}
        </div>
      </section>
    </div>
  );
}

function ecommerceGenerationFailureText(payload, t) {
  const code = payload?.error || payload;
  if (code === 'AI_PROVIDER_NOT_CONFIGURED' || code === 'INVALID_IMAGE_PROVIDER') return t.providerRequired;
  if (code === 'REFERENCE_IMAGES_UNSUPPORTED') return t.maiReferenceUnsupported;
  if (code === 'TOO_MANY_REFERENCE_IMAGES') return t.maiReferenceLimit;
  if (code === 'REFERENCE_IMAGE_TOO_LARGE') return t.referenceTooLarge;
  if (code === 'INVALID_REFERENCE_IMAGE_FORMAT') return t.maiReferenceFormat;
  if (code === 'IMAGE_PROVIDER_UNAVAILABLE') return t.providerUnavailable(payload?.providerName, payload?.providerModel);
  if (code === 'IMAGE_PROVIDER_AUTH_FAILED') return t.providerAuthFailed;
  if (code === 'IMAGE_PROVIDER_BALANCE_ERROR') return t.providerBalanceError;
  if (code === 'IMAGE_PROVIDER_TIMEOUT') return t.providerTimeout;
  if (code === 'UPSTREAM_BUSY') return t.providerBusy;
  if (code === 'SERVER_RESTARTED') return t.serverRestarted;
  if (code === 'GROUP_BUDGET_REQUIRED') return t.groupBudgetRequired;
  if (code === 'GROUP_BALANCE_REQUIRED') return t.groupBalanceRequired;
  if (code === 'GROUP_ACCESS_SUSPENDED') return t.groupAccessSuspended;
  return t.generationFailed;
}

export default function EcommerceWorkspace({
  language,
  session,
  profile,
  onSignIn,
  onBilling,
  onProfileChange,
  pendingEcommerceProjectId = '',
  onEcommerceProjectConsumed
}) {
  const t = copy[language] || copy.en;
  const signedIn = hasSession(session);
  const hasAccess = signedIn && Boolean(profile?.isSuperAdmin || Number(profile?.creditBalance || 0) > 0);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(() => createEmptyForm());
  const [status, setStatus] = useState('idle');
  const [imageProviders, setImageProviders] = useState([]);
  const [message, setMessage] = useState('');
  const [assets, setAssets] = useState([]);
  const [assetStatus, setAssetStatus] = useState('idle');
  const [assetFeedback, setAssetFeedback] = useState('');
  const [assetDragging, setAssetDragging] = useState(false);
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [generations, setGenerations] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [selectedProductionSlots, setSelectedProductionSlots] = useState([]);
  const [generationTasks, setGenerationTasks] = useState({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [generationMessage, setGenerationMessage] = useState('');
  const [taskStartedNotice, setTaskStartedNotice] = useState(null);
  const [openFieldHelp, setOpenFieldHelp] = useState('');
  const [aiBriefOriginals, setAiBriefOriginals] = useState({});
  const [aiBriefStatus, setAiBriefStatus] = useState('idle');
  const [identitySpecStatus, setIdentitySpecStatus] = useState('idle');
  const preferenceUserId = String(session?.user?.id || 'guest');
  const [projectListCollapsed, setProjectListCollapsed] = useState(() => readEcommerceProjectListCollapsed(preferenceUserId));
  const [collapsedSections, setCollapsedSections] = useState(() => getCollapsedSectionsForStage(0));
  const [selectedWorkflowStep, setSelectedWorkflowStep] = useState(0);
  const [hoveredWorkflowStep, setHoveredWorkflowStep] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [thumbnailHoverPreview, setThumbnailHoverPreview] = useState(null);
  const [versionCenterSlotId, setVersionCenterSlotId] = useState('');
  const [versionActionState, setVersionActionState] = useState('');
  const formRef = useRef(form);
  const aiBriefOriginalsRef = useRef(aiBriefOriginals);
  const lastSavedProjectFingerprintRef = useRef('');
  const saveInFlightRef = useRef(null);
  formRef.current = form;
  aiBriefOriginalsRef.current = aiBriefOriginals;
  const fileInputRef = useRef(null);
  const generationTasksRef = useRef(new Map());
  const automaticAnalysisRequestsRef = useRef(new Map());
  const taskStartedNoticeTimerRef = useRef(null);
  const sectionRefs = useRef({});
  const productNameInputRef = useRef(null);
  const industrySelectionModeRef = useRef('auto');
  const platform = useMemo(() => getEcommercePlatform(form.platformId), [form.platformId]);
  const industry = useMemo(
    () => ECOMMERCE_INDUSTRIES.find((item) => item.id === form.industryId) || ECOMMERCE_INDUSTRIES[0],
    [form.industryId]
  );
  const subcategories = useMemo(() => getEcommerceSubcategories(form.industryId), [form.industryId]);
  const recommendedVisualStyles = useMemo(() => getVisualStylesForIndustry(form.industryId), [form.industryId]);
  const providerCompatibilityById = useMemo(() => new Map(
    imageProviders.map((provider) => [provider.id, ecommerceProviderCompatibility(provider, assets)])
  ), [assets, imageProviders]);
  const selectedProviderCompatibility = providerCompatibilityById.get(form.imageProviderId)
    || { valid: false, error: 'AI_PROVIDER_NOT_CONFIGURED' };
  const selectedProviderCompatibilityMessage = ecommerceProviderCompatibilityText(selectedProviderCompatibility, t);
  const selectedImageProvider = imageProviders.find((provider) => provider.id === form.imageProviderId) || null;
  const selectedProviderSupportsQuality = isGptImageProvider(selectedImageProvider);
  const effectiveGenerationQuality = selectedProviderSupportsQuality
    ? normalizeEcommerceImageQuality(form.imageQuality)
    : 'medium';
  const linkedMediaAssetIds = useMemo(() => assets.map((asset) => asset.mediaAssetId).filter(Boolean), [assets]);
  const remainingProjectAssetSlots = Math.max(0, ECOMMERCE_PROJECT_ASSET_LIMIT - assets.length);

  useEffect(() => {
    setProjectListCollapsed(readEcommerceProjectListCollapsed(preferenceUserId));
  }, [preferenceUserId]);

  function updateProjectListCollapsed(collapsed) {
    const nextCollapsed = Boolean(collapsed);
    setProjectListCollapsed(nextCollapsed);
    writeEcommerceProjectListCollapsed(nextCollapsed, preferenceUserId);
  }

  useEffect(() => {
    fetch('/api/image-providers', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload?.ok) return;
        const nextProviders = orderImageProviders(payload.providers);
        setImageProviders(nextProviders);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!imageProviders.length) return;
    setForm((current) => {
      const resolvedProviderId = resolveImageProviderId(imageProviders, current.imageProviderId);
      return resolvedProviderId && resolvedProviderId !== current.imageProviderId
        ? { ...current, imageProviderId: resolvedProviderId }
        : current;
    });
  }, [imageProviders, form.id, form.imageProviderId]);

  useEffect(() => () => {
    if (taskStartedNoticeTimerRef.current) globalThis.clearTimeout?.(taskStartedNoticeTimerRef.current);
  }, []);
  const recommendedTemplates = useMemo(
    () => getEcommerceTemplates(form.platformId, form.industryId),
    [form.platformId, form.industryId]
  );
  const visualStyles = useMemo(() => {
    const selectedStyle = getEcommerceVisualStyle(form.visualStyleId);
    return recommendedVisualStyles.some((item) => item.id === selectedStyle.id)
      ? recommendedVisualStyles
      : [...recommendedVisualStyles, selectedStyle];
  }, [form.visualStyleId, recommendedVisualStyles]);
  const hasAdoptedOutput = outputs.some((output) => Boolean(output.selectedGenerationId));
  const projectSaveFingerprint = ecommerceProjectSaveFingerprint(form, aiBriefOriginals);
  const currentStage = !form.id
    ? 0
    : !form.masterAssetId
      ? 1
      : hasAdoptedOutput ? 4 : 2;
  const maxUnlockedStage = !form.id
    ? 0
    : !form.masterAssetId
      ? 1
      : hasAdoptedOutput ? 4 : 3;
  const activeWorkflowStep = hoveredWorkflowStep != null && hoveredWorkflowStep <= maxUnlockedStage
    ? hoveredWorkflowStep
    : Math.min(selectedWorkflowStep, maxUnlockedStage);

  useEffect(() => {
    if (hoveredWorkflowStep != null && hoveredWorkflowStep > maxUnlockedStage) setHoveredWorkflowStep(null);
    if (selectedWorkflowStep > maxUnlockedStage) setSelectedWorkflowStep(maxUnlockedStage);
  }, [hoveredWorkflowStep, maxUnlockedStage, selectedWorkflowStep]);

  useEffect(() => {
    setCollapsedSections((current) => Object.fromEntries(SECTION_KEYS.map((key) => [
      key,
      SECTION_WORKFLOW_STEP[key] > maxUnlockedStage ? true : current[key]
    ])));
  }, [maxUnlockedStage]);

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
    setAssetFeedback('');
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
    if (!signedIn || !form.id || collapsedSections.assets || assetLibraryOpen) return undefined;
    const handlePagePaste = (event) => {
      if (event.defaultPrevented || isTextEditingTarget(event.target)) return;
      handleAssetPaste(event);
    };
    globalThis.document?.addEventListener('paste', handlePagePaste);
    return () => globalThis.document?.removeEventListener('paste', handlePagePaste);
  }, [signedIn, form.id, collapsedSections.assets, assetLibraryOpen, assetStatus, assets.length]);

  useEffect(() => {
    if (!signedIn || !form.id) return undefined;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        await refreshProjectRuntime();
      } finally {
        refreshing = false;
      }
    };
    const timer = globalThis.setInterval?.(refresh, 1500);
    return () => globalThis.clearInterval?.(timer);
  }, [signedIn, form.id]);

  useEffect(() => {
    setSelectedProductionSlots([]);
    generationTasksRef.current.clear();
    setGenerationTasks({});
    setBatchRunning(false);
    setVersionCenterSlotId('');
  }, [form.id]);

  useEffect(() => {
    setSelectedProductionSlots((current) => current.filter((slotId) => form.selectedSlots.includes(slotId)));
  }, [form.selectedSlots]);

  useEffect(() => {
    const lockedSlots = new Set(outputs.filter((output) => output.locked).map((output) => output.slotId));
    if (!lockedSlots.size) return;
    setSelectedProductionSlots((current) => current.filter((slotId) => !lockedSlots.has(slotId)));
  }, [outputs]);

  useEffect(() => {
    let active = true;
    setGenerations([]);
    setOutputs([]);
    setGenerationMessage('');
    if (!signedIn || !form.id) return () => {
      active = false;
    };

    Promise.all([
      fetch(`/api/ecommerce/outputs?projectId=${encodeURIComponent(form.id)}`)
        .then((response) => response.json().then((payload) => ({ response, payload }))),
      fetch(`/api/ecommerce/tasks?projectId=${encodeURIComponent(form.id)}`)
        .then((response) => response.json().then((payload) => ({ response, payload })))
    ])
      .then(([outputResult, taskResult]) => {
        if (!active) return;
        if (outputResult.response.ok && outputResult.payload?.ok) {
          setGenerations(outputResult.payload.generations || []);
          setOutputs(outputResult.payload.outputs || []);
        }
        if (taskResult.response.ok && taskResult.payload?.ok) {
          const latestBySlot = new Map();
          for (const task of taskResult.payload.tasks || []) {
            if (!latestBySlot.has(task.slotId)) latestBySlot.set(task.slotId, { ...task, taskId: task.id });
          }
          generationTasksRef.current = latestBySlot;
          setGenerationTasks(Object.fromEntries(latestBySlot));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [signedIn, form.id]);

  function updateField(field, value) {
    setMessage('');
    const resetsAiContext = ['industryId', 'productName', 'brandName'].includes(field);
    if (resetsAiContext) {
      setAiBriefOriginals({});
      setAiBriefStatus('idle');
      setIdentitySpecStatus('idle');
    }
    setStatus('dirty');
    setForm((current) => {
      const next = {
        ...(resetsAiContext ? clearUneditedAiBrief(current, aiBriefOriginals) : current),
        [field]: value
      };
      if (field === 'productName' && !current.id && industrySelectionModeRef.current === 'auto') {
        const industryId = inferEcommerceIndustryId(value, next.brandName);
        const subcategoryId = inferEcommerceSubcategoryId(industryId, value, next.brandName);
        const plan = getDefaultEcommercePlan(next.platformId, industryId);
        return {
          ...next,
          industryId,
          subcategoryId,
          templateId: plan.templateId,
          visualStyleId: plan.visualStyleId,
          selectedSlots: plan.selectedSlotIds
        };
      }
      return next;
    });
  }

  function handleImageProviderChange(nextProviderId) {
    if (!nextProviderId || nextProviderId === formRef.current.imageProviderId) return;
    const provider = imageProviders.find((item) => item.id === nextProviderId);
    const compatibility = ecommerceProviderCompatibility(provider, assets);
    if (!compatibility.valid) {
      setGenerationMessage(ecommerceProviderCompatibilityText(compatibility, t));
      return;
    }
    setForm((current) => ({ ...current, imageProviderId: nextProviderId }));
    setStatus('dirty');
    setGenerationMessage('');
  }

  function updateIdentitySpec(field, value) {
    if (!IDENTITY_SPEC_FIELDS.includes(field)) return;
    setMessage('');
    setStatus('dirty');
    setForm((current) => ({
      ...current,
      identitySpec: { ...(current.identitySpec || {}), [field]: value }
    }));
  }

  async function handleAiBuildIdentitySpec() {
    if (!signedIn) {
      onSignIn?.();
      return;
    }
    if (!hasAccess) {
      if (profile?.groupAccount) setMessage(profile.groupAccount.role === 'member' ? t.groupBudgetRequired : t.groupBalanceRequired);
      else onBilling?.();
      return;
    }
    if (!form.id || !assets.some((asset) => asset.available !== false && asset.assetType === 'product')) {
      setMessage(t.identitySpecAssetsRequired);
      return;
    }
    if (!form.productName.trim()) {
      setMessage(t.productRequired);
      return;
    }

    setIdentitySpecStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/ecommerce/auto-fill-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focus: 'identitySpec',
          language,
          projectId: form.id,
          industryId: form.industryId,
          productName: form.productName,
          brandName: form.brandName,
          currentBrief: {
            coreUser: form.coreUser,
            coreScenario: form.coreScenario,
            sellingPoints: form.sellingPoints,
            identitySpec: form.identitySpec
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.user) onProfileChange?.(payload.user);
      if (payload.error === 'CREDITS_REQUIRED') onBilling?.();
      if (!response.ok || !payload?.ok || !payload.brief) throw new Error(payload?.error || 'IDENTITY_SPEC_FAILED');
      const normalizedBrief = normalizeEcommerceAiBrief(payload.brief, { language });
      if (!normalizedBrief?.identitySpec || !Object.keys(normalizedBrief.identitySpec).length) {
        throw new Error('IDENTITY_SPEC_INCOMPLETE');
      }

      const currentForm = formRef.current;
      const currentOriginals = normalizeAiBriefOriginals(aiBriefOriginalsRef.current);
      const merged = mergeRefreshedAiIdentitySpec(
        currentForm.identitySpec,
        normalizedBrief.identitySpec,
        currentOriginals.identitySpec
      );
      setForm({ ...currentForm, identitySpec: merged.identitySpec });
      setAiBriefOriginals({ ...currentOriginals, identitySpec: merged.aiOriginals });
      setStatus('dirty');
      setIdentitySpecStatus('success');
      setMessage(merged.replacedFields.length ? t.identitySpecUpdated : t.identitySpecManualPreserved);
    } catch {
      setIdentitySpecStatus('error');
      setMessage(t.identitySpecFailed);
    }
  }

  function applyTemplate(templateId) {
    const template = getEcommerceTemplate(templateId);
    if (!template || template.platformId !== form.platformId) return;
    const validSlotIds = new Set(platform.slots.map((item) => item.id));
    setForm((current) => ({
      ...current,
      templateId: template.id,
      visualStyleId: template.visualStyleId,
      selectedSlots: template.selectedSlotIds.filter((slotId) => validSlotIds.has(slotId))
    }));
    setStatus('dirty');
  }

  function selectPlatform(platformId) {
    setMessage('');
    setStatus('dirty');
    setForm((current) => {
      const plan = getDefaultEcommercePlan(platformId, current.industryId);
      return {
        ...current,
        platformId,
        templateId: plan.templateId,
        visualStyleId: plan.visualStyleId,
        selectedSlots: plan.selectedSlotIds
      };
    });
  }

  function selectIndustry(industryId) {
    industrySelectionModeRef.current = 'manual';
    const plan = getDefaultEcommercePlan(form.platformId, industryId);
    const subcategoryId = inferEcommerceSubcategoryId(industryId, form.productName, form.brandName);
    setMessage('');
    setAiBriefOriginals({});
    setAiBriefStatus('idle');
    setIdentitySpecStatus('idle');
    setStatus('dirty');
    setForm((current) => ({
      ...clearUneditedAiBrief(current, aiBriefOriginals),
      industryId,
      subcategoryId,
      templateId: plan.templateId,
      visualStyleId: plan.visualStyleId,
      selectedSlots: plan.selectedSlotIds
    }));
  }

  function selectSubcategory(subcategoryId) {
    industrySelectionModeRef.current = 'manual';
    setMessage('');
    setStatus('dirty');
    setForm((current) => ({ ...current, subcategoryId }));
  }

  function toggleSlot(slotId) {
    setStatus('dirty');
    setForm((current) => {
      const selected = new Set(current.selectedSlots);
      if (selected.has(slotId)) selected.delete(slotId);
      else selected.add(slotId);
      return { ...current, selectedSlots: [...selected] };
    });
  }

  function toggleSection(sectionKey) {
    if (!SECTION_KEYS.includes(sectionKey)) return;
    const step = SECTION_WORKFLOW_STEP[sectionKey];
    if (step > maxUnlockedStage) {
      setMessage(t.lockedStage);
      return;
    }
    if (collapsedSections[sectionKey]) setSelectedWorkflowStep(step);
    setCollapsedSections((current) => ({ ...current, [sectionKey]: !current[sectionKey] }));
  }

  function sectionInteractionProps(sectionKey) {
    const step = SECTION_WORKFLOW_STEP[sectionKey];
    const available = step <= maxUnlockedStage;
    return {
      ref: (node) => {
        if (node) sectionRefs.current[sectionKey] = node;
        else delete sectionRefs.current[sectionKey];
      },
      onMouseEnter: () => {
        if (available) setHoveredWorkflowStep(step);
      },
      onMouseLeave: () => setHoveredWorkflowStep((current) => current === step ? null : current),
      onFocusCapture: () => {
        if (available) setHoveredWorkflowStep(step);
      },
      onBlurCapture: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHoveredWorkflowStep((current) => current === step ? null : current);
        }
      },
      'data-workflow-step': step,
      'data-workflow-locked': available ? undefined : 'true'
    };
  }

  function navigateToWorkflowStep(step) {
    if (step > maxUnlockedStage) {
      setMessage(t.lockedStage);
      return;
    }
    if (step === 0) {
      setSelectedWorkflowStep(0);
      setHoveredWorkflowStep(0);
      setCollapsedSections((current) => ({ ...current, brief: false }));
      globalThis.requestAnimationFrame?.(() => {
        productNameInputRef.current?.focus({ preventScroll: true });
        sectionRefs.current.start?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    const sectionKeys = WORKFLOW_SECTIONS[step] || [];
    const sectionKey = sectionKeys[0];
    setCollapsedSections((current) => ({
      ...current,
      ...Object.fromEntries(sectionKeys.map((key) => [key, false]))
    }));
    setSelectedWorkflowStep(step);
    setHoveredWorkflowStep(step);
    globalThis.requestAnimationFrame?.(() => sectionRefs.current[sectionKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function startNewProject() {
    industrySelectionModeRef.current = 'auto';
    lastSavedProjectFingerprintRef.current = '';
    setForm({
      ...createEmptyForm(),
      imageProviderId: resolveImageProviderId(imageProviders)
    });
    setMessage('');
    setStatus('idle');
    setAssets([]);
    setAiBriefOriginals({});
    setAiBriefStatus('idle');
    setIdentitySpecStatus('idle');
    setCollapsedSections(getCollapsedSectionsForStage(0));
    setSelectedWorkflowStep(0);
    setHoveredWorkflowStep(null);
    setPreviewImage(null);
    globalThis.requestAnimationFrame?.(() => {
      productNameInputRef.current?.focus({ preventScroll: true });
      sectionRefs.current.start?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function openProject(project) {
    industrySelectionModeRef.current = 'manual';
    const nextForm = projectToForm(project);
    const resolvedForm = {
      ...nextForm,
      imageProviderId: resolveImageProviderId(imageProviders, nextForm.imageProviderId)
    };
    const originals = normalizeAiBriefOriginals(project.aiBriefOriginals);
    lastSavedProjectFingerprintRef.current = ecommerceProjectSaveFingerprint(nextForm, originals);
    setForm(resolvedForm);
    setMessage('');
    setStatus('saved');
    setAiBriefOriginals(originals);
    setAiBriefStatus(Object.keys(originals).length ? 'success' : 'idle');
    setIdentitySpecStatus('idle');
    const initialStep = project.masterAssetId ? 2 : 1;
    setCollapsedSections(getCollapsedSectionsForStage(initialStep));
    setSelectedWorkflowStep(initialStep);
    setPreviewImage(null);
  }

  useEffect(() => {
    if (!pendingEcommerceProjectId || !projects.length) return;
    const project = projects.find((item) => item.id === pendingEcommerceProjectId);
    if (!project) return;
    openProject(project);
    setCollapsedSections((current) => ({ ...current, assets: false }));
    setSelectedWorkflowStep(1);
    globalThis.requestAnimationFrame?.(() => sectionRefs.current.assets?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    onEcommerceProjectConsumed?.();
  }, [pendingEcommerceProjectId, projects]);

  async function handleDeleteProject(event, project) {
    event.stopPropagation();
    const label = project.projectName || project.productName;
    if (!globalThis.confirm?.(language === 'zh' ? `确定删除项目“${label}”？` : `Delete project "${label}"?`)) return;
    const response = await fetch(`/api/ecommerce/projects?id=${encodeURIComponent(project.id)}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) return setMessage(language === 'zh' ? '项目删除失败' : 'Project deletion failed');
    const remaining = projects.filter((item) => item.id !== project.id);
    setProjects(remaining);
    if (form.id === project.id) remaining[0] ? openProject(remaining[0]) : startNewProject();
  }

  async function saveCurrentProject({ focusOnError = true } = {}) {
    let currentForm = formRef.current;
    if (!signedIn) {
      onSignIn?.();
      return null;
    }
    if (!currentForm.productName.trim()) {
      if (focusOnError) {
        setMessage(t.productRequired);
        productNameInputRef.current?.focus({ preventScroll: true });
      }
      return null;
    }

    const activeSave = saveInFlightRef.current;
    if (activeSave) {
      try {
        await activeSave;
      } catch {
        // The latest draft is retried below.
      }
      if (saveInFlightRef.current === activeSave) saveInFlightRef.current = null;
      currentForm = formRef.current;
      const latestFingerprint = ecommerceProjectSaveFingerprint(currentForm, aiBriefOriginalsRef.current);
      if (currentForm.id && latestFingerprint === lastSavedProjectFingerprintRef.current) return currentForm;
      return saveCurrentProject({ focusOnError });
    }

    const originalSnapshot = normalizeAiBriefOriginals(aiBriefOriginalsRef.current);
    const requestFingerprint = ecommerceProjectSaveFingerprint(currentForm, originalSnapshot);
    if (currentForm.id && requestFingerprint === lastSavedProjectFingerprintRef.current) {
      setStatus('saved');
      return currentForm;
    }

    setStatus('saving');
    const saveRequest = (async () => {
      const response = await fetch('/api/ecommerce/projects', {
        method: currentForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ecommerceProjectSavePayload(currentForm, originalSnapshot))
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.project) throw new Error(payload?.error || 'SAVE_FAILED');
      return payload.project;
    })();
    saveInFlightRef.current = saveRequest;

    try {
      const savedProject = await saveRequest;
      const savedOriginals = normalizeAiBriefOriginals(savedProject.aiBriefOriginals || originalSnapshot);
      const savedForm = projectToForm(savedProject);
      const savedFingerprint = ecommerceProjectSaveFingerprint(savedForm, savedOriginals);
      lastSavedProjectFingerprintRef.current = savedFingerprint;
      setProjects((current) => [savedProject, ...current.filter((item) => item.id !== savedProject.id)]);

      const latestForm = formRef.current;
      const latestOriginals = normalizeAiBriefOriginals(aiBriefOriginalsRef.current);
      const latestFingerprint = ecommerceProjectSaveFingerprint(latestForm, latestOriginals);
      const hasNewerDraft = latestFingerprint !== requestFingerprint;
      const nextForm = hasNewerDraft
        ? {
          ...latestForm,
          id: savedProject.id,
          projectName: latestForm.projectName || savedProject.projectName,
          userId: savedProject.userId,
          createdAt: savedProject.createdAt
        }
        : savedForm;
      if (!hasNewerDraft) {
        setAiBriefOriginals(savedOriginals);
        aiBriefOriginalsRef.current = savedOriginals;
      }
      formRef.current = nextForm;
      setForm(nextForm);
      const pendingNewerDraft = ecommerceProjectSaveFingerprint(nextForm, aiBriefOriginalsRef.current) !== savedFingerprint;
      setStatus(pendingNewerDraft ? 'dirty' : 'saved');
      setMessage('');
      if (assets.some((asset) => asset.available !== false && asset.assetType === 'product')) {
        void requestAutomaticProductAnalysis(savedProject.id);
      }
      return nextForm;
    } catch {
      setStatus('error');
      setMessage(t.saveFailed);
      return null;
    } finally {
      if (saveInFlightRef.current === saveRequest) saveInFlightRef.current = null;
    }
  }

  useEffect(() => {
    if (!signedIn || !form.productName.trim()) return undefined;
    if (projectSaveFingerprint === lastSavedProjectFingerprintRef.current) return undefined;
    setStatus((current) => current === 'saving' ? current : 'dirty');
    const timer = globalThis.setTimeout?.(() => {
      void saveCurrentProject({ focusOnError: false });
    }, 650);
    return () => globalThis.clearTimeout?.(timer);
  }, [signedIn, projectSaveFingerprint]);

  async function handleContinueToAssets() {
    if (!signedIn) {
      onSignIn?.();
      return;
    }
    const project = await saveCurrentProject();
    if (!project) return;
    setCollapsedSections((current) => ({ ...current, brief: true, assets: false }));
    setSelectedWorkflowStep(1);
    setHoveredWorkflowStep(1);
    globalThis.requestAnimationFrame?.(() => sectionRefs.current.assets?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function handleContinueToPlan() {
    if (!formRef.current.masterAssetId) return;
    setCollapsedSections((current) => ({ ...current, assets: true, visual: false, outputs: false }));
    setSelectedWorkflowStep(2);
    setHoveredWorkflowStep(2);
    globalThis.requestAnimationFrame?.(() => sectionRefs.current.visual?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
      if (profile?.groupAccount) setMessage(profile.groupAccount.role === 'member' ? t.groupBudgetRequired : t.groupBalanceRequired);
      else onBilling?.();
      return;
    }
    if (!form.productName.trim()) {
      setAiBriefStatus('error');
      setMessage(t.productRequired);
      globalThis.document?.getElementById('ecommerce-product-name')?.focus();
      return;
    }
    const hasBlankAiField = ['coreUser', 'coreScenario', 'sellingPoints'].some((field) => !String(form[field] || '').trim());
    if (!hasBlankAiField) {
      setAiBriefStatus('success');
      return;
    }

    setAiBriefStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/ecommerce/auto-fill-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focus: 'brief',
          language,
          projectId: form.id,
          industryId: form.industryId,
          productName: form.productName,
          brandName: form.brandName,
          currentBrief: {
            coreUser: form.coreUser,
            coreScenario: form.coreScenario,
            sellingPoints: form.sellingPoints,
            identitySpec: form.identitySpec
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.user) onProfileChange?.(payload.user);
      if (payload.error === 'CREDITS_REQUIRED') onBilling?.();
      if (!response.ok || !payload?.ok || !payload.brief) throw new Error(payload?.error || 'AI_BRIEF_FAILED');
      const normalizedBrief = normalizeEcommerceAiBrief(payload.brief, { language });
      if (!normalizedBrief) throw new Error('AI_BRIEF_INCOMPLETE');
      const generatedBrief = {
        coreUser: normalizedBrief.coreUser,
        coreScenario: normalizedBrief.coreScenario,
        sellingPoints: normalizedBrief.sellingPoints
      };
      if ([generatedBrief.coreUser, generatedBrief.coreScenario, generatedBrief.sellingPoints].some((value) => !String(value || '').trim())) {
        throw new Error('AI_BRIEF_INCOMPLETE');
      }
      const currentForm = formRef.current;
      const nextForm = { ...currentForm };
      const nextOriginals = normalizeAiBriefOriginals(aiBriefOriginalsRef.current);
      for (const field of ['coreUser', 'coreScenario', 'sellingPoints']) {
        if (!String(currentForm[field] || '').trim() && String(generatedBrief[field] || '').trim()) {
          nextForm[field] = generatedBrief[field];
          nextOriginals[field] = generatedBrief[field];
        }
      }
      setAiBriefOriginals(nextOriginals);
      setForm(nextForm);
      setStatus('dirty');
      setAiBriefStatus('success');
    } catch {
      setAiBriefStatus('error');
      setMessage(t.aiBriefFailed);
    }
  }

  function requestAutomaticProductAnalysis(projectId = formRef.current.id) {
    if (!signedIn || !projectId) return Promise.resolve(null);
    const activeRequest = automaticAnalysisRequestsRef.current.get(projectId);
    if (activeRequest) return activeRequest;
    const request = fetch('/api/ecommerce/auto-fill-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automatic: true, language, projectId })
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok || !payload.project) return null;
        const analyzedProject = payload.project;
        setForm((current) => current.id === analyzedProject.id ? {
          ...current,
          coreUser: analyzedProject.coreUser || '',
          coreScenario: analyzedProject.coreScenario || '',
          targetAudience: analyzedProject.targetAudience || '',
          sellingPoints: (analyzedProject.sellingPoints || []).join('\n'),
          identitySpec: { ...(analyzedProject.identitySpec || {}) }
        } : current);
        setAiBriefOriginals(normalizeAiBriefOriginals(analyzedProject.aiBriefOriginals));
        setProjects((current) => current.map((item) => item.id === analyzedProject.id ? analyzedProject : item));
        return analyzedProject;
      })
      .catch(() => null)
      .finally(() => automaticAnalysisRequestsRef.current.delete(projectId));
    automaticAnalysisRequestsRef.current.set(projectId, request);
    return request;
  }

  async function uploadProjectAssets(inputFiles, uploadType = '', purpose = '') {
    const incomingFiles = [...(inputFiles || [])];
    const remainingSlots = Math.max(0, ECOMMERCE_PROJECT_ASSET_LIMIT - assets.length);
    const files = incomingFiles.slice(0, remainingSlots);
    if (!incomingFiles.length || !form.id || !signedIn) return [];
    if (!remainingSlots) {
      setAssetStatus('error');
      setAssetFeedback(t.assetCountLimit);
      return [];
    }
    setAssetStatus('uploading');
    setAssetFeedback(incomingFiles.length > remainingSlots ? t.assetCountLimit : '');
    let failed = false;
    let failureMessage = incomingFiles.length > remainingSlots ? t.assetCountLimit : '';
    const uploaded = [];
    for (const file of files) {
      if (!isSupportedEcommerceAssetMimeType(file.type)) {
        failed = true;
        failureMessage ||= t.uploadFailed;
        continue;
      }
      if (file.size > ECOMMERCE_PROJECT_ASSET_MAX_BYTES) {
        failed = true;
        failureMessage = t.assetTooLarge;
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const resolvedUploadType = uploadType || inferEcommerceAssetType(file.name);
        const response = await fetch('/api/ecommerce/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: form.id, assetType: resolvedUploadType, purpose, fileName: file.name, dataUrl })
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
        failureMessage ||= t.uploadFailed;
      }
    }
    if (uploaded.length) {
      setAssets((current) => [...current, ...uploaded].sort((a, b) => a.sortOrder - b.sortOrder));
      setIdentitySpecStatus('idle');
      void requestAutomaticProductAnalysis(form.id);
    }
    setAssetStatus(failed ? 'error' : 'idle');
    setAssetFeedback(failureMessage);
    return uploaded;
  }

  async function handleAssetFiles(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    await uploadProjectAssets(files);
  }

  function handleAssetPaste(event) {
    if (!form.id || !signedIn || assetStatus === 'uploading') return;
    const files = pastedImageFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    void uploadProjectAssets(files);
  }

  async function handlePasteImages() {
    if (!form.id || !signedIn || assetStatus === 'uploading') return;
    if (!globalThis.navigator?.clipboard?.read) {
      setAssetStatus('error');
      setAssetFeedback(t.pasteUnavailable);
      return;
    }
    try {
      const clipboardItems = await globalThis.navigator.clipboard.read();
      const files = [];
      for (const item of clipboardItems) {
        const mimeType = item.types.find((type) => ECOMMERCE_PROJECT_ASSET_MIME_TYPES.includes(type));
        if (!mimeType) continue;
        files.push(clipboardImageFile(await item.getType(mimeType), files.length));
      }
      if (!files.length) {
        setAssetStatus('error');
        setAssetFeedback(t.pasteEmpty);
        return;
      }
      await uploadProjectAssets(files);
    } catch {
      setAssetStatus('error');
      setAssetFeedback(t.pasteUnavailable);
    }
  }

  function handleAssetDrop(event) {
    event.preventDefault();
    setAssetDragging(false);
    if (!form.id || !signedIn || assetStatus === 'uploading') return;
    const files = Array.from(event.dataTransfer?.files || []).filter((file) => String(file.type || '').startsWith('image/'));
    if (files.length) void uploadProjectAssets(files);
  }

  async function handleLibraryAssets(assetIds) {
    const ids = [...new Set((assetIds || []).filter(Boolean))].slice(0, remainingProjectAssetSlots);
    if (!form.id || !ids.length) return;
    setAssetStatus('updating');
    setAssetFeedback('');
    let failed = false;
    let failureMessage = '';
    for (const assetId of ids) {
      try {
        const response = await fetch('/api/assets/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetId,
            projectId: form.id,
            assetType: 'product',
            role: 'product'
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok) {
          const error = new Error(payload?.error || 'ASSET_PROJECT_LINK_FAILED');
          error.code = payload?.error || '';
          throw error;
        }
      } catch (error) {
        failed = true;
        failureMessage = error?.code === 'ASSET_TOO_LARGE'
          ? t.assetTooLarge
          : error?.code === 'ASSET_LIMIT_REACHED'
            ? t.assetCountLimit
            : t.assetLibraryLinkFailed;
      }
    }
    try {
      const response = await fetch(`/api/ecommerce/assets?projectId=${encodeURIComponent(form.id)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'ASSET_LOAD_FAILED');
      setAssets(payload.assets || []);
      setForm((current) => ({ ...current, masterAssetId: payload.masterAssetId || '' }));
      setProjects((current) => current.map((project) => project.id === form.id
        ? { ...project, masterAssetId: payload.masterAssetId || '' }
        : project));
      setIdentitySpecStatus('idle');
      if ((payload.assets || []).some((asset) => asset.available !== false && asset.assetType === 'product')) {
        void requestAutomaticProductAnalysis(form.id);
      }
    } catch {
      failed = true;
    }
    setAssetStatus(failed ? 'error' : 'idle');
    if (failed) {
      setAssetFeedback(failureMessage || t.assetLibraryLinkFailed);
      throw new Error('ASSET_LIBRARY_LINK_FAILED');
    }
  }

  async function handleRefinementAssetFiles(files) {
    return uploadProjectAssets(files, 'reference', 'detail');
  }

  async function handleDeleteAsset(assetId) {
    if (!signedIn || assetStatus === 'uploading') return;
    setThumbnailHoverPreview(null);
    setAssetStatus('deleting');
    try {
      const response = await fetch(`/api/ecommerce/assets?id=${encodeURIComponent(assetId)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'DELETE_FAILED');
      setAssets(payload.assets || []);
      setIdentitySpecStatus('idle');
      const masterAssetId = payload.masterAssetId || payload.project?.masterAssetId || '';
      setForm((current) => ({ ...current, masterAssetId }));
      setProjects((current) => current.map((item) => item.id === form.id ? { ...item, masterAssetId } : item));
      setAssetStatus('idle');
      if ((payload.assets || []).some((asset) => asset.available !== false && asset.assetType === 'product')) {
        void requestAutomaticProductAnalysis(form.id);
      }
    } catch {
      setAssetStatus('error');
    }
  }

  async function handleSetMaster(assetId) {
    if (!signedIn || !form.id || assetStatus === 'uploading') return;
    setAssetStatus('updating');
    try {
      const response = await fetch('/api/ecommerce/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-master', projectId: form.id, assetId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.project) throw new Error(payload?.error || 'MASTER_UPDATE_FAILED');
      setAssets(payload.assets || []);
      setForm((current) => ({ ...current, masterAssetId: payload.project.masterAssetId || '' }));
      setProjects((current) => current.map((item) => item.id === payload.project.id ? payload.project : item));
      setIdentitySpecStatus('idle');
      setAssetStatus('idle');
      void requestAutomaticProductAnalysis(payload.project.id);
    } catch {
      setAssetStatus('error');
    }
  }

  async function handleAssetPurpose(assetId, purpose) {
    if (!signedIn || !form.id || assetStatus === 'uploading') return;
    setAssetStatus('updating');
    try {
      const response = await fetch('/api/ecommerce/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purpose', projectId: form.id, assetId, purpose })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'ASSET_UPDATE_FAILED');
      setAssets(payload.assets || []);
      setIdentitySpecStatus('idle');
      setAssetStatus('idle');
    } catch {
      setAssetStatus('error');
    }
  }

  async function moveAsset(assetId, direction) {
    const currentIndex = assets.findIndex((item) => item.id === assetId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= assets.length || !form.id) return;
    const nextAssets = [...assets];
    [nextAssets[currentIndex], nextAssets[nextIndex]] = [nextAssets[nextIndex], nextAssets[currentIndex]];
    setAssets(nextAssets.map((item, index) => ({ ...item, sortOrder: index + 1 })));
    try {
      const response = await fetch('/api/ecommerce/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', projectId: form.id, assetIds: nextAssets.map((item) => item.id) })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'ASSET_REORDER_FAILED');
      setAssets(payload.assets || nextAssets);
    } catch {
      setAssets(assets);
      setAssetStatus('error');
    }
  }

  function createGenerationTaskId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function showTaskStartedNotice(count) {
    if (taskStartedNoticeTimerRef.current) globalThis.clearTimeout?.(taskStartedNoticeTimerRef.current);
    setTaskStartedNotice({ count });
    taskStartedNoticeTimerRef.current = globalThis.setTimeout?.(() => {
      setTaskStartedNotice(null);
      taskStartedNoticeTimerRef.current = null;
    }, 5000);
  }

  function dismissTaskStartedNotice() {
    if (taskStartedNoticeTimerRef.current) globalThis.clearTimeout?.(taskStartedNoticeTimerRef.current);
    taskStartedNoticeTimerRef.current = null;
    setTaskStartedNotice(null);
  }

  function updateGenerationTask(slotId, task) {
    if (task) generationTasksRef.current.set(slotId, task);
    else generationTasksRef.current.delete(slotId);
    setGenerationTasks(Object.fromEntries(generationTasksRef.current));
  }

  function toggleProductionSlot(slotId) {
    if (outputs.find((item) => item.slotId === slotId)?.locked) return;
    setSelectedProductionSlots((current) => current.includes(slotId)
      ? current.filter((item) => item !== slotId)
      : [...current, slotId]);
  }

  async function refreshProjectRuntime() {
    if (!form.id) return;
    const [outputResponse, taskResponse] = await Promise.all([
      fetch(`/api/ecommerce/outputs?projectId=${encodeURIComponent(form.id)}`),
      fetch(`/api/ecommerce/tasks?projectId=${encodeURIComponent(form.id)}`)
    ]);
    const [outputPayload, taskPayload] = await Promise.all([
      outputResponse.json().catch(() => ({})),
      taskResponse.json().catch(() => ({}))
    ]);
    if (outputResponse.ok && outputPayload?.ok) {
      setGenerations(outputPayload.generations || []);
      setOutputs(outputPayload.outputs || []);
    }
    if (taskResponse.ok && taskPayload?.ok) {
      const latestBySlot = new Map();
      for (const task of taskPayload.tasks || []) {
        if (!latestBySlot.has(task.slotId)) latestBySlot.set(task.slotId, { ...task, taskId: task.id });
      }
      generationTasksRef.current = latestBySlot;
      setGenerationTasks(Object.fromEntries(latestBySlot));
    }
  }

  async function createServerTasks(requests, project = formRef.current) {
    await requestAutomaticProductAnalysis(project.id);
    const response = await fetch('/api/ecommerce/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, providerId: project.imageProviderId, requests })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok || !payload.tasks?.length) {
      if (payload.error === 'SLOT_LOCKED') setGenerationMessage(t.slotLocked);
      if (payload.error === 'TASK_ALREADY_ACTIVE') {
        await refreshProjectRuntime();
        setGenerationMessage(t.taskAlreadyActive);
      }
      if (!['SLOT_LOCKED', 'TASK_ALREADY_ACTIVE'].includes(payload.error)) {
        setGenerationMessage(ecommerceGenerationFailureText(payload, t));
      }
      const error = new Error(payload.error || 'TASK_CREATE_FAILED');
      error.payload = payload;
      throw error;
    }
    for (const task of payload.tasks) updateGenerationTask(task.slotId, { ...task, taskId: task.id });
    return payload.tasks;
  }

  async function runSlotGeneration(slotId, taskId = '', request = {}) {
    if (!hasAccess) {
      if (profile?.groupAccount) setGenerationMessage(profile.groupAccount.role === 'member' ? t.groupBudgetRequired : t.groupBalanceRequired);
      else onBilling?.();
      return false;
    }
    if (!form.masterAssetId) {
      setGenerationMessage(t.masterRequired);
      return false;
    }
    if (!selectedProviderCompatibility.valid) {
      setGenerationMessage(selectedProviderCompatibilityMessage);
      return false;
    }
    let project = formRef.current;
    if (!project.id || ecommerceProjectSaveFingerprint(project, aiBriefOriginalsRef.current) !== lastSavedProjectFingerprintRef.current) {
      project = await saveCurrentProject();
      if (!project) return false;
    }
    const output = outputs.find((item) => item.slotId === slotId);
    if (output?.locked) {
      setGenerationMessage(t.slotLocked);
      return false;
    }
    const catalogSlot = platform.slots.find((item) => item.id === slotId);
    const referenceCount = countEcommerceReferenceImages({
      project,
      slot: catalogSlot,
      assets,
      baseGenerationId: request.baseGenerationId || '',
      referenceInputs: request.referenceInputs || []
    });
    const baseGeneration = request.baseGenerationId
      ? generations.find((generation) => generation.id === request.baseGenerationId)
      : null;
    const pricingSize = catalogSlot
      ? request.baseGenerationId
        ? resolveEcommerceRefinementSize(baseGeneration, catalogSlot)
        : resolveEcommerceSlotGenerationSize(catalogSlot)
      : '1024x1024';
    let confirmedPricing;
    try {
      confirmedPricing = await requestImagePricing({
        size: pricingSize,
        quality: effectiveGenerationQuality,
        providerId: project.imageProviderId,
        referenceCount
      });
    } catch (error) {
      setGenerationMessage(ecommerceGenerationFailureText(error?.message, t));
      return false;
    }
    const requiredCredits = Number(confirmedPricing.credits || 0);
    if (!profile?.isSuperAdmin && Number(profile?.creditBalance || 0) < requiredCredits) {
      setGenerationMessage(profile?.groupAccount?.role === 'member'
        ? t.groupBudgetRequired
        : profile?.groupAccount?.role === 'admin'
          ? t.groupBalanceRequired
          : t.insufficientBatchCredits(requiredCredits, Number(profile?.creditBalance || 0)));
      if (!profile?.groupAccount) onBilling?.();
      return false;
    }

    let serverTask = taskId ? generationTasksRef.current.get(slotId) : null;
    try {
      if (!taskId) {
        [serverTask] = await createServerTasks([{
          id: createGenerationTaskId(),
          slotId,
          quality: effectiveGenerationQuality,
          adjustment: request.adjustment || '',
          baseGenerationId: request.baseGenerationId || '',
          targetArea: request.targetArea || 'auto',
          referenceInputs: request.referenceInputs || []
        }], project);
        taskId = serverTask.id;
      }
    } catch (error) {
      if (!['TASK_ALREADY_ACTIVE', 'SLOT_LOCKED'].includes(error?.message)) {
        setGenerationMessage(ecommerceGenerationFailureText(error?.payload || error?.message, t));
      }
      return false;
    }
    const queuedTask = generationTasksRef.current.get(slotId);
    if (queuedTask && queuedTask.taskId !== taskId) return false;
    updateGenerationTask(slotId, { ...(serverTask || queuedTask), taskId, status: 'queued' });
    setGenerationMessage('');
    return true;
  }

  async function handleCancelGeneration(slotId) {
    const task = generationTasksRef.current.get(slotId);
    if (!task) return;
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
      if (payload.task) updateGenerationTask(slotId, { ...payload.task, taskId: payload.task.id });
      if (!['cancelled', 'failed', 'interrupted'].includes(payload.task?.status)) {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
          const taskResponse = await fetch(`/api/ecommerce/tasks?projectId=${encodeURIComponent(form.id)}`, { cache: 'no-store' });
          const taskPayload = await taskResponse.json().catch(() => ({}));
          if (!taskResponse.ok || !taskPayload?.ok) continue;
          const currentTask = (taskPayload.tasks || []).find((item) => item.id === task.taskId);
          if (!currentTask) break;
          updateGenerationTask(slotId, { ...currentTask, taskId: currentTask.id });
          if (['cancelled', 'failed', 'interrupted'].includes(currentTask.status)) break;
        }
      }
    } catch {
      await refreshProjectRuntime().catch(() => undefined);
      setGenerationMessage(t.generationFailed);
    }
  }

  async function handleRetryTask(slotId) {
    const task = generationTasksRef.current.get(slotId);
    if (!task?.taskId) return runSlotGeneration(slotId);
    try {
      const response = await fetch('/api/ecommerce/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', taskId: task.taskId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.task) throw new Error(payload.error || 'TASK_RETRY_FAILED');
      updateGenerationTask(slotId, { ...payload.task, taskId: payload.task.id });
      return true;
    } catch (error) {
      setGenerationMessage(ecommerceGenerationFailureText(error?.message, t));
      return false;
    }
  }

  async function handleGenerateSelected({
    project = formRef.current,
    requestedSlotIds = selectedProductionSlots
  } = {}) {
    dismissTaskStartedNotice();
    if (!project.id || ecommerceProjectSaveFingerprint(project, aiBriefOriginalsRef.current) !== lastSavedProjectFingerprintRef.current) {
      project = await saveCurrentProject();
      if (!project) return;
    }
    const slotIds = requestedSlotIds.filter((slotId) => (
      project.selectedSlots.includes(slotId) && !outputs.find((item) => item.slotId === slotId)?.locked
    ));
    if (!slotIds.length) {
      setGenerationMessage(t.selectAtLeastOne);
      return;
    }
    if (!project.masterAssetId) {
      setGenerationMessage(t.masterRequired);
      return;
    }
    if (!selectedProviderCompatibility.valid) {
      setGenerationMessage(selectedProviderCompatibilityMessage);
      return;
    }
    let pricingQuotes;
    try {
      pricingQuotes = await requestImagePricingBatch(slotIds.map((slotId) => {
        const slot = platform.slots.find((item) => item.id === slotId);
        const referenceCount = countEcommerceReferenceImages({ project, slot, assets });
        return slot
          ? { key: slotId, size: resolveEcommerceSlotGenerationSize(slot), quality: effectiveGenerationQuality, providerId: project.imageProviderId, referenceCount }
          : { key: slotId, size: '1024x1024', quality: effectiveGenerationQuality, providerId: project.imageProviderId, referenceCount };
      }));
    } catch (error) {
      setGenerationMessage(ecommerceGenerationFailureText(error?.message, t));
      return;
    }
    const requiredCredits = pricingQuotes.reduce((total, quote) => total + Number(quote?.pricing?.credits || 0), 0);
    const availableCredits = profile?.isSuperAdmin ? Number.POSITIVE_INFINITY : Number(profile?.creditBalance || 0);
    if (requiredCredits > availableCredits) {
      setGenerationMessage(profile?.groupAccount?.role === 'member'
        ? t.groupBudgetRequired
        : profile?.groupAccount?.role === 'admin'
          ? t.groupBalanceRequired
          : t.insufficientBatchCredits(requiredCredits, availableCredits));
      if (!profile?.groupAccount) onBilling?.();
      return;
    }
    try {
      await createServerTasks(slotIds.map((slotId) => ({
        id: createGenerationTaskId(), slotId, quality: effectiveGenerationQuality
      })), project);
    } catch (error) {
      if (!['TASK_ALREADY_ACTIVE', 'SLOT_LOCKED'].includes(error?.message)) {
        setGenerationMessage(ecommerceGenerationFailureText(error?.payload || error?.message, t));
      }
      return;
    }
    setBatchRunning(false);
    setGenerationMessage('');
    showTaskStartedNotice(slotIds.length);
  }

  async function handleGenerateFromOutputs() {
    const selectedSlots = formRef.current.selectedSlots || [];
    if (!selectedSlots.length) {
      setGenerationMessage(t.selectAtLeastOne);
      return;
    }
    if (!formRef.current.masterAssetId) {
      setGenerationMessage(t.masterRequired);
      return;
    }

    const project = await saveCurrentProject();
    if (!project) return;

    const slotIds = project.selectedSlots.filter((slotId) => !outputs.find((item) => item.slotId === slotId)?.locked);
    setSelectedProductionSlots(slotIds);
    setCollapsedSections((current) => ({ ...current, outputs: true, production: false }));
    setSelectedWorkflowStep(3);
    setHoveredWorkflowStep(3);
    globalThis.requestAnimationFrame?.(() => {
      sectionRefs.current.production?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function handleSelectVersion(slotId, generationId) {
    setVersionActionState(`select:${generationId}`);
    try {
      const response = await fetch('/api/ecommerce/outputs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'select', projectId: form.id, slotId, generationId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.output) throw new Error(payload.error || 'VERSION_SELECT_FAILED');
      setOutputs((current) => [payload.output, ...current.filter((item) => item.slotId !== slotId)]);
    } catch {
      setGenerationMessage(t.generationFailed);
    } finally {
      setVersionActionState('');
    }
  }

  async function handleArchiveVersion(slotId, generationId) {
    setVersionActionState(`archive:${generationId}`);
    try {
      const response = await fetch(`/api/ecommerce/outputs?projectId=${encodeURIComponent(form.id)}&slotId=${encodeURIComponent(slotId)}&generationId=${encodeURIComponent(generationId)}`, {
        method: 'DELETE'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload.error || 'VERSION_ARCHIVE_FAILED');
      setGenerations((current) => current.filter((item) => item.id !== generationId));
    } catch {
      setGenerationMessage(t.generationFailed);
    } finally {
      setVersionActionState('');
    }
  }

  async function handleLockOutput(slotId, locked) {
    setVersionActionState('lock');
    try {
      const response = await fetch('/api/ecommerce/outputs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lock', projectId: form.id, slotId, locked })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.output) throw new Error(payload.error || 'OUTPUT_LOCK_FAILED');
      setOutputs((current) => [payload.output, ...current.filter((item) => item.slotId !== slotId)]);
    } catch {
      setGenerationMessage(t.generationFailed);
    } finally {
      setVersionActionState('');
    }
  }

  async function handleConsistencyCheck(slotId) {
    setVersionActionState('check');
    try {
      const response = await fetch('/api/ecommerce/check-consistency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: form.id, slotId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload.output) throw new Error(payload.error || 'CONSISTENCY_CHECK_FAILED');
      setOutputs((current) => [payload.output, ...current.filter((item) => item.slotId !== slotId)]);
    } catch {
      setGenerationMessage(t.consistencyFailedRequest);
    } finally {
      setVersionActionState('');
    }
  }

  async function handleCreateRevision(slotId, request) {
    setVersionActionState('revise');
    try {
      const success = await runSlotGeneration(slotId, '', request);
      if (success) await refreshProjectRuntime();
      return success;
    } finally {
      setVersionActionState('');
    }
  }

  function handleDeliveryProjectCreated(project) {
    if (!project) return;
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    openProject(project);
  }

  const localName = (item) => language === 'zh' ? item.nameZh : item.nameEn;
  const localDescription = (item) => language === 'zh' ? item.descriptionZh : item.descriptionEn;
  const localPurpose = (item) => language === 'zh' ? item.purposeZh : item.purposeEn;
  const localExamples = (item) => language === 'zh' ? item.examplesZh : item.examplesEn;
  const generationsBySlot = useMemo(() => {
    const grouped = new Map();
    for (const generation of generations) {
      if (!generation.slotId) continue;
      if (!grouped.has(generation.slotId)) grouped.set(generation.slotId, []);
      grouped.get(generation.slotId).push(generation);
    }
    for (const versions of grouped.values()) {
      versions.sort((left, right) => Number(right.versionNumber || 0) - Number(left.versionNumber || 0));
    }
    return grouped;
  }, [generations]);
  const outputsBySlot = useMemo(
    () => new Map(outputs.map((output) => [output.slotId, output])),
    [outputs]
  );
  const adoptedGenerationBySlot = useMemo(() => {
    const adopted = new Map();
    for (const [slotId, versions] of generationsBySlot) {
      const output = outputsBySlot.get(slotId);
      const selected = output?.selectedGenerationId
        ? versions.find((version) => version.id === output.selectedGenerationId)
        : null;
      adopted.set(slotId, selected || versions.find((version) => version.status === 'succeeded') || null);
    }
    return adopted;
  }, [generationsBySlot, outputsBySlot]);
  const latestAttemptBySlot = useMemo(() => {
    const latest = new Map();
    for (const [slotId, versions] of generationsBySlot) latest.set(slotId, versions[0] || null);
    return latest;
  }, [generationsBySlot]);
  const productionSlots = platform.slots.filter((item) => form.selectedSlots.includes(item.id));
  const {
    pricingByKey: productionPricingQuotes,
    loading: productionPricingLoading
  } = useServerImagePricingBatch(productionSlots.map((slot) => ({
    key: slot.id,
    size: resolveEcommerceSlotGenerationSize(slot),
    quality: effectiveGenerationQuality,
    providerId: form.imageProviderId,
    referenceCount: countEcommerceReferenceImages({ project: form, slot, assets })
  })));
  const productionPricingBySlot = new Map(productionSlots.map((slot) => [slot.id, productionPricingQuotes[slot.id] || null]));
  const selectableProductionSlots = productionSlots.filter((item) => !outputsBySlot.get(item.id)?.locked);
  const selectedPricingComplete = selectedProductionSlots.every((slotId) => Boolean(productionPricingBySlot.get(slotId)));
  const selectedProductionPricing = selectedPricingComplete ? selectedProductionSlots.reduce((total, slotId) => {
    const pricing = productionPricingBySlot.get(slotId);
    return {
      credits: total.credits + Number(pricing?.credits || 0),
      originalCredits: total.originalCredits + Number(pricing?.originalCredits || pricing?.credits || 0),
      discountApplied: total.discountApplied || Boolean(pricing?.discountApplied),
      promotion: pricing?.promotion || total.promotion
    };
  }, { credits: 0, originalCredits: 0, discountApplied: false, promotion: null }) : null;
  const allProductionSelected = Boolean(selectableProductionSlots.length) && selectableProductionSlots.every((item) => selectedProductionSlots.includes(item.id));
  const activeGenerationCount = Object.values(generationTasks).filter((task) => ['queued', 'running', 'cancelling'].includes(task.status)).length;
  const versionCenterCatalogSlot = platform.slots.find((item) => item.id === versionCenterSlotId);
  const versionCenterSlot = versionCenterCatalogSlot
    ? { ...versionCenterCatalogSlot, name: localName(versionCenterCatalogSlot) }
    : null;
  const assetTypeLabels = {
    product: t.assetProduct,
    packaging: t.assetPackaging,
    logo: t.assetLogo,
    reference: t.assetReference
  };
  const hasAiOriginal = (field) => Object.prototype.hasOwnProperty.call(aiBriefOriginals, field);
  const resetLabelFor = (field) => hasAiOriginal(field) ? t.restoreAiField : t.clearField;
  const showProjectList = projects.length > 0;

  function showThumbnailHoverPreview(event, asset) {
    const image = event.currentTarget?.querySelector?.('img') || event.currentTarget;
    const layout = ecommerceThumbnailHoverPreviewLayout(image, asset?.width, asset?.height);
    const imageUrl = asset?.imageUrl || asset?.thumbnailUrl || asset?.previewUrl || asset?.originalUrl;
    if (!layout || !imageUrl) return;
    const dimensions = Number(asset?.width) > 0 && Number(asset?.height) > 0
      ? `${asset.width}×${asset.height}`
      : '';
    setThumbnailHoverPreview({
      ...layout,
      imageUrl,
      details: [asset?.fileName, dimensions].filter(Boolean)
    });
  }

  function hideThumbnailHoverPreview() {
    setThumbnailHoverPreview(null);
  }

  return (
    <div className="ecommerceWorkspace">
      {thumbnailHoverPreview ? (
        <div
          className="freeImageThumbnailHoverPreview ecommerceThumbnailHoverPreview"
          role="tooltip"
          style={{
            left: `${thumbnailHoverPreview.left}px`,
            top: `${thumbnailHoverPreview.top}px`,
            width: `${thumbnailHoverPreview.width}px`
          }}
        >
          <img
            src={thumbnailHoverPreview.imageUrl}
            alt=""
            style={{ height: `${thumbnailHoverPreview.height}px` }}
            decoding="async"
            draggable={false}
          />
          {thumbnailHoverPreview.details.length ? (
            <div>{thumbnailHoverPreview.details.map((detail) => <span key={detail}>{detail}</span>)}</div>
          ) : null}
        </div>
      ) : null}
      {taskStartedNotice ? (
        <div className="ecommerceTaskStartedToast" role="status" aria-live="polite">
          <CircleCheck size={22} />
          <div>
            <strong>{t.taskStartedTitle}</strong>
            <span>{t.taskStartedNotice(taskStartedNotice.count)}</span>
          </div>
          <button type="button" onClick={dismissTaskStartedNotice} aria-label={language === 'zh' ? '关闭提示' : 'Dismiss notification'}>
            <X size={16} />
          </button>
        </div>
      ) : null}
      <div className="ecommerceHero">
        <p>{t.title}</p>
      </div>

      <div className="ecommerceWorkflow" aria-label={language === 'zh' ? '项目流程' : 'Project workflow'}>
        {t.workflow.map((label, index) => {
          const locked = index > maxUnlockedStage;
          const active = index === activeWorkflowStep;
          const completed = index < currentStage && !active;
          return (
          <button
            className={`${active ? 'active' : ''} ${completed ? 'completed' : ''} ${locked ? 'locked' : ''}`}
            type="button"
            aria-disabled={locked}
            title={locked ? t.lockedStage : label}
            onMouseEnter={() => { if (!locked) setHoveredWorkflowStep(index); }}
            onMouseLeave={() => setHoveredWorkflowStep((current) => current === index ? null : current)}
            onFocus={() => { if (!locked) setHoveredWorkflowStep(index); }}
            onBlur={() => setHoveredWorkflowStep((current) => current === index ? null : current)}
            onClick={() => navigateToWorkflowStep(index)}
            key={label}
          >
            <span>{index + 1}</span>
            <strong>{label}</strong>
            {active ? <em>{t.currentStage}</em> : locked ? <em>{t.lockedStage}</em> : null}
          </button>
          );
        })}
      </div>

      {!signedIn ? (
        <div className="ecommerceGate">
          <FolderOpen size={24} />
          <div><strong>{t.signInTitle}</strong><span>{t.signInText}</span></div>
          <button type="button" onClick={onSignIn}>{t.signIn}</button>
        </div>
      ) : !hasAccess && form.masterAssetId ? (
        <div className="ecommerceGate">
          <Sparkles size={24} />
          <div><strong>{profile?.groupAccount ? (profile.groupAccount.role === 'member' ? (language === 'zh' ? '集团预算不足' : 'Group budget required') : (language === 'zh' ? '集团余额不足' : 'Group balance required')) : t.creditsTitle}</strong><span>{profile?.groupAccount ? (profile.groupAccount.role === 'member' ? t.groupBudgetRequired : t.groupBalanceRequired) : t.creditsText}</span></div>
          {!profile?.groupAccount ? <button type="button" onClick={onBilling}>{t.recharge}</button> : null}
        </div>
      ) : null}

      <div className={`ecommerceLayout ${projectListCollapsed || !showProjectList ? 'projectListCollapsed' : ''} ${!showProjectList ? 'noProjectList' : ''}`}>
        {showProjectList ? <aside className={`ecommerceProjectList ${projectListCollapsed ? 'collapsed' : ''}`}>
          {projectListCollapsed ? (
            <button className="ecommerceProjectListExpand" type="button" onClick={() => updateProjectListCollapsed(false)} aria-label={t.expandProjects} title={t.expandProjects}>
              <ChevronRight size={18} /><Box size={17} /><span>{t.projects}</span>
            </button>
          ) : (
            <>
              <div className="ecommerceProjectListHeader">
                <h3>{t.projects}</h3>
                <div>
                  <button type="button" onClick={startNewProject}><Plus size={15} /> {t.newProject}</button>
                  <button className="ecommerceProjectListCollapse" type="button" onClick={() => updateProjectListCollapsed(true)} aria-label={t.collapseProjects} title={t.collapseProjects}><ChevronLeft size={17} /></button>
                </div>
              </div>
              {status === 'loading' ? <LoaderCircle className="spin ecommerceListLoader" size={21} /> : null}
              {projects.length ? (
                <div className="ecommerceProjectCards">
                  {projects.map((project) => {
                    const itemPlatform = getEcommercePlatform(project.platformId);
                    return (
                      <article className={`ecommerceProjectCard ${project.id === form.id ? 'active' : ''}`} key={project.id}>
                      <button className="ecommerceProjectOpen" type="button" onClick={() => openProject(project)}>
                        <span><Box size={15} /> {localName(itemPlatform)}</span>
                        <strong>{project.projectName || project.productName}</strong>
                        <em>{project.selectedSlots?.length || 0} · {t.draft}</em>
                      </button>
                      <button className="ecommerceProjectDelete" type="button" onClick={(event) => handleDeleteProject(event, project)} aria-label={language === 'zh' ? '删除项目' : 'Delete project'}><Trash2 size={15} /></button>
                      </article>
                    );
                  })}
                </div>
              ) : status !== 'loading' ? <p>{t.noProjects}</p> : null}
            </>
          )}
        </aside> : null}

        <form className="ecommerceProjectForm" onSubmit={(event) => event.preventDefault()}>
          <div
            className={`ecommerceStagePanel ecommerceProductBriefStage ${activeWorkflowStep === 0 ? 'stageActive' : ''}`}
            ref={(node) => {
              if (node) sectionRefs.current.start = node;
              else delete sectionRefs.current.start;
            }}
            onMouseEnter={() => setHoveredWorkflowStep(0)}
            onMouseLeave={() => setHoveredWorkflowStep((current) => current === 0 ? null : current)}
            onFocusCapture={() => setHoveredWorkflowStep(0)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setHoveredWorkflowStep((current) => current === 0 ? null : current);
              }
            }}
            data-workflow-step="0"
          >
          <fieldset className={`ecommerceSection ecommerceProductBriefSection ecommerceCollapsibleSection ${collapsedSections.brief ? 'collapsed' : ''}`} {...sectionInteractionProps('brief')}>
            <CollapsibleSectionLegend
              label={t.productBrief}
              summary={form.productName.trim() || t.productNamePlaceholder}
              collapsed={collapsedSections.brief}
              contentId="ecommerce-brief-section"
              expandLabel={t.expandSection}
              collapseLabel={t.collapseSection}
              onToggle={() => toggleSection('brief')}
            />
            <div className="ecommerceCollapsibleContent" id="ecommerce-brief-section" hidden={collapsedSections.brief}>
              <div className="ecommerceSimpleBrief">
                <label className="ecommerceField ecommerceProductNameField">
                  <span>{t.productName}</span>
                  <input ref={productNameInputRef} id="ecommerce-product-name" required value={form.productName} onChange={(event) => updateField('productName', event.target.value)} placeholder={t.productNamePlaceholder} />
                </label>
                <label className="ecommerceField ecommerceIndustryField">
                  <span>{t.industry} <em>{t.industryAutoHint}</em></span>
                  <span className="ecommerceCategorySelects">
                    <span>
                      <small>{t.primaryCategory}</small>
                      <select value={form.industryId} onChange={(event) => selectIndustry(event.target.value)} aria-label={t.primaryCategory}>
                        {ECOMMERCE_INDUSTRIES.map((item) => <option value={item.id} key={item.id}>{localName(item)}</option>)}
                      </select>
                    </span>
                    <span>
                      <small>{t.secondaryCategory}</small>
                      <select value={form.subcategoryId} onChange={(event) => selectSubcategory(event.target.value)} aria-label={t.secondaryCategory}>
                        {subcategories.map((item) => <option value={item.id} key={item.id}>{localName(item)}</option>)}
                      </select>
                    </span>
                  </span>
                </label>
                <div className="ecommercePlatformSimple" aria-label={t.platform}>
                  <span>{t.platform}</span>
                  <div>
                    {ECOMMERCE_PLATFORMS.map((item) => (
                      <button className={form.platformId === item.id ? 'active' : ''} type="button" onClick={() => selectPlatform(item.id)} aria-pressed={form.platformId === item.id} key={item.id}>
                        {localName(item)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ecommerceStepAction ecommerceProductNextAction">
                  <button className="primary" type="button" onClick={handleContinueToAssets} disabled={status === 'saving' || !form.productName.trim()}>
                    {form.id ? t.openAssets : t.continueToAssets}
                    {status === 'saving' ? <LoaderCircle size={16} className="spin" /> : <ChevronRight size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </fieldset>
          </div>

          <fieldset className={`ecommerceSection ecommerceAssetSection ecommerceCollapsibleSection ${collapsedSections.assets ? 'collapsed' : ''} ${activeWorkflowStep === 1 ? 'stageActive' : ''}`} {...sectionInteractionProps('assets')}>
            <CollapsibleSectionLegend
              label={t.sourceAssets}
              summary={t.assetSummary(assets.length, Boolean(form.masterAssetId))}
              collapsed={collapsedSections.assets}
              contentId="ecommerce-assets-section"
              expandLabel={t.expandSection}
              collapseLabel={t.collapseSection}
              onToggle={() => toggleSection('assets')}
            />
            <div
              className={`ecommerceCollapsibleContent ecommerceAssetDropSurface ${assetDragging ? 'dragActive' : ''}`}
              id="ecommerce-assets-section"
              hidden={collapsedSections.assets}
              tabIndex={form.id ? 0 : -1}
              aria-label={t.assetLimit}
              onPaste={handleAssetPaste}
              onDragEnter={(event) => { event.preventDefault(); setAssetDragging(true); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setAssetDragging(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setAssetDragging(false); }}
              onDrop={handleAssetDrop}
            >
              <p className="ecommerceAssetHint">{t.sourceAssetsHint}</p>
              {!form.id ? (
                <div className="ecommerceAssetEmpty"><FolderOpen size={22} /><span>{t.saveBeforeUpload}</span></div>
              ) : (
                <>
                <div className="ecommerceAssetToolbar">
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ECOMMERCE_PROJECT_ASSET_MIME_TYPES.join(',')}
                      multiple
                      hidden
                      onChange={handleAssetFiles}
                    />
                    <div className="ecommerceAssetSourceButtons">
                      <button type="button" onClick={handlePasteImages} disabled={!signedIn || assetStatus === 'uploading' || assets.length >= ECOMMERCE_PROJECT_ASSET_LIMIT}>
                        <ClipboardPaste size={16} />
                        {t.pasteImages}
                      </button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!signedIn || assetStatus === 'uploading' || assets.length >= ECOMMERCE_PROJECT_ASSET_LIMIT}>
                        {assetStatus === 'uploading' ? <LoaderCircle size={16} className="spin" /> : <ImageUp size={16} />}
                        {assetStatus === 'uploading' ? t.uploadingAssets : t.uploadFromDevice}
                      </button>
                      <button type="button" onClick={() => setAssetLibraryOpen(true)} disabled={!signedIn || assetStatus === 'uploading' || remainingProjectAssetSlots <= 0}>
                        <FolderOpen size={16} />
                        {t.chooseFromLibrary}
                      </button>
                    </div>
                    <small className={assetStatus === 'error' ? 'error' : ''}>{assetFeedback || t.assetLimit}</small>
                  </div>
                </div>
                {assetStatus === 'loading' ? <LoaderCircle className="spin ecommerceListLoader" size={21} /> : null}
                {assets.length ? (
                  <div className="ecommerceAssetGrid">
                    {assets.map((asset) => (
                      <article
                        className={`${asset.isMaster ? 'master' : ''} ${asset.available === false ? 'unavailable' : ''}`.trim()}
                        key={asset.id}
                        onMouseEnter={(event) => { if (asset.available !== false) showThumbnailHoverPreview(event, asset); }}
                        onMouseLeave={hideThumbnailHoverPreview}
                      >
                        {asset.available === false ? <div className="ecommerceAssetUnavailable"><ShieldAlert size={22} /><strong>{t.assetUnavailable}</strong><small>{t.assetUnavailableHint}</small></div> : <img src={asset.imageUrl} alt={asset.fileName} loading="lazy" />}
                        {asset.isMaster ? <em className="ecommerceMasterBadge"><Check size={12} /> {t.masterAsset}</em> : null}
                        <div className="ecommerceAssetInfo">
                          <span>{assetTypeLabels[asset.assetType] || asset.assetType}</span>
                          <strong title={asset.fileName}>{asset.fileName}</strong>
                        </div>
                        <button className="ecommerceAssetDeleteButton" type="button" aria-label={`${t.deleteAsset}: ${asset.fileName}`} onMouseEnter={hideThumbnailHoverPreview} onFocus={hideThumbnailHoverPreview} onPointerDown={hideThumbnailHoverPreview} onClick={() => handleDeleteAsset(asset.id)}>
                          <Trash2 size={14} />
                        </button>
                        {asset.available !== false && !asset.isMaster && asset.assetType === 'product' ? (
                          <button className="ecommerceSetMasterButton" type="button" onClick={() => handleSetMaster(asset.id)}>
                            {t.setMaster}
                          </button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : assetStatus !== 'loading' ? (
                  <button className="ecommerceAssetEmpty ecommerceAssetDropTarget" type="button" onClick={() => fileInputRef.current?.click()}>
                    <ImageUp size={22} />
                    <span>{t.assetLimit}</span>
                  </button>
                ) : null}
                {assets.length ? <p className="ecommerceMasterHint">{t.masterHint}</p> : null}
                {form.masterAssetId ? (
                  <div className="ecommerceStepAction">
                    <button className="primary" type="button" onClick={handleContinueToPlan}>
                      {t.continueToPlan} <ChevronRight size={16} />
                    </button>
                  </div>
                ) : null}
                </>
              )}
            </div>
          </fieldset>

          <fieldset className={`ecommerceSection ecommerceVisualSection ecommerceCollapsibleSection ${collapsedSections.visual ? 'collapsed' : ''} ${activeWorkflowStep === 2 ? 'stageActive' : ''}`} {...sectionInteractionProps('visual')}>
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
              <div className="ecommerceTemplatePanel">
                <strong>{t.templates}</strong>
                <div className="ecommerceTemplateGrid">
                  {recommendedTemplates.map((template) => {
                    const active = form.templateId === template.id;
                    return (
                      <button
                        className={active ? 'active' : ''}
                        type="button"
                        onClick={() => applyTemplate(template.id)}
                        aria-pressed={active}
                        key={template.id}
                      >
                        <span><Box size={16} /></span>
                        <strong>{localName(template)}</strong>
                        <small>{localDescription(template)}</small>
                        <em>{active ? <Check size={13} /> : <Plus size={13} />}{active ? t.templateApplied : t.applyTemplate}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
              <details className="ecommerceAdvancedOptions" open>
                <summary>{t.optionalStyles}</summary>
                <strong className="ecommerceVisualStyleTitle">{t.visualStyle}</strong>
                <p className="ecommerceVisualStylePreviewHint">{t.visualStylePreviewHint}</p>
                <div className="ecommerceVisualStyleGrid" aria-label={t.visualStyle}>
                  {visualStyles.map((item) => {
                    const active = form.visualStyleId === item.id;
                    return (
                      <button
                        className={active ? 'active' : ''}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateField('visualStyleId', item.id)}
                        key={item.id}
                      >
                        <span className="ecommerceVisualStylePreview">
                          <img src={`/images/ecommerce-style-previews/${item.id}.webp`} alt={`${localName(item)} · Pic365 矿泉水`} />
                        </span>
                        <span className="ecommerceVisualStyleCopy">
                          <strong>{active ? <Check size={14} /> : null}{localName(item)}</strong>
                          <small>{localDescription(item)}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </details>
            </div>
          </fieldset>

          <fieldset className={`ecommerceSection ecommerceCollapsibleSection ${collapsedSections.outputs ? 'collapsed' : ''} ${activeWorkflowStep === 2 ? 'stageActive' : ''}`} {...sectionInteractionProps('outputs')}>
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
              <div className="ecommerceOutputGenerateAction">
                <button
                  className="primary"
                  type="button"
                  onClick={handleGenerateFromOutputs}
                  disabled={status === 'saving' || !form.selectedSlots.length || !form.masterAssetId}
                >
                  {status === 'saving' ? <LoaderCircle size={16} className="spin" /> : <ChevronRight size={16} />}
                  {t.generateFromOutputs}
                </button>
              </div>
            </div>
          </fieldset>

          {form.id ? (
            <fieldset className={`ecommerceSection ecommerceProductionSection ecommerceCollapsibleSection ${collapsedSections.production ? 'collapsed' : ''} ${activeWorkflowStep === 3 ? 'stageActive' : ''}`} {...sectionInteractionProps('production')}>
              <CollapsibleSectionLegend
                label={t.production}
                summary={t.productionSummary(outputs.filter((output) => output.selectedGenerationId).length, productionSlots.length)}
                collapsed={collapsedSections.production}
                contentId="ecommerce-production-section"
                expandLabel={t.expandSection}
                collapseLabel={t.collapseSection}
                onToggle={() => toggleSection('production')}
              />
              <div className="ecommerceCollapsibleContent ecommerceProductionContent" id="ecommerce-production-section" hidden={collapsedSections.production}>
              <div className="ecommerceProductionSettings">
                <label className="ecommerceField ecommerceProductionProvider">
                  <span>{language === 'zh' ? '生图服务' : 'Image service'}</span>
                  <select
                    value={form.imageProviderId}
                    onChange={(event) => handleImageProviderChange(event.target.value)}
                    disabled={status === 'saving' || activeGenerationCount > 0}
                  >
                    {imageProviders.map((provider) => {
                      const compatibility = providerCompatibilityById.get(provider.id);
                      return (
                        <option value={provider.id} disabled={!compatibility?.valid} key={provider.id}>
                          {provider.name}{provider.isDefault ? (language === 'zh' ? '（默认）' : ' (Default)') : ''}{compatibility?.valid ? '' : ` · ${t.providerUnavailableChoice}`}
                        </option>
                      );
                    })}
                  </select>
                </label>
                {selectedProviderSupportsQuality ? (
                  <fieldset className="ecommerceProductionQuality">
                    <legend>{t.generationQuality}</legend>
                    <div>
                      {ECOMMERCE_IMAGE_QUALITIES.map((quality) => (
                        <label className={form.imageQuality === quality ? 'selected' : ''} key={quality}>
                          <input
                            type="radio"
                            name="ecommerce-generation-quality"
                            value={quality}
                            checked={form.imageQuality === quality}
                            disabled={batchRunning || activeGenerationCount > 0}
                            onChange={() => updateField('imageQuality', quality)}
                          />
                          <span className="ecommerceQualityCheck">{form.imageQuality === quality ? <Check size={13} /> : null}</span>
                          <span>{quality === 'low' ? t.qualityLow : quality === 'medium' ? t.qualityMedium : t.qualityHigh}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
              </div>
              {!selectedProviderCompatibility.valid ? (
                <p className="ecommerceGenerationMessage ecommerceProviderCompatibilityMessage">{selectedProviderCompatibilityMessage}</p>
              ) : null}
              <div className="ecommerceBatchToolbar">
                <button
                  type="button"
                  onClick={() => setSelectedProductionSlots(allProductionSelected ? [] : selectableProductionSlots.map((item) => item.id))}
                  disabled={batchRunning}
                >
                  <ListChecks size={15} />
                  {allProductionSelected ? t.clearSelection : t.selectAll}
                </button>
                <div className="ecommerceBatchGenerateGroup">
                  <span className="ecommerceBatchPrice">
                    {t.batchSelectionLabel(selectedProductionSlots.length)} <ImageCreditPrice pricing={selectedProductionPricing} language={language} compact />
                  </span>
                  <button
                    className="primary"
                    type="button"
                    onClick={handleGenerateSelected}
                    disabled={!selectedProductionSlots.length}
                  >
                    {batchRunning ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />}
                    {batchRunning ? `${t.batchGenerating} ${activeGenerationCount}` : t.generateSelected}
                  </button>
                </div>
              </div>
              {generationMessage ? <p className="ecommerceGenerationMessage">{generationMessage}</p> : null}
              <div className="ecommerceProductionGrid">
                {productionSlots.map((item) => {
                  const slotPricing = productionPricingBySlot.get(item.id);
                  const output = outputsBySlot.get(item.id);
                  const versions = generationsBySlot.get(item.id) || [];
                  const adopted = adoptedGenerationBySlot.get(item.id);
                  const latestAttempt = latestAttemptBySlot.get(item.id);
                  const task = generationTasks[item.id];
                  const taskActive = Boolean(task && ['queued', 'running', 'cancelling'].includes(task.status));
                  const retryable = Boolean(task && ['failed', 'cancelled', 'interrupted'].includes(task.status));
                  const latestAttemptFailed = Boolean(adopted && latestAttempt && latestAttempt.id !== adopted.id && latestAttempt.status !== 'succeeded');
                  const selectedForBatch = selectedProductionSlots.includes(item.id);
                  const taskLabel = task?.status === 'queued'
                    ? t.queued
                    : task?.status === 'running'
                      ? t.running
                      : task?.status === 'cancelling'
                        ? t.cancelling
                        : task?.status === 'interrupted'
                          ? t.interrupted
                          : '';
                  const consistencyLabel = output?.consistencyStatus === 'passed'
                    ? t.consistencyPassed
                    : output?.consistencyStatus === 'warning'
                      ? t.consistencyWarning
                      : output?.consistencyStatus === 'failed'
                        ? t.consistencyFailed
                        : t.consistencyUnchecked;
                  return (
                    <article className={`${selectedForBatch ? 'selected' : ''} ${output?.locked ? 'locked' : ''}`} key={item.id}>
                      <div className="ecommerceProductionPreview">
                        {adopted?.imageUrl ? (
                          <button
                            className="ecommerceProductionImageButton"
                            type="button"
                            aria-label={`${t.viewImage}: ${localName(item)}`}
                            title={t.viewImage}
                            onClick={() => setPreviewImage({
                              imageUrl: adopted.imageUrl,
                              alt: localName(item),
                              title: localName(item),
                              meta: `${item.aspectRatio} · ${item.recommendedSize} · ${t.version(adopted.versionNumber)}`
                            })}
                          >
                            <img src={adopted.imageUrl} alt={localName(item)} loading="lazy" />
                            <span><Maximize2 size={18} /></span>
                          </button>
                        ) : (
                          <div><ImagePlus size={24} /><span>{latestAttempt?.status === 'failed' ? t.generationFailed : t.noOutput}</span></div>
                        )}
                        <label className="ecommerceProductionSelect" aria-label={`${t.selectAll}: ${localName(item)}`}>
                          <input
                            type="checkbox"
                            checked={selectedForBatch}
                            onChange={() => toggleProductionSlot(item.id)}
                            disabled={batchRunning || output?.locked}
                          />
                          <span>{selectedForBatch ? <Check size={14} /> : null}</span>
                        </label>
                        {taskLabel ? <em className="ecommerceTaskStatus">{taskActive ? <LoaderCircle className="spin" size={11} /> : null}{taskLabel}</em> : null}
                        {!taskLabel && output?.locked ? <em className="ecommerceTaskStatus locked"><Lock size={11} /> {t.outputLocked}</em> : null}
                      </div>
                      <div className="ecommerceProductionCopy">
                        <span>{item.aspectRatio} · {item.recommendedSize}</span>
                        <strong>{localName(item)}</strong>
                        <div className="ecommerceProductionMeta">
                          {adopted ? <em>{t.adoptedVersion} · {t.version(adopted.versionNumber)}</em> : <em>{t.noOutput}</em>}
                          {adopted ? (
                            <span className={`consistency ${output?.consistencyStatus || 'unchecked'}`}>
                              {output?.consistencyStatus === 'passed' ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                              {consistencyLabel}
                            </span>
                          ) : null}
                        </div>
                        {latestAttemptFailed ? <em className="ecommerceLatestAttemptFailed">{t.latestAttemptFailed}</em> : null}
                      </div>
                      <div className="ecommerceProductionActions">
                        <button
                          className={taskActive ? 'cancel' : retryable ? 'retry' : ''}
                          type="button"
                          onClick={() => taskActive
                            ? handleCancelGeneration(item.id)
                            : retryable
                              ? handleRetryTask(item.id)
                              : runSlotGeneration(item.id)}
                          disabled={output?.locked || task?.status === 'cancelling' || (!taskActive && (batchRunning || productionPricingLoading || !slotPricing || !form.masterAssetId || status === 'saving' || !selectedProviderCompatibility.valid))}
                        >
                          {taskActive
                            ? task.status === 'cancelling' ? <LoaderCircle size={15} className="spin" /> : <X size={15} />
                            : retryable ? <RotateCcw size={15} /> : adopted ? <RefreshCw size={15} /> : <Sparkles size={15} />}
                          {taskActive
                            ? task.status === 'cancelling' ? t.cancelling : t.cancel
                            : retryable
                              ? <>{t.retryLabel} · <ImageCreditPrice pricing={slotPricing} language={language} compact /></>
                              : adopted
                                ? <>{t.regenerateSlotLabel} · <ImageCreditPrice pricing={slotPricing} language={language} compact /></>
                                : <>{t.generateSlotLabel} · <ImageCreditPrice pricing={slotPricing} language={language} compact /></>}
                        </button>
                        <button className="versions" type="button" onClick={() => setVersionCenterSlotId(item.id)}>
                          <History size={14} /> {t.versions}{versions.length ? ` · ${versions.length}` : ''}
                        </button>
                        {adopted?.imageUrl ? (
                          <a
                            href={adopted.imageUrl}
                            download={buildDownloadFilename({
                              productName: form.productName,
                              slotName: localName(item),
                              platformName: localName(platform),
                              versionNumber: adopted.versionNumber,
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
              </div>
            </fieldset>
          ) : null}

          {form.id ? (
            <fieldset className={`ecommerceSection ecommerceCollapsibleSection ecommerceDeliverySection ${collapsedSections.delivery ? 'collapsed' : ''} ${activeWorkflowStep === 4 ? 'stageActive' : ''}`} {...sectionInteractionProps('delivery')}>
              <CollapsibleSectionLegend
                label={t.professionalDelivery}
                summary={t.deliverySummary(outputs.filter((output) => output.selectedGenerationId).length)}
                collapsed={collapsedSections.delivery}
                contentId="ecommerce-delivery-section"
                expandLabel={t.expandSection}
                collapseLabel={t.collapseSection}
                onToggle={() => toggleSection('delivery')}
              />
              <div className="ecommerceCollapsibleContent ecommerceDeliveryContent" id="ecommerce-delivery-section" hidden={collapsedSections.delivery}>
                <EcommerceDeliveryCenter
                  language={language}
                  project={form}
                  platform={platform}
                  slots={productionSlots}
                  outputs={outputs}
                  generations={generations}
                  assets={assets}
                  reuseEnabled={maxUnlockedStage >= 4}
                  onProjectCreated={handleDeliveryProjectCreated}
                  onRefineImage={handleCreateRevision}
                  onUploadRefinementAssets={handleRefinementAssetFiles}
                />
              </div>
            </fieldset>
          ) : null}

          {status === 'saving' || message ? (
            <div className={`ecommerceAutosaveStatus ${status === 'error' ? 'error' : ''}`} role="status">
              {status === 'saving' ? <LoaderCircle size={15} className="spin" /> : null}
              <span>{status === 'saving' ? t.saving : message}</span>
            </div>
          ) : null}
        </form>
      </div>
      <EcommerceAssetLibraryPicker
        open={assetLibraryOpen && Boolean(form.id)}
        language={language}
        session={session}
        assetTypeLabel={t.assetProduct}
        linkedAssetIds={linkedMediaAssetIds}
        maxSelectable={remainingProjectAssetSlots}
        maxFileBytes={ECOMMERCE_PROJECT_ASSET_MAX_BYTES}
        allowedMimeTypes={ECOMMERCE_PROJECT_ASSET_MIME_TYPES}
        onClose={() => setAssetLibraryOpen(false)}
        onConfirm={handleLibraryAssets}
      />
      <EcommerceVersionCenterModal
        slot={versionCenterSlot}
        versions={versionCenterSlotId ? generationsBySlot.get(versionCenterSlotId) || [] : []}
        output={versionCenterSlotId ? outputsBySlot.get(versionCenterSlotId) : null}
        t={t}
        language={language}
        platformName={localName(platform)}
        productName={form.productName}
        project={form}
        assets={assets}
        providerId={form.imageProviderId}
        quality={effectiveGenerationQuality}
        actionState={versionActionState}
        onClose={() => setVersionCenterSlotId('')}
        onPreview={(version) => setPreviewImage({
          imageUrl: version.imageUrl,
          alt: versionCenterSlot?.name || '',
          title: `${versionCenterSlot?.name || ''} · ${t.version(version.versionNumber)}`,
          meta: `${versionCenterSlot?.aspectRatio || ''} · ${versionCenterSlot?.recommendedSize || ''}`
        })}
        onSelect={(generationId) => handleSelectVersion(versionCenterSlotId, generationId)}
        onArchive={(generationId) => handleArchiveVersion(versionCenterSlotId, generationId)}
        onLock={(locked) => handleLockOutput(versionCenterSlotId, locked)}
        onCheck={() => handleConsistencyCheck(versionCenterSlotId)}
        onRevise={(request) => handleCreateRevision(versionCenterSlotId, request)}
      />
      <EcommerceImageLightbox image={previewImage} t={t} onClose={() => setPreviewImage(null)} />
    </div>
  );
}
