import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  defaultImagePricingConfigForModel,
  GEMINI_IMAGE_PRICING_TIERS,
  getImageGenerationPricing,
  IMAGE_PRICING_PIXEL_STEP,
  IMAGE_PRICING_STRATEGIES,
  normalizeImagePricingConfig
} from '../shared/image-pricing.js';
import { isGeminiImageModel } from '../shared/image-generation.js';
import { buildSafePromptFallback } from '../shared/prompt-safety.js';
import {
  calculateRechargeCredits,
  normalizeRechargeConfig,
  quoteCustomRecharge
} from '../shared/recharge-config.js';
import { formatStoragePriceYuan, normalizeStorageBillingConfig } from '../shared/storage-billing.js';
import { getClientImagePricing, ImageCreditPrice, refreshImagePromotion, requestImagePricing, useServerImagePricing } from './image-pricing-client.jsx';
import {
  ArrowUpRight,
  AudioLines,
  BarChart3,
  Bell,
  Building2,
  Calculator,
  Cat,
  ChevronDown,
  Check,
  Coins,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Heart,
  HardDrive,
  ImageIcon,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  PackageCheck,
  Plus,
  RefreshCw,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SunMoon,
  Tags,
  TrendingUp,
  Trash2,
  UserCircle,
  UserPlus,
  Users,
  WandSparkles,
  X
} from 'lucide-react';
import './styles.css';
import { authClient } from './authClient';
import CreateWorkspace from './create-workspace';
import { fetchImageGeneration } from './image-generation-client.js';
import { SITE_NOTICE_EXAMPLES } from '../shared/site-notice.js';
import { ADMIN_PERMISSIONS } from '../shared/admin-permissions.js';
import AdminChatProvider from './admin-chat-provider.jsx';
import AdminSystemGroups from './admin-system-groups.jsx';
import AdminVideoProvider from './admin-video-provider.jsx';
import ChatCompanion from './chat-companion.jsx';
import Homepage from './homepage.jsx';
import GroupAccountPanel from './group-account-panel.jsx';
import {
  AuditEventsPanel,
  CreditAdjustmentDialog,
  FinancialReportsPanel,
  GlobalMenuSettingsPanel,
  PersonalMenuSettings,
  RedeemCodeCard,
  RedemptionCodesPanel,
  UserEditDialog
} from './admin-governance.jsx';

const SiteNoticeContent = lazy(() => import('./site-notice-content.jsx'));
const MediaAssetCenter = lazy(() => import('./media-asset-center.jsx'));
const InfiniteImageCanvas = lazy(() => import('./infinite-image-canvas.jsx'));

const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
const watchaLogoUrl =
  'https://watcha.tos-cn-beijing.volces.com/products/logo/1752064513_guan-cha-insights.png?x-tos-process=image/resize,w_720/format,webp';

const copy = {
  en: {
    loading: 'Loading GPT-Image2 cases...',
    brand: 'GPT-Image2 Gallery',
    navTemplates: 'Templates',
    navCases: 'Examples',
    navAssets: 'Assets',
    navCooperation: 'Cooperation',
    navHome: 'Home',
    ecommerceMode: 'Product image sets',
    freeMode: 'Image Studio',
    canvasMode: 'Infinite Canvas',
    api: 'API',
    cooperationTitle: 'Support & Cooperation',
    cooperationTechnical: 'Technical support',
    cooperationCustomer: 'Customer service / Business cooperation',
    qq: 'QQ',
    wechat: 'WeChat',
    eyebrow: 'Live GPT-Image2 prompt gallery',
    title: 'From viral images to reusable prompts.',
    subtitle:
      'A visual workspace for GPT-Image2 creation: browse real cases, copy prompts, test image generation, and explore industrial templates.',
    explore: 'Explore cases',
    cases: 'cases',
    categories: 'categories',
    templates: 'templates',
    sectionEyebrow: 'Copy, filter, remix',
    sectionTitle: 'Viral cases with prompts one click away.',
    templateEyebrow: '20+ industrial prompt templates',
    templateTitle: 'Start from a proven template, then remix the case library.',
    templateSubtitle:
      'Each template is distilled from real GPT-Image2 examples and includes structure, constraints, and pitfalls for production use.',
    templateKind: 'Prompt Template',
    search: 'Search cases, sources, prompts...',
    category: 'Category',
    style: 'Style',
    scene: 'Scene',
    all: 'All',
    matching: 'matching cases',
    copied: 'Copied',
    copyPrompt: 'Copy Prompt',
    copyTemplatePrompt: 'Copy Template',
    favorite: 'Favorite',
    favorited: 'Favorited',
    unfavorite: 'Remove Favorite',
    myFavorites: 'My Favorites',
    noFavorites: 'No favorites yet.',
    signInToFavorite: 'Sign in to save favorite cases.',
    favoriteSaved: 'Favorite saved.',
    favoriteRemoved: 'Favorite removed.',
    favoriteFailed: 'Favorite update failed. Please try again.',
    closePreview: 'Close preview',
    viewDetails: 'View Details',
    generateTest: 'Generate Test',
    generateImage: 'Generate Image',
    generating: 'Generating...',
    editablePrompt: 'Editable Prompt',
    generatedResult: 'Generated Result',
    originalImage: 'Original Image',
    savedInBrowser: 'Saved in this browser',
    resetPrompt: 'Reset Prompt',
    sanitizePrompt: 'Safety rewrite',
    sanitizingPrompt: 'Rewriting safely...',
    sanitizeDone: 'Prompt rewritten for policy compliance.',
    sanitizeBlocked: 'A safe rewrite template was applied.',
    sanitizeFailed: 'A local safe rewrite template was applied.',
    contentModerationBlocked: 'Content review blocked this prompt.',
    sanitizeNoChange: 'The prompt did not change.',
    oneFreeGeneration: '3 free test images',
    superAdminGeneration: (credits) => `Super admin reference price: ${credits} credits; balance is not deducted.`,
    generationCost: (credits) => `Estimated cost: ${credits} credits`,
    freeLimitReached: 'Free generation used. Buy credits to keep generating.',
    creditsRequired: 'Credits required. Buy credits to keep generating.',
    guestFreeLimitReached: 'All 3 free guest images have been used. Sign in with credits to continue.',
    generationBusy: 'The image service is busy. Please try again in a moment.',
    generationFailed: 'Generation failed. Please try again later.',
    generationTimeout: 'Generation exceeded the 300-second wait limit. Please try again.',
    promptRequired: 'Prompt is required and must stay under 6000 characters.',
    serverUnavailable: 'Generation service is not configured yet.',
    checkoutUnavailable: 'Online recharge is not configured yet.',
    checkoutFailed: 'Checkout failed. Please try again later.',
    billingSuccess: 'Payment is processing. Credits will appear after confirmation.',
    billingCancelled: 'Payment was cancelled. You can choose another pack anytime.',
    billingFailed: 'Payment verification failed. No credits were added.',
    authRequired: 'Sign in to generate a test image.',
    signIn: 'Sign in',
    signInTitle: 'Sign in to continue creating',
    signInSubtitle: 'Create an account or sign in to save projects, upload images, and use generation credits.',
    authLoginMode: 'Sign in',
    authRegisterMode: 'Create account',
    authForgotPassword: 'Forgot password?',
    authResetTitle: 'Reset password',
    authResetSubtitle: 'Enter your account email, email code, and a new password.',
    authBackToLogin: 'Back to sign in',
    authEmail: 'Email',
    authPassword: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    authNewPassword: 'New password',
    authConfirmPassword: 'Confirm new password',
    authPasswordMismatch: 'The two passwords do not match.',
    authResetSubmit: 'Reset password',
    authResetSuccess: 'Password reset. Sign in with your new password.',
    authResetCodeSent: 'If this email is registered, a 6-digit reset code has been sent.',
    authName: 'Display name',
    authVerificationCode: 'Email code',
    authSendCode: 'Send code',
    authSendingCode: 'Sending…',
    authResendCode: 'Resend code',
    authResendIn: 'Resend in {seconds}s',
    authCodeSent: 'A 6-digit code was sent to your email.',
    authPreviewCode: 'Local preview code: {code}',
    authSubmitLogin: 'Sign in',
    authSubmitRegister: 'Create account',
    authPasswordHint: 'Use at least 8 characters.',
    authInvalidCredentials: 'Email or password is incorrect.',
    authEmailRegistered: 'This email is already registered.',
    authInvalidEmail: 'Enter a valid email address.',
    authInvalidPassword: 'Password must be at least 8 characters.',
    authCodeRequired: 'Enter the 6-digit email code.',
    authCodeInvalid: 'The email code is incorrect.',
    authCodeExpired: 'The email code expired. Request a new one.',
    authCodeLocked: 'Too many incorrect attempts. Request a new code.',
    authCodeCooldown: 'Please wait before requesting another code.',
    authEmailSendFailed: 'The verification email could not be sent. Try again later.',
    authEmailNotConfigured: 'Email delivery is not configured yet.',
    authDomainBlocked: 'This email domain is not allowed to register.',
    authRateLimited: 'Too many login attempts. Please wait a bit, then try again.',
    googleNotConfigured: 'Google sign-in is not enabled yet.',
    continueWithGoogle: 'Continue with Google',
    continueWithWatcha: 'Continue with Watcha',
    authNotConfigured: 'Login is not configured yet.',
    watchaNotConfigured: 'Watcha sign-in is not configured yet.',
    watchaSessionExpired: 'Watcha sign-in expired. Please try again.',
    watchaDenied: 'Watcha authorization was cancelled.',
    watchaLoginFailed: 'Watcha sign-in failed. Please try again.',
    authError: 'Login failed. Please try again.',
    signOut: 'Sign out',
    account: 'Account',
    accountSettings: 'Account settings',
    accountTitle: 'Account settings',
    accountSubtitle: 'Manage your public display name and GPT-Image2 credit usage.',
    displayName: 'Display name',
    saveProfile: 'Save profile',
    profileSaved: 'Profile saved.',
    profileUpdateFailed: 'Profile update failed. Please try again.',
    changePassword: 'Change password',
    changePasswordHint: 'Enter your current password, then enter the new password twice to confirm it.',
    currentPassword: 'Current password',
    confirmNewPassword: 'Confirm new password',
    saveNewPassword: 'Change password',
    passwordChanged: 'Password changed.',
    passwordChangedSessions: 'Password changed. Other devices have been signed out.',
    currentPasswordWrong: 'The current password is incorrect.',
    passwordUnchanged: 'The new password must be different from the current password.',
    passwordChangeFailed: 'Password could not be changed. Please try again.',
    googleAvatarSource: 'Avatar is synced from your login provider.',
    accountOverview: 'Account overview',
    totalGenerations: 'Generated tests',
    totalGenerationCredits: 'Credits spent',
    generationUsage: 'Generation spending',
    openCase: 'View case',
    sourceCase: 'Source case',
    noGenerationTransactions: 'No generation spending yet.',
    adminPanel: 'Admin',
    creditCenter: 'Credit center',
    superAdmin: 'Super admin',
    credits: 'credits',
    buyCredits: 'Recharge',
    creditPacks: 'Recharge packs',
    packCredits: (count) => `${count} credits`,
    billingTitle: 'Recharge credits',
    billingSubtitle: 'Choose a fixed pack or custom amount, then pay with Alipay or WeChat Pay.',
    balanceTitle: 'Current balance',
    transactionHistory: 'Credit history',
    noTransactions: 'No credit history yet.',
    loadBilling: 'Loading billing...',
    openBilling: 'Open credit center',
    paymentReady: 'Online recharge is available.',
    billingNotReady: 'Online recharge is not configured.',
    adminAdjust: 'Adjust credits',
    editUser: 'Edit user',
    creditAmount: 'Amount',
    reason: 'Reason',
    newPassword: 'New password',
    newPasswordHint: 'Leave blank to keep the current password unchanged.',
    applyAdjustment: 'Save changes',
    cancel: 'Cancel',
    promotionTitle: 'Image promotion',
    promotionSubtitle: 'Keep list prices unchanged and apply one scheduled discount to every image workflow.',
    promotionEnabled: 'Enable promotion',
    promotionName: 'Campaign name',
    promotionNamePlaceholder: 'For example: Summer launch',
    promotionPayPercent: 'Customer pays',
    promotionPayPercentHint: '80% means 20% off. The list price is calculated first, then multiplied by the promotion rate and rounded to the nearest 1 credit; the minimum remains 20 credits.',
    promotionStartsAt: 'Starts at',
    promotionEndsAt: 'Ends at',
    promotionSave: 'Save promotion',
    promotionSaving: 'Saving...',
    promotionSaved: 'Promotion saved.',
    promotionUpdateFailed: 'Promotion could not be saved.',
    promotionRangeInvalid: 'End time must be later than start time.',
    promotionActive: 'Active now',
    promotionScheduled: 'Scheduled',
    promotionExpired: 'Expired',
    promotionInactive: 'Inactive',
    promotionPreview: 'Price preview',
    freeReady: 'Free test ready',
    freeUsedShort: 'Free test used',
    signInToGenerate: 'Sign in to generate',
    creditsAvailable: (count) => `${count} credit${count === 1 ? '' : 's'} available`,
    adminTitle: 'User admin',
    adminSubtitle: 'Traffic, users, credits, and generation activity in one dashboard.',
    adminMetrics: 'Dashboard',
    trafficMetrics: 'Traffic',
    businessMetrics: 'Business',
    analyticsNotConfigured: 'GA4 is not configured yet. Business metrics are still available.',
    analyticsLoadFailed: 'GA4 data could not be loaded. Business metrics are still available.',
    invalidDateRange: 'Choose a date range within 180 days.',
    rangeToday: 'Today',
    range7d: '7 days',
    range30d: '30 days',
    range90d: '90 days',
    customRange: 'Custom',
    startDate: 'Start date',
    endDate: 'End date',
    applyRange: 'Apply',
    selectedRange: 'Selected range',
    pv: 'PV',
    uv: 'UV',
    visits: 'Visits',
    sessions: 'Sessions',
    newUsers: 'New users',
    registeredUsers: 'Registered users',
    newRegistrations: 'New registrations',
    totalGenerationsMetric: 'Total generations',
    rangeGenerations: 'Range generations',
    succeeded: 'Succeeded',
    failed: 'Failed',
    pending: 'Pending',
    creditsConsumed: 'Credits consumed',
    creditsInCirculation: 'Credits in balances',
    purchasedCredits: 'Purchased credits',
    dailyTraffic: 'Daily traffic',
    trafficTrend: 'Traffic trend',
    businessTrend: 'Business trend',
    registrations: 'Registrations',
    topPages: 'Top pages',
    channels: 'Channels',
    countries: 'Countries',
    pageViews: 'Views',
    noAnalyticsRows: 'No analytics rows yet.',
    refresh: 'Refresh',
    users: 'Users',
    role: 'Role',
    creditBalance: 'Credits',
    freeGeneration: 'Free test',
    spentCredits: 'Spent',
    purchased: 'Purchased',
    lastGeneration: 'Last generation',
    createdAt: 'Created',
    loadingUsers: 'Loading users...',
    noUsers: 'No users yet.',
    adminOnly: 'Only super admins can view this page.',
    adminLoadFailed: 'Unable to load account administration data.',
    creditAdjustmentFailed: 'Credit adjustment failed. Please try again.',
    creditAdjustmentInsufficient: 'The adjustment cannot make the account balance negative.',
    adminUserNotFound: 'The selected user no longer exists.',
    fullPrompt: 'Full Prompt',
    templatePrompt: 'Template Prompt',
    useWhen: 'Use When',
    guidance: 'Guidance',
    pitfalls: 'Pitfalls',
    examples: 'Example Cases',
    source: 'Source',
    limit: (count) => `Showing the first ${count} results for speed. Use search or filters to narrow the gallery.`
  },
  zh: {
    loading: '正在加载 GPT-Image2 案例...',
    brand: 'GPT-Image2 画廊',
    navTemplates: '模板',
    navCases: '范例',
    navAssets: '资产库',
    navCooperation: '合作',
    navHome: '主页',
    ecommerceMode: '电商套图',
    freeMode: '灵感生图',
    canvasMode: '无限画布',
    api: 'API',
    cooperationTitle: '合作与支持',
    cooperationTechnical: '技术支持',
    cooperationCustomer: '客服 / 商务合作',
    qq: 'QQ',
    wechat: '微信',
    eyebrow: '实时更新的 GPT-Image2 提示词画廊',
    title: '从爆款图片，复用提示词',
    subtitle:
      '一个面向图像创作的可视化工作台：浏览真实案例、复制 Prompt、在线测试生图、查看工业级模板。',
    explore: '浏览案例',
    cases: '个案例',
    categories: '个分类',
    templates: '套模板',
    sectionEyebrow: '复制、筛选、复用',
    sectionTitle: '爆款案例和 Prompt，一键可取。',
    templateEyebrow: '20+ 套工业级提示词模板',
    templateTitle: '从成熟模板起稿',
    templateSubtitle:
      '每套模板都从真实 GPT 案例里提炼，包含结构、约束和防坑经验，适合生产流程直接复用。',
    templateKind: '提示词模板',
    search: '搜索案例、来源、Prompt...',
    category: '分类',
    style: '风格',
    scene: '场景',
    all: '全部',
    matching: '个匹配案例',
    copied: '已复制',
    copyPrompt: '复制 Prompt',
    copyTemplatePrompt: '复制模板',
    favorite: '收藏',
    favorited: '已收藏',
    unfavorite: '取消收藏',
    myFavorites: '我的收藏',
    noFavorites: '暂无收藏案例。',
    signInToFavorite: '登录后即可收藏案例。',
    favoriteSaved: '已加入收藏。',
    favoriteRemoved: '已取消收藏。',
    favoriteFailed: '收藏更新失败，请稍后再试。',
    closePreview: '关闭预览',
    viewDetails: '详情',
    generateTest: '生成测试',
    generateImage: '生成图片',
    generating: '生成中...',
    editablePrompt: '可编辑 Prompt',
    generatedResult: '生成结果',
    originalImage: '原图',
    savedInBrowser: '已保存到本浏览器',
    resetPrompt: '重置 Prompt',
    sanitizePrompt: '脱敏',
    sanitizingPrompt: '正在合规改写...',
    sanitizeDone: '已完成合规改写。',
    sanitizeBlocked: '已使用安全模板完成改写。',
    sanitizeFailed: '已使用本地安全模板完成改写。',
    contentModerationBlocked: '内容审核未通过。',
    sanitizeNoChange: '提示词未发生变化。',
    oneFreeGeneration: '免费生成 3 张测试图',
    superAdminGeneration: (credits) => `超级管理员参考价 ${credits} 积分，不扣账户余额。`,
    generationCost: (credits) => `预计消耗 ${credits} 积分`,
    freeLimitReached: '免费额度已用完，可购买积分继续生成。',
    creditsRequired: '积分不足，可购买积分继续生成。',
    guestFreeLimitReached: '游客免费图片已用完，请登录并获得积分后继续使用。',
    generationBusy: '生图服务繁忙，请稍后再试。',
    generationFailed: '生成失败，请稍后再试。',
    generationTimeout: '生图等待超过 300 秒，请重新尝试。',
    promptRequired: 'Prompt 不能为空，并且不能超过 6000 字符。',
    serverUnavailable: '生成服务还没有完成配置。',
    checkoutUnavailable: '在线充值尚未完成配置。',
    checkoutFailed: '创建支付失败，请稍后再试。',
    billingSuccess: '支付正在处理中，确认后积分会自动到账。',
    billingCancelled: '已取消支付，你可以随时购买积分包。',
    billingFailed: '支付校验失败，本次没有增加积分。',
    authRequired: '登录后即可生成测试图。',
    signIn: '登录',
    signInTitle: '登录后继续创作',
    signInSubtitle: '注册或登录账户，即可保存项目、上传图片并使用生图积分。',
    authLoginMode: '登录',
    authRegisterMode: '注册账户',
    authForgotPassword: '忘记密码？',
    authResetTitle: '找回密码',
    authResetSubtitle: '输入注册邮箱、邮箱验证码和新密码。',
    authBackToLogin: '返回登录',
    authEmail: '邮箱',
    authPassword: '密码',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
    authNewPassword: '新密码',
    authConfirmPassword: '确认新密码',
    authPasswordMismatch: '两次输入的密码不一致。',
    authResetSubmit: '重置密码',
    authResetSuccess: '密码已重置，请使用新密码登录。',
    authResetCodeSent: '如果该邮箱已注册，6 位重置验证码已发送。',
    authName: '显示名称',
    authVerificationCode: '邮箱验证码',
    authSendCode: '发送验证码',
    authSendingCode: '发送中…',
    authResendCode: '重新发送',
    authResendIn: '{seconds} 秒后重发',
    authCodeSent: '6 位验证码已发送到你的邮箱。',
    authPreviewCode: '本地预览验证码：{code}',
    authSubmitLogin: '登录',
    authSubmitRegister: '创建账户',
    authPasswordHint: '密码至少需要 8 个字符。',
    authInvalidCredentials: '邮箱或密码不正确。',
    authEmailRegistered: '该邮箱已经注册。',
    authInvalidEmail: '请输入有效邮箱地址。',
    authInvalidPassword: '密码至少需要 8 个字符。',
    authCodeRequired: '请输入 6 位邮箱验证码。',
    authCodeInvalid: '邮箱验证码不正确。',
    authCodeExpired: '邮箱验证码已失效，请重新发送。',
    authCodeLocked: '验证码错误次数过多，请重新发送。',
    authCodeCooldown: '请稍后再重新发送验证码。',
    authEmailSendFailed: '验证码邮件发送失败，请稍后重试。',
    authEmailNotConfigured: '邮件发送服务尚未配置。',
    authDomainBlocked: '该邮箱域名暂不允许注册。',
    authRateLimited: '登录尝试过于频繁，请稍后再试。',
    googleNotConfigured: 'Google 登录还没有启用。',
    continueWithGoogle: '使用 Google 登录',
    continueWithWatcha: '使用观猹登录',
    authNotConfigured: '登录功能还没有完成配置。',
    watchaNotConfigured: '观猹登录还没有完成配置。',
    watchaSessionExpired: '观猹登录已过期，请重新尝试。',
    watchaDenied: '已取消观猹授权。',
    watchaLoginFailed: '观猹登录失败，请稍后再试。',
    authError: '登录失败，请稍后再试。',
    signOut: '退出登录',
    account: '账号',
    accountSettings: '账户设置',
    accountTitle: '账户设置',
    accountSubtitle: '管理你的显示名称和 GPT-Image2 积分消耗。',
    displayName: '显示名称',
    saveProfile: '保存资料',
    profileSaved: '资料已保存。',
    profileUpdateFailed: '资料保存失败，请稍后再试。',
    changePassword: '修改密码',
    changePasswordHint: '先验证当前密码，新密码需要输入两次进行确认。',
    currentPassword: '当前密码',
    confirmNewPassword: '再次输入新密码',
    saveNewPassword: '确认修改密码',
    passwordChanged: '密码已修改。',
    passwordChangedSessions: '密码已修改，其他设备已退出登录。',
    currentPasswordWrong: '当前密码不正确。',
    passwordUnchanged: '新密码不能与当前密码相同。',
    passwordChangeFailed: '密码修改失败，请稍后重试。',
    googleAvatarSource: '头像会同步你的登录账号头像。',
    accountOverview: '账户概览',
    totalGenerations: '生成测试数',
    totalGenerationCredits: '已消耗积分',
    generationUsage: '生图消耗记录',
    openCase: '查看案例',
    sourceCase: '关联案例',
    noGenerationTransactions: '暂无生图消耗记录。',
    adminPanel: '后台',
    creditCenter: '积分中心',
    superAdmin: '超级管理员',
    credits: '积分',
    buyCredits: '充值',
    creditPacks: '充值套餐',
    packCredits: (count) => `${count} 积分`,
    billingTitle: '积分充值',
    billingSubtitle: '选择固定套餐或自定义金额，可使用支付宝或微信支付。',
    balanceTitle: '当前余额',
    transactionHistory: '积分流水',
    noTransactions: '暂无积分流水。',
    loadBilling: '正在加载积分中心...',
    openBilling: '打开积分中心',
    paymentReady: '在线充值已开放。',
    billingNotReady: '在线充值尚未配置。',
    adminAdjust: '调整积分',
    editUser: '编辑用户',
    creditAmount: '数量',
    reason: '原因',
    newPassword: '新密码',
    newPasswordHint: '不填写则保留用户原密码不变。',
    applyAdjustment: '保存修改',
    cancel: '取消',
    promotionTitle: '生图促销',
    promotionSubtitle: '基础原价保持不变，统一为自由生图、电商套图和单图精修设置活动折扣。',
    promotionEnabled: '启用促销',
    promotionName: '活动名称',
    promotionNamePlaceholder: '例如：暑期上新',
    promotionPayPercent: '实付比例',
    promotionPayPercentHint: '填写 80 表示八折。先计算原价，再乘以折扣比例，四舍五入精确到 1 积分；最低仍为 20 积分。',
    promotionStartsAt: '开始时间',
    promotionEndsAt: '结束时间',
    promotionSave: '保存促销设置',
    promotionSaving: '正在保存……',
    promotionSaved: '促销设置已保存。',
    promotionUpdateFailed: '促销设置保存失败。',
    promotionRangeInvalid: '结束时间必须晚于开始时间。',
    promotionActive: '活动进行中',
    promotionScheduled: '等待开始',
    promotionExpired: '已结束',
    promotionInactive: '未启用',
    promotionPreview: '价格预览',
    freeReady: '免费测试可用',
    freeUsedShort: '免费测试已用',
    signInToGenerate: '登录后生成',
    creditsAvailable: (count) => `可用积分 ${count}`,
    adminTitle: '用户管理',
    adminSubtitle: '统一查看流量、用户、积分和生图活跃情况。',
    adminMetrics: '数据看板',
    trafficMetrics: '流量数据',
    businessMetrics: '业务数据',
    analyticsNotConfigured: 'GA4 还没有配置，当前先展示业务数据。',
    analyticsLoadFailed: 'GA4 数据暂时读取失败，当前先展示业务数据。',
    invalidDateRange: '请选择 180 天以内的日期范围。',
    rangeToday: '今天',
    range7d: '近 7 天',
    range30d: '近 30 天',
    range90d: '近 90 天',
    customRange: '自定义',
    startDate: '开始日期',
    endDate: '结束日期',
    applyRange: '应用',
    selectedRange: '当前区间',
    pv: 'PV',
    uv: 'UV',
    visits: '访问数',
    sessions: 'Sessions',
    newUsers: '新访客',
    registeredUsers: '注册用户',
    newRegistrations: '新增注册',
    totalGenerationsMetric: '总生图量',
    rangeGenerations: '区间生图量',
    succeeded: '成功',
    failed: '失败',
    pending: '进行中',
    creditsConsumed: '已消耗积分',
    creditsInCirculation: '账户积分余额',
    purchasedCredits: '购买积分',
    dailyTraffic: '每日流量',
    trafficTrend: '流量趋势',
    businessTrend: '业务趋势',
    registrations: '注册',
    topPages: '热门页面',
    channels: '来源渠道',
    countries: '国家/地区',
    pageViews: '浏览量',
    noAnalyticsRows: '暂无统计数据。',
    refresh: '刷新',
    users: '用户',
    role: '角色',
    creditBalance: '积分',
    freeGeneration: '免费测试',
    spentCredits: '消耗',
    purchased: '购买',
    lastGeneration: '最近生图',
    createdAt: '创建时间',
    loadingUsers: '正在加载用户...',
    noUsers: '暂无用户。',
    adminOnly: '仅超级管理员可查看。',
    adminLoadFailed: '账户管理数据加载失败，请稍后重试。',
    creditAdjustmentFailed: '积分调整失败，请稍后重试。',
    creditAdjustmentInsufficient: '调整后账户积分不能小于 0。',
    adminUserNotFound: '所选用户已不存在。',
    fullPrompt: '完整 Prompt',
    templatePrompt: '模板 Prompt',
    useWhen: '适用场景',
    guidance: '使用建议',
    pitfalls: '防坑指南',
    examples: '关联案例',
    source: '来源',
    limit: (count) => `为了保证浏览速度，当前展示前 ${count} 条结果。可以用搜索或筛选缩小范围。`
  }
};

const labelMap = {
  zh: {
    'Architecture & Spaces': '建筑与空间',
    Architecture: '建筑',
    Brand: '品牌',
    'Brand & Logos': '品牌与标志',
    Character: '角色',
    Characters: '人物',
    'Characters & People': '人物与角色',
    Charts: '图表',
    'Charts & Infographics': '图表与信息可视化',
    Classical: '古典',
    Commerce: '商业',
    Creative: '创意',
    Documents: '文档',
    'Documents & Publishing': '文档与出版物',
    Education: '教育',
    Fashion: '时尚',
    Food: '食品饮品',
    History: '历史',
    'History & Classical Themes': '历史与古风题材',
    Illustration: '插画',
    'Illustration & Art': '插画与艺术',
    Infographic: '信息图',
    'Other Use Cases': '其他应用场景',
    Photography: '摄影',
    'Photography & Realism': '摄影与写实',
    Poster: '海报',
    'Posters & Typography': '海报与排版',
    Product: '商品',
    Products: '商品',
    'Products & E-commerce': '商品与电商',
    Realistic: '写实',
    Scenes: '场景',
    'Scenes & Storytelling': '场景与叙事',
    Social: '社媒',
    Story: '叙事',
    Tech: '科技',
    Travel: '旅行',
    UI: '界面',
    'UI & Interfaces': 'UI 与界面'
  }
};

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function textFor(value, language) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[language] || value.en || value.zh || '';
}

function listFor(value, language) {
  const localized = value?.[language] || value?.en || value?.zh || [];
  return Array.isArray(localized) ? localized : [];
}

function compactText(value, maxLength = 180) {
  if (!value || value.length <= maxLength) return value || '';
  return `${value.slice(0, maxLength)}...`;
}

const GENERATED_TESTS_STORAGE_KEY = 'gpt-image-2-generated-tests:v1';
const MAX_SAVED_GENERATIONS = 12;
const HERO_CASE_COUNT = 5;
const HOT_STRIP_CASE_COUNT = 8;
const GALLERY_INITIAL_COUNT = 12;
const GALLERY_BATCH_SIZE = 12;
const EMPTY_SITE_DATA = Object.freeze({
  repository: '',
  totalCases: 0,
  categories: [],
  styles: [],
  scenes: [],
  cases: []
});
const EMPTY_STYLE_LIBRARY = Object.freeze({
  categories: [],
  styles: [],
  scenes: [],
  templates: [],
  tagLabels: {}
});
let bodyScrollLockCount = 0;
let bodyScrollLockState = null;

const PAGE_HASHES = {
  home: 'home',
  cases: 'gallery',
  templates: 'templates',
  create: 'create',
  canvas: 'canvas',
  assets: 'assets',
  cooperation: 'cooperation',
  admin: 'admin'
};
const PUBLIC_PAGES = new Set(['home', 'cases', 'templates', 'cooperation']);

const SITE_THEME_STORAGE_KEY = 'pic365.site-theme.v1';

function loadSiteTheme() {
  try {
    return localStorage.getItem(SITE_THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function pageFromHash(hash = '') {
  const value = String(hash || '').replace(/^#/, '');
  if (!value || value === PAGE_HASHES.home) return 'home';
  if (value === PAGE_HASHES.templates) return 'templates';
  if (value === PAGE_HASHES.cases) return 'cases';
  if (value === PAGE_HASHES.canvas) return 'canvas';
  if (value === PAGE_HASHES.assets) return 'assets';
  if (value === PAGE_HASHES.cooperation) return 'cooperation';
  if (value === PAGE_HASHES.admin) return 'admin';
  return 'create';
}

function hashForPage(page) {
  return PAGE_HASHES[page] || PAGE_HASHES.home;
}

function pagePathWithHash() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function sendGaPageView() {
  if (!gaMeasurementId || typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', {
    page_title: document.title,
    page_location: window.location.href,
    page_path: pagePathWithHash()
  });
}

function useGaPageViews() {
  useEffect(() => {
    if (!gaMeasurementId) return undefined;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', gaMeasurementId, { send_page_view: false });

    const existingScript = document.querySelector(`script[data-ga4="${gaMeasurementId}"]`);
    if (!existingScript) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`;
      script.dataset.ga4 = gaMeasurementId;
      document.head.appendChild(script);
    }

    sendGaPageView();
    window.addEventListener('hashchange', sendGaPageView);
    window.addEventListener('popstate', sendGaPageView);
    return () => {
      window.removeEventListener('hashchange', sendGaPageView);
      window.removeEventListener('popstate', sendGaPageView);
    };
  }, []);
}

function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;

    if (bodyScrollLockCount === 0) {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      bodyScrollLockState = {
        scrollY,
        bodyOverflow: document.body.style.overflow,
        bodyPosition: document.body.style.position,
        bodyTop: document.body.style.top,
        bodyWidth: document.body.style.width,
        htmlOverflow: document.documentElement.style.overflow
      };
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    }

    bodyScrollLockCount += 1;

    return () => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
      if (bodyScrollLockCount > 0 || !bodyScrollLockState) return;

      const { scrollY, bodyOverflow, bodyPosition, bodyTop, bodyWidth, htmlOverflow } = bodyScrollLockState;
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
      document.body.style.position = bodyPosition;
      document.body.style.top = bodyTop;
      document.body.style.width = bodyWidth;
      bodyScrollLockState = null;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function formatShortDate(value, language) {
  if (!value) return '-';
  const normalized = /^\d{8}$/.test(String(value))
    ? `${String(value).slice(0, 4)}-${String(value).slice(4, 6)}-${String(value).slice(6, 8)}T00:00:00Z`
    : value;
  return new Date(normalized).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric'
  });
}

function formatRangeDate(value, language) {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function dateInputValue(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function firstNumber(...values) {
  const value = values.find((item) => item !== undefined && item !== null);
  return Number(value || 0);
}

function percentOf(value, max) {
  if (!max) return 0;
  return Math.max(4, Math.round((Number(value || 0) / max) * 100));
}

function readSavedGenerations() {
  try {
    return JSON.parse(localStorage.getItem(GENERATED_TESTS_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function getSavedGeneration(caseId) {
  const saved = readSavedGenerations()[String(caseId)];
  return saved?.image ? saved : null;
}

function saveGeneratedTest(caseId, entry) {
  const key = String(caseId);
  const saved = readSavedGenerations();
  saved[key] = entry;

  const latestEntries = Object.entries(saved)
    .filter(([, value]) => value?.image)
    .sort(([, a], [, b]) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))
    .slice(0, MAX_SAVED_GENERATIONS);

  try {
    localStorage.setItem(GENERATED_TESTS_STORAGE_KEY, JSON.stringify(Object.fromEntries(latestEntries)));
  } catch {
    const compactEntries = latestEntries.slice(0, Math.max(1, Math.floor(MAX_SAVED_GENERATIONS / 2)));
    try {
      localStorage.setItem(GENERATED_TESTS_STORAGE_KEY, JSON.stringify(Object.fromEntries(compactEntries)));
    } catch {
      // Browser storage can be full or blocked. The generated image still stays
      // visible for the current dialog state when persistence is unavailable.
    }
  }
}

function normalizeFavoriteRows(favorites = []) {
  const rows = Array.isArray(favorites) ? favorites : [];
  return rows
    .map((favorite) => ({
      caseId: Number(favorite.caseId || favorite.case_id),
      createdAt: favorite.createdAt || favorite.created_at || ''
    }))
    .filter((favorite) => Number.isInteger(favorite.caseId) && favorite.caseId > 0);
}

function takeDistinctCases(cases, count, excludedIds = new Set()) {
  const picked = [];
  const seenIds = new Set(excludedIds);

  for (const caseItem of cases) {
    if (seenIds.has(caseItem.id)) continue;
    picked.push(caseItem);
    seenIds.add(caseItem.id);
    if (picked.length === count) break;
  }

  return picked;
}

function localizeLabel(value, language, styleLibrary) {
  const libraryItems = [
    ...(styleLibrary?.categories || []),
    ...(styleLibrary?.styles || []),
    ...(styleLibrary?.scenes || [])
  ];
  const match = libraryItems.find((item) => item.value === value || item.id === value);
  if (match) return textFor(match.title, language);
  return labelMap[language]?.[value] || value;
}

function localizeTemplateTag(value, language, styleLibrary) {
  const tagLabel = styleLibrary?.tagLabels?.[value];
  if (tagLabel) return textFor(tagLabel, language);
  return localizeLabel(value, language, styleLibrary);
}

function orderByLibrary(values, libraryItems = []) {
  const order = new Map(libraryItems.map((item, index) => [item.value, index]));
  return [...values].sort((a, b) => {
    const aOrder = order.has(a) ? order.get(a) : Number.MAX_SAFE_INTEGER;
    const bOrder = order.has(b) ? order.get(b) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b);
  });
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some embedded browsers block the async clipboard API. Fall back to the
      // older selection path so the copy button still works in local previews.
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
  document.body.removeChild(textarea);
}

function useCopy() {
  const [copiedId, setCopiedId] = useState(null);

  async function copyText(text, id) {
    await copyToClipboard(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  async function copyPrompt(caseItem) {
    await copyText(caseItem.prompt, `case-${caseItem.id}`);
  }

  return { copiedId, copyPrompt, copyText };
}

function generationErrorMessage(error, language) {
  const t = copy[language];
  if (error === 'FREE_LIMIT_REACHED') return t.freeLimitReached;
  if (error === 'CREDITS_REQUIRED') return t.creditsRequired;
  if (error === 'GUEST_FREE_LIMIT_REACHED') return t.guestFreeLimitReached;
  if (error === 'AUTH_REQUIRED') return t.authRequired;
  if (error === 'FORBIDDEN') return t.adminOnly;
  if (error === 'ADMIN_USERS_LOAD_FAILED' || error === 'ADMIN_METRICS_LOAD_FAILED') return t.adminLoadFailed;
  if (error === 'CREDIT_ADJUSTMENT_FAILED' || error === 'INVALID_CREDIT_ADJUSTMENT') return t.creditAdjustmentFailed;
  if (error === 'CREDITS_INSUFFICIENT') return t.creditAdjustmentInsufficient;
  if (error === 'USER_NOT_FOUND') return t.adminUserNotFound;
  if (error === 'UPSTREAM_BUSY') return t.generationBusy;
  if (error === 'IMAGE_PROVIDER_UNAVAILABLE') return language === 'zh'
    ? '当前生图服务没有可用的模型渠道，请联系管理员检查服务配置。'
    : 'The selected image service has no available model channel. Please ask an administrator to check its configuration.';
  if (error === 'IMAGE_PROVIDER_AUTH_FAILED') return language === 'zh'
    ? '当前生图服务的 API Key 无效或无权限。'
    : 'The selected image service API key is invalid or unauthorized.';
  if (error === 'IMAGE_PROVIDER_BALANCE_ERROR') return language === 'zh'
    ? '当前生图服务的上游余额或额度不足。'
    : 'The upstream image service has insufficient balance or quota.';
  if (error === 'IMAGE_PROVIDER_TIMEOUT') return language === 'zh'
    ? '生图服务请求超时，请稍后重试。'
    : 'The image service request timed out. Please try again later.';
  if (error === 'CLIENT_GENERATION_TIMEOUT') return t.generationTimeout;
  if (error === 'SERVER_NOT_CONFIGURED') return t.serverUnavailable;
  if (error === 'BILLING_NOT_CONFIGURED') return t.checkoutUnavailable;
  if (error === 'INVALID_PAYMENT_METHOD') return language === 'zh' ? '请选择有效的支付方式。' : 'Choose a valid payment method.';
  if (error === 'INVALID_RECHARGE_AMOUNT') return language === 'zh' ? '充值金额无效。' : 'The recharge amount is invalid.';
  if (error === 'RECHARGE_CONTACT_REQUIRED') return language === 'zh' ? '该金额超过自助充值上限，请联系客服。' : 'This amount exceeds the self-service limit. Contact support.';
  if (error === 'CHECKOUT_FAILED') return t.checkoutFailed;
  if (error === 'INVALID_PROMPT') return t.promptRequired;
  if (error === 'CONTENT_MODERATION_BLOCKED') return t.contentModerationBlocked;
  return t.generationFailed;
}

function dateTimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function dateTimeLocalIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function promotionDraftFromValue(value = {}) {
  return {
    enabled: Boolean(value.enabled),
    name: String(value.name || ''),
    payPercent: Number(value.payPercent || 100),
    startsAt: dateTimeLocalValue(value.startsAt),
    endsAt: dateTimeLocalValue(value.endsAt)
  };
}

function amountInputValue(amountCents) {
  const amount = Number(amountCents || 0) / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function createRechargeDraft(value = {}, payment = {}) {
  const normalized = normalizeRechargeConfig(value);
  return {
    signupBonusCredits: String(normalized.signupBonusCredits),
    creditsPerYuan: normalized.creditsPerYuan,
    packs: normalized.packs.map((pack) => ({
      id: pack.id,
      amountYuan: amountInputValue(pack.amountCents),
      bonusPercent: String(pack.bonusPercent),
      enabled: pack.enabled !== false
    })),
    custom: {
      enabled: normalized.custom.enabled !== false,
      minimumAmountYuan: amountInputValue(normalized.custom.minimumAmountCents),
      bonusThresholdYuan: amountInputValue(normalized.custom.bonusThresholdCents),
      bonusPercent: String(normalized.custom.bonusPercent),
      maximumSelfServiceAmountYuan: amountInputValue(normalized.custom.maximumSelfServiceAmountCents),
      contactMessageZh: normalized.custom.contactMessageZh,
      contactMessageEn: normalized.custom.contactMessageEn
    },
    payment: {
      enabled: Boolean(payment.enabled),
      merchantId: String(payment.merchantId || ''),
      gatewayUrl: String(payment.gatewayUrl || ''),
      apiKey: '',
      hasApiKey: Boolean(payment.hasApiKey),
      apiKeyMasked: String(payment.apiKeyMasked || '')
    }
  };
}

function rechargePayloadFromDraft(draft) {
  return {
    signupBonusCredits: Number(draft.signupBonusCredits),
    packs: draft.packs.map((pack) => ({
      id: pack.id,
      amountCents: Math.round(Number(pack.amountYuan) * 100),
      bonusPercent: Number(pack.bonusPercent),
      enabled: pack.enabled !== false
    })),
    custom: {
      enabled: draft.custom.enabled !== false,
      minimumAmountCents: Math.round(Number(draft.custom.minimumAmountYuan) * 100),
      bonusThresholdCents: Math.round(Number(draft.custom.bonusThresholdYuan) * 100),
      bonusPercent: Number(draft.custom.bonusPercent),
      maximumSelfServiceAmountCents: Math.round(Number(draft.custom.maximumSelfServiceAmountYuan) * 100),
      contactMessageZh: draft.custom.contactMessageZh,
      contactMessageEn: draft.custom.contactMessageEn
    }
  };
}

function yipayPayloadFromDraft(draft) {
  return {
    enabled: Boolean(draft.payment.enabled),
    merchantId: String(draft.payment.merchantId || '').trim(),
    gatewayUrl: String(draft.payment.gatewayUrl || '').trim(),
    apiKey: String(draft.payment.apiKey || '').trim()
  };
}

function rechargePackPreview(pack, creditsPerYuan = 100) {
  return calculateRechargeCredits(
    Math.round(Number(pack.amountYuan || 0) * 100),
    Number(pack.bonusPercent || 0),
    creditsPerYuan
  );
}

function getAuthHeaders(session) {
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function isAuthenticatedSession(session) {
  return Boolean(session?.user || session?.access_token);
}

function getGenerationQuotaText(profile, language, requiredCredits = 0) {
  const t = copy[language];
  if (!profile) return t.authRequired;
  if (profile.groupAccount) {
    const accountLabel = language === 'zh' ? `集团账户：${profile.groupAccount.name}` : `Group account: ${profile.groupAccount.name}`;
    return `${accountLabel} · ${t.generationCost(requiredCredits)} · ${t.creditsAvailable(profile.creditBalance)}`;
  }
  if (profile.isSuperAdmin) {
    return `${t.superAdminGeneration(requiredCredits)} ${t.creditsAvailable(profile.creditBalance)}`;
  }
  if (profile.creditBalance > 0) {
    return `${t.generationCost(requiredCredits)} · ${t.creditsAvailable(profile.creditBalance)}`;
  }
  return t.creditsRequired;
}

function productText(value, language) {
  if (!value) return '';
  return value[language] || value.en || value.zh || '';
}

function formatStorageBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function transactionLabel(transaction, language) {
  const typeMap = {
    storage: language === 'zh' ? '存储消耗' : 'Storage usage',
    grant: language === 'zh' ? '赠送' : 'Grant',
    signup_bonus: language === 'zh' ? '注册赠送' : 'Sign-up bonus',
    purchase: language === 'zh' ? '购买' : 'Purchase',
    generation: language === 'zh' ? '生图消耗' : 'Generation',
    refund: language === 'zh' ? '失败返还' : 'Refund',
    adjustment: language === 'zh' ? '管理员调整' : 'Admin adjustment'
  };
  return typeMap[transaction.type] || transaction.type || '-';
}

function transactionCaseId(transaction) {
  const rawCaseId = transaction?.caseId || transaction?.metadata?.caseId;
  const caseId = Number(rawCaseId);
  return Number.isFinite(caseId) && caseId > 0 ? caseId : null;
}

function TransactionItem({ transaction, language, casesById, onOpenCase }) {
  const t = copy[language];
  const caseId = transactionCaseId(transaction);
  const caseItem = caseId ? casesById?.get(caseId) : null;
  const caseLabel = caseItem
    ? `${t.openCase} #${caseId} · ${compactText(caseItem.title, 28)}`
    : `${t.sourceCase} #${caseId}`;

  return (
    <div className={cx('transactionItem', caseId && 'hasCase')}>
      <div className="transactionInfo">
        <span>{transactionLabel(transaction, language)}</span>
        {caseId ? (
          <button
            className="transactionCaseLink"
            type="button"
            onClick={() => caseItem && onOpenCase?.(caseItem)}
            disabled={!caseItem}
          >
            <ImageIcon size={14} />
            {caseLabel}
          </button>
        ) : null}
      </div>
      <strong className={transaction.amount >= 0 ? 'positive' : 'negative'}>
        {transaction.amount >= 0 ? '+' : ''}{transaction.amount}
      </strong>
      <em>
        {transaction.createdAt
          ? new Date(transaction.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
          : '-'}
      </em>
    </div>
  );
}

function formatTemplatePrompt(item, language, styleLibrary) {
  const title = textFor(item.title, language);
  const description = textFor(item.description, language);
  const useWhen = textFor(item.useWhen, language);
  const guidance = listFor(item.guidance, language);
  const pitfalls = listFor(item.pitfalls, language);
  const tags = [
    localizeLabel(item.category, language, styleLibrary),
    ...(item.styles || []).map((style) => localizeLabel(style, language, styleLibrary)),
    ...(item.scenes || []).map((scene) => localizeLabel(scene, language, styleLibrary)),
    ...(item.tags || []).map((tag) => localizeTemplateTag(tag, language, styleLibrary))
  ].filter(Boolean);
  const uniqueTags = [...new Set(tags)];

  if (language === 'zh') {
    return [
      `模板：${title}`,
      `用途：${useWhen || description}`,
      `视觉方向：${uniqueTags.join(' / ')}`,
      '',
      '请基于以下结构生成一条可直接用于 GPT Image 2 的图片 Prompt：',
      '- 主体：[要生成的产品、人物、空间、界面或信息主题]',
      '- 场景：[使用环境、叙事背景、受众语境]',
      '- 构图：[画面比例、镜头距离、主体位置、层级关系]',
      '- 风格：[材质、光线、色彩、时代感、品牌气质]',
      '- 文本：[必须准确显示的标题、标签、按钮或说明文字]',
      '- 细节：[关键装饰、辅助元素、信息标注、交互层]',
      '- 输出：[清晰度、比例、完成度、可读性要求]',
      '',
      '核心约束：',
      ...guidance.map((line) => `- ${line}`),
      '',
      '需要避免：',
      ...pitfalls.map((line) => `- ${line}`)
    ].join('\n');
  }

  return [
    `Template: ${title}`,
    `Use case: ${useWhen || description}`,
    `Visual direction: ${uniqueTags.join(' / ')}`,
    '',
    'Create a copy-ready GPT Image 2 prompt with this structure:',
    '- Subject: [product, person, space, interface, or information topic]',
    '- Scene: [context, audience, narrative setting]',
    '- Composition: [aspect ratio, camera distance, focal hierarchy, placement]',
    '- Style: [material, lighting, color, era, brand tone]',
    '- Text: [exact title, labels, buttons, or annotations that must be readable]',
    '- Details: [decorative elements, callouts, UI layers, supporting objects]',
    '- Output: [resolution, aspect ratio, polish level, readability requirements]',
    '',
    'Core constraints:',
    ...guidance.map((line) => `- ${line}`),
    '',
    'Avoid:',
    ...pitfalls.map((line) => `- ${line}`)
  ].join('\n');
}

function Hero({ latestCases, language, totalCases, categoryCount, onOpenCase, onExplore }) {
  const t = copy[language];

  return (
    <section className="hero">
      <div className="heroGlow heroGlowA" />
      <div className="heroGlow heroGlowB" />
      <div className="scanGrid" />
      <div className="heroCopy">
        <div className="eyebrow">
          <Sparkles size={16} />
          {t.eyebrow}
        </div>
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
        <div className="heroActions">
          <a
            className="primaryAction"
            href="#gallery"
            onClick={(event) => {
              event.preventDefault();
              onExplore();
            }}
          >
            {t.explore}
            <ArrowUpRight size={18} />
          </a>
        </div>
        <div className="metrics">
          <span><strong>{totalCases}</strong> {t.cases}</span>
          <span><strong>{categoryCount}</strong> {t.categories}</span>
          <span><strong>20+</strong> {t.templates}</span>
        </div>
      </div>
      <div className="heroDeck" aria-label="Latest GPT-Image2 cases">
        {latestCases.length ? latestCases.slice(0, 5).map((caseItem, index) => (
          <button
            className={`heroCard heroCard${index + 1}`}
            type="button"
            aria-label={`${language === 'zh' ? '打开案例' : 'Open case'} ${caseItem.id}: ${caseItem.title}`}
            onClick={() => onOpenCase(caseItem)}
            key={caseItem.id}
          >
            <img
              src={caseItem.thumbnail || caseItem.image}
              alt={caseItem.imageAlt}
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={index === 0 ? 'high' : 'auto'}
            />
            <span>{language === 'zh' ? '案例' : 'Case'} {caseItem.id}</span>
          </button>
        )) : Array.from({ length: 5 }, (_, index) => (
          <span className={`heroCard heroCard${index + 1} galleryImageSkeleton`} aria-hidden="true" key={`hero-skeleton-${index}`} />
        ))}
      </div>
    </section>
  );
}

function FilterPill({ active, children, onClick }) {
  return (
    <button className={cx('filterPill', active && 'active')} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function useDropdownDismiss(open, setOpen) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setOpen]);

  return ref;
}

function LanguageSwitch({ language, setLanguage, combinedLabel = false }) {
  const [open, setOpen] = useState(false);
  const ref = useDropdownDismiss(open, setOpen);
  const languageOptions = [
    { value: 'en', label: 'English', short: 'EN' },
    { value: 'zh', label: '中文', short: '中文' }
  ];
  const activeLanguage = languageOptions.find((option) => option.value === language) || languageOptions[0];

  return (
    <div className="dropdownControl languageSwitch" ref={ref}>
      <button
        className={cx('dropdownTrigger', open && 'open')}
        type="button"
        aria-label="Language"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
      <span>{combinedLabel ? '中文 / En' : activeLanguage.short}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="dropdownMenu languageMenu" role="menu">
          {languageOptions.map((option) => (
            <button
              className={cx(option.value === language && 'active')}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === language}
              onClick={() => {
                setLanguage(option.value);
                setOpen(false);
              }}
              key={option.value}
            >
              <span>{option.label}</span>
              <strong>{option.short}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function authErrorMessage(error, language) {
  const t = copy[language];
  const message = String(error?.message || error || '').trim();
  const normalized = message.toLowerCase();

  if (error?.status === 429 || normalized.includes('rate limit') || normalized.includes('too many')) {
    return t.authRateLimited;
  }

  if (normalized.includes('provider') || normalized.includes('oauth')) {
    return t.googleNotConfigured;
  }

  return message || t.authError;
}

function authRedirectErrorMessage(code, language) {
  const t = copy[language];
  if (code === 'watcha_not_configured') return t.watchaNotConfigured;
  if (code === 'watcha_state_failed') return t.watchaSessionExpired;
  if (code === 'watcha_denied') return t.watchaDenied;
  if (code === 'watcha_login_failed') return t.watchaLoginFailed;
  return t.authError;
}

function GoogleIcon() {
  return (
    <svg className="googleIcon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.25h2.91c1.7-1.57 2.69-3.89 2.69-6.6z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.25c-.8.54-1.83.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.94v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.72A5.41 5.41 0 0 1 3.67 9c0-.6.1-1.18.28-1.72V4.95H.94A9 9 0 0 0 0 9c0 1.45.34 2.82.94 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.57c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.95l3.01 2.33C4.66 5.15 6.65 3.57 9 3.57z" />
    </svg>
  );
}

function WatchaIcon() {
  return <img className="watchaIcon" src={watchaLogoUrl} alt="" aria-hidden="true" loading="lazy" />;
}

function AuthModal({ open, language, initialErrorCode, onClose }) {
  const t = copy[language];
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    if (initialErrorCode) {
      setStatus('error');
      setMessage(authRedirectErrorMessage(initialErrorCode, language));
      return;
    }
    setStatus('idle');
    setMessage('');
    setMode('login');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowLoginPassword(false);
    setFullName('');
    setVerificationCode('');
    setCodeCooldown(0);
    setSendingCode(false);
    setVerifiedEmail('');
  }, [open, initialErrorCode, language]);

  useEffect(() => {
    if (!open || codeCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCodeCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, codeCooldown > 0]);

  if (!open) return null;

  const isLoading = status === 'loading';

  function changeMode(nextMode) {
    setMode(nextMode);
    setStatus('idle');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
    setShowLoginPassword(false);
    setVerificationCode('');
    setVerifiedEmail('');
    setCodeCooldown(0);
  }

  function authErrorMessage(code) {
    return code === 'INVALID_CREDENTIALS' ? t.authInvalidCredentials
      : code === 'EMAIL_ALREADY_REGISTERED' ? t.authEmailRegistered
        : code === 'INVALID_EMAIL' ? t.authInvalidEmail
          : code === 'INVALID_PASSWORD' ? t.authInvalidPassword
            : code === 'VERIFICATION_CODE_REQUIRED' ? t.authCodeRequired
              : code === 'INVALID_VERIFICATION_CODE' ? t.authCodeInvalid
                : code === 'VERIFICATION_CODE_EXPIRED' ? t.authCodeExpired
                  : code === 'VERIFICATION_CODE_ATTEMPTS_EXCEEDED' ? t.authCodeLocked
                    : code === 'VERIFICATION_CODE_COOLDOWN' ? t.authCodeCooldown
                      : code === 'RATE_LIMITED' ? (mode === 'register' ? t.authCodeCooldown : t.authRateLimited)
                      : code === 'EMAIL_SEND_FAILED' ? t.authEmailSendFailed
                        : code === 'EMAIL_NOT_CONFIGURED' ? t.authEmailNotConfigured
                          : code === 'EMAIL_DOMAIN_BLOCKED' || code === 'EMAIL_DOMAIN_NOT_ALLOWED' ? t.authDomainBlocked
                            : t.authError;
  }

  async function handleSendCode() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setStatus('error');
      setMessage(t.authInvalidEmail);
      return;
    }
    setSendingCode(true);
    setMessage('');
    try {
      const result = mode === 'reset'
        ? await authClient.sendPasswordResetCode(email, language)
        : await authClient.sendRegistrationCode(email, language);
      setVerifiedEmail(email.trim().toLowerCase());
      setCodeCooldown(Math.max(1, Number(result.resendAfterSeconds || 60)));
      setStatus('sent');
      setMessage(result.previewCode
        ? t.authPreviewCode.replace('{code}', result.previewCode)
        : mode === 'reset' ? t.authResetCodeSent : t.authCodeSent);
    } catch (error) {
      setStatus('error');
      setMessage(authErrorMessage(error?.code || ''));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (mode === 'reset' && password !== confirmPassword) {
      setStatus('error');
      setMessage(t.authPasswordMismatch);
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      if (mode === 'register') {
        await authClient.signUp(email, password, fullName, verificationCode);
      } else if (mode === 'reset') {
        await authClient.resetPassword(email, verificationCode, password);
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setVerificationCode('');
        setVerifiedEmail('');
        setCodeCooldown(0);
        setStatus('sent');
        setMessage(t.authResetSuccess);
        return;
      } else {
        await authClient.signIn(email, password);
      }
      onClose();
    } catch (error) {
      const code = error?.code || '';
      setStatus('error');
      setMessage(authErrorMessage(code));
    }
  }

  return (
    <div
      className="previewOverlay authOverlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="authDialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="previewClose" type="button" onClick={onClose} aria-label={t.closePreview}>
          <X size={20} />
        </button>
        <div className="authIcon">
          <UserCircle size={28} />
        </div>
        <h2 id="auth-title">{mode === 'reset' ? t.authResetTitle : mode === 'login' ? t.signInTitle : t.authRegisterMode}</h2>
        <p>{mode === 'reset' ? t.authResetSubtitle : t.signInSubtitle}</p>
        {mode === 'reset' ? (
          <button className="authBackButton" type="button" onClick={() => changeMode('login')}>
            {t.authBackToLogin}
          </button>
        ) : (
          <div className="authModeSwitch" role="tablist" aria-label={t.signInTitle}>
            <button type="button" className={cx(mode === 'login' && 'active')} onClick={() => changeMode('login')}>
              {t.authLoginMode}
            </button>
            <button type="button" className={cx(mode === 'register' && 'active')} onClick={() => changeMode('register')}>
              {t.authRegisterMode}
            </button>
          </div>
        )}
        <form className="localAuthForm" onSubmit={handleSubmit}>
          {mode === 'register' ? (
            <label>
              <span>{t.authName}</span>
              <input value={fullName} maxLength={80} onChange={(event) => setFullName(event.target.value)} />
            </label>
          ) : null}
          <label>
            <span>{t.authEmail}</span>
            <input type="email" value={email} autoComplete="email" onChange={(event) => {
              setEmail(event.target.value);
              if (event.target.value.trim().toLowerCase() !== verifiedEmail) {
                setVerificationCode('');
                setVerifiedEmail('');
                setMessage('');
              }
            }} required />
          </label>
          {mode !== 'login' ? (
            <div className="authVerificationField">
              <label htmlFor="auth-verification-code">{t.authVerificationCode}</label>
              <div className="authVerificationRow">
                <input
                  id="auth-verification-code"
                  aria-label={t.authVerificationCode}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={verificationCode}
                  maxLength={6}
                  pattern="[0-9]{6}"
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                />
                <button type="button" onClick={handleSendCode} disabled={sendingCode || codeCooldown > 0}>
                  {sendingCode
                    ? t.authSendingCode
                    : codeCooldown > 0
                      ? t.authResendIn.replace('{seconds}', codeCooldown)
                      : verifiedEmail ? t.authResendCode : t.authSendCode}
                </button>
              </div>
            </div>
          ) : null}
          <label>
            <span>{mode === 'reset' ? t.authNewPassword : t.authPassword}</span>
            <div className="passwordInputWrap">
              <input type={mode === 'login' && showLoginPassword ? 'text' : 'password'} value={password} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
              {mode === 'login' ? (
                <button
                  className="passwordVisibilityButton"
                  type="button"
                  aria-label={showLoginPassword ? t.hidePassword : t.showPassword}
                  title={showLoginPassword ? t.hidePassword : t.showPassword}
                  onClick={() => setShowLoginPassword((current) => !current)}
                >
                  {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              ) : null}
            </div>
          </label>
          {mode === 'reset' ? (
            <label>
              <span>{t.authConfirmPassword}</span>
              <input type="password" value={confirmPassword} autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
            </label>
          ) : null}
          {mode !== 'login' ? <small>{t.authPasswordHint}</small> : null}
          {mode === 'login' ? (
            <button className="authForgotButton" type="button" onClick={() => changeMode('reset')}>
              {t.authForgotPassword}
            </button>
          ) : null}
          <button className="localAuthSubmit" type="submit" disabled={isLoading}>
            {isLoading ? <LoaderCircle className="spinIcon" size={18} /> : mode === 'reset' ? <KeyRound size={18} /> : <LogIn size={18} />}
            {mode === 'reset' ? t.authResetSubmit : mode === 'login' ? t.authSubmitLogin : t.authSubmitRegister}
          </button>
        </form>
        {message ? (
          <p className={cx('authMessage', status === 'error' && 'error', status === 'sent' && 'sent')}>
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function UserMenu({ language, session, profile, onSignIn, onSignOut, onBilling, onAccount, onFavorites }) {
  const t = copy[language];
  const [open, setOpen] = useState(false);
  const ref = useDropdownDismiss(open, setOpen);

  if (!session) {
    return (
      <button className="accountButton" type="button" onClick={onSignIn}>
        <LogIn size={17} />
        <span>{t.signIn}</span>
      </button>
    );
  }

  const email = profile?.email || session.user?.email || t.account;
  const emailUserName = String(email).split('@')[0] || t.account;
  const displayName = profile?.fullName || session.user?.user_metadata?.name || emailUserName;
  const avatarUrl = profile?.avatarUrl || session.user?.user_metadata?.avatar_url || session.user?.user_metadata?.picture || '';
  const totalSpent = Number(profile?.usage?.totalGenerationCredits || 0);

  return (
    <div className="dropdownControl userMenu" ref={ref}>
      <button
        className={cx('userTrigger', open && 'open')}
        type="button"
        aria-label={`${t.account}: ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="avatarBadge">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <UserCircle size={18} />}
        </span>
        <span className="userTriggerName" title={displayName}>{displayName}</span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="dropdownMenu userDropdown" role="menu">
          <div className="userSummary">
            {avatarUrl ? <img className="userSummaryAvatar" src={avatarUrl} alt="" /> : <UserCircle size={32} />}
            <div>
              <strong>{displayName}</strong>
              <span>{email}</span>
            </div>
          </div>
          <div className="userStats">
            {profile?.isSuperAdmin ? (
              <span className="userStat admin">
                <ShieldCheck size={15} />
                {t.superAdmin}
              </span>
            ) : null}
            <span className="userStat">
              <Coins size={15} />
              {profile?.creditBalance || 0} {t.credits}{profile?.groupAccount ? ` · ${profile.groupAccount.name}` : ''}
            </span>
            <span className="userStat">
              <ReceiptText size={15} />
              {t.totalGenerationCredits}: {totalSpent}
            </span>
          </div>
          <div className="dropdownDivider" />
          <button
            className="dropdownAction"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAccount();
            }}
          >
            <Settings size={17} />
            {t.accountSettings}
          </button>
          <button
            className="dropdownAction"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onFavorites();
            }}
          >
            <Heart size={17} />
            {t.myFavorites}
          </button>
          <button
            className="dropdownAction"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onBilling();
            }}
          >
            <CreditCard size={17} />
            {t.creditCenter}
          </button>
          <button
            className="dropdownAction danger"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut size={17} />
            {t.signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AccountPanel({
  open,
  language,
  session,
  profile,
  casesById,
  favoriteRows,
  initialSection,
  onClose,
  onBilling,
  onProfileChange,
  onMenuChanged,
  onOpenCase
}) {
  const t = copy[language];
  const [fullName, setFullName] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('idle');
  const [passwordMessage, setPasswordMessage] = useState('');
  const favoritesRef = useRef(null);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setFullName(profile?.fullName || session?.user?.user_metadata?.name || '');
    setStatus('idle');
    setMessage('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordStatus('idle');
    setPasswordMessage('');
  }, [open, profile?.fullName, session?.user?.user_metadata?.name]);

  useEffect(() => {
    if (!open || initialSection !== 'favorites') return;
    const frame = window.requestAnimationFrame(() => {
      favoritesRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, initialSection, favoriteRows]);

  if (!open) return null;

  const email = profile?.email || session?.user?.email || '';
  const avatarUrl = profile?.avatarUrl || session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture || '';
  const usage = profile?.usage || {};
  const recentTransactions = profile?.recentTransactions || [];
  const generationTransactions = recentTransactions.filter((transaction) => ['generation', 'refund', 'storage'].includes(transaction.type));
  const favoriteCases = normalizeFavoriteRows(favoriteRows)
    .map((favorite) => ({
      ...favorite,
      caseItem: casesById?.get(favorite.caseId)
    }))
    .filter((favorite) => favorite.caseItem);

  async function handleSubmit(event) {
    event.preventDefault();
    const nextName = fullName.trim();
    if (!nextName) {
      setStatus('error');
      setMessage(t.profileUpdateFailed);
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(session)
        },
        body: JSON.stringify({ fullName: nextName })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'PROFILE_UPDATE_FAILED');
      }
      if (payload.user) onProfileChange(payload.user);
      setStatus('success');
      setMessage(t.profileSaved);
    } catch {
      setStatus('error');
      setMessage(t.profileUpdateFailed);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setPasswordStatus('error');
      setPasswordMessage(t.authPasswordMismatch);
      return;
    }
    if (currentPassword.length < 8 || newPassword.length < 8) {
      setPasswordStatus('error');
      setPasswordMessage(t.authInvalidPassword);
      return;
    }
    setPasswordStatus('loading');
    setPasswordMessage('');
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(session)
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword: confirmNewPassword })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        const error = new Error(payload.error || 'PASSWORD_CHANGE_FAILED');
        error.code = payload.error || 'PASSWORD_CHANGE_FAILED';
        throw error;
      }
      if (payload.user) onProfileChange(payload.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordStatus('success');
      setPasswordMessage(payload.otherSessionsRevoked ? t.passwordChangedSessions : t.passwordChanged);
    } catch (error) {
      const code = error?.code || '';
      setPasswordStatus('error');
      setPasswordMessage(code === 'INVALID_CURRENT_PASSWORD'
        ? t.currentPasswordWrong
        : code === 'PASSWORD_MISMATCH'
          ? t.authPasswordMismatch
          : code === 'PASSWORD_UNCHANGED'
            ? t.passwordUnchanged
            : code === 'INVALID_PASSWORD'
              ? t.authInvalidPassword
              : t.passwordChangeFailed);
    }
  }

  return (
    <div
      className="previewOverlay accountOverlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="accountDialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="previewClose" type="button" onClick={onClose} aria-label={t.closePreview}>
          <X size={20} />
        </button>
        <div className="accountHeader">
          <div className="accountAvatar">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <UserCircle size={44} />}
          </div>
          <div>
            <span className="eyebrow">
              <Settings size={16} />
              {t.accountSettings}
            </span>
            <h2 id="account-title">{t.accountTitle}</h2>
            <p>{t.accountSubtitle}</p>
          </div>
        </div>

        <div className="accountGrid">
          <form className="accountForm" onSubmit={handleSubmit}>
            <label>
              <span>{t.displayName}</span>
              <input
                value={fullName}
                maxLength={80}
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
            <div className="accountEmail">
              <span>{t.account}</span>
              <strong>{email}</strong>
              <em>{t.googleAvatarSource}</em>
            </div>
            <button type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <Check size={16} />}
              {t.saveProfile}
            </button>
            {message ? (
              <p className={cx('authMessage', status === 'error' && 'error', status === 'success' && 'sent')}>
                {message}
              </p>
            ) : null}
          </form>

          <section className="accountOverview">
            <h3>{t.accountOverview}</h3>
            <div className="accountMetrics">
              <div>
                <span>{t.creditBalance}</span>
                <strong>{profile?.creditBalance || 0}</strong>
              </div>
              <div>
                <span>{t.totalGenerations}</span>
                <strong>{Number(usage.totalGenerations || 0)}</strong>
              </div>
              <div>
                <span>{t.totalGenerationCredits}</span>
                <strong>{Number(usage.totalGenerationCredits || 0)}</strong>
              </div>
            </div>
            <button className="portalButton accountBillingButton" type="button" onClick={onBilling}>
              <CreditCard size={16} />
              {t.creditCenter}
            </button>
          </section>
        </div>

        <section className="accountPasswordCard">
          <header>
            <div>
              <h3><KeyRound size={18} />{t.changePassword}</h3>
              <p>{t.changePasswordHint}</p>
            </div>
          </header>
          <form className="accountPasswordForm" onSubmit={handlePasswordSubmit}>
            <label>
              <span>{t.currentPassword}</span>
              <input type="password" autoComplete="current-password" minLength={8} maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
            </label>
            <label>
              <span>{t.authNewPassword}</span>
              <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
            </label>
            <label>
              <span>{t.confirmNewPassword}</span>
              <input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} required />
            </label>
            <button type="submit" disabled={passwordStatus === 'loading'}>
              {passwordStatus === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <KeyRound size={16} />}
              {t.saveNewPassword}
            </button>
          </form>
          {passwordMessage ? (
            <p className={cx('authMessage', passwordStatus === 'error' && 'error', passwordStatus === 'success' && 'sent')}>
              {passwordMessage}
            </p>
          ) : null}
        </section>

        <GroupAccountPanel
          language={language}
          profile={profile}
          onProfileChange={onProfileChange}
        />

        <PersonalMenuSettings
          language={language}
          profile={profile}
          onMenuChanged={onMenuChanged}
        />

        <section className="transactionSection favoritesSection" ref={favoritesRef}>
          <h3>
            <Heart size={18} />
            {t.myFavorites}
          </h3>
          {favoriteCases.length ? (
            <div className="favoriteGrid">
              {favoriteCases.map(({ caseId, createdAt, caseItem }) => (
                <button
                  className="favoriteCard"
                  type="button"
                  onClick={() => onOpenCase?.(caseItem)}
                  key={caseId}
                >
                  <img src={caseItem.thumbnail || caseItem.image} alt={caseItem.imageAlt} loading="lazy" decoding="async" />
                  <span>#{caseId}</span>
                  <strong>{caseItem.title}</strong>
                  <em>
                    {createdAt
                      ? new Date(createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')
                      : localizeLabel(caseItem.category, language, null)}
                  </em>
                </button>
              ))}
            </div>
          ) : (
            <p className="emptyTransactions">{t.noFavorites}</p>
          )}
        </section>

        <section className="transactionSection accountTransactions">
          <h3>
            <ReceiptText size={18} />
            {t.generationUsage}
          </h3>
          {generationTransactions.length ? (
            <div className="transactionList">
              {generationTransactions.map((transaction) => (
                <TransactionItem
                  transaction={transaction}
                  language={language}
                  casesById={casesById}
                  onOpenCase={onOpenCase}
                  key={transaction.id}
                />
              ))}
            </div>
          ) : (
            <p className="emptyTransactions">{t.noGenerationTransactions}</p>
          )}
        </section>
      </section>
    </div>
  );
}

function AdminMetricCard({ icon, label, value, hint }) {
  return (
    <div className="adminMetricCard">
      <span className="adminMetricIcon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{formatNumber(value)}</strong>
        {hint ? <em>{hint}</em> : null}
      </div>
    </div>
  );
}

function AdminTrendChart({ rows = [], series = [], language, emptyLabel }) {
  const chartRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const width = 720;
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 38, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => series.map((item) => Number(row[item.key] || 0)))
  );

  function pointFor(row, index, key) {
    const x = padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
    const y = padding.top + chartHeight - (Number(row[key] || 0) / maxValue) * chartHeight;
    return { x, y };
  }

  function linePath(points) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  }

  function areaPath(points) {
    if (!points.length) return '';
    const bottom = padding.top + chartHeight;
    const lastPoint = points[points.length - 1];
    return `${linePath(points)} L ${lastPoint.x.toFixed(2)} ${bottom} L ${points[0].x.toFixed(2)} ${bottom} Z`;
  }

  function handlePointerMove(event) {
    if (!chartRef.current || !rows.length) return;
    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    const rect = chartRef.current.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * width;
    const ratio = Math.min(1, Math.max(0, (relativeX - padding.left) / chartWidth));
    setHoverIndex(Math.round(ratio * (rows.length - 1)));
  }

  if (!rows.length) {
    return <p className="emptyTransactions">{emptyLabel}</p>;
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const xLabelIndexes = rows.length <= 8
    ? rows.map((_, index) => index)
    : [0, Math.round((rows.length - 1) / 2), rows.length - 1];
  const activeIndex = hoverIndex ?? rows.length - 1;
  const activeRow = rows[activeIndex];
  const activeX = pointFor(activeRow, activeIndex, series[0]?.key).x;
  const tooltipX = Math.min(activeX + 12, width - 178);

  return (
    <div className="adminTrendChart">
      <div className="adminChartLegend">
        {series.map((item) => (
          <span key={item.key}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <svg
        ref={chartRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={series.map((item) => item.label).join(', ')}
        onMouseMove={handlePointerMove}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchMove={handlePointerMove}
        onTouchEnd={() => setHoverIndex(null)}
      >
        <defs>
          {series.filter((item) => item.area).map((item) => (
            <linearGradient id={`area-${item.key}`} key={item.key} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity="0.38" />
              <stop offset="100%" stopColor={item.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
        {gridLines.map((line) => {
          const y = padding.top + chartHeight * line;
          return (
            <g key={line}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text x={padding.left - 10} y={y + 4} textAnchor="end">
                {formatNumber(Math.round(maxValue * (1 - line)))}
              </text>
            </g>
          );
        })}
        {xLabelIndexes.map((index) => {
          const point = pointFor(rows[index], index, series[0]?.key);
          return (
            <text className="adminChartDate" key={`${rows[index].date}-${index}`} x={point.x} y={height - 10} textAnchor="middle">
              {formatShortDate(rows[index].date, language)}
            </text>
          );
        })}
        {series.map((item) => {
          const points = rows.map((row, index) => pointFor(row, index, item.key));
          return (
            <g key={item.key}>
              {item.area ? <path className="adminChartArea" d={areaPath(points)} fill={`url(#area-${item.key})`} /> : null}
              <path
                className="adminChartLine"
                d={linePath(points)}
                stroke={item.color}
                strokeDasharray={item.dashed ? '8 7' : undefined}
              />
            </g>
          );
        })}
        {activeRow ? (
          <g className="adminChartActive">
            <line x1={activeX} x2={activeX} y1={padding.top} y2={padding.top + chartHeight} />
            {series.map((item) => {
              const point = pointFor(activeRow, activeIndex, item.key);
              return <circle key={item.key} cx={point.x} cy={point.y} r="4.5" fill={item.color} />;
            })}
            <g className="adminChartTooltip" transform={`translate(${tooltipX} 34)`}>
              <rect width="164" height={38 + series.length * 18} rx="8" />
              <text x="12" y="22">{formatRangeDate(activeRow.date, language)}</text>
              {series.map((item, index) => (
                <text key={item.key} x="12" y={44 + index * 18}>
                  {item.label}: {formatNumber(activeRow[item.key])}
                </text>
              ))}
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function AdminRankList({ rows, type, language }) {
  const t = copy[language];
  if (!rows?.length) return <p className="emptyTransactions">{t.noAnalyticsRows}</p>;

  return (
    <div className="adminRankList">
      {rows.map((row, index) => {
        const title = row.page || row.channel || row.country || '-';
        const mainValue = row.pageViews ?? row.sessions ?? row.activeUsers ?? 0;
        const subValue = row.activeUsers ?? row.pageViews ?? 0;
        return (
          <div className="adminRankItem" key={`${type}-${title}-${index}`}>
            <span>{index + 1}</span>
            <div>
              <strong title={title}>{title}</strong>
              <em>{type === 'channels' ? t.sessions : t.uv}: {formatNumber(subValue)}</em>
            </div>
            <b>{formatNumber(mainValue)}</b>
          </div>
        );
      })}
    </div>
  );
}

function NotificationBell({ language, session, profile, onProfileChange, onSignIn }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedId, setExpandedId] = useState('');
  const [busyId, setBusyId] = useState('');
  const ref = useDropdownDismiss(open, setOpen);
  const signedIn = isAuthenticatedSession(session);

  const refresh = useCallback(async () => {
    if (!signedIn) { setItems([]); setUnreadCount(0); return; }
    try {
      const response = await fetch('/api/notifications?limit=100', { headers: getAuthHeaders(session), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) return;
      setItems(payload.notifications || []);
      setUnreadCount(Number(payload.unreadCount || 0));
    } catch { /* keep the last successful notification list */ }
  }, [signedIn, session]);

  useEffect(() => { refresh(); }, [refresh, profile?.groupInvitations?.length]);
  useEffect(() => {
    if (!signedIn) return undefined;
    const handleFocus = () => refresh();
    window.addEventListener('focus', handleFocus);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener('focus', handleFocus); window.clearInterval(timer); };
  }, [refresh, signedIn]);

  async function markRead(notificationId, all = false) {
    const response = await fetch('/api/notifications', {
      method: 'PATCH', headers: { ...getAuthHeaders(session), 'Content-Type': 'application/json' },
      body: JSON.stringify(all ? { all: true } : { notificationId })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok) { setItems(payload.notifications || []); setUnreadCount(Number(payload.unreadCount || 0)); }
  }

  async function openNotification(item) {
    setExpandedId((current) => current === item.id ? '' : item.id);
    if (item.unread) await markRead(item.id);
  }

  async function respond(item, accept) {
    setBusyId(item.id);
    try {
      const action = item.type === 'group_admin_transfer' ? 'respond-admin-transfer' : 'respond-invitation';
      const body = item.type === 'group_admin_transfer'
        ? { action, transferId: item.entityId, accept }
        : { action, invitationId: item.entityId, accept };
      const response = await fetch('/api/groups', {
        method: 'POST', headers: { ...getAuthHeaders(session), 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok && payload.user) onProfileChange?.(payload.user);
      await refresh();
    } finally { setBusyId(''); }
  }

  if (!signedIn) return <button className="notificationTrigger" type="button" aria-label={language === 'zh' ? '通知，登录后查看' : 'Notifications, sign in to view'} title={language === 'zh' ? '登录后查看通知' : 'Sign in to view notifications'} onClick={onSignIn}><Bell size={20} /></button>;
  return (
    <div className="dropdownControl notificationMenu" ref={ref}>
      <button className={cx('notificationTrigger', open && 'open', unreadCount > 0 && 'hasUnread')} type="button" aria-label={language === 'zh' ? `通知${unreadCount ? `，${unreadCount} 条未读` : ''}` : `Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Bell size={20} />{unreadCount > 0 ? <span>{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>
      {open ? <section className="notificationDropdown" aria-label={language === 'zh' ? '通知中心' : 'Notification center'}>
        <header><div><strong>{language === 'zh' ? '通知' : 'Notifications'}</strong><span>{unreadCount ? (language === 'zh' ? `${unreadCount} 条未读` : `${unreadCount} unread`) : (language === 'zh' ? '全部已读' : 'All read')}</span></div>{unreadCount ? <button type="button" onClick={() => markRead('', true)}>{language === 'zh' ? '全部已读' : 'Mark all read'}</button> : null}</header>
        <div className="notificationList">
          {items.length ? items.map((item) => {
            const expanded = expandedId === item.id;
            return <article className={cx('notificationItem', item.unread && 'unread', expanded && 'expanded')} key={item.id}>
              <button className="notificationItemSummary" type="button" onClick={() => openNotification(item)}>
                <span className="notificationTypeIcon">{item.type.startsWith('group_') ? <Building2 size={17} /> : <Bell size={17} />}</span>
                <span><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small></span>
                {item.unread ? <i /> : null}
              </button>
              {expanded ? <div className="notificationItemBody">
                {item.format === 'plain' ? <p>{item.body}</p> : <RichSiteNoticeContent body={item.body} format={item.format} />}
                {item.metadata?.actionAvailable ? <div className="notificationActions"><button type="button" disabled={busyId === item.id} onClick={() => respond(item, true)}>{language === 'zh' ? '接受' : 'Accept'}</button><button className="secondary" type="button" disabled={busyId === item.id} onClick={() => respond(item, false)}>{language === 'zh' ? '拒绝' : 'Decline'}</button></div> : item.metadata?.status && item.metadata.status !== 'pending' ? <em>{language === 'zh' ? `状态：${item.metadata.status}` : `Status: ${item.metadata.status}`}</em> : null}
              </div> : null}
            </article>;
          }) : <p className="notificationEmpty">{language === 'zh' ? '暂无通知' : 'No notifications'}</p>}
        </div>
      </section> : null}
    </div>
  );
}

function formatPricingInputValue(value, precision) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return Number.isInteger(precision) ? number.toFixed(precision) : String(number);
}

function PricingNumberInput({
  value,
  onCommit,
  min,
  max,
  step = 'any',
  precision,
  alignUpStep,
  disabled = false,
  readOnly = false,
  title
}) {
  const [draft, setDraft] = useState(() => formatPricingInputValue(value, precision));
  const focusedRef = useRef(false);
  const skipCommitRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatPricingInputValue(value, precision));
  }, [value, precision, disabled, readOnly]);

  const restore = () => setDraft(formatPricingInputValue(value, precision));

  const commit = () => {
    focusedRef.current = false;
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      restore();
      return;
    }
    const trimmed = String(draft).trim();
    if (!trimmed) {
      restore();
      return;
    }
    let next = Number(trimmed);
    if (!Number.isFinite(next)) {
      restore();
      return;
    }
    if (Number.isFinite(alignUpStep) && alignUpStep > 0) {
      next = Math.ceil((next - 1e-9) / alignUpStep) * alignUpStep;
    }
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    if (Number.isInteger(precision)) next = Number(next.toFixed(precision));
    onCommit?.(next);
    setDraft(formatPricingInputValue(next, precision));
  };

  return (
    <input
      type="number"
      inputMode={Number.isInteger(precision) && precision > 0 ? 'decimal' : 'numeric'}
      min={min}
      max={max}
      step={step}
      value={readOnly ? formatPricingInputValue(value, precision) : draft}
      disabled={disabled}
      readOnly={readOnly}
      title={title}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          skipCommitRef.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function createProviderDraft(model = 'gpt-image-2') {
  const pricingConfig = defaultImagePricingConfigForModel(model);
  return {
    id: '',
    name: '',
    baseUrl: '',
    apiKey: '',
    model,
    providerType: 'openai-compatible',
    pricingStrategy: pricingConfig.strategy,
    pricingConfig,
    enabled: true,
    isDefault: false
  };
}

function providerPricingLabel(provider, language) {
  const strategy = provider?.pricingStrategy || provider?.pricingConfig?.strategy;
  const labels = language === 'zh'
    ? {
        [IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_FORMULA]: '像素 × 质量公式',
        [IMAGE_PRICING_STRATEGIES.FIXED_QUALITY]: '按质量固定价',
        [IMAGE_PRICING_STRATEGIES.FIXED_IMAGE]: '每张固定价',
        [IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_MATRIX]: '像素区间矩阵'
      }
    : {
        [IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_FORMULA]: 'Pixel × quality formula',
        [IMAGE_PRICING_STRATEGIES.FIXED_QUALITY]: 'Fixed by quality',
        [IMAGE_PRICING_STRATEGIES.FIXED_IMAGE]: 'Fixed per image',
        [IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_MATRIX]: 'Pixel-band matrix'
      };
  return labels[strategy] || strategy || '-';
}

function createNotificationDraft(value = {}) {
  return {
    siteNoticeEnabled: Boolean(value.siteNoticeEnabled),
    siteNoticeTitle: String(value.siteNoticeTitle || ''),
    siteNoticeBody: String(value.siteNoticeBody || ''),
    siteNoticeFormat: ['markdown', 'html'].includes(value.siteNoticeFormat) ? value.siteNoticeFormat : 'markdown',
    siteNoticePlacement: ['banner', 'modal'].includes(value.siteNoticePlacement) ? value.siteNoticePlacement : 'banner',
    audience: ['all', 'signed-in', 'members'].includes(value.audience) ? value.audience : 'all',
    notifyGenerationFailure: value.notifyGenerationFailure !== false,
    notifyLowCredits: value.notifyLowCredits !== false,
    lowCreditThreshold: Number(value.lowCreditThreshold || 20),
    notifyChannelFailure: value.notifyChannelFailure !== false
  };
}

function RichSiteNoticeContent({ body, format, className = '' }) {
  return (
    <Suspense fallback={<div className={className}>通知内容加载中…</div>}>
      <SiteNoticeContent className={className} body={body} format={format} />
    </Suspense>
  );
}

function AdminPanel({ language, session, profile, casesById, onOpenCase, onMenuSettingsChanged }) {
  const t = copy[language];
  const can = useCallback((permission) => profile?.adminPermissions?.includes(permission) === true, [profile?.adminPermissions]);
  const [activeSection, setActiveSection] = useState(() => {
    try {
      const saved = globalThis.localStorage?.getItem('pic365-admin-section');
      if (saved) return saved;
    } catch {
      // Admin navigation persistence is optional.
    }
    return profile?.role === 'operations' ? 'channels' : profile?.role === 'accountant' ? 'credits' : 'pricing';
  });
  const [users, setUsers] = useState([]);
  const [systemGroups, setSystemGroups] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [range, setRange] = useState('7d');
  const [customStart, setCustomStart] = useState(() => dateInputValue(29));
  const [customEnd, setCustomEnd] = useState(() => dateInputValue());
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [creditUser, setCreditUser] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const [promotionDraft, setPromotionDraft] = useState(() => promotionDraftFromValue());
  const [promotionStatus, setPromotionStatus] = useState('idle');
  const [promotionMessage, setPromotionMessage] = useState('');
  const [recharge, setRecharge] = useState(() => normalizeRechargeConfig());
  const [rechargeDraft, setRechargeDraft] = useState(() => createRechargeDraft());
  const [rechargeStatus, setRechargeStatus] = useState('idle');
  const [rechargeMessage, setRechargeMessage] = useState('');
  const [storageBilling, setStorageBilling] = useState(() => normalizeStorageBillingConfig());
  const [storageBillingDraft, setStorageBillingDraft] = useState(() => ({ enabled: true, unitPriceYuanPerGb: '3.00' }));
  const [storageBillingSummary, setStorageBillingSummary] = useState(null);
  const [storageBillingStatus, setStorageBillingStatus] = useState('idle');
  const [storageBillingMessage, setStorageBillingMessage] = useState('');
  const [providers, setProviders] = useState([]);
  const [providerDraft, setProviderDraft] = useState(() => createProviderDraft());
  const [providerPricingReferenceCount, setProviderPricingReferenceCount] = useState(0);
  const [providerEditorMode, setProviderEditorMode] = useState('auto');
  const [providerMessage, setProviderMessage] = useState('');
  const [promptLogging, setPromptLogging] = useState({ enabled: false, updatedAt: null });
  const [promptLogs, setPromptLogs] = useState([]);
  const [promptLoggingStatus, setPromptLoggingStatus] = useState('idle');
  const [promptLoggingMessage, setPromptLoggingMessage] = useState('');
  const [notificationDraft, setNotificationDraft] = useState(() => createNotificationDraft());
  const [notificationStatus, setNotificationStatus] = useState('idle');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [adminAlerts, setAdminAlerts] = useState([]);

  async function loadPromotion() {
    try {
      const response = await fetch('/api/image-pricing', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'PRICING_LOAD_FAILED');
      setPromotion(payload.promotion || null);
      setPromotionDraft(promotionDraftFromValue(payload.promotion));
    } catch {
      setPromotionMessage(t.promotionUpdateFailed);
    }
  }

  async function loadRecharge() {
    try {
      const response = await fetch('/api/admin/recharge', { headers: getAuthHeaders(session), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'RECHARGE_CONFIG_FAILED');
      const next = normalizeRechargeConfig(payload.recharge);
      setRecharge(next);
      setRechargeDraft(createRechargeDraft(next, payload.payment));
      setRechargeStatus('idle');
      setRechargeMessage('');
    } catch {
      setRechargeStatus('error');
      setRechargeMessage(language === 'zh' ? '充值配置加载失败。' : 'Recharge configuration failed to load.');
    }
  }

  function updateRechargePack(index, patch) {
    setRechargeDraft((current) => ({
      ...current,
      packs: current.packs.map((pack, packIndex) => packIndex === index ? { ...pack, ...patch } : pack)
    }));
  }

  function addRechargePack() {
    setRechargeDraft((current) => ({
      ...current,
      packs: [
        ...current.packs,
        { id: `recharge-${Date.now()}`, amountYuan: '10', bonusPercent: '0', enabled: true }
      ]
    }));
  }

  function removeRechargePack(index) {
    setRechargeDraft((current) => ({
      ...current,
      packs: current.packs.filter((_, packIndex) => packIndex !== index)
    }));
  }

  async function saveRecharge(event) {
    event.preventDefault();
    const rechargePayload = rechargePayloadFromDraft(rechargeDraft);
    const paymentPayload = yipayPayloadFromDraft(rechargeDraft);
    const invalidPack = rechargePayload.packs.some((pack) => !Number.isFinite(pack.amountCents) || pack.amountCents < 100 || !Number.isFinite(pack.bonusPercent) || pack.bonusPercent < 0);
    const invalidCustom = !Number.isFinite(rechargePayload.custom.minimumAmountCents)
      || rechargePayload.custom.minimumAmountCents < 100
      || !Number.isFinite(rechargePayload.custom.bonusThresholdCents)
      || !Number.isFinite(rechargePayload.custom.maximumSelfServiceAmountCents);
    if (!rechargePayload.packs.length || invalidPack || invalidCustom) {
      setRechargeStatus('error');
      setRechargeMessage(language === 'zh' ? '请填写有效的充值金额和赠送比例。' : 'Enter valid recharge amounts and bonus percentages.');
      return;
    }
    if (paymentPayload.enabled && (!paymentPayload.merchantId || !paymentPayload.gatewayUrl || (!paymentPayload.apiKey && !rechargeDraft.payment.hasApiKey))) {
      setRechargeStatus('error');
      setRechargeMessage(language === 'zh' ? '启用在线充值前，请填写商户号、支付网关和 API KEY。' : 'Enter the merchant ID, gateway URL, and API key before enabling online recharge.');
      return;
    }
    setRechargeStatus('loading');
    setRechargeMessage('');
    try {
      const response = await fetch('/api/admin/recharge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(session) },
        body: JSON.stringify({ recharge: rechargePayload, payment: paymentPayload })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'RECHARGE_CONFIG_FAILED');
      const next = normalizeRechargeConfig(result.recharge);
      setRecharge(next);
      setRechargeDraft(createRechargeDraft(next, result.payment));
      setRechargeStatus('success');
      setRechargeMessage(language === 'zh' ? '充值配置已保存。' : 'Recharge configuration saved.');
    } catch (error) {
      setRechargeStatus('error');
      const invalidGateway = error.message === 'INVALID_YIPAY_GATEWAY';
      const incomplete = error.message === 'YIPAY_CONFIG_INCOMPLETE';
      setRechargeMessage(invalidGateway
        ? (language === 'zh' ? '支付网关必须是有效的 HTTPS 地址。' : 'The payment gateway must be a valid HTTPS URL.')
        : incomplete
          ? (language === 'zh' ? '易支付配置不完整。' : 'The Yipay configuration is incomplete.')
          : (language === 'zh' ? '充值配置保存失败。' : 'Recharge configuration could not be saved.'));
    }
  }

  async function loadStorageBilling() {
    try {
      const response = await fetch('/api/admin/storage-billing', {
        headers: getAuthHeaders(session),
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'STORAGE_BILLING_CONFIG_FAILED');
      const next = normalizeStorageBillingConfig(payload.storageBilling);
      setStorageBilling(next);
      setStorageBillingDraft({
        enabled: next.enabled,
        unitPriceYuanPerGb: formatStoragePriceYuan(next.unitPriceCentsPerGb)
      });
      setStorageBillingSummary(payload.summary || null);
      setStorageBillingStatus('idle');
      setStorageBillingMessage('');
    } catch {
      setStorageBillingStatus('error');
      setStorageBillingMessage(language === 'zh' ? '存储计费配置加载失败。' : 'Storage billing settings failed to load.');
    }
  }

  async function saveStorageBilling(event) {
    event.preventDefault();
    const unitPriceYuan = Number(storageBillingDraft.unitPriceYuanPerGb);
    if (!Number.isFinite(unitPriceYuan) || unitPriceYuan < 0.01) {
      setStorageBillingStatus('error');
      setStorageBillingMessage(language === 'zh' ? '请输入有效的每 GB 月费。' : 'Enter a valid monthly price per GB.');
      return;
    }
    setStorageBillingStatus('loading');
    setStorageBillingMessage('');
    try {
      const response = await fetch('/api/admin/storage-billing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(session) },
        body: JSON.stringify({
          enabled: storageBillingDraft.enabled,
          unitPriceCentsPerGb: Math.round(unitPriceYuan * 100)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'STORAGE_BILLING_CONFIG_FAILED');
      const next = normalizeStorageBillingConfig(payload.storageBilling);
      setStorageBilling(next);
      setStorageBillingDraft({
        enabled: next.enabled,
        unitPriceYuanPerGb: formatStoragePriceYuan(next.unitPriceCentsPerGb)
      });
      setStorageBillingSummary(payload.summary || null);
      setStorageBillingStatus('success');
      setStorageBillingMessage(language === 'zh' ? '存储计费配置已保存。' : 'Storage billing settings saved.');
    } catch {
      setStorageBillingStatus('error');
      setStorageBillingMessage(language === 'zh' ? '存储计费配置保存失败。' : 'Storage billing settings could not be saved.');
    }
  }

  async function loadProviders() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch('/api/admin/image-providers', { headers: getAuthHeaders(session), cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || !Array.isArray(payload.providers)) {
          throw new Error(payload?.error || 'PROVIDER_LOAD_FAILED');
        }
        setProviders(payload.providers);
        return true;
      } catch {
        if (attempt < 2) {
          await new Promise((resolve) => globalThis.setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    }
    setProviderMessage(language === 'zh' ? '生图服务配置加载失败，请稍后重试。' : 'Image service configuration failed to load. Try again shortly.');
    return false;
  }

  async function loadNotifications() {
    try {
      const response = await fetch('/api/admin/notifications', { headers: getAuthHeaders(session), cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'NOTIFICATION_CONFIG_FAILED');
      setNotificationDraft(createNotificationDraft(payload.notifications));
      setAdminAlerts(payload.alerts || []);
      setNotificationStatus('idle');
      setNotificationMessage('');
    } catch {
      setNotificationStatus('error');
      setNotificationMessage(language === 'zh' ? '通知配置加载失败。' : 'Notification configuration failed to load.');
    }
  }

  async function loadPromptLogging() {
    setPromptLoggingStatus('loading');
    setPromptLoggingMessage('');
    try {
      const response = await fetch('/api/admin/prompt-logging?limit=100', {
        headers: getAuthHeaders(session),
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'PROMPT_LOGGING_LOAD_FAILED');
      setPromptLogging(payload.config || { enabled: false, updatedAt: null });
      setPromptLogs(Array.isArray(payload.logs) ? payload.logs : []);
      setPromptLoggingStatus('idle');
    } catch {
      setPromptLoggingStatus('error');
      setPromptLoggingMessage(language === 'zh' ? '提示词记录加载失败。' : 'Prompt logging failed to load.');
    }
  }

  async function savePromptLogging(enabled) {
    setPromptLoggingStatus('loading');
    setPromptLoggingMessage('');
    try {
      const response = await fetch('/api/admin/prompt-logging', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(session) },
        body: JSON.stringify({ enabled })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'PROMPT_LOGGING_UPDATE_FAILED');
      setPromptLogging(payload.config || { enabled, updatedAt: null });
      setPromptLogs(Array.isArray(payload.logs) ? payload.logs : []);
      setPromptLoggingStatus('success');
      setPromptLoggingMessage(language === 'zh'
        ? enabled ? '已开启提示词记录。' : '已关闭提示词记录，后续请求不再新增记录。'
        : enabled ? 'Prompt logging is enabled.' : 'Prompt logging is disabled for future requests.');
    } catch {
      setPromptLoggingStatus('error');
      setPromptLoggingMessage(language === 'zh' ? '提示词记录设置保存失败。' : 'Prompt logging settings could not be saved.');
    }
  }

  async function acknowledgeAlert(alertId) {
    try {
      const response = await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(session) },
        body: JSON.stringify({ action: 'acknowledge-alert', alertId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'ALERT_UPDATE_FAILED');
      setAdminAlerts(payload.alerts || []);
    } catch {
      setNotificationMessage(language === 'zh' ? '提醒状态更新失败。' : 'Alert status could not be updated.');
    }
  }

  async function saveNotifications(event) {
    event.preventDefault();
    setNotificationStatus('loading');
    setNotificationMessage('');
    try {
      const response = await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(session) },
        body: JSON.stringify(notificationDraft)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'NOTIFICATION_CONFIG_FAILED');
      setNotificationDraft(createNotificationDraft(payload.notifications));
      setNotificationStatus('success');
      setNotificationMessage(language === 'zh' ? '通知配置已保存。' : 'Notification settings saved.');
    } catch {
      setNotificationStatus('error');
      setNotificationMessage(language === 'zh' ? '通知配置保存失败。' : 'Notification settings could not be saved.');
    }
  }

  function editProvider(provider) {
    setProviderEditorMode('edit');
    setProviderPricingReferenceCount(0);
    setProviderDraft({
      ...provider,
      apiKey: '',
      pricingStrategy: provider.pricingStrategy || provider.pricingConfig?.strategy,
      pricingConfig: normalizeImagePricingConfig(provider.pricingConfig, {
        model: provider.model,
        strategy: provider.pricingStrategy
      })
    });
    setProviderMessage('');
  }

  function resetProviderDraft() {
    setProviderEditorMode('new');
    setProviderPricingReferenceCount(0);
    setProviderDraft(createProviderDraft());
  }

  function updateProviderPricingConfig(patch) {
    setProviderDraft((current) => ({
      ...current,
      pricingConfig: normalizeImagePricingConfig({ ...current.pricingConfig, ...patch }, {
        model: current.model,
        strategy: current.pricingStrategy
      })
    }));
  }

  function updateProviderPricingFormula(patch) {
    setProviderDraft((current) => ({
      ...current,
      pricingConfig: normalizeImagePricingConfig({
        ...current.pricingConfig,
        formula: { ...(current.pricingConfig?.formula || {}), ...patch }
      }, {
        model: current.model,
        strategy: current.pricingStrategy
      })
    }));
  }

  function changeProviderPricingStrategy(pricingStrategy) {
    setProviderDraft((current) => ({
      ...current,
      pricingStrategy,
      pricingConfig: normalizeImagePricingConfig({ ...current.pricingConfig, strategy: pricingStrategy }, {
        model: current.model,
        strategy: pricingStrategy
      })
    }));
  }

  function resetProviderPricingForModel() {
    setProviderDraft((current) => {
      const pricingConfig = defaultImagePricingConfigForModel(current.model);
      return { ...current, pricingStrategy: pricingConfig.strategy, pricingConfig };
    });
  }

  function updateProviderMatrixBand(index, patch) {
    setProviderDraft((current) => {
      const bands = [...(current.pricingConfig?.bands || [])];
      bands[index] = { ...bands[index], ...patch };
      return {
        ...current,
        pricingConfig: normalizeImagePricingConfig({ ...current.pricingConfig, bands }, {
          model: current.model,
          strategy: current.pricingStrategy
        })
      };
    });
  }

  function addProviderMatrixBand() {
    setProviderDraft((current) => {
      const bands = [...(current.pricingConfig?.bands || [])];
      const previous = bands.at(-1);
      bands.push({
        id: `band-${bands.length + 1}`,
        maxPixels: Math.min(8_294_400, Math.max(655_360, Number(previous?.maxPixels || 655_360) + 1_000_000)),
        pricesRmb: { ...(previous?.pricesRmb || { low: 0.2, medium: 0.5, high: 1 }) }
      });
      return {
        ...current,
        pricingConfig: normalizeImagePricingConfig({ ...current.pricingConfig, bands }, {
          model: current.model,
          strategy: current.pricingStrategy
        })
      };
    });
  }

  function removeProviderMatrixBand(index) {
    setProviderDraft((current) => ({
      ...current,
      pricingConfig: normalizeImagePricingConfig({
        ...current.pricingConfig,
        bands: (current.pricingConfig?.bands || []).filter((_, bandIndex) => bandIndex !== index)
      }, {
        model: current.model,
        strategy: current.pricingStrategy
      })
    }));
  }

  async function saveProvider(event) {
    event.preventDefault();
    setProviderMessage('');
    const response = await fetch('/api/admin/image-providers', {
      method: providerDraft.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders(session) },
      body: JSON.stringify(providerDraft)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setProviderMessage(language === 'zh' ? `保存失败：${payload.error || '配置错误'}` : `Save failed: ${payload.error || 'invalid configuration'}`);
      return;
    }
    if (activeSection === 'pricing') {
      editProvider(payload.provider);
      setProviderMessage(language === 'zh' ? '计费规则已保存' : 'Pricing rule saved.');
    } else {
      resetProviderDraft();
      setProviderMessage(language === 'zh' ? '生图服务已保存' : 'Image service saved.');
    }
    await loadProviders();
  }

  async function removeProvider(provider) {
    if (!globalThis.confirm?.(language === 'zh' ? `删除生图服务“${provider.name}”？` : `Delete image service "${provider.name}"?`)) return;
    const response = await fetch('/api/admin/image-providers', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getAuthHeaders(session) }, body: JSON.stringify({ id: provider.id })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setProviderMessage(language === 'zh' ? `删除失败：${payload.error || '配置正在使用'}` : `Delete failed: ${payload.error || 'configuration is in use'}`);
      return;
    }
    if (providerDraft.id === provider.id) resetProviderDraft();
    await loadProviders();
  }

  async function loadAdminData(nextRange = range, nextStart = customStart, nextEnd = customEnd) {
    if (!isAuthenticatedSession(session)) {
      setStatus('error');
      setMessage(t.adminOnly);
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const headers = getAuthHeaders(session);
      const params = new URLSearchParams({ range: nextRange });
      if (nextRange === 'custom') {
        params.set('start', nextStart);
        params.set('end', nextEnd);
      }
      const usersPromise = can(ADMIN_PERMISSIONS.VIEW_USERS) || can(ADMIN_PERMISSIONS.ADJUST_CREDITS)
        ? fetch('/api/admin/users', { headers })
        : Promise.resolve(null);
      const metricsPromise = can(ADMIN_PERMISSIONS.VIEW_METRICS)
        ? fetch(`/api/admin/metrics?${params.toString()}`, { headers })
        : Promise.resolve(null);
      const [usersResponse, metricsResponse] = await Promise.all([usersPromise, metricsPromise]);
      if (usersResponse) {
        const usersPayload = await usersResponse.json().catch(() => ({}));
        if (!usersResponse.ok || !usersPayload.ok) throw new Error(usersPayload.error || 'SERVER_NOT_CONFIGURED');
        setUsers(usersPayload.users || []);
      } else {
        setUsers([]);
      }
      if (metricsResponse) {
        const metricsPayload = await metricsResponse.json().catch(() => ({}));
        if (!metricsResponse.ok || !metricsPayload.ok) throw new Error(metricsPayload.error || 'SERVER_NOT_CONFIGURED');
        setMetrics(metricsPayload);
      } else {
        setMetrics(null);
      }
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setMessage(
        error.message === 'INVALID_DATE_RANGE'
          ? t.invalidDateRange
          : generationErrorMessage(error.message, language)
      );
    }
  }

  function handleCustomApply() {
    if (range !== 'custom') {
      setRange('custom');
      return;
    }
    loadAdminData('custom', customStart, customEnd);
  }

  async function handleSavePromotion(event) {
    event.preventDefault();
    setPromotionStatus('loading');
    setPromotionMessage('');
    try {
      const response = await fetch('/api/image-pricing', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(session)
        },
        body: JSON.stringify({
          enabled: promotionDraft.enabled,
          name: promotionDraft.name,
          payPercent: Number(promotionDraft.payPercent),
          startsAt: dateTimeLocalIso(promotionDraft.startsAt),
          endsAt: dateTimeLocalIso(promotionDraft.endsAt)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'PROMOTION_UPDATE_FAILED');
      setPromotion(payload.promotion || null);
      setPromotionDraft(promotionDraftFromValue(payload.promotion));
      setPromotionStatus('success');
      setPromotionMessage(t.promotionSaved);
      await refreshImagePromotion().catch(() => undefined);
    } catch (error) {
      setPromotionStatus('error');
      setPromotionMessage(error.message === 'INVALID_PROMOTION_RANGE' ? t.promotionRangeInvalid : t.promotionUpdateFailed);
    }
  }

  useEffect(() => {
    if (!isAuthenticatedSession(session)) return;
    if (can(ADMIN_PERMISSIONS.VIEW_USERS) || can(ADMIN_PERMISSIONS.ADJUST_CREDITS) || can(ADMIN_PERMISSIONS.VIEW_METRICS)) loadAdminData(range);
    if (can(ADMIN_PERMISSIONS.MANAGE_PROMOTIONS)) loadPromotion();
    if (can(ADMIN_PERMISSIONS.MANAGE_RECHARGE)) loadRecharge();
    if (can(ADMIN_PERMISSIONS.MANAGE_PRICING)) loadStorageBilling();
    if (can(ADMIN_PERMISSIONS.MANAGE_NOTIFICATIONS)) loadNotifications();
  }, [isAuthenticatedSession(session), range, profile?.role]);

  useEffect(() => {
    if (!isAuthenticatedSession(session)) return;
    if (activeSection !== 'pricing' && activeSection !== 'channels') return;
    if (activeSection === 'pricing' && !can(ADMIN_PERMISSIONS.MANAGE_PRICING)) return;
    if (activeSection === 'channels' && !can(ADMIN_PERMISSIONS.MANAGE_CHANNELS)) return;
    loadProviders();
  }, [activeSection, isAuthenticatedSession(session), profile?.role]);

  useEffect(() => {
    if (!isAuthenticatedSession(session) || activeSection !== 'prompt-records' || !profile?.isSuperAdmin) return;
    loadPromptLogging();
  }, [activeSection, isAuthenticatedSession(session), profile?.isSuperAdmin]);

  useEffect(() => {
    if (!['pricing', 'channels'].includes(activeSection) || providerEditorMode === 'new' || providerDraft.id || !providers.length) return;
    editProvider(providers.find((provider) => provider.isDefault) || providers[0]);
  }, [activeSection, providerDraft.id, providerEditorMode, providers]);
  const traffic = metrics?.traffic || {};
  const business = metrics?.business || {};
  const trafficTotals = traffic.totals || {};
  const businessTotals = business.totals || {};
  const businessRange = business.range || {};
  const selectedRange = metrics?.range;
  const selectedRangeLabel = selectedRange?.startDate && selectedRange?.endDate
    ? `${formatRangeDate(selectedRange.startDate, language)} - ${formatRangeDate(selectedRange.endDate, language)}`
    : '';
  const analyticsMessage = !traffic.configured
    ? t.analyticsNotConfigured
    : traffic.error
      ? t.analyticsLoadFailed
      : '';
  const trafficSeries = [
    { key: 'pv', label: t.pv, color: '#42e6ff', area: true },
    { key: 'uv', label: t.uv, color: '#c7ff65' },
    { key: 'visits', label: t.visits, color: '#ff8f70', dashed: true }
  ];
  const businessSeries = [
    { key: 'generations', label: t.rangeGenerations, color: '#42e6ff', area: true },
    { key: 'registrations', label: t.registrations, color: '#c7ff65' },
    { key: 'creditsConsumed', label: t.creditsConsumed, color: '#ff8f70', dashed: true }
  ];
  const promotionPreviewPricing = getClientImagePricing(
    { size: '1024x1024', quality: 'medium' },
    { ...promotionDraft, enabled: true, startsAt: null, endsAt: null }
  );
  const geminiProviderPricing = isGeminiImageModel(providerDraft.model);
  const providerPricingMaximumPixels = providerDraft.pricingConfig?.maximumPixels || 8_294_400;
  const providerPricingQualityLabels = geminiProviderPricing
    ? {
        low: `Low / ${GEMINI_IMAGE_PRICING_TIERS.low.resolution}`,
        medium: `Medium / ${GEMINI_IMAGE_PRICING_TIERS.medium.resolution}`,
        high: `High / ${GEMINI_IMAGE_PRICING_TIERS.high.resolution}`
      }
    : { low: 'Low', medium: 'Medium', high: 'High' };
  const providerPricingPreviewRows = (geminiProviderPricing ? [
    ['1K · 1024×1024', '1024x1024'],
    ['2K · 2048×2048', '2048x2048'],
    ['4K · 4096×4096', '4096x4096']
  ] : [
    ['640×1024', '640x1024'],
    ['816×816', '816x816'],
    ['1024×1536', '1024x1536'],
    ['2048×2048', '2048x2048'],
    ['2880×2880', '2880x2880']
  ]).map(([label, size]) => ({
    label,
    low: getImageGenerationPricing({ size, quality: 'low', model: providerDraft.model, referenceCount: providerPricingReferenceCount }, providerDraft.pricingConfig),
    medium: getImageGenerationPricing({ size, quality: 'medium', model: providerDraft.model, referenceCount: providerPricingReferenceCount }, providerDraft.pricingConfig),
    high: getImageGenerationPricing({ size, quality: 'high', model: providerDraft.model, referenceCount: providerPricingReferenceCount }, providerDraft.pricingConfig)
  }));
  const promotionStateLabel = promotion?.active
    ? t.promotionActive
    : promotion?.scheduled
      ? t.promotionScheduled
      : promotion?.expired
        ? t.promotionExpired
        : t.promotionInactive;
  const adminSections = [
    can(ADMIN_PERMISSIONS.MANAGE_PRICING) && { id: 'pricing', groupId: 'financial', label: language === 'zh' ? '计费规则' : 'Pricing rules', Icon: Calculator },
    can(ADMIN_PERMISSIONS.ADJUST_CREDITS) && { id: 'credits', groupId: 'financial', label: language === 'zh' ? '积分管理' : 'Credit management', Icon: Coins },
    can(ADMIN_PERMISSIONS.MANAGE_RECHARGE) && { id: 'recharge', groupId: 'financial', label: language === 'zh' ? '充值设置' : 'Recharge settings', Icon: CreditCard },
    can(ADMIN_PERMISSIONS.CREATE_REDEMPTION_CODES) && { id: 'redemption', groupId: 'financial', label: language === 'zh' ? '兑换码管理' : 'Redemption codes', Icon: KeyRound },
    can(ADMIN_PERMISSIONS.VIEW_CREDIT_REPORTS) && { id: 'finance', groupId: 'financial', label: language === 'zh' ? '财务报表' : 'Financial reports', Icon: ReceiptText },
    can(ADMIN_PERMISSIONS.MANAGE_PROMOTIONS) && { id: 'promotion', groupId: 'financial', label: language === 'zh' ? '促销优惠' : 'Promotions', Icon: Tags },
    can(ADMIN_PERMISSIONS.VIEW_USERS) && { id: 'users', groupId: 'users-content', label: language === 'zh' ? '用户管理' : 'User management', Icon: Users },
    profile?.isSuperAdmin && { id: 'prompt-records', groupId: 'users-content', label: language === 'zh' ? '提示词记录' : 'Prompt logs', Icon: ReceiptText },
    can(ADMIN_PERMISSIONS.MANAGE_PRICING) && can(ADMIN_PERMISSIONS.MANAGE_CHANNELS) && { id: 'chat-assistant', groupId: 'system', label: language === 'zh' ? '聊天精灵' : 'Chat assistant', Icon: Cat },
    can(ADMIN_PERMISSIONS.MANAGE_NOTIFICATIONS) && { id: 'notifications', groupId: 'system', label: language === 'zh' ? '通知管理' : 'Notifications', Icon: Bell },
    can(ADMIN_PERMISSIONS.MANAGE_CHANNELS) && { id: 'channels', groupId: 'system', label: language === 'zh' ? '渠道配置' : 'Channels', Icon: KeyRound },
    can(ADMIN_PERMISSIONS.MANAGE_GLOBAL_SETTINGS) && { id: 'global-settings', groupId: 'system', label: language === 'zh' ? '全局设置' : 'Global settings', Icon: Settings },
    (can(ADMIN_PERMISSIONS.VIEW_ALL_AUDIT) || can(ADMIN_PERMISSIONS.VIEW_FINANCE_AUDIT) || can(ADMIN_PERMISSIONS.VIEW_OPERATIONS_AUDIT)) && { id: 'audit', groupId: 'security', label: language === 'zh' ? '审计记录' : 'Audit log', Icon: ShieldCheck }
  ].filter(Boolean);
  const adminGroups = [
    { id: 'financial', label: language === 'zh' ? '财务管理' : 'Finance', Icon: Calculator },
    { id: 'users-content', label: language === 'zh' ? '用户与内容' : 'Users & content', Icon: Users },
    { id: 'system', label: language === 'zh' ? '系统管理' : 'System', Icon: Settings },
    { id: 'security', label: language === 'zh' ? '安全审计' : 'Security & audit', Icon: ShieldCheck }
  ].map((group) => ({
    ...group,
    sections: adminSections.filter((section) => section.groupId === group.id)
  })).filter((group) => group.sections.length > 0);
  const activeAdminSection = adminSections.find((item) => item.id === activeSection) || adminSections[0];
  const activeAdminGroup = adminGroups.find((group) => group.sections.some((section) => section.id === activeAdminSection?.id)) || adminGroups[0];

  useEffect(() => {
    if (adminSections.some((item) => item.id === activeSection)) return;
    if (adminSections[0]) setActiveSection(adminSections[0].id);
  }, [activeSection, profile?.role]);

  useEffect(() => {
    if (!activeAdminSection?.id) return;
    try {
      globalThis.localStorage?.setItem('pic365-admin-section', activeAdminSection.id);
    } catch {
      // Admin navigation persistence is optional.
    }
  }, [activeAdminSection?.id]);
  const providerPricingStrategy = providerDraft.pricingStrategy || providerDraft.pricingConfig?.strategy;
  const formulaPricingActive = providerPricingStrategy === IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_FORMULA;
  const matrixPricingActive = providerPricingStrategy === IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_MATRIX;
  const fixedQualityPricingActive = providerPricingStrategy === IMAGE_PRICING_STRATEGIES.FIXED_QUALITY;
  const fixedImagePricingActive = providerPricingStrategy === IMAGE_PRICING_STRATEGIES.FIXED_IMAGE;
  const steppedPricingActive = formulaPricingActive || matrixPricingActive;

  const pricingEditor = (
    <section className="adminProviderPricingEditor">
      <header>
        <div>
          <strong>{language === 'zh' ? '独立计费规则' : 'Independent pricing rule'}</strong>
          <span>{language === 'zh' ? '单张原价＝基础生图费＋参考图数量×单价；促销在合计原价之后计算' : 'List price per output = base generation fee + reference count × unit price; promotions apply afterward.'}</span>
        </div>
        <button type="button" onClick={resetProviderPricingForModel}><RefreshCw size={14} />{language === 'zh' ? '应用模型预设' : 'Apply model preset'}</button>
      </header>
      <div className="adminProviderPricingGrid">
        <label><span>{language === 'zh' ? '计费方式' : 'Pricing method'}</span><select value={providerPricingStrategy} onChange={(event) => changeProviderPricingStrategy(event.target.value)}>
          <option value={IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_FORMULA}>{language === 'zh' ? '像素 × 质量公式' : 'Pixel × quality formula'}</option>
          <option value={IMAGE_PRICING_STRATEGIES.FIXED_QUALITY}>{language === 'zh' ? '按质量固定价' : 'Fixed by quality'}</option>
          <option value={IMAGE_PRICING_STRATEGIES.FIXED_IMAGE}>{language === 'zh' ? '每张固定价' : 'Fixed per image'}</option>
          <option value={IMAGE_PRICING_STRATEGIES.PIXEL_QUALITY_MATRIX}>{language === 'zh' ? '像素区间矩阵' : 'Pixel-band matrix'}</option>
        </select></label>
        <label className={cx(!steppedPricingActive && 'isPricingDisabled')}><span>{language === 'zh' ? '价格阶梯（元）' : 'Price step (RMB)'}</span><PricingNumberInput value={providerDraft.pricingConfig.priceStepRmb} min={0.01} step="0.01" precision={2} disabled={!steppedPricingActive} onCommit={(value) => updateProviderPricingConfig({ priceStepRmb: value })} /></label>
        <label className={cx(!steppedPricingActive && 'isPricingDisabled')}><span>{language === 'zh' ? '最低收费（元）' : 'Minimum charge (RMB)'}</span><PricingNumberInput value={providerDraft.pricingConfig.minimumChargeRmb} min={0} step="0.01" precision={2} disabled={!steppedPricingActive} onCommit={(value) => updateProviderPricingConfig({ minimumChargeRmb: value })} /></label>
        <label className={cx(!steppedPricingActive && 'isPricingDisabled')}><span>{language === 'zh' ? '最高收费（元）' : 'Maximum charge (RMB)'}</span><PricingNumberInput value={providerDraft.pricingConfig.maximumChargeRmb} min={0.01} step="0.01" precision={2} disabled={!steppedPricingActive} onCommit={(value) => updateProviderPricingConfig({ maximumChargeRmb: value })} /></label>
        <label className={cx(!steppedPricingActive && 'isPricingDisabled')}><span>{language === 'zh' ? 'Auto 计费像素' : 'Auto billed pixels'}</span><PricingNumberInput value={providerDraft.pricingConfig.autoSizePixels} min={655360} max={providerPricingMaximumPixels} step={IMAGE_PRICING_PIXEL_STEP} alignUpStep={IMAGE_PRICING_PIXEL_STEP} disabled={!steppedPricingActive} onCommit={(value) => updateProviderPricingConfig({ autoSizePixels: value })} /></label>
        <label className="isPricingDisabled"><span>{language === 'zh' ? 'Auto 计费质量' : 'Auto billed quality'}</span><select value="medium" disabled><option value="medium">Medium</option></select></label>
        <label><span>{language === 'zh' ? '参考图单价（元/张）' : 'Reference price (RMB/image)'}</span><PricingNumberInput value={providerDraft.pricingConfig.referenceImagePriceRmb} min={0} step="0.01" precision={2} onCommit={(value) => updateProviderPricingConfig({ referenceImagePriceRmb: value })} /></label>
        <label><span>{language === 'zh' ? '参考图数量（报价预览）' : 'Reference count (preview)'}</span><PricingNumberInput value={providerPricingReferenceCount} min={0} max={9} step={1} precision={0} onCommit={(value) => setProviderPricingReferenceCount(Math.max(0, Math.min(9, Math.round(Number(value) || 0))))} /></label>
        <label className="adminProviderCheck"><input type="checkbox" checked={providerDraft.pricingConfig.promotionEligible !== false} onChange={(event) => updateProviderPricingConfig({ promotionEligible: event.target.checked })} /><span>{language === 'zh' ? '允许参与促销' : 'Promotion eligible'}</span></label>
      </div>
      {formulaPricingActive ? (
        <div className="adminProviderPricingGrid formula">
          <label><span>{language === 'zh' ? '基础成本（折扣前/元）' : 'Base list cost (RMB)'}</span><PricingNumberInput value={providerDraft.pricingConfig.formula.baseCostRmb} min={0} step="0.01" precision={2} onCommit={(value) => updateProviderPricingFormula({ baseCostRmb: value })} /></label>
          <label className="isPricingReadonly"><span>{language === 'zh' ? '每百万像素成本（元）' : 'Cost per MP (RMB)'}</span><PricingNumberInput value={providerDraft.pricingConfig.formula.costPerMegapixelRmb} min={0} step="0.000001" precision={6} readOnly title={language === 'zh' ? '系统根据模型成本预设，不可编辑' : 'Read-only model cost coefficient'} /></label>
          {['low', 'medium', 'high'].map((qualityName) => <label key={qualityName}><span>{qualityName.toUpperCase()} {language === 'zh' ? '质量倍率' : 'quality factor'}</span><PricingNumberInput value={providerDraft.pricingConfig.formula.qualityFactors[qualityName]} min={0} step="0.1" onCommit={(value) => updateProviderPricingFormula({ qualityFactors: { ...providerDraft.pricingConfig.formula.qualityFactors, [qualityName]: value } })} /></label>)}
          <label><span>{language === 'zh' ? '售价倍率' : 'Price multiplier'}</span><PricingNumberInput value={providerDraft.pricingConfig.formula.priceMultiplier} min={0} step="0.01" onCommit={(value) => updateProviderPricingFormula({ priceMultiplier: value })} /></label>
          <label><span>{language === 'zh' ? '固定附加费（元）' : 'Fixed fee (RMB)'}</span><PricingNumberInput value={providerDraft.pricingConfig.formula.fixedFeeRmb} min={0} step="0.01" precision={2} onCommit={(value) => updateProviderPricingFormula({ fixedFeeRmb: value })} /></label>
          <label><span>{language === 'zh' ? '实际采购成本比例' : 'Actual cost ratio'}</span><PricingNumberInput value={providerDraft.pricingConfig.formula.actualCostRatio} min={0} step="0.01" onCommit={(value) => updateProviderPricingFormula({ actualCostRatio: value })} /></label>
        </div>
      ) : null}
      {fixedQualityPricingActive ? (
        <div className="adminProviderPricingGrid formula">
          {['low', 'medium', 'high'].map((qualityName) => <label key={qualityName}><span>{providerPricingQualityLabels[qualityName]} {language === 'zh' ? '单张价格（元）' : 'price (RMB)'}</span><PricingNumberInput value={providerDraft.pricingConfig.qualityPricesRmb[qualityName]} min={0} step="0.01" precision={2} onCommit={(value) => updateProviderPricingConfig({ qualityPricesRmb: { ...providerDraft.pricingConfig.qualityPricesRmb, [qualityName]: value } })} /></label>)}
          <label className="isPricingDisabled"><span>{language === 'zh' ? '实际采购成本比例' : 'Actual cost ratio'}</span><PricingNumberInput value={providerDraft.pricingConfig.actualCostRatio} min={0} step="0.01" disabled /></label>
        </div>
      ) : null}
      {fixedImagePricingActive ? (
        <div className="adminProviderPricingGrid formula">
          <label><span>{language === 'zh' ? '每张价格（元）' : 'Price per image (RMB)'}</span><PricingNumberInput value={providerDraft.pricingConfig.fixedPriceRmb} min={0} step="0.01" precision={2} onCommit={(value) => updateProviderPricingConfig({ fixedPriceRmb: value })} /></label>
          <label className="isPricingDisabled"><span>{language === 'zh' ? '实际采购成本比例' : 'Actual cost ratio'}</span><PricingNumberInput value={providerDraft.pricingConfig.actualCostRatio} min={0} step="0.01" disabled /></label>
        </div>
      ) : null}
      {matrixPricingActive ? (
        <div className="adminProviderMatrix">
          <div className="adminProviderMatrixHeader"><span>{language === 'zh' ? '像素上限' : 'Max pixels'}</span><span>Low</span><span>Medium</span><span>High</span><span /></div>
          {(providerDraft.pricingConfig.bands || []).map((band, index) => <div className="adminProviderMatrixRow" key={`${band.id}-${index}`}>
            <PricingNumberInput value={band.maxPixels} min={655360} max={providerPricingMaximumPixels} step={IMAGE_PRICING_PIXEL_STEP} alignUpStep={IMAGE_PRICING_PIXEL_STEP} onCommit={(value) => updateProviderMatrixBand(index, { maxPixels: value })} />
            {['low', 'medium', 'high'].map((qualityName) => <PricingNumberInput value={band.pricesRmb[qualityName]} min={0} step="0.01" precision={2} onCommit={(value) => updateProviderMatrixBand(index, { pricesRmb: { ...band.pricesRmb, [qualityName]: value } })} key={qualityName} />)}
            <button type="button" onClick={() => removeProviderMatrixBand(index)} aria-label={language === 'zh' ? '删除档位' : 'Remove band'}><Trash2 size={14} /></button>
          </div>)}
          <button className="adminProviderMatrixAdd" type="button" onClick={addProviderMatrixBand}><Plus size={14} />{language === 'zh' ? '增加像素档位' : 'Add pixel band'}</button>
        </div>
      ) : null}
      <div className="adminProviderPricingPreview">
        <strong>{language === 'zh' ? `原价预览（参考图 ${providerPricingReferenceCount} 张；100积分＝1元）` : `List-price preview (${providerPricingReferenceCount} references; 100 credits = RMB 1)`}</strong>
        <div><span>{language === 'zh' ? '尺寸' : 'Size'}</span><span>{providerPricingQualityLabels.low}</span><span>{providerPricingQualityLabels.medium}</span><span>{providerPricingQualityLabels.high}</span></div>
        {providerPricingPreviewRows.map((row) => <div key={row.label}><span>{row.label}</span><b>{row.low.credits}</b><b>{row.medium.credits}</b><b>{row.high.credits}</b></div>)}
      </div>
    </section>
  );

  return (
    <section className="adminWorkspace" aria-labelledby="admin-title">
      <div className="adminWorkspaceHeader">
        <div>
          <span className="eyebrow"><ShieldCheck size={16} />{t.superAdmin}</span>
          <h2 id="admin-title">{language === 'zh' ? '运营管理中心' : 'Operations admin'}</h2>
          <p>{activeAdminGroup?.label} · {activeAdminSection?.label}</p>
        </div>
        <span className="adminEnvironmentBadge">{import.meta.env.DEV ? (language === 'zh' ? '本地环境' : 'Local environment') : (language === 'zh' ? '生产环境' : 'Production')}</span>
      </div>

      <div className="adminWorkspaceNavigation">
        <nav className="adminWorkspacePrimaryNav" aria-label={language === 'zh' ? '管理后台一级菜单' : 'Admin categories'}>
          {adminGroups.map(({ id, label, Icon, sections }) => {
            const active = activeAdminGroup?.id === id;
            return (
              <button
                className={active ? 'active' : ''}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveSection(sections[0].id)}
                key={id}
              >
                <Icon size={18} /><span>{label}</span><em>{sections.length}</em>
              </button>
            );
          })}
        </nav>
        <nav
          className="adminWorkspaceNav adminWorkspaceSecondaryNav"
          style={{ '--admin-nav-columns': Math.min(activeAdminGroup?.sections.length || 1, 6) }}
          aria-label={language === 'zh' ? '管理后台二级菜单' : 'Admin sections'}
        >
          {(activeAdminGroup?.sections || []).map(({ id, label, Icon }) => (
            <button
              className={activeSection === id ? 'active' : ''}
              type="button"
              aria-current={activeSection === id ? 'page' : undefined}
              onClick={() => setActiveSection(id)}
              key={id}
            >
              <Icon size={16} /><span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="adminWorkspaceContent">
        {['credits', 'users'].includes(activeSection) ? (
          <div className="adminWorkspaceToolbar">
            {can(ADMIN_PERMISSIONS.VIEW_METRICS) ? <div className="adminRangeToggle" role="group" aria-label={t.adminMetrics}>
              {[["today", t.rangeToday], ["7d", t.range7d], ["30d", t.range30d], ["90d", t.range90d], ["custom", t.customRange]].map(([value, label]) => (
                <button className={cx(range === value && 'active')} type="button" onClick={() => setRange(value)} key={value}>{label}</button>
              ))}
            </div> : null}
            {can(ADMIN_PERMISSIONS.VIEW_METRICS) && range === 'custom' ? (
              <div className="adminCustomRange">
                <label><span>{t.startDate}</span><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
                <label><span>{t.endDate}</span><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
                <button type="button" onClick={handleCustomApply} disabled={status === 'loading'}>{t.applyRange}</button>
              </div>
            ) : null}
            <button type="button" onClick={() => loadAdminData()} disabled={status === 'loading'}>{status === 'loading' ? <LoaderCircle className="spinIcon" size={17} /> : <RefreshCw size={17} />}{t.refresh}</button>
          </div>
        ) : null}

        {activeSection === 'pricing' ? (
          <>
          <section className="adminBlock adminProviderBlock">
            <div className="adminSectionHeading">
              <div><h3><Calculator size={18} />{language === 'zh' ? '计费规则' : 'Pricing rules'}</h3><p>{language === 'zh' ? '每个生图渠道拥有独立规则，便于以后接入 Banana、Grok 和千问。' : 'Each image channel has its own rule for future providers.'}</p></div>
            </div>
            {providers.length ? (
              <form className="adminPricingForm" onSubmit={saveProvider}>
                <label className="adminPricingProviderSelect"><span>{language === 'zh' ? '计费服务' : 'Image service'}</span><select value={providerDraft.id} onChange={(event) => editProvider(providers.find((provider) => provider.id === event.target.value) || providers[0])}>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name} · {provider.model}</option>)}</select></label>
                {pricingEditor}
                <button className="adminProviderAction adminProviderSave" type="submit"><Calculator size={16} />{language === 'zh' ? '保存计费规则' : 'Save pricing rule'}</button>
              </form>
            ) : <div className="adminState"><KeyRound size={20} />{language === 'zh' ? '请先在“渠道配置”中添加生图服务。' : 'Add an image service in Channels first.'}</div>}
            {providerMessage ? <p className="adminNotice">{providerMessage}</p> : null}
          </section>
          <form className="adminBlock adminStorageBilling" onSubmit={saveStorageBilling}>
            <div className="adminSectionHeading">
              <div>
                <h3><HardDrive size={18} />{language === 'zh' ? '资产存储计费' : 'Asset storage billing'}</h3>
                <p>{language === 'zh' ? '只统计用户自己拥有的文件，分享资产不计费；按北京时间每日 00:00 记录并按本月最高占用增量扣费。' : 'Only owner storage is billed. Shared assets are excluded. Usage is measured daily at 00:00 China time and charged against the monthly peak.'}</p>
              </div>
              <span className="adminRechargeStatus">{language === 'zh' ? '100 积分 = 1 元' : '100 credits = RMB 1'}</span>
            </div>
            <div className="adminStorageBillingGrid">
              <label className="adminRechargeSwitch"><input type="checkbox" checked={storageBillingDraft.enabled} onChange={(event) => setStorageBillingDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span>{language === 'zh' ? '启用每日跑批' : 'Enable daily billing'}</span></label>
              <label><span>{language === 'zh' ? '每 GB 月费（元）' : 'Monthly price per GB (RMB)'}</span><input type="number" min="0.01" step="0.01" value={storageBillingDraft.unitPriceYuanPerGb} onChange={(event) => setStorageBillingDraft((current) => ({ ...current, unitPriceYuanPerGb: event.target.value }))} /></label>
              <div><span>{language === 'zh' ? '执行时间' : 'Schedule'}</span><strong>00:00 · Asia/Shanghai</strong></div>
              <div><span>{language === 'zh' ? '本月已扣' : 'Charged this month'}</span><strong>{formatNumber(storageBillingSummary?.chargedCredits || 0)} {language === 'zh' ? '积分' : 'credits'}</strong></div>
              <div><span>{language === 'zh' ? '本月计费峰值' : 'Billed peak this month'}</span><strong>{formatStorageBytes(storageBillingSummary?.billedPeakBytes || 0)}</strong></div>
              <div><span>{language === 'zh' ? '最近跑批' : 'Latest batch'}</span><strong>{storageBillingSummary?.latestBatch?.runDate || (language === 'zh' ? '尚未执行' : 'Not run yet')}</strong></div>
            </div>
            <p className="adminStorageBillingNote">{language === 'zh' ? '月内首次测量会锁定当月单价；修改后的价格从下一个自然月开始应用。单次不足 1 积分时不扣费，也不推进已计费峰值。' : 'The first measurement locks the monthly price. Changes apply next calendar month. Amounts below one credit are neither charged nor added to the billed peak.'}</p>
            <button className="adminProviderAction adminProviderSave" type="submit" disabled={storageBillingStatus === 'loading'}>{storageBillingStatus === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <HardDrive size={16} />}{language === 'zh' ? '保存存储计费配置' : 'Save storage billing settings'}</button>
            {storageBillingMessage ? <p className="adminNotice">{storageBillingMessage}</p> : null}
          </form>
          </>
        ) : null}

        {activeSection === 'credits' ? (
          <div className="adminDashboard">
            {metrics ? <section className="adminBlock">
              <h3><Coins size={18} />{language === 'zh' ? '积分概览' : 'Credit overview'}</h3>
              <div className="adminMetricGrid">
                <AdminMetricCard icon={<Coins size={18} />} label={t.creditsInCirculation} value={firstNumber(businessTotals.totalCreditBalance, business.totalCreditBalance)} />
                <AdminMetricCard icon={<Coins size={18} />} label={t.creditsConsumed} value={firstNumber(businessTotals.totalCreditsConsumed, business.totalGenerationCredits)} hint={`${t.rangeGenerations}: ${formatNumber(firstNumber(businessRange.creditsConsumed, business.rangeGenerationCredits))}`} />
                <AdminMetricCard icon={<CreditCard size={18} />} label={t.purchasedCredits} value={firstNumber(businessTotals.purchasedCredits, business.purchasedCredits)} />
                <AdminMetricCard icon={<ImageIcon size={18} />} label={t.totalGenerationsMetric} value={firstNumber(businessTotals.totalGenerations, business.totalGenerations)} />
              </div>
              <div className="adminChartGrid"><div className="adminPanelCard chart"><h4>{t.businessTrend}</h4>{business.daily?.length ? <AdminTrendChart rows={business.daily} series={businessSeries} language={language} emptyLabel={t.noAnalyticsRows} /> : <p className="emptyTransactions">{t.noAnalyticsRows}</p>}</div></div>
            </section> : null}
            <section className="adminBlock">
              <h3><Users size={18} />{language === 'zh' ? '用户积分' : 'User credits'}</h3>
               <div className="adminTableWrap"><table className="adminTable adminCreditTable"><thead><tr><th>{t.users}</th><th>{language === 'zh' ? '备注名' : 'Admin note'}</th><th>{t.creditBalance}</th><th>{t.spentCredits}</th><th>{t.purchased}</th><th>{t.adminAdjust}</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="adminUserCell">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <UserCircle size={28} />}<div><strong>{user.email}</strong>{user.fullName ? <span>{user.fullName}</span> : null}</div></div></td><td>{user.adminNote || '-'}</td><td>{formatNumber(user.creditBalance)}</td><td>{formatNumber(user.usage?.totalGenerationCredits)}</td><td>{formatNumber(user.usage?.purchasedCredits)}</td><td><button className="tableAction" type="button" onClick={() => setCreditUser(user)} disabled={user.id === profile?.id || (profile?.role === 'accountant' && user.role !== 'user')}><Coins size={15} />{t.adminAdjust}</button></td></tr>)}</tbody></table></div>
            </section>
          </div>
        ) : null}

        {activeSection === 'recharge' ? (
          <form className="adminBlock adminRechargeForm" onSubmit={saveRecharge}>
            <div className="adminSectionHeading">
              <div>
                <h3><CreditCard size={18} />{language === 'zh' ? '充值方案配置' : 'Recharge configuration'}</h3>
                <p>{language === 'zh' ? '配置充值金额、赠送比例和易支付网关；API KEY 加密保存。' : 'Configure recharge amounts, bonuses, and the Yipay gateway. The API key is encrypted at rest.'}</p>
              </div>
              <span className="adminRechargeStatus">{language === 'zh' ? '100 积分 = 1 元' : '100 credits = ¥1'}</span>
            </div>

            <section className="adminRechargeSection adminPaymentGatewaySection">
              <header>
                <div><strong>{language === 'zh' ? '易支付接口' : 'Yipay gateway'}</strong><span>{language === 'zh' ? '支持支付宝和微信支付；商户密钥只在服务端使用。' : 'Supports Alipay and WeChat Pay. The merchant secret is used only on the server.'}</span></div>
                <label className="adminRechargeSwitch"><input type="checkbox" checked={rechargeDraft.payment.enabled} onChange={(event) => setRechargeDraft((current) => ({ ...current, payment: { ...current.payment, enabled: event.target.checked } }))} /><span>{language === 'zh' ? '启用在线充值' : 'Enable online recharge'}</span></label>
              </header>
              <div className="adminPaymentGatewayGrid">
                <label><span>{language === 'zh' ? '商户名 / 商户号（PID）' : 'Merchant ID (PID)'}</span><input value={rechargeDraft.payment.merchantId} maxLength={128} onChange={(event) => setRechargeDraft((current) => ({ ...current, payment: { ...current.payment, merchantId: event.target.value } }))} placeholder="例如：20220715225121" /></label>
                <label><span>{language === 'zh' ? '支付网关' : 'Payment gateway'}</span><input type="url" value={rechargeDraft.payment.gatewayUrl} maxLength={500} onChange={(event) => setRechargeDraft((current) => ({ ...current, payment: { ...current.payment, gatewayUrl: event.target.value } }))} placeholder="https://pay.example.com" /></label>
                <label><span>API KEY</span><input type="password" value={rechargeDraft.payment.apiKey} maxLength={2000} autoComplete="new-password" onChange={(event) => setRechargeDraft((current) => ({ ...current, payment: { ...current.payment, apiKey: event.target.value } }))} placeholder={rechargeDraft.payment.hasApiKey ? (language === 'zh' ? `已保存 ${rechargeDraft.payment.apiKeyMasked}，留空保持不变` : `Saved as ${rechargeDraft.payment.apiKeyMasked}; leave blank to keep it`) : (language === 'zh' ? '输入易支付 API KEY' : 'Enter the Yipay API key')} /></label>
              </div>
              <p className={`adminPaymentGatewayState ${rechargeDraft.payment.enabled && rechargeDraft.payment.hasApiKey ? 'ready' : ''}`}>{rechargeDraft.payment.hasApiKey ? (language === 'zh' ? `API KEY 已安全保存：${rechargeDraft.payment.apiKeyMasked}` : `API key stored securely: ${rechargeDraft.payment.apiKeyMasked}`) : (language === 'zh' ? '尚未保存 API KEY。' : 'No API key has been saved.')}</p>
            </section>

            <div className="adminRechargeBaseGrid">
              <label><span>{language === 'zh' ? '新用户注册赠送' : 'New-user sign-up bonus'}</span><div className="adminRechargeUnitInput"><input type="number" min="0" step="1" value={rechargeDraft.signupBonusCredits} onChange={(event) => setRechargeDraft((current) => ({ ...current, signupBonusCredits: event.target.value }))} /><b>{language === 'zh' ? '积分' : 'credits'}</b></div></label>
              <label className="isPricingReadonly"><span>{language === 'zh' ? '基础兑换率' : 'Base conversion rate'}</span><div className="adminRechargeUnitInput"><input value={rechargeDraft.creditsPerYuan} readOnly /><b>{language === 'zh' ? '积分/元' : 'credits/¥'}</b></div></label>
              <div className="adminRechargePolicy"><strong>{language === 'zh' ? '发放规则' : 'Grant rule'}</strong><span>{language === 'zh' ? '只在首次注册成功时发放一次，普通登录不会重复赠送。' : 'Granted once after the first successful registration; normal sign-ins never grant it again.'}</span></div>
            </div>

            <section className="adminRechargeSection">
              <header><div><strong>{language === 'zh' ? '固定充值套餐' : 'Fixed recharge packs'}</strong><span>{language === 'zh' ? '总积分 = 金额 × 100 + 赠送积分' : 'Total credits = amount × 100 + bonus credits'}</span></div><button className="adminProviderAction adminProviderCancel" type="button" onClick={addRechargePack}><Plus size={15} />{language === 'zh' ? '增加套餐' : 'Add pack'}</button></header>
              <div className="adminRechargePackList">
                <div className="adminRechargePackHeader"><span>{language === 'zh' ? '启用' : 'On'}</span><span>{language === 'zh' ? '金额（元）' : 'Amount (¥)'}</span><span>{language === 'zh' ? '赠送比例' : 'Bonus'}</span><span>{language === 'zh' ? '基础积分' : 'Base'}</span><span>{language === 'zh' ? '赠送积分' : 'Bonus credits'}</span><span>{language === 'zh' ? '到账积分' : 'Total'}</span><span /></div>
                {rechargeDraft.packs.map((pack, index) => {
                  const preview = rechargePackPreview(pack, rechargeDraft.creditsPerYuan);
                  return <div className="adminRechargePackRow" key={pack.id}>
                    <label className="adminRechargeEnabled"><input type="checkbox" checked={pack.enabled} onChange={(event) => updateRechargePack(index, { enabled: event.target.checked })} /><span>{pack.enabled ? (language === 'zh' ? '是' : 'Yes') : (language === 'zh' ? '否' : 'No')}</span></label>
                    <input type="number" min="1" step="0.01" value={pack.amountYuan} onChange={(event) => updateRechargePack(index, { amountYuan: event.target.value })} />
                    <div className="adminRechargeUnitInput compact"><input type="number" min="0" step="0.000001" value={pack.bonusPercent} onChange={(event) => updateRechargePack(index, { bonusPercent: event.target.value })} /><b>%</b></div>
                    <b>{formatNumber(preview.baseCredits)}</b>
                    <b className="bonus">+{formatNumber(preview.bonusCredits)}</b>
                    <strong>{formatNumber(preview.credits)}</strong>
                    <button className="adminProviderRowAction adminProviderRemove" type="button" onClick={() => removeRechargePack(index)} disabled={rechargeDraft.packs.length <= 1} aria-label={language === 'zh' ? '删除套餐' : 'Remove pack'}><Trash2 size={15} /></button>
                  </div>;
                })}
              </div>
            </section>

            <section className="adminRechargeSection">
              <header><div><strong>{language === 'zh' ? '自定义充值' : 'Custom recharge'}</strong><span>{language === 'zh' ? '超过自助上限时只提示联系客服和销售，不进入支付。' : 'Amounts above the self-service limit only show the contact-sales notice.'}</span></div><label className="adminRechargeSwitch"><input type="checkbox" checked={rechargeDraft.custom.enabled} onChange={(event) => setRechargeDraft((current) => ({ ...current, custom: { ...current.custom, enabled: event.target.checked } }))} /><span>{language === 'zh' ? '启用' : 'Enabled'}</span></label></header>
              <div className="adminRechargeCustomGrid">
                <label><span>{language === 'zh' ? '最低金额（元）' : 'Minimum amount (¥)'}</span><input type="number" min="1" step="0.01" value={rechargeDraft.custom.minimumAmountYuan} onChange={(event) => setRechargeDraft((current) => ({ ...current, custom: { ...current.custom, minimumAmountYuan: event.target.value } }))} /></label>
                <label><span>{language === 'zh' ? '赠送起始金额（元）' : 'Bonus starts at (¥)'}</span><input type="number" min="1" step="0.01" value={rechargeDraft.custom.bonusThresholdYuan} onChange={(event) => setRechargeDraft((current) => ({ ...current, custom: { ...current.custom, bonusThresholdYuan: event.target.value } }))} /></label>
                <label><span>{language === 'zh' ? '赠送比例' : 'Bonus percentage'}</span><div className="adminRechargeUnitInput"><input type="number" min="0" step="0.01" value={rechargeDraft.custom.bonusPercent} onChange={(event) => setRechargeDraft((current) => ({ ...current, custom: { ...current.custom, bonusPercent: event.target.value } }))} /><b>%</b></div></label>
                <label><span>{language === 'zh' ? '自助充值上限（元）' : 'Self-service maximum (¥)'}</span><input type="number" min="1" step="0.01" value={rechargeDraft.custom.maximumSelfServiceAmountYuan} onChange={(event) => setRechargeDraft((current) => ({ ...current, custom: { ...current.custom, maximumSelfServiceAmountYuan: event.target.value } }))} /></label>
                <label className="wide"><span>{language === 'zh' ? '超过上限提示（中文）' : 'Over-limit message (Chinese)'}</span><input value={rechargeDraft.custom.contactMessageZh} maxLength={240} onChange={(event) => setRechargeDraft((current) => ({ ...current, custom: { ...current.custom, contactMessageZh: event.target.value } }))} /></label>
                <label className="wide"><span>{language === 'zh' ? '超过上限提示（英文）' : 'Over-limit message (English)'}</span><input value={rechargeDraft.custom.contactMessageEn} maxLength={240} onChange={(event) => setRechargeDraft((current) => ({ ...current, custom: { ...current.custom, contactMessageEn: event.target.value } }))} /></label>
              </div>
            </section>

            <div className="adminRechargeFooter">
              <span>{recharge.updatedAt ? `${language === 'zh' ? '最近更新' : 'Last updated'}：${new Date(recharge.updatedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}` : (language === 'zh' ? '当前使用系统默认方案' : 'Using the system default plan')}</span>
              <button className="adminProviderAction adminProviderSave" type="submit" disabled={rechargeStatus === 'loading'}>{rechargeStatus === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <CreditCard size={16} />}{language === 'zh' ? '保存充值配置' : 'Save recharge settings'}</button>
            </div>
            {rechargeMessage ? <p className={`adminNotice ${rechargeStatus === 'error' ? 'error' : ''}`}>{rechargeMessage}</p> : null}
          </form>
        ) : null}

        {activeSection === 'users' ? (
          <div className="adminDashboard">
            {metrics ? <section className="adminBlock">
              <h3><TrendingUp size={18} />{t.trafficMetrics}</h3>
              {analyticsMessage ? <p className="adminNotice">{analyticsMessage}</p> : null}
              {selectedRangeLabel ? <p className="adminRangeSummary">{t.selectedRange}: <strong>{selectedRangeLabel}</strong></p> : null}
              <div className="adminMetricGrid"><AdminMetricCard icon={<BarChart3 size={18} />} label={t.pv} value={firstNumber(trafficTotals.pv, trafficTotals.pageViews)} /><AdminMetricCard icon={<Users size={18} />} label={t.uv} value={firstNumber(trafficTotals.uv, trafficTotals.activeUsers)} /><AdminMetricCard icon={<ReceiptText size={18} />} label={t.visits} value={firstNumber(trafficTotals.visits, trafficTotals.sessions)} /><AdminMetricCard icon={<UserPlus size={18} />} label={t.newUsers} value={trafficTotals.newUsers} /></div>
            </section> : null}
            {can(ADMIN_PERMISSIONS.MANAGE_SYSTEM_GROUPS) ? <AdminSystemGroups language={language} session={session} onGroupsChanged={(nextGroups) => { setSystemGroups(nextGroups); void loadAdminData(range, customStart, customEnd); }} /> : null}
            <section className="adminBlock">
              <h3><Users size={18} />{t.users}</h3>
              {status === 'loading' ? <div className="adminState"><LoaderCircle className="spinIcon" size={20} />{t.loadingUsers}</div> : null}
              {status === 'error' ? <p className="authMessage error">{message || t.adminOnly}</p> : null}
              {status !== 'loading' && !users.length && status !== 'error' ? <div className="adminState"><Users size={20} />{t.noUsers}</div> : null}
              {users.length ? <div className="adminTableWrap"><table className="adminTable"><thead><tr><th>{language === 'zh' ? '登录邮箱 / 用户名' : 'Email / username'}</th><th>{language === 'zh' ? '管理员备注名' : 'Admin note'}</th><th>{t.role}</th><th>{language === 'zh' ? '系统分组' : 'System group'}</th><th>{language === 'zh' ? '状态' : 'Status'}</th><th>{t.creditBalance}</th><th>{language === 'zh' ? '最后登录' : 'Last login'}</th><th>{language === 'zh' ? '操作' : 'Actions'}</th></tr></thead><tbody>{users.map((user) => { const accountantTargetBlocked = profile?.role === 'accountant' && user.role !== 'user'; return <tr key={user.id}><td><div className="adminUserCell">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <UserCircle size={28} />}<div><strong>{user.email}</strong><span>{user.fullName || '-'}</span></div></div></td><td>{user.adminNote || '-'}</td><td><span className="roleBadge">{user.role}</span></td><td>{user.role === 'user' ? user.systemGroupName || '-' : (language === 'zh' ? '管理员直通' : 'Admin bypass')}</td><td>{user.status}</td><td>{formatNumber(user.creditBalance)}</td><td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : '-'}</td><td><div className="tableActionGroup"><button className="tableAction" type="button" onClick={() => setEditingUser(user)} disabled={accountantTargetBlocked}><Settings size={15} />{language === 'zh' ? '编辑' : 'Edit'}</button><button className="tableAction" type="button" onClick={() => setCreditUser(user)} disabled={user.id === profile?.id || accountantTargetBlocked}><Coins size={15} />{t.adminAdjust}</button></div></td></tr>; })}</tbody></table></div> : null}
            </section>
          </div>
        ) : null}

        {activeSection === 'redemption' ? <RedemptionCodesPanel language={language} profile={profile} /> : null}
        {activeSection === 'finance' ? <FinancialReportsPanel language={language} /> : null}
        {activeSection === 'global-settings' ? <GlobalMenuSettingsPanel language={language} onChanged={onMenuSettingsChanged} /> : null}
        {activeSection === 'audit' ? <AuditEventsPanel language={language} profile={profile} /> : null}

        {activeSection === 'promotion' ? (
          <section className="adminBlock adminPromotionBlock">
            <div className="adminPromotionHeading"><h3><Sparkles size={18} />{t.promotionTitle}</h3><span className={`adminPromotionStatus ${promotion?.active ? 'active' : promotion?.scheduled ? 'scheduled' : ''}`}>{promotionStateLabel}</span></div>
            <p className="adminPromotionSubtitle">{t.promotionSubtitle}</p>
            <form className="adminPromotionForm" onSubmit={handleSavePromotion}>
              <label className="adminPromotionToggle"><input type="checkbox" checked={promotionDraft.enabled} onChange={(event) => setPromotionDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span>{t.promotionEnabled}</span></label>
              <label><span>{t.promotionName}</span><input value={promotionDraft.name} onChange={(event) => setPromotionDraft((current) => ({ ...current, name: event.target.value }))} placeholder={t.promotionNamePlaceholder} maxLength={80} /></label>
              <label><span>{t.promotionPayPercent}</span><div className="adminPromotionPercentInput"><input type="number" min="10" max="100" step="1" value={promotionDraft.payPercent} onChange={(event) => setPromotionDraft((current) => ({ ...current, payPercent: event.target.value }))} /><b>%</b></div></label>
              <label><span>{t.promotionStartsAt}</span><input type="datetime-local" value={promotionDraft.startsAt} onChange={(event) => setPromotionDraft((current) => ({ ...current, startsAt: event.target.value }))} /></label>
              <label><span>{t.promotionEndsAt}</span><input type="datetime-local" value={promotionDraft.endsAt} onChange={(event) => setPromotionDraft((current) => ({ ...current, endsAt: event.target.value }))} /></label>
              <div className="adminPromotionPreview"><span>{t.promotionPreview}</span><ImageCreditPrice pricing={promotionPreviewPricing} language={language} /></div>
              <button type="submit" disabled={promotionStatus === 'loading'}>{promotionStatus === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <Settings size={16} />}{promotionStatus === 'loading' ? t.promotionSaving : t.promotionSave}</button>
            </form>
            <p className="adminPromotionHint">{t.promotionPayPercentHint}</p>
            {promotionMessage ? <p className={`adminNotice ${promotionStatus === 'error' ? 'error' : ''}`}>{promotionMessage}</p> : null}
          </section>
        ) : null}

        {activeSection === 'notifications' ? (
          <form className="adminBlock adminNotificationForm" onSubmit={saveNotifications}>
            <div className="adminSectionHeading"><div><h3><Bell size={18} />{language === 'zh' ? '通知管理' : 'Notifications'}</h3><p>{language === 'zh' ? '发布到用户顶部铃铛通知中心，并设置需要重点关注的运营提醒。' : 'Publish to the top notification bell and configure operational alerts.'}</p></div></div>
            <label className="adminNotificationToggle"><input type="checkbox" checked={notificationDraft.siteNoticeEnabled} onChange={(event) => setNotificationDraft((current) => ({ ...current, siteNoticeEnabled: event.target.checked }))} /><span>{language === 'zh' ? '发布站内通知' : 'Publish site notification'}</span></label>
            <div className="adminNotificationGrid">
              <label><span>{language === 'zh' ? '公告标题' : 'Notice title'}</span><input value={notificationDraft.siteNoticeTitle} maxLength={120} onChange={(event) => setNotificationDraft((current) => ({ ...current, siteNoticeTitle: event.target.value }))} /></label>
              <label><span>{language === 'zh' ? '显示对象' : 'Audience'}</span><select value={notificationDraft.audience} onChange={(event) => setNotificationDraft((current) => ({ ...current, audience: event.target.value }))}><option value="all">{language === 'zh' ? '所有访客' : 'All visitors'}</option><option value="signed-in">{language === 'zh' ? '已登录用户' : 'Signed-in users'}</option><option value="members">{language === 'zh' ? '有积分用户' : 'Users with credits'}</option></select></label>
              <label><span>{language === 'zh' ? '内容格式' : 'Content format'}</span><select value={notificationDraft.siteNoticeFormat} onChange={(event) => setNotificationDraft((current) => ({ ...current, siteNoticeFormat: event.target.value }))}><option value="markdown">Markdown</option><option value="html">HTML</option></select></label>
              <label><span>{language === 'zh' ? '显示位置' : 'Placement'}</span><input value={language === 'zh' ? '顶部铃铛通知中心' : 'Top notification bell'} disabled /></label>
            </div>
            <label className="adminNotificationBody">
              <span>{language === 'zh' ? '公告内容' : 'Notice content'}</span>
              <textarea
                value={notificationDraft.siteNoticeBody}
                maxLength={5000}
                rows={6}
                placeholder={SITE_NOTICE_EXAMPLES[notificationDraft.siteNoticeFormat]}
                onChange={(event) => setNotificationDraft((current) => ({ ...current, siteNoticeBody: event.target.value }))}
              />
            </label>
            <div className="adminNotificationExample">
              <div><strong>{language === 'zh' ? `${notificationDraft.siteNoticeFormat === 'html' ? 'HTML' : 'Markdown'} 简单范例` : `Simple ${notificationDraft.siteNoticeFormat === 'html' ? 'HTML' : 'Markdown'} example`}</strong><code>{SITE_NOTICE_EXAMPLES[notificationDraft.siteNoticeFormat]}</code></div>
              <button type="button" onClick={() => setNotificationDraft((current) => ({ ...current, siteNoticeBody: SITE_NOTICE_EXAMPLES[current.siteNoticeFormat] }))}>{language === 'zh' ? '填入范例' : 'Use example'}</button>
            </div>
            <div className="adminNotificationPreview">
              <span>{language === 'zh' ? '即时预览' : 'Live preview'}</span>
              <article><strong>{notificationDraft.siteNoticeTitle || (language === 'zh' ? '站内通知' : 'Notice')}</strong><RichSiteNoticeContent body={notificationDraft.siteNoticeBody || SITE_NOTICE_EXAMPLES[notificationDraft.siteNoticeFormat]} format={notificationDraft.siteNoticeFormat} /></article>
            </div>
            <div className="adminNotificationAlertGrid">
              <label><input type="checkbox" checked={notificationDraft.notifyGenerationFailure} onChange={(event) => setNotificationDraft((current) => ({ ...current, notifyGenerationFailure: event.target.checked }))} /><span>{language === 'zh' ? '关注生图失败' : 'Generation failures'}</span></label>
              <label><input type="checkbox" checked={notificationDraft.notifyChannelFailure} onChange={(event) => setNotificationDraft((current) => ({ ...current, notifyChannelFailure: event.target.checked }))} /><span>{language === 'zh' ? '关注渠道异常' : 'Channel failures'}</span></label>
              <label><input type="checkbox" checked={notificationDraft.notifyLowCredits} onChange={(event) => setNotificationDraft((current) => ({ ...current, notifyLowCredits: event.target.checked }))} /><span>{language === 'zh' ? '关注低余额用户' : 'Low-credit users'}</span></label>
              <label className="adminLowCreditThreshold"><span>{language === 'zh' ? '低余额阈值' : 'Low-credit threshold'}</span><input type="number" min="0" step="1" value={notificationDraft.lowCreditThreshold} onChange={(event) => setNotificationDraft((current) => ({ ...current, lowCreditThreshold: event.target.value }))} /></label>
            </div>
            <div className="adminProviderList adminAlertList">
              {adminAlerts.length ? adminAlerts.map((alert) => (
                <article className={`adminAlertItem ${alert.severity}`} key={alert.id}>
                  <div><strong>{alert.message}</strong><span>{alert.type} · {alert.occurrences} · {alert.lastSeenAt ? new Date(alert.lastSeenAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : ''}</span></div>
                  <button className="adminProviderRowAction adminProviderEdit" type="button" onClick={() => acknowledgeAlert(alert.id)}><Check size={14} />{language === 'zh' ? '已处理' : 'Acknowledge'}</button>
                </article>
              )) : <p className="adminNotice">{language === 'zh' ? '当前没有待处理的运营提醒。' : 'No open operational alerts.'}</p>}
            </div>
            <button className="adminProviderAction adminProviderSave" type="submit" disabled={notificationStatus === 'loading'}>{notificationStatus === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <Bell size={16} />}{language === 'zh' ? '保存通知设置' : 'Save notification settings'}</button>
            {notificationMessage ? <p className={`adminNotice ${notificationStatus === 'error' ? 'error' : ''}`}>{notificationMessage}</p> : null}
          </form>
        ) : null}

        {activeSection === 'prompt-records' ? (
          <section className="adminBlock adminPromptLogBlock">
            <div className="adminSectionHeading">
              <div>
                <h3><ReceiptText size={18} />{language === 'zh' ? '提示词记录' : 'Prompt logs'}</h3>
                <p>{language === 'zh'
                  ? '仅记录灵感生图的单图创作与批量 AI 修图请求；关闭后不再新增记录。'
                  : 'Records Image Studio single and batch-repair requests only. Disabling stops new records.'}</p>
              </div>
              <label className="adminPromptLoggingSwitch">
                <input
                  type="checkbox"
                  checked={Boolean(promptLogging.enabled)}
                  disabled={promptLoggingStatus === 'loading'}
                  onChange={(event) => savePromptLogging(event.target.checked)}
                />
                <span>{promptLogging.enabled
                  ? language === 'zh' ? '记录中' : 'Recording'
                  : language === 'zh' ? '已关闭' : 'Disabled'}</span>
              </label>
            </div>
            {promptLoggingMessage ? <p className={`adminNotice ${promptLoggingStatus === 'error' ? 'error' : ''}`}>{promptLoggingMessage}</p> : null}
            <div className="adminPromptLogList">
              {promptLoggingStatus === 'loading' && !promptLogs.length ? (
                <div className="adminState"><LoaderCircle className="spinIcon" size={20} />{language === 'zh' ? '正在加载提示词记录…' : 'Loading prompt logs…'}</div>
              ) : promptLogs.length ? promptLogs.map((item) => (
                <article key={item.id}>
                  <header>
                    <div>
                      <strong>{item.userEmail || item.userId || (language === 'zh' ? '未知用户' : 'Unknown user')}</strong>
                      <span>{item.taskMode === 'batch-repair'
                        ? language === 'zh' ? '批量 AI 修图' : 'Batch AI repair'
                        : language === 'zh' ? '单图创作' : 'Single image'}</span>
                    </div>
                    <time>{item.createdAt ? new Date(item.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : ''}</time>
                  </header>
                  <div className="adminPromptLogFacts">
                    <span>{item.providerName || '-'}</span>
                    <span>{item.model || '-'}</span>
                    <span>{item.width && item.height ? `${item.width}×${item.height}` : item.size || '-'}</span>
                    <span>{language === 'zh' ? '质量' : 'Quality'}：{item.quality || '-'}</span>
                    <span>{language === 'zh' ? '参考图' : 'References'}：{item.referenceCount || 0}</span>
                    {item.sourceName ? <span>{item.sourceName}</span> : null}
                  </div>
                  <details>
                    <summary>{language === 'zh' ? '查看完整提示词' : 'View full prompt'}</summary>
                    <pre>{item.effectivePrompt || item.userPrompt}</pre>
                    {item.effectivePrompt && item.effectivePrompt !== item.userPrompt ? (
                      <div className="adminPromptUserText">
                        <strong>{language === 'zh' ? '用户输入' : 'User input'}</strong>
                        <p>{item.userPrompt}</p>
                      </div>
                    ) : null}
                  </details>
                </article>
              )) : (
                <div className="adminState"><ReceiptText size={20} />{language === 'zh' ? '暂无提示词记录。' : 'No prompt logs yet.'}</div>
              )}
            </div>
          </section>
        ) : null}

        {activeSection === 'channels' ? (
          <div className="adminDashboard">
          <section className="adminBlock adminProviderBlock adminChannelSection">
            <div className="adminSectionHeading"><div><h3><ImageIcon size={18} />{language === 'zh' ? '图片渠道配置' : 'Image channels'}</h3><p>{language === 'zh' ? '编辑区每行四项；渠道名称、模型、接口、掩码 Key、启停和默认状态在下方表格统一查看。' : 'The editor uses four fields per row. Review names, models, endpoints, masked keys, and status in the table below.'}</p></div><button className="adminProviderAction adminProviderCancel" type="button" onClick={resetProviderDraft}><Plus size={15} />{language === 'zh' ? '新增图片渠道' : 'Add image channel'}</button></div>
            <form className="adminProviderForm adminChannelForm adminChannelEditor" onSubmit={saveProvider}>
              <label><span>{language === 'zh' ? '显示名称' : 'Display name'}</span><input required value={providerDraft.name} onChange={(event) => setProviderDraft((current) => ({ ...current, name: event.target.value }))} placeholder="GPT Image 2 / Gemini Banana" /></label>
              <label><span>{language === 'zh' ? '接口类型' : 'Provider type'}</span><select value={providerDraft.providerType} onChange={(event) => setProviderDraft((current) => ({ ...current, providerType: event.target.value }))}>
                <option value="openai-compatible">{language === 'zh' ? 'OpenAI 兼容 · 自动识别' : 'OpenAI compatible · Auto'}</option>
                <option value="openai-compatible-json">{language === 'zh' ? 'OpenAI 兼容 · JSON 编辑' : 'OpenAI compatible · JSON edits'}</option>
                <option value="openai-compatible-multipart">{language === 'zh' ? 'OpenAI 兼容 · Multipart 编辑' : 'OpenAI compatible · Multipart edits'}</option>
              </select></label>
              <label><span>Base URL</span><input required value={providerDraft.baseUrl} onChange={(event) => setProviderDraft((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://example.com" /></label>
              <label><span>Model</span><input required value={providerDraft.model} onChange={(event) => setProviderDraft((current) => ({ ...current, model: event.target.value }))} placeholder="gpt-image-2" /></label>
              <label><span>API Key</span><input type="password" required={!providerDraft.id} value={providerDraft.apiKey} onChange={(event) => setProviderDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={providerDraft.id ? (providerDraft.apiKeyMasked || (language === 'zh' ? '留空保持不变' : 'Leave blank to keep')) : 'sk-...'} /></label>
              <label className="adminProviderCheck"><input type="checkbox" checked={providerDraft.enabled} onChange={(event) => setProviderDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span>{language === 'zh' ? '启用' : 'Enabled'}</span></label>
              <label className="adminProviderCheck"><input type="checkbox" checked={providerDraft.isDefault} onChange={(event) => setProviderDraft((current) => ({ ...current, isDefault: event.target.checked }))} /><span>{language === 'zh' ? '默认服务' : 'Default'}</span></label>
              <label><span>{language === 'zh' ? '计费规则' : 'Pricing rule'}</span><input value={providerPricingLabel(providerDraft, language)} disabled /></label>
              <div className="adminChannelEditorActions"><button className="adminProviderAction adminProviderSave" type="submit"><Settings size={16} />{providerDraft.id ? (language === 'zh' ? '保存图片渠道' : 'Save image channel') : (language === 'zh' ? '新增图片渠道' : 'Add image channel')}</button>{providerDraft.id ? <button className="adminProviderAction adminProviderCancel" type="button" onClick={resetProviderDraft}><X size={16} />{language === 'zh' ? '取消编辑' : 'Cancel edit'}</button> : null}</div>
            </form>
            <div className="adminChannelTableWrap"><table className="adminChannelTable"><thead><tr><th>{language === 'zh' ? '渠道名称' : 'Channel'}</th><th>{language === 'zh' ? '模型与协议' : 'Model & protocol'}</th><th>{language === 'zh' ? '接口与密钥' : 'Endpoint & key'}</th><th>{language === 'zh' ? '计费规则' : 'Pricing'}</th><th>{language === 'zh' ? '状态' : 'Status'}</th><th>{language === 'zh' ? '操作' : 'Actions'}</th></tr></thead><tbody>{providers.map((provider) => <tr key={provider.id}><td><strong>{provider.name}</strong></td><td><span>{provider.model}</span><small>{provider.providerType}</small></td><td><span>{provider.baseUrl}</span><small>{provider.apiKeyMasked || (language === 'zh' ? '未配置 Key' : 'No key')}</small></td><td><span>{providerPricingLabel(provider, language)}</span><small>{language === 'zh' ? '100 积分 = 1 元' : '100 credits = RMB 1'}</small></td><td><div className="adminChannelStatus"><i className={provider.enabled ? 'enabled' : 'disabled'}>{provider.enabled ? (language === 'zh' ? '启用' : 'Enabled') : (language === 'zh' ? '停用' : 'Disabled')}</i>{provider.isDefault ? <i className="default">{language === 'zh' ? '默认' : 'Default'}</i> : null}</div></td><td><div className="adminChannelRowActions"><button className="adminProviderRowAction adminProviderEdit" type="button" onClick={() => editProvider(provider)}><Settings size={14} />{language === 'zh' ? '编辑' : 'Edit'}</button><button className="adminProviderRowAction adminProviderRemove" type="button" onClick={() => removeProvider(provider)} aria-label={language === 'zh' ? '删除图片渠道' : 'Delete image channel'}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>
            {providerMessage ? <p className="adminNotice">{providerMessage}</p> : null}
          </section>
          <AdminVideoProvider language={language} session={session} imageProviders={providers} />
          <section className="adminBlock adminProviderBlock adminChannelSection adminTtsPlaceholder"><div className="adminSectionHeading"><div><h3><AudioLines size={18} />{language === 'zh' ? 'TTS 语音渠道' : 'TTS voice channels'}</h3><p>{language === 'zh' ? '已预留独立配置区。当前版本暂不启用，后续接入 Azure Speech 后再开放渠道、声音和计费设置。' : 'Reserved for a future Azure Speech integration, including channel, voice, and pricing settings.'}</p></div><span>{language === 'zh' ? '暂未启用' : 'Not enabled yet'}</span></div></section>
          </div>
        ) : null}

        {activeSection === 'chat-assistant' ? <AdminChatProvider language={language} session={session} /> : null}
      </div>

      <UserEditDialog
        key={editingUser?.id || 'user-editor-empty'}
        language={language}
        profile={profile}
        user={editingUser}
        systemGroups={systemGroups}
        onClose={() => setEditingUser(null)}
        onSaved={(updatedUser) => setUsers((current) => current.map((user) => user.id === updatedUser.id ? { ...user, ...updatedUser } : user))}
      />
      <CreditAdjustmentDialog
        key={creditUser?.id || 'credit-editor-empty'}
        language={language}
        user={creditUser}
        onClose={() => setCreditUser(null)}
        onSaved={(updatedUser) => setUsers((current) => current.map((user) => user.id === updatedUser.id ? { ...user, ...updatedUser } : user))}
      />
    </section>
  );
}

function CreditPanel({
  open,
  language,
  session,
  profile,
  notice,
  casesById,
  onClose,
  onAuthRequired,
  onProfileChange,
  onOpenCase
}) {
  const t = copy[language];
  const [packs, setPacks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [rechargeConfig, setRechargeConfig] = useState(() => normalizeRechargeConfig());
  const [customAmount, setCustomAmount] = useState('10');
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentType, setPaymentType] = useState('alipay');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [busyProduct, setBusyProduct] = useState('');
  useBodyScrollLock(open);

  async function loadBilling() {
    setStatus('loading');
    setMessage(notice || '');

    try {
      const headers = getAuthHeaders(session);
      const [catalogResponse, historyResponse] = await Promise.all([
        fetch('/api/billing/catalog', { headers }),
        isAuthenticatedSession(session)
          ? fetch('/api/billing/history', { headers })
          : Promise.resolve(null)
      ]);
      const catalogPayload = await catalogResponse.json().catch(() => ({}));
      if (!catalogResponse.ok || !catalogPayload.ok) {
        throw new Error(catalogPayload.error || 'SERVER_NOT_CONFIGURED');
      }

      setPacks(catalogPayload.packs || []);
      const nextRecharge = normalizeRechargeConfig(catalogPayload.recharge);
      setRechargeConfig(nextRecharge);
      setCustomAmount((current) => current || amountInputValue(nextRecharge.custom.minimumAmountCents));
      setCheckoutAvailable(Boolean(catalogPayload.checkoutAvailable));
      const nextPaymentMethods = Array.isArray(catalogPayload.paymentMethods) ? catalogPayload.paymentMethods : [];
      setPaymentMethods(nextPaymentMethods);
      setPaymentType((current) => nextPaymentMethods.some((method) => method.id === current) ? current : nextPaymentMethods[0]?.id || 'alipay');
      if (catalogPayload.user) onProfileChange(catalogPayload.user);

      if (historyResponse) {
        const historyPayload = await historyResponse.json().catch(() => ({}));
        if (historyResponse.ok && historyPayload.ok) {
          setTransactions(historyPayload.transactions || []);
        }
      } else {
        setTransactions([]);
      }

      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setMessage(generationErrorMessage(error.message, language));
    }
  }

  async function refreshTransactionsAfterRedemption() {
    if (!isAuthenticatedSession(session)) return;
    const response = await fetch('/api/billing/history', {
      headers: getAuthHeaders(session),
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok) setTransactions(payload.transactions || []);
  }

  useEffect(() => {
    if (open) loadBilling();
  }, [open, isAuthenticatedSession(session)]);

  const customQuote = useMemo(() => quoteCustomRecharge(
    Math.round(Number(customAmount || 0) * 100),
    rechargeConfig
  ), [customAmount, rechargeConfig]);

  const customRechargeMessage = customQuote.requiresContact
    ? productText({ zh: rechargeConfig.custom.contactMessageZh, en: rechargeConfig.custom.contactMessageEn }, language)
    : customQuote.belowMinimum
      ? (language === 'zh'
          ? `自定义充值不能低于 ¥${amountInputValue(rechargeConfig.custom.minimumAmountCents)}。`
          : `Custom recharge cannot be below ¥${amountInputValue(rechargeConfig.custom.minimumAmountCents)}.`)
      : (language === 'zh'
          ? `预计到账 ${formatNumber(customQuote.credits)} 积分，其中赠送 ${formatNumber(customQuote.bonusCredits)} 积分。`
          : `Estimated total: ${formatNumber(customQuote.credits)} credits, including ${formatNumber(customQuote.bonusCredits)} bonus credits.`);

  async function handleCheckout(product) {
    if (!isAuthenticatedSession(session)) {
      onAuthRequired();
      return;
    }
    if (!checkoutAvailable) {
      setMessage(t.checkoutUnavailable);
      return;
    }

    setBusyProduct(`${product.type}:${product.id}`);
    setMessage('');

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(session)
        },
        body: JSON.stringify({
          productId: product.id,
          amountCents: product.amountCents,
          paymentType
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.url) {
        throw new Error(payload.error || 'CHECKOUT_FAILED');
      }
      if (payload.user) onProfileChange(payload.user);
      window.location.href = payload.url;
    } catch (error) {
      setBusyProduct('');
      setMessage(generationErrorMessage(error.message, language));
    }
  }

  if (!open) return null;

  return (
    <div
      className="previewOverlay billingOverlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="billingDialog" role="dialog" aria-modal="true" aria-labelledby="billing-title">
        <button className="previewClose" type="button" onClick={onClose} aria-label={t.closePreview}>
          <X size={20} />
        </button>
        <div className="billingHero">
          <span className="eyebrow">
            <CreditCard size={16} />
            {t.creditCenter}
          </span>
          <h2 id="billing-title">{t.billingTitle}</h2>
          <p>{t.billingSubtitle}</p>
        </div>

        <div className="billingSummary">
          <div>
            <span>{t.balanceTitle}</span>
            <strong>{profile?.groupAccount ? profile?.personalCreditBalance || 0 : profile?.creditBalance || 0}</strong>
            <em>{t.credits}</em>
          </div>
          <div>
            <span>{t.freeGeneration}</span>
            <strong>{profile?.freeUsed ? t.freeUsedShort : t.freeReady}</strong>
            <em>{checkoutAvailable ? t.paymentReady : t.billingNotReady}</em>
          </div>
          <div>
            <span>{language === 'zh' ? '新用户赠送' : 'New-user bonus'}</span>
            <strong>{formatNumber(rechargeConfig.signupBonusCredits)}</strong>
            <em>{language === 'zh' ? '首次注册成功后一次性到账' : 'Granted once after first registration'}</em>
          </div>
        </div>

        {!isAuthenticatedSession(session) ? (
          <div className="billingState">
            <p>{t.authRequired}</p>
            <button type="button" onClick={onAuthRequired}>
              <LogIn size={17} />
              {t.signIn}
            </button>
          </div>
        ) : null}

        {status === 'loading' ? (
          <div className="billingState">
            <LoaderCircle className="spinIcon" size={20} />
            {t.loadBilling}
          </div>
        ) : null}

        {message ? (
          <p className={cx('authMessage', status === 'error' && 'error')}>{message}</p>
        ) : null}

        {checkoutAvailable && paymentMethods.length ? (
          <div className="billingPaymentMethods" role="group" aria-label={language === 'zh' ? '支付方式' : 'Payment method'}>
            <span>{language === 'zh' ? '支付方式' : 'Payment method'}</span>
            <div>{paymentMethods.map((method) => <button className={paymentType === method.id ? 'active' : ''} type="button" key={method.id} onClick={() => setPaymentType(method.id)}>{language === 'zh' ? method.nameZh : method.nameEn}</button>)}</div>
          </div>
        ) : null}

        <div className="billingSections rechargeBillingSections">
          <section>
            <h3>
              <Coins size={18} />
              {t.creditPacks}
            </h3>
            <div className="billingCards rechargePackGrid">
              {packs.map((pack) => {
                const busy = busyProduct === `${pack.type}:${pack.id}`;
                return (
                  <article className="billingCard" key={pack.id}>
                    <span>{productText(pack.name, language)}</span>
                    <strong>{pack.priceLabel}</strong>
                        <p className="billingPackBreakdown">
                          <span>
                            {formatNumber(pack.baseCredits)} {language === 'zh' ? '基础积分' : 'base credits'}
                          </span>
                          {Number(pack.bonusCredits || 0) > 0 ? (
                            <b className="billingPackBonus">
                              + {formatNumber(pack.bonusCredits)} {language === 'zh' ? '赠送积分' : 'bonus credits'}
                            </b>
                          ) : null}
                        </p>
                    <div className="billingCredits">{t.packCredits(pack.credits)}</div>
                    <button type="button" disabled={busy} onClick={() => handleCheckout(pack)}>
                      {busy ? <LoaderCircle className="spinIcon" size={16} /> : <Coins size={16} />}
                      {checkoutAvailable ? t.buyCredits : (language === 'zh' ? '接口待配置' : 'Not configured')}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          {rechargeConfig.custom.enabled ? (
            <section className="customRechargeSection">
              <h3><CreditCard size={18} />{language === 'zh' ? '自定义充值' : 'Custom recharge'}</h3>
              <div className="customRechargeCard">
                <label>
                  <span>{language === 'zh' ? '充值金额' : 'Recharge amount'}</span>
                  <div className="customRechargeAmount"><b>¥</b><input type="number" min={rechargeConfig.custom.minimumAmountCents / 100} step="0.01" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} /></div>
                </label>
                <div className="customRechargeQuote">
                  <span>{language === 'zh' ? '基础积分' : 'Base credits'}<b>{formatNumber(customQuote.baseCredits)}</b></span>
                  <span>{language === 'zh' ? '赠送积分' : 'Bonus credits'}<b>+{formatNumber(customQuote.bonusCredits)}</b></span>
                  <strong>{language === 'zh' ? '预计到账' : 'Estimated total'}<em>{formatNumber(customQuote.credits)}</em></strong>
                </div>
                <p className={customQuote.valid ? '' : 'warning'}>{customRechargeMessage}</p>
                <button type="button" disabled={!customQuote.valid || busyProduct === 'custom_recharge:custom'} onClick={() => handleCheckout({ type: 'custom_recharge', id: 'custom', amountCents: customQuote.amountCents })}>{busyProduct === 'custom_recharge:custom' ? <LoaderCircle className="spinIcon" size={16} /> : <CreditCard size={16} />}{checkoutAvailable ? t.buyCredits : (language === 'zh' ? '接口待配置' : 'Not configured')}</button>
              </div>
            </section>
          ) : null}

          {isAuthenticatedSession(session) ? (
            <section className="billingRedeemSection">
              <RedeemCodeCard
                language={language}
                profile={profile}
                onProfileChanged={onProfileChange}
                onRedeemed={refreshTransactionsAfterRedemption}
                className="billingRedeemCard"
              />
            </section>
          ) : null}
        </div>

        <section className="transactionSection">
          <h3>
            <ReceiptText size={18} />
            {t.transactionHistory}
          </h3>
          {transactions.length ? (
            <div className="transactionList">
              {transactions.map((transaction) => (
                <TransactionItem
                  transaction={transaction}
                  language={language}
                  casesById={casesById}
                  onOpenCase={onOpenCase}
                  key={transaction.id}
                />
              ))}
            </div>
          ) : (
            <p className="emptyTransactions">{t.noTransactions}</p>
          )}
        </section>
      </section>
    </div>
  );
}

function TemplateSection({ language, styleLibrary, onOpenTemplate }) {
  const t = copy[language];
  const templates = styleLibrary.templates || [];

  return (
    <section className="templateSection" id="templates">
      <div className="sectionHead templateHead">
        <div>
          <span className="eyebrow">{t.templateEyebrow}</span>
          <h2>{t.templateTitle}</h2>
          <p>{t.templateSubtitle}</p>
        </div>
      </div>
      <div className="caseGrid templateCaseGrid">
        {templates.map((item, index) => {
          const title = textFor(item.title, language);
          const description = textFor(item.description, language);
          return (
            <article className="caseCard templateVisualCard" key={item.id}>
              <button
                className="caseImage imageButton templateImage"
                type="button"
                onClick={() => onOpenTemplate(item)}
              >
                <img src={item.cover} alt={title} loading="lazy" decoding="async" fetchPriority="low" />
                <span className="caseBadge">
                  {language === 'zh' ? '模板' : 'Template'} {String(index + 1).padStart(2, '0')}
                </span>
                <span className="imageHint">
                  <Eye size={15} />
                  {t.viewDetails}
                </span>
              </button>
              <div className="caseBody">
                <div className="caseMeta">
                  <span>{t.templateKind}</span>
                  <span>{localizeLabel(item.category, language, styleLibrary)}</span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
                <div className="tagRow">
                  {(item.tags || []).map((tag) => (
                    <span key={`${item.id}-${tag}`}>{localizeTemplateTag(tag, language, styleLibrary)}</span>
                  ))}
                </div>
                <div className="cardActions templateActions">
                  <button type="button" onClick={() => onOpenTemplate(item)}>
                    <Eye size={17} />
                    {t.viewDetails}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PromptCard({
  caseItem,
  copied,
  favorited,
  favoriteBusy,
  language,
  onCopy,
  onOpen,
  onGenerate,
  onToggleFavorite,
  styleLibrary
}) {
  const t = copy[language];
  const tags = [...new Set([...caseItem.styles, ...caseItem.scenes])].slice(0, 4);

  return (
    <article className="caseCard">
      <button className="caseImage imageButton" type="button" onClick={() => onOpen(caseItem)}>
        <img src={caseItem.thumbnail || caseItem.image} alt={caseItem.imageAlt} loading="lazy" decoding="async" fetchPriority="low" />
        <span className="caseBadge">{language === 'zh' ? '案例' : 'Case'} {caseItem.id}</span>
        <span className="imageHint">
          <Eye size={15} />
          {t.viewDetails}
        </span>
      </button>
      <div className="caseBody">
        <div className="caseMeta">
          <span>{localizeLabel(caseItem.category, language, styleLibrary)}</span>
          {caseItem.sourceUrl ? (
            <a href={caseItem.sourceUrl} target="_blank" rel="noreferrer">
              {caseItem.sourceLabel}
            </a>
          ) : (
            <span>{caseItem.sourceLabel}</span>
          )}
        </div>
        <h3>{caseItem.title}</h3>
        {caseItem.promptPreview ? <p>{caseItem.promptPreview}</p> : null}
        <div className="tagRow">
          {tags.map((tag) => (
            <span key={`${caseItem.id}-${tag}`}>{localizeLabel(tag, language, styleLibrary)}</span>
          ))}
        </div>
        <div className="cardActions caseActions">
          <button
            className={cx('favoriteAction', favorited && 'active')}
            type="button"
            onClick={() => onToggleFavorite(caseItem)}
            disabled={favoriteBusy}
            aria-pressed={Boolean(favorited)}
          >
            {favoriteBusy ? <LoaderCircle className="spinIcon" size={17} /> : <Heart size={17} />}
            {favorited ? t.favorited : t.favorite}
          </button>
          <button type="button" onClick={() => onCopy(caseItem)}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? t.copied : t.copyPrompt}
          </button>
          <button type="button" onClick={() => onOpen(caseItem)}>
            <Eye size={17} />
            {t.viewDetails}
          </button>
          <button type="button" onClick={() => onGenerate(caseItem)}>
            <ImageIcon size={17} />
            {t.generateTest}
          </button>
        </div>
      </div>
    </article>
  );
}

function PreviewDialog({
  preview,
  language,
  styleLibrary,
  copiedId,
  session,
  profile,
  favorite,
  favoriteBusy,
  onClose,
  onCopyText,
  onToggleFavorite,
  onAuthRequired,
  onBillingRequired,
  onProfileChange
}) {
  const t = copy[language];
  const { pricing: casePricing, loading: casePricingLoading } = useServerImagePricing(
    { size: '1024x1024', quality: 'medium' },
    { enabled: preview?.type === 'case' }
  );
  const [editablePrompt, setEditablePrompt] = useState('');
  const [generationState, setGenerationState] = useState({
    status: 'idle',
    image: '',
    message: ''
  });
  const [sanitizeState, setSanitizeState] = useState({
    status: 'idle',
    message: ''
  });
  useBodyScrollLock(Boolean(preview));

  useEffect(() => {
    if (!preview) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [preview, onClose]);

  useEffect(() => {
    if (preview?.type !== 'case') return;
    const savedGeneration = getSavedGeneration(preview.item.id);
    setEditablePrompt(preview.item.prompt || '');
    setGenerationState(
      savedGeneration
        ? {
            status: 'saved',
            image: savedGeneration.image,
            message: '',
            prompt: savedGeneration.prompt || preview.item.prompt || '',
            savedAt: savedGeneration.savedAt || ''
          }
        : { status: 'idle', image: '', message: '', prompt: '', savedAt: '' }
    );
    setSanitizeState({ status: 'idle', message: '' });
  }, [preview]);

  if (!preview) return null;

  const { type, item } = preview;
  const isTemplate = type === 'template';
  const title = isTemplate ? textFor(item.title, language) : item.title;
  const description = isTemplate ? textFor(item.description, language) : compactText(item.promptPreview);
  const image = isTemplate ? item.cover : item.image;
  const imageAlt = isTemplate ? title : item.imageAlt;
  const promptText = isTemplate ? formatTemplatePrompt(item, language, styleLibrary) : editablePrompt;
  const copyId = isTemplate ? `template-${item.id}` : `case-${item.id}`;
  const isCopied = copiedId === copyId;
  const meta = isTemplate
    ? [t.templateKind, localizeLabel(item.category, language, styleLibrary)]
    : [
        `${language === 'zh' ? '案例' : 'Case'} ${item.id}`,
        localizeLabel(item.category, language, styleLibrary)
      ];
  const tags = isTemplate
    ? [...new Set([...(item.tags || []), ...(item.styles || []), ...(item.scenes || [])])].slice(0, 8)
    : [...new Set([...(item.styles || []), ...(item.scenes || [])])].slice(0, 8);
  const guidance = listFor(item.guidance, language);
  const pitfalls = listFor(item.pitfalls, language);
  const isGenerating = generationState.status === 'generating';
  const generatedImage = !isTemplate ? generationState.image : '';
  const isSignedIn = isAuthenticatedSession(session);
  const creditBalance = Number(profile?.creditBalance || 0);
  const isOutOfCredits = isSignedIn && Boolean(casePricing) && creditBalance < casePricing.credits && !profile?.isSuperAdmin;
  const isSanitizing = sanitizeState.status === 'processing';
  const moderationLocked = generationState.status === 'content_moderation_blocked';
  const generationLocked = isGenerating || isSanitizing || moderationLocked || (isSignedIn && (casePricingLoading || !casePricing));
  const quotaText = isSignedIn ? getGenerationQuotaText(profile, language, Number(casePricing?.credits || 0)) : t.authRequired;

  async function handleSanitize() {
    if (isTemplate || isSanitizing) return;
    if (!isSignedIn) {
      onAuthRequired();
      return;
    }

    const prompt = editablePrompt.trim();
    if (!prompt || prompt.length > 6000) {
      setSanitizeState({ status: 'error', message: t.promptRequired });
      return;
    }

    setSanitizeState({ status: 'processing', message: '' });
    try {
      const response = await fetch('/api/sanitize-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(session)
        },
        body: JSON.stringify({ prompt })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.prompt) {
        if (payload.error === 'AUTH_REQUIRED') {
          onAuthRequired();
          setSanitizeState({ status: 'idle', message: '' });
          return;
        }
        const fallbackPrompt = buildSafePromptFallback(prompt);
        setEditablePrompt(fallbackPrompt);
        if (moderationLocked) {
          setGenerationState((current) => ({
            ...current,
            status: 'idle',
            image: '',
            message: '',
            prompt: fallbackPrompt
          }));
        }
        setSanitizeState({ status: 'success', message: t.sanitizeDone });
        return;
      }

      let nextPrompt = String(payload.prompt).trim();
      if (!nextPrompt || nextPrompt === prompt) nextPrompt = buildSafePromptFallback(prompt);
      const changed = nextPrompt !== prompt;
      setEditablePrompt(nextPrompt);
      if (moderationLocked) {
        setGenerationState((current) => ({
          ...current,
          status: 'idle',
          image: '',
          message: '',
          prompt: nextPrompt
        }));
      }
      setSanitizeState({ status: 'success', message: t.sanitizeDone });
    } catch {
      const fallbackPrompt = buildSafePromptFallback(prompt);
      setEditablePrompt(fallbackPrompt);
      if (moderationLocked) {
        setGenerationState((current) => ({
          ...current,
          status: 'idle',
          image: '',
          message: '',
          prompt: fallbackPrompt
        }));
      }
      setSanitizeState({ status: 'success', message: t.sanitizeDone });
    }
  }

  async function handleGenerate() {
    if (isTemplate || isGenerating || isSanitizing || moderationLocked) return;
    if (!isSignedIn) {
      onAuthRequired();
      setGenerationState({ status: 'idle', image: generatedImage, message: '' });
      return;
    }
    const prompt = editablePrompt.trim();
    if (!prompt || prompt.length > 6000) {
      setGenerationState({ status: 'error', image: '', message: t.promptRequired });
      return;
    }
    let confirmedPricing;
    try {
      confirmedPricing = await requestImagePricing({ size: '1024x1024', quality: 'medium' });
    } catch {
      setGenerationState({ status: 'error', image: generatedImage, message: t.generationFailed });
      return;
    }
    if (!profile?.isSuperAdmin && creditBalance < Number(confirmedPricing.credits || 0)) {
      onBillingRequired();
      setGenerationState({ status: 'idle', image: generatedImage, message: t.creditsRequired });
      return;
    }

    setGenerationState({ status: 'generating', image: '', message: '' });

    try {
      const response = await fetchImageGeneration('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(session)
        },
        body: JSON.stringify({
          caseId: item.id,
          prompt,
          size: '1024x1024',
          quality: 'medium',
          count: 1
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok || !payload.image) {
        if (payload.user) onProfileChange(payload.user);
        if (payload.error === 'AUTH_REQUIRED' || payload.loginRequired) {
          onAuthRequired();
          setGenerationState({ status: 'idle', image: generatedImage, message: '' });
          return;
        }
        if (payload.error === 'CONTENT_MODERATION_BLOCKED') {
          setGenerationState({
            status: 'content_moderation_blocked',
            image: '',
            message: t.contentModerationBlocked,
            prompt
          });
          setSanitizeState({ status: 'error', message: '' });
          return;
        }
        throw new Error(payload.error || 'GENERATION_FAILED');
      }

      const savedAt = new Date().toISOString();
      saveGeneratedTest(item.id, {
        image: payload.image,
        prompt,
        savedAt
      });
      if (payload.user) onProfileChange(payload.user);
      setGenerationState({ status: 'success', image: payload.image, message: '', prompt, savedAt });
    } catch (error) {
      setGenerationState({
        status: 'error',
        image: '',
        message: generationErrorMessage(error.message, language),
        prompt
      });
    }
  }

  function handlePromptChange(event) {
    setEditablePrompt(event.target.value);
    if (sanitizeState.status === 'success') {
      setSanitizeState({ status: 'idle', message: '' });
    }
  }

  function handleResetPrompt() {
    setEditablePrompt(item.prompt || '');
    setSanitizeState({ status: 'idle', message: '' });
  }

  return (
    <div
      className="previewOverlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="previewDialog" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <button className="previewClose" type="button" onClick={onClose} aria-label={t.closePreview}>
          <X size={20} />
        </button>
        <div className={cx('previewMedia', generatedImage && 'hasComparison')}>
          {generatedImage ? (
            <div className="comparisonGrid">
              <figure className="comparisonFigure">
                <div className="comparisonLabel">{t.originalImage}</div>
                <img src={image} alt={imageAlt} />
              </figure>
              <figure className="comparisonFigure generatedFigure">
                <div className="comparisonLabel">
                  {t.generatedResult}
                  {generationState.status === 'saved' ? <span>{t.savedInBrowser}</span> : null}
                </div>
                <img src={generatedImage} alt={t.generatedResult} />
              </figure>
            </div>
          ) : (
            <img src={image} alt={imageAlt} />
          )}
        </div>
        <div className="previewContent">
          <div className="previewMeta">
            {meta.map((itemMeta) => (
              <span key={itemMeta}>{itemMeta}</span>
            ))}
          </div>
          <h2 id="preview-title">{title}</h2>
          <p>{description}</p>
          <div className="tagRow previewTags">
            {tags.map((tag) => (
              <span key={`${type}-${item.id}-${tag}`}>
                {isTemplate
                  ? localizeTemplateTag(tag, language, styleLibrary)
                  : localizeLabel(tag, language, styleLibrary)}
              </span>
            ))}
          </div>
          {isTemplate && item.useWhen ? (
            <div className="previewSection compactSection">
              <h3>{t.useWhen}</h3>
              <p>{textFor(item.useWhen, language)}</p>
            </div>
          ) : null}
          <div className={cx('previewActions', moderationLocked && 'moderationLocked')}>
            {!isTemplate ? (
              <button
                className={cx('favoriteAction', favorite && 'active')}
                type="button"
                onClick={() => onToggleFavorite(item)}
                disabled={favoriteBusy || moderationLocked}
                aria-pressed={Boolean(favorite)}
              >
                {favoriteBusy ? <LoaderCircle className="spinIcon" size={17} /> : <Heart size={17} />}
                {favorite ? t.unfavorite : t.favorite}
              </button>
            ) : null}
            <button type="button" onClick={() => onCopyText(promptText, copyId)} disabled={moderationLocked}>
              {isCopied ? <Check size={17} /> : <Copy size={17} />}
              {isCopied ? t.copied : isTemplate ? t.copyTemplatePrompt : t.copyPrompt}
            </button>
            {!isTemplate ? (
              <button type="button" onClick={handleGenerate} disabled={generationLocked}>
                {isGenerating ? <LoaderCircle className="spinIcon" size={17} /> : <ImageIcon size={17} />}
                {isGenerating ? t.generating : isOutOfCredits ? t.buyCredits : isSignedIn ? (
                  <>{t.generateTest} · <ImageCreditPrice pricing={casePricing} language={language} compact /></>
                ) : t.signInToGenerate}
              </button>
            ) : null}
            {!isTemplate && item.sourceUrl ? (
              <a
                className={moderationLocked ? 'moderationLockedAction' : undefined}
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-disabled={moderationLocked}
                tabIndex={moderationLocked ? -1 : undefined}
                onClick={(event) => {
                  if (moderationLocked) event.preventDefault();
                }}
              >
                {t.source}
                <ArrowUpRight size={17} />
              </a>
            ) : null}
          </div>
          <div className="previewSection">
            <div className="sectionTitleRow">
              <h3>{isTemplate ? t.templatePrompt : t.editablePrompt}</h3>
              {!isTemplate ? (
                <div className="promptActionGroup">
                  <button type="button" onClick={handleSanitize} disabled={isSanitizing || isGenerating}>
                    {isSanitizing ? <LoaderCircle className="spinIcon" size={14} /> : <WandSparkles size={14} />}
                    {isSanitizing ? t.sanitizingPrompt : t.sanitizePrompt}
                  </button>
                  <button type="button" onClick={handleResetPrompt} disabled={isSanitizing}>
                    {t.resetPrompt}
                  </button>
                </div>
              ) : null}
            </div>
            {isTemplate ? (
              <pre className="promptBlock">{promptText}</pre>
            ) : (
              <textarea
                className={cx(
                  'promptEditor',
                  moderationLocked && 'moderationBlocked',
                  sanitizeState.status === 'success' && 'promptSanitized'
                )}
                value={editablePrompt}
                onChange={handlePromptChange}
                maxLength={6000}
              />
            )}
            {!isTemplate && sanitizeState.message ? (
              <p className={cx('promptSafetyMessage', moderationLocked && 'moderationLocked', sanitizeState.status === 'error' && 'error')}>
                {sanitizeState.message}
              </p>
            ) : null}
          </div>
          {!isTemplate ? (
            <div className={cx('generationPanel', moderationLocked && 'moderationLocked')}>
              <div className={cx('generationQuota', (!isSignedIn || isOutOfCredits) && 'used')}>
                {quotaText}
              </div>
              <button type="button" onClick={handleGenerate} disabled={generationLocked}>
                {isGenerating ? <LoaderCircle className="spinIcon" size={17} /> : <ImageIcon size={17} />}
                {isGenerating ? t.generating : isOutOfCredits ? t.buyCredits : isSignedIn ? (
                  <>{t.generateImage} · <ImageCreditPrice pricing={casePricing} language={language} compact /></>
                ) : t.signInToGenerate}
              </button>
              {generationState.status === 'error' || moderationLocked ? (
                <p className="generationMessage">{generationState.message}</p>
              ) : null}
            </div>
          ) : null}
          {isTemplate && (guidance.length || pitfalls.length || item.exampleCases?.length) ? (
            <div className="previewColumns">
              {guidance.length ? (
                <div className="previewSection compactSection">
                  <h3>{t.guidance}</h3>
                  <ul>
                    {guidance.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {pitfalls.length ? (
                <div className="previewSection compactSection">
                  <h3>{t.pitfalls}</h3>
                  <ul>
                    {pitfalls.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {item.exampleCases?.length ? (
                <div className="previewSection compactSection">
                  <h3>{t.examples}</h3>
                  <div className="exampleCaseRow">
                    {item.exampleCases.map((caseId) => (
                      <span key={caseId}>
                        #{caseId}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function CooperationPage({ language }) {
  const t = copy[language];
  return (
    <section className="cooperationPage" aria-labelledby="cooperation-page-title">
      <header>
        <span>PIC365</span>
        <h1 id="cooperation-page-title">{t.cooperationTitle}</h1>
      </header>
      <div className="cooperationContactGrid">
        <article>
          <span>{t.cooperationTechnical}</span>
          <div><em>{t.qq}</em><strong>2655485</strong></div>
        </article>
        <article>
          <span>{t.cooperationCustomer}</span>
          <div><em>{t.wechat}</em><strong>tzy20191024</strong></div>
        </article>
      </div>
    </section>
  );
}

function PublicNavigation({
  language,
  setLanguage,
  activePage,
  menuSettings,
  siteTheme,
  setSiteTheme,
  session,
  profile,
  onHome,
  onSolutions,
  onCases,
  onTemplates,
  onCooperation,
  onApi,
  onWorkspace,
  onSignIn,
  onSignOut,
  onAccount,
  onFavorites,
  onBilling,
  onProfileChange
}) {
  const labels = language === 'zh'
    ? { solutions: '解决方案', cases: '范例', templates: '模板', cooperation: '合作', api: 'API', workspace: '进入工作台' }
    : { solutions: 'Solutions', cases: 'Examples', templates: 'Templates', cooperation: 'Cooperation', api: 'API', workspace: 'Open workspace' };
  const themeLabel = siteTheme === 'light'
    ? (language === 'zh' ? '切换深色风格' : 'Switch to dark theme')
    : (language === 'zh' ? '切换白色风格' : 'Switch to light theme');

  return <div className="homeNavShell homeWrap">
    <nav className="homeNav" aria-label={language === 'zh' ? '首页导航' : 'Homepage navigation'}>
      <button className="homeBrand" type="button" onClick={onHome} aria-label="Pic365">
        <img src="/images/pic365-logo.png" alt="Pic365" />
      </button>
      <div className="homeNavLinks">
        <button className={activePage === 'home' ? 'active' : ''} type="button" onClick={onSolutions}>{labels.solutions}</button>
        <button className={activePage === 'cases' ? 'active' : ''} type="button" onClick={onCases}>{labels.cases}</button>
        <button className={activePage === 'templates' ? 'active' : ''} type="button" onClick={onTemplates}>{labels.templates}</button>
        <button className={activePage === 'cooperation' ? 'active' : ''} type="button" onClick={onCooperation}>{labels.cooperation}</button>
        {menuSettings.effective.api ? <button type="button" onClick={onApi}>{labels.api}</button> : null}
      </div>
      <div className="homeNavActions">
        <LanguageSwitch language={language} setLanguage={setLanguage} combinedLabel />
        <NotificationBell language={language} session={session} profile={profile} onProfileChange={onProfileChange} onSignIn={onSignIn} />
        <button className="siteThemeToggle" type="button" aria-pressed={siteTheme === 'light'} aria-label={themeLabel} title={themeLabel} onClick={() => setSiteTheme((current) => current === 'light' ? 'dark' : 'light')}><SunMoon size={20} /></button>
        <UserMenu language={language} session={session} profile={profile} onSignIn={onSignIn} onSignOut={onSignOut} onAccount={onAccount} onFavorites={onFavorites} onBilling={onBilling} />
        <button className="homePrimaryButton homeWorkspaceButton" type="button" onClick={onWorkspace}>{labels.workspace}<ArrowUpRight size={16} /></button>
      </div>
    </nav>
  </div>;
}

function App() {
  useGaPageViews();
  const [siteData, setSiteData] = useState(EMPTY_SITE_DATA);
  const [styleLibrary, setStyleLibrary] = useState(EMPTY_STYLE_LIBRARY);
  const [caseIndexLoading, setCaseIndexLoading] = useState(true);
  const [visibleCaseCount, setVisibleCaseCount] = useState(GALLERY_INITIAL_COUNT);
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'zh');
  const [siteTheme, setSiteTheme] = useState(loadSiteTheme);
  const [activePage, setActivePage] = useState(() => pageFromHash(window.location.hash));
  const [workspaceMode, setWorkspaceMode] = useState('single');
  const [pendingReferenceAsset, setPendingReferenceAsset] = useState(null);
  const [pendingCanvasReference, setPendingCanvasReference] = useState(null);
  const [pendingEcommerceProjectId, setPendingEcommerceProjectId] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [style, setStyle] = useState('All');
  const [scene, setScene] = useState('All');
  const [creationCategory, setCreationCategory] = useState('All');
  const [preview, setPreview] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [favoriteRows, setFavoriteRows] = useState([]);
  const [favoriteBusyId, setFavoriteBusyId] = useState(null);
  const [favoriteMessage, setFavoriteMessage] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [authErrorCode, setAuthErrorCode] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountInitialSection, setAccountInitialSection] = useState('overview');
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingNotice, setBillingNotice] = useState('');
  const [menuSettings, setMenuSettings] = useState({
    global: { templates: true, cases: true, api: true },
    personal: { hideEcommerce: false, hideTemplates: false, hideCases: false, hideApi: false },
    effective: { ecommerce: true, templates: true, cases: true, api: true }
  });
  const fullCaseDataPromiseRef = useRef(null);
  const gallerySentinelRef = useRef(null);
  const { copiedId, copyText } = useCopy();
  const t = copy[language];

  useEffect(() => {
    let cancelled = false;
    const dataVersion = encodeURIComponent(__PIC365_BUILD_ID__);
    fetch(`/style-library.json?v=${dataVersion}`)
      .then((response) => response.json())
      .then((library) => {
        if (!cancelled) setStyleLibrary(library);
      })
      .catch(() => undefined);
    fetch(`/cases-index.json?v=${dataVersion}`, { priority: 'high' })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) setSiteData(payload);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCaseIndexLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function loadFullCaseData() {
    if (siteData.cases.some((item) => item.prompt)) return Promise.resolve(siteData);
    if (!fullCaseDataPromiseRef.current) {
      const dataVersion = encodeURIComponent(__PIC365_BUILD_ID__);
      fullCaseDataPromiseRef.current = fetch(`/cases.json?v=${dataVersion}`, { priority: 'low' })
        .then((response) => {
          if (!response.ok) throw new Error('CASE_DATA_LOAD_FAILED');
          return response.json();
        })
        .then((payload) => {
          setSiteData(payload);
          return payload;
        })
        .catch((error) => {
          fullCaseDataPromiseRef.current = null;
          throw error;
        });
    }
    return fullCaseDataPromiseRef.current;
  }

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  useEffect(() => {
    try { localStorage.setItem(SITE_THEME_STORAGE_KEY, siteTheme); } catch { /* best effort */ }
    document.documentElement.dataset.theme = siteTheme;
    document.body.dataset.theme = siteTheme;
    document.documentElement.style.colorScheme = siteTheme;
  }, [siteTheme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (!authError) return;

    setAuthErrorCode(authError);
    setAuthOpen(true);
    params.delete('auth_error');
    params.delete('auth_provider');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, []);

  useEffect(() => {
    let active = true;
    authClient.getSession().then((nextSession) => {
      if (active) setSession(nextSession || null);
    }).catch(() => {
      if (active) setSession(null);
    });

    const unsubscribe = authClient.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticatedSession(session)) return;
    if (
      window.location.hash === '#admin'
      || window.location.hash === '#assets'
      || window.location.hash === '#canvas'
      || window.location.hash === '#cooperation'
      || window.location.hash === '#gallery'
      || window.location.hash === '#home'
      || window.location.hash === '#templates'
      || !window.location.hash
    ) return;
    setWorkspaceMode('single');
    setActivePage('create');
    if (window.location.hash !== '#create') {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#create`);
    }
  }, [isAuthenticatedSession(session)]);

  const refreshMenuSettings = useCallback(async () => {
    try {
      const response = await fetch(`/api/menu-settings?t=${Date.now()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'MENU_SETTINGS_FAILED');
      setMenuSettings(payload.menu);
      return payload.menu;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    refreshMenuSettings();
  }, [refreshMenuSettings, session?.user?.id]);


  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticatedSession(session)) {
      setProfile(null);
      setFavoriteRows([]);
      return () => {
        cancelled = true;
      };
    }

    fetch('/api/me', {
      headers: getAuthHeaders(session)
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload?.ok) {
          setProfile(payload.user);
        }
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticatedSession(session)]);

  useEffect(() => {
    if (activePage !== 'admin' || profile == null || profile.canAccessAdmin) return;
    handlePageChange('create');
  }, [activePage, profile?.canAccessAdmin]);

  async function loadFavorites({ silent = true } = {}) {
    if (!isAuthenticatedSession(session)) {
      setFavoriteRows([]);
      return [];
    }

    try {
      const response = await fetch('/api/favorites', {
        headers: getAuthHeaders(session)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload.error || 'FAVORITES_LOAD_FAILED');
      }
      const favorites = normalizeFavoriteRows(payload.favorites);
      setFavoriteRows(favorites);
      return favorites;
    } catch {
      if (!silent) setTimedFavoriteMessage(t.favoriteFailed);
      return [];
    }
  }

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticatedSession(session)) {
      setFavoriteRows([]);
      return () => {
        cancelled = true;
      };
    }

    loadFavorites().then((favorites) => {
      if (cancelled) return;
      setFavoriteRows(favorites);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticatedSession(session)]);

  useEffect(() => {
    function handleHashChange() {
      setActivePage(pageFromHash(window.location.hash));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function handlePageChange(nextPage) {
    let page = Object.prototype.hasOwnProperty.call(PAGE_HASHES, nextPage) ? nextPage : 'home';
    if (page === 'admin' && !profile?.canAccessAdmin) page = 'create';
    setActivePage(page);
    const nextHash = `#${hashForPage(page)}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState({}, '', `${window.location.pathname}${window.location.search}${nextHash}`);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openHomepageSolutions() {
    if (activePage !== 'home') handlePageChange('home');
    window.setTimeout(() => {
      document.getElementById('homepage-audiences')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, activePage === 'home' ? 0 : 60);
  }

  function openAuth() {
    setAuthErrorCode('');
    setAuthOpen(true);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get('billing');
    if (!billing) return;
    if (billing === 'success') setBillingNotice(t.billingSuccess);
    if (billing === 'cancelled') setBillingNotice(t.billingCancelled);
    if (billing === 'failed') setBillingNotice(t.billingFailed);
    setBillingOpen(true);
    params.delete('billing');
    params.delete('session_id');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, [t.billingCancelled, t.billingFailed, t.billingSuccess]);

  const latestCases = useMemo(() => {
    if (!siteData) return [];
    return [...siteData.cases].sort((a, b) => b.id - a.id);
  }, [siteData]);

  const heroCases = useMemo(
    () => takeDistinctCases(latestCases, HERO_CASE_COUNT),
    [latestCases]
  );

  const hotStripCases = useMemo(
    () => takeDistinctCases(
      latestCases,
      HOT_STRIP_CASE_COUNT,
      new Set(heroCases.map((caseItem) => caseItem.id))
    ),
    [heroCases, latestCases]
  );

  const filteredCases = useMemo(() => {
    if (!siteData) return [];
    const q = query.trim().toLowerCase();
    return siteData.cases.filter((item) => {
      const matchQuery =
        !q ||
        `${item.id} ${item.title} ${item.category} ${item.prompt || ''} ${item.promptPreview || ''} ${item.sourceLabel}`
          .toLowerCase()
          .includes(q);
      const matchCategory = category === 'All' || item.category === category;
      const matchStyle = style === 'All' || item.styles.includes(style);
      const matchScene = scene === 'All' || item.scenes.includes(scene);
      return matchQuery && matchCategory && matchStyle && matchScene;
    });
  }, [siteData, query, category, style, scene]);

  const orderedCategories = useMemo(
    () => (siteData && styleLibrary ? orderByLibrary(siteData.categories, styleLibrary.categories) : []),
    [siteData, styleLibrary]
  );
  const orderedStyles = useMemo(
    () => (siteData && styleLibrary ? orderByLibrary(siteData.styles, styleLibrary.styles) : []),
    [siteData, styleLibrary]
  );
  const orderedScenes = useMemo(
    () => (siteData && styleLibrary ? orderByLibrary(siteData.scenes, styleLibrary.scenes) : []),
    [siteData, styleLibrary]
  );

  const creationCategoryOptions = useMemo(() => {
    if (!siteData || !styleLibrary) return [];
    const templateCategories = (styleLibrary.templates || []).map((item) => item.category);
    const values = [...new Set([...siteData.categories, ...templateCategories])];
    return orderByLibrary(values, styleLibrary.categories).map((value) => ({
      value,
      label: localizeLabel(value, language, styleLibrary)
    }));
  }, [language, siteData, styleLibrary]);

  const creationCases = useMemo(() => {
    if (!siteData) return [];
    return siteData.cases
      .filter((item) => creationCategory === 'All' || item.category === creationCategory)
      .slice(0, 12);
  }, [creationCategory, siteData]);

  const visibleCases = filteredCases.slice(0, visibleCaseCount);
  const casesById = useMemo(() => new Map((siteData?.cases || []).map((caseItem) => [caseItem.id, caseItem])), [siteData]);
  const favoriteCaseIds = useMemo(
    () => new Set(normalizeFavoriteRows(favoriteRows).map((favorite) => favorite.caseId)),
    [favoriteRows]
  );

  useEffect(() => {
    setVisibleCaseCount(GALLERY_INITIAL_COUNT);
  }, [query, category, style, scene]);

  useEffect(() => {
    if (!query.trim() || siteData.cases.some((item) => item.prompt)) return;
    const timer = window.setTimeout(() => {
      loadFullCaseData().catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, siteData]);

  useEffect(() => {
    if (activePage !== 'cases' || visibleCaseCount >= filteredCases.length) return undefined;
    const sentinel = gallerySentinelRef.current;
    if (!sentinel) return undefined;
    const loadNextBatch = () => {
      setVisibleCaseCount((current) => Math.min(filteredCases.length, current + GALLERY_BATCH_SIZE));
    };
    if (typeof IntersectionObserver === 'undefined') {
      let frame = 0;
      const checkPosition = () => {
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (sentinel.getBoundingClientRect().top <= window.innerHeight + 900) loadNextBatch();
        });
      };
      window.addEventListener('scroll', checkPosition, { passive: true });
      window.addEventListener('resize', checkPosition);
      checkPosition();
      return () => {
        window.removeEventListener('scroll', checkPosition);
        window.removeEventListener('resize', checkPosition);
        if (frame) window.cancelAnimationFrame(frame);
      };
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      loadNextBatch();
    }, { rootMargin: '900px 0px', threshold: 0.01 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activePage, filteredCases.length, visibleCaseCount]);

  async function handleSignOut() {
    await authClient.signOut().catch(() => undefined);
    setSession(null);
    setProfile(null);
    setFavoriteRows([]);
    setAccountOpen(false);
    setBillingOpen(false);
    setWorkspaceMode('single');
    handlePageChange('home');
  }

  function handleProfileChange(nextProfile) {
    if (nextProfile) setProfile(nextProfile);
  }

  function handleMenuSettingsChanged(nextMenu) {
    if (nextMenu) setMenuSettings(nextMenu);
    else refreshMenuSettings();
  }

  function openCasePreview(caseItem) {
    if (!caseItem) return;
    setPreview({ type: 'case', item: caseItem });
    if (caseItem.prompt) return;
    loadFullCaseData()
      .then((payload) => {
        const detailedCase = payload.cases.find((item) => item.id === caseItem.id);
        if (!detailedCase) return;
        setPreview((current) => (
          current?.type === 'case' && current.item?.id === caseItem.id
            ? { ...current, item: detailedCase }
            : current
        ));
      })
      .catch(() => undefined);
  }

  async function handleCopyCasePrompt(caseItem) {
    let detailedCase = caseItem;
    if (!detailedCase?.prompt) {
      const payload = await loadFullCaseData().catch(() => null);
      detailedCase = payload?.cases?.find((item) => item.id === caseItem?.id) || caseItem;
    }
    if (detailedCase?.prompt) await copyText(detailedCase.prompt, `case-${detailedCase.id}`);
  }

  function handleOpenCaseFromAccount(caseItem) {
    setAccountOpen(false);
    setAccountInitialSection('overview');
    setBillingOpen(false);
    openCasePreview(caseItem);
  }

  function handleOpenCaseFromAdmin(caseItem) {
    openCasePreview(caseItem);
  }

  function setTimedFavoriteMessage(message) {
    setFavoriteMessage(message);
    window.setTimeout(() => {
      setFavoriteMessage((current) => (current === message ? '' : current));
    }, 2400);
  }

  async function handleToggleFavorite(caseItem) {
    if (!caseItem?.id) return;
    if (!isAuthenticatedSession(session)) {
      openAuth();
      setTimedFavoriteMessage(t.signInToFavorite);
      return;
    }

    const caseId = Number(caseItem.id);
    const isFavorite = favoriteCaseIds.has(caseId);
    const previousRows = favoriteRows;
    setFavoriteBusyId(caseId);

    if (isFavorite) {
      setFavoriteRows((current) => normalizeFavoriteRows(current).filter((favorite) => favorite.caseId !== caseId));
    } else {
      setFavoriteRows((current) => [
        { caseId, createdAt: new Date().toISOString() },
        ...normalizeFavoriteRows(current).filter((favorite) => favorite.caseId !== caseId)
      ]);
    }

    try {
      const response = await fetch(isFavorite ? `/api/favorites?caseId=${caseId}` : '/api/favorites', {
        method: isFavorite ? 'DELETE' : 'POST',
        headers: {
          ...(isFavorite ? {} : { 'Content-Type': 'application/json' }),
          ...getAuthHeaders(session)
        },
        body: isFavorite ? undefined : JSON.stringify({ caseId })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        if (payload.error === 'AUTH_REQUIRED' || payload.loginRequired) openAuth();
        throw new Error(payload.error || 'FAVORITE_FAILED');
      }

      if (!isFavorite && payload.favorite) {
        const favorite = normalizeFavoriteRows([payload.favorite])[0];
        if (favorite) {
          setFavoriteRows((current) => [
            favorite,
            ...normalizeFavoriteRows(current).filter((item) => item.caseId !== caseId)
          ]);
        }
      }
      setTimedFavoriteMessage(isFavorite ? t.favoriteRemoved : t.favoriteSaved);
    } catch {
      setFavoriteRows(previousRows);
      setTimedFavoriteMessage(t.favoriteFailed);
    } finally {
      setFavoriteBusyId(null);
    }
  }

  function handleOpenAccount(section = 'overview') {
    setAccountInitialSection(section);
    setAccountOpen(true);
    if (section === 'favorites') {
      loadFavorites({ silent: false });
    }
  }

  function handleCloseAccount() {
    setAccountOpen(false);
    setAccountInitialSection('overview');
  }

  const isPublicPage = PUBLIC_PAGES.has(activePage);
  const openWorkspace = () => {
    setWorkspaceMode('single');
    handlePageChange('create');
  };
  const publicNavigation = <PublicNavigation
    language={language}
    setLanguage={setLanguage}
    activePage={activePage}
    menuSettings={menuSettings}
    siteTheme={siteTheme}
    setSiteTheme={setSiteTheme}
    session={session}
    profile={profile}
    onHome={() => handlePageChange('home')}
    onSolutions={openHomepageSolutions}
    onCases={() => handlePageChange('cases')}
    onTemplates={() => handlePageChange('templates')}
    onCooperation={() => handlePageChange('cooperation')}
    onApi={() => window.open(import.meta.env.VITE_API_PORTAL_URL || 'https://www.unikeyx.com', '_blank', 'noopener,noreferrer')}
    onWorkspace={openWorkspace}
    onSignIn={openAuth}
    onSignOut={handleSignOut}
    onAccount={() => handleOpenAccount('overview')}
    onFavorites={() => handleOpenAccount('favorites')}
    onBilling={() => {
      setBillingNotice('');
      setBillingOpen(true);
    }}
    onProfileChange={setProfile}
  />;

  return (
    <main className={cx('siteApp', isPublicPage && 'sitePublicPage', activePage === 'home' && 'siteHomepageActive', activePage === 'canvas' && 'siteWorkspaceCanvas', siteTheme === 'light' && 'siteThemeLight')} data-theme={siteTheme}>
      {isPublicPage && activePage !== 'home' ? publicNavigation : null}
      {!isPublicPage ? <header className={cx('topbar', 'workspaceTopbar', `topbarPage-${activePage}`)}>
        <div className="workspaceHomeCluster">
          <a className="brand pic365Brand" href="#home" aria-label="pic365">
            <img className="pic365BrandLogo" src="/images/pic365-logo.png" alt="pic365" />
          </a>
          <button className="workspaceHomeButton" type="button" onClick={() => handlePageChange('home')}>
            {t.navHome}
          </button>
        </div>
        <div className="topbarControls">
          <nav className={cx('pageTabs', profile?.canAccessAdmin && 'withAdminTab')} aria-label={language === 'zh' ? '主页面' : 'Main pages'}>
            <button
              className={cx('pageTab', activePage === 'create' && workspaceMode === 'single' && 'active')}
              type="button"
              onClick={() => {
                setWorkspaceMode('single');
                handlePageChange('create');
              }}
            >
              {t.freeMode}
            </button>
            <button
              className={cx('pageTab', activePage === 'canvas' && 'active')}
              type="button"
              onClick={() => handlePageChange('canvas')}
            >
              {t.canvasMode}
            </button>
            <button
              className={cx('pageTab', activePage === 'create' && workspaceMode === 'ecommerce' && 'active')}
              type="button"
              onClick={() => {
                setWorkspaceMode('ecommerce');
                handlePageChange('create');
              }}
            >
              {t.ecommerceMode}
            </button>
            <button
              className={cx('pageTab', activePage === 'assets' && 'active')}
              type="button"
              onClick={() => handlePageChange('assets')}
            >
              {t.navAssets}
            </button>
            {profile?.canAccessAdmin ? (
              <button
                className={cx('pageTab', 'adminPageTab', activePage === 'admin' && 'active')}
                type="button"
                onClick={() => handlePageChange('admin')}
              >
                {t.adminPanel}
              </button>
            ) : null}
          </nav>
          <UserMenu
            language={language}
            session={session}
            profile={profile}
            onSignIn={openAuth}
            onSignOut={handleSignOut}
            onAccount={() => handleOpenAccount('overview')}
            onFavorites={() => handleOpenAccount('favorites')}
            onBilling={() => {
              setBillingNotice('');
              setBillingOpen(true);
            }}
          />
        </div>
      </header> : null}
      {favoriteMessage ? <div className="toastNotice">{favoriteMessage}</div> : null}

      {activePage === 'home' ? <Homepage
        language={language}
        navigation={publicNavigation}
        onCreate={() => { setWorkspaceMode('single'); handlePageChange('create'); }}
        onCanvas={() => handlePageChange('canvas')}
        onEcommerce={() => { setWorkspaceMode('ecommerce'); handlePageChange('create'); }}
        onCases={() => handlePageChange('cases')}
      /> : null}

      {activePage === 'cases' ? (
        <>
      <Hero
        latestCases={heroCases}
        language={language}
        totalCases={siteData.totalCases}
        categoryCount={siteData.categories.length}
        onOpenCase={openCasePreview}
        onExplore={() => handlePageChange('cases')}
      />

      <section className="hotStrip">
        {hotStripCases.map((caseItem) => (
          <button
            type="button"
            aria-label={`${language === 'zh' ? '打开案例' : 'Open case'} ${caseItem.id}: ${caseItem.title}`}
            onClick={() => openCasePreview(caseItem)}
            key={caseItem.id}
          >
            <img src={caseItem.thumbnail || caseItem.image} alt={caseItem.imageAlt} loading="lazy" decoding="async" fetchPriority="low" />
            <span>#{caseItem.id}</span>
          </button>
        ))}
      </section>

      <section className="gallerySection" id="gallery">
        <div className="sectionHead">
          <div>
            <span className="eyebrow">{t.sectionEyebrow}</span>
            <h2>{t.sectionTitle}</h2>
          </div>
          <div className="searchBox">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.search}
            />
          </div>
        </div>

        <div className="filterPanel">
          <div>
            <strong>{t.category}</strong>
            <div className="filterRow">
              <FilterPill active={category === 'All'} onClick={() => setCategory('All')}>{t.all}</FilterPill>
              {orderedCategories.map((item) => (
                <FilterPill key={item} active={category === item} onClick={() => setCategory(item)}>
                  {localizeLabel(item, language, styleLibrary)}
                </FilterPill>
              ))}
            </div>
          </div>
          <div>
            <strong>{t.style}</strong>
            <div className="filterRow">
              <FilterPill active={style === 'All'} onClick={() => setStyle('All')}>{t.all}</FilterPill>
              {orderedStyles.map((item) => (
                <FilterPill key={item} active={style === item} onClick={() => setStyle(item)}>
                  {localizeLabel(item, language, styleLibrary)}
                </FilterPill>
              ))}
            </div>
          </div>
          <div>
            <strong>{t.scene}</strong>
            <div className="filterRow">
              <FilterPill active={scene === 'All'} onClick={() => setScene('All')}>{t.all}</FilterPill>
              {orderedScenes.map((item) => (
                <FilterPill key={item} active={scene === item} onClick={() => setScene(item)}>
                  {localizeLabel(item, language, styleLibrary)}
                </FilterPill>
              ))}
            </div>
          </div>
        </div>

        <div className="resultBar">
          <span>{language === 'zh' ? `${filteredCases.length} ${t.matching}` : `${filteredCases.length} ${t.matching}`}</span>
        </div>

        <div className="caseGrid" aria-busy={caseIndexLoading}>
          {caseIndexLoading ? Array.from({ length: 9 }, (_, index) => (
            <article className="caseCard galleryCaseSkeleton" aria-hidden="true" key={`gallery-skeleton-${index}`}>
              <span className="galleryImageSkeleton" />
              <span className="galleryLineSkeleton wide" />
              <span className="galleryLineSkeleton" />
            </article>
          )) : visibleCases.map((caseItem) => (
            <PromptCard
              caseItem={caseItem}
              copied={copiedId === `case-${caseItem.id}`}
              favorited={favoriteCaseIds.has(caseItem.id)}
              favoriteBusy={favoriteBusyId === caseItem.id}
              language={language}
              onCopy={handleCopyCasePrompt}
              onOpen={openCasePreview}
              onGenerate={(item) => {
                openCasePreview(item);
                if (!isAuthenticatedSession(session)) openAuth();
              }}
              onToggleFavorite={handleToggleFavorite}
              styleLibrary={styleLibrary}
              key={caseItem.id}
            />
          ))}
        </div>

        {!caseIndexLoading && filteredCases.length > visibleCases.length && (
          <div className="galleryLoadSentinel" ref={gallerySentinelRef}>
            <LoaderCircle className="spinIcon" size={17} />
            <button type="button" onClick={() => setVisibleCaseCount((current) => Math.min(filteredCases.length, current + GALLERY_BATCH_SIZE))}>
              {t.limit(visibleCases.length)}
            </button>
          </div>
        )}
      </section>

        </>
      ) : null}

      {activePage === 'templates' ? (
        <>
          <TemplateSection
            language={language}
            styleLibrary={styleLibrary}
            onOpenTemplate={(item) => setPreview({ type: 'template', item })}
          />
        </>
      ) : null}

      {activePage === 'create' ? (
        <CreateWorkspace
          workspaceMode={workspaceMode}
          language={language}
          session={session}
          profile={profile}
          cases={creationCases}
          categoryOptions={creationCategoryOptions}
          category={creationCategory}
          onCategoryChange={setCreationCategory}
          onOpenCase={openCasePreview}
          onBrowseCases={() => handlePageChange('cases')}
          onSignIn={openAuth}
          onBilling={() => {
            setBillingNotice(t.creditsRequired);
            setBillingOpen(true);
          }}
          onProfileChange={handleProfileChange}
          pendingReferenceAsset={pendingReferenceAsset}
          onReferenceAssetConsumed={() => setPendingReferenceAsset(null)}
          pendingCanvasReference={pendingCanvasReference}
          onCanvasReferenceConsumed={() => setPendingCanvasReference(null)}
          pendingEcommerceProjectId={pendingEcommerceProjectId}
          onEcommerceProjectConsumed={() => setPendingEcommerceProjectId('')}
        />
      ) : null}
      {activePage === 'canvas' ? (
        <Suspense fallback={<div className="createWorkspaceLoading" aria-live="polite"><span /></div>}>
          <InfiniteImageCanvas
            language={language}
            theme={siteTheme}
            session={session}
            profile={profile}
            onSignIn={openAuth}
            onBilling={() => {
              setBillingNotice(t.creditsRequired);
              setBillingOpen(true);
            }}
            onProfileChange={handleProfileChange}
            onOpenInStudio={(node) => {
              setPendingCanvasReference(node);
              setWorkspaceMode('single');
              handlePageChange('create');
            }}
          />
        </Suspense>
      ) : null}
      {activePage === 'assets' ? (
        <Suspense fallback={<div className="createWorkspaceLoading" aria-live="polite"><span /></div>}>
          <MediaAssetCenter
            language={language}
            session={session}
            profile={profile}
            onSignIn={openAuth}
            onUseAsReference={(asset) => {
              setPendingReferenceAsset(asset);
              setWorkspaceMode('single');
              handlePageChange('create');
            }}
          />
        </Suspense>
      ) : null}
      {activePage === 'cooperation' ? <CooperationPage language={language} /> : null}
      {activePage === 'admin' && profile?.canAccessAdmin ? (
        <AdminPanel
          language={language}
          session={session}
          profile={profile}
          casesById={casesById}
          onOpenAccount={() => handleOpenAccount('overview')}
          onOpenCase={handleOpenCaseFromAdmin}
          onMenuSettingsChanged={handleMenuSettingsChanged}
        />
      ) : null}
      <PreviewDialog
        preview={preview}
        language={language}
        styleLibrary={styleLibrary}
        copiedId={copiedId}
        session={session}
        profile={profile}
        favorite={preview?.type === 'case' ? favoriteCaseIds.has(preview.item.id) : false}
        favoriteBusy={preview?.type === 'case' && favoriteBusyId === preview.item.id}
        onClose={() => setPreview(null)}
        onCopyText={copyText}
        onToggleFavorite={handleToggleFavorite}
        onAuthRequired={openAuth}
        onBillingRequired={() => {
          setBillingNotice(t.creditsRequired);
          setBillingOpen(true);
        }}
        onProfileChange={handleProfileChange}
      />
      <AuthModal
        open={authOpen}
        language={language}
        initialErrorCode={authErrorCode}
        onClose={() => {
          setAuthOpen(false);
          setAuthErrorCode('');
        }}
      />
      <AccountPanel
        open={accountOpen}
        language={language}
        session={session}
        profile={profile}
        casesById={casesById}
        favoriteRows={favoriteRows}
        initialSection={accountInitialSection}
        onClose={handleCloseAccount}
        onProfileChange={handleProfileChange}
        onMenuChanged={handleMenuSettingsChanged}
        onOpenCase={handleOpenCaseFromAccount}
        onBilling={() => {
          setAccountOpen(false);
          setBillingNotice('');
          setBillingOpen(true);
        }}
      />
      <CreditPanel
        open={billingOpen}
        language={language}
        session={session}
        profile={profile}
        notice={billingNotice}
        casesById={casesById}
        onClose={() => setBillingOpen(false)}
        onAuthRequired={openAuth}
        onProfileChange={handleProfileChange}
        onOpenCase={handleOpenCaseFromAccount}
      />
      <ChatCompanion
        language={language}
        session={session}
        profile={profile}
        onSignIn={openAuth}
        onBilling={() => {
          setBillingNotice(t.creditsRequired);
          setBillingOpen(true);
        }}
        onProfileChange={handleProfileChange}
      />
    </main>
  );
}

const rootElement = document.getElementById('root');
const appRoot = globalThis.__PIC365_REACT_ROOT__ || createRoot(rootElement);
globalThis.__PIC365_REACT_ROOT__ = appRoot;
appRoot.render(<App />);
