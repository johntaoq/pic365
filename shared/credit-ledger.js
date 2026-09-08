export const CREDIT_LEDGER_CATEGORIES = Object.freeze([
  'all',
  'ai_image',
  'ai_video',
  'ai_voice',
  'ai_chat',
  'ai_tool',
  'storage',
  'recharge',
  'redemption',
  'grant',
  'adjustment',
  'group',
  'refund',
  'other'
]);

export const CREDIT_LEDGER_PAGE_SIZES = Object.freeze([10, 20, 30, 50, 100]);

export function creditLedgerPaginationItems(currentPage = 1, totalPages = 1) {
  const total = Math.max(1, Math.floor(Number(totalPages) || 1));
  const current = Math.max(1, Math.min(total, Math.floor(Number(currentPage) || 1)));
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 'jump', total - 1, total];
  if (current >= total - 3) return [1, 2, 'jump', total - 3, total - 2, total - 1, total];
  return [1, 'jump-left', current - 1, current, current + 1, 'jump-right', total];
}

export const CREDIT_LEDGER_CATEGORY_LABELS = Object.freeze({
  all: { zh: '全部类型', en: 'All types' },
  ai_image: { zh: 'AI 图片', en: 'AI image' },
  ai_video: { zh: 'AI 视频', en: 'AI video' },
  ai_voice: { zh: 'AI 语音', en: 'AI voice' },
  ai_chat: { zh: '聊天精灵', en: 'AI chat' },
  ai_tool: { zh: 'AI 工具', en: 'AI tool' },
  storage: { zh: '存储消耗', en: 'Storage' },
  recharge: { zh: '充值到账', en: 'Recharge' },
  redemption: { zh: '兑换码到账', en: 'Redemption' },
  grant: { zh: '赠送积分', en: 'Credit grant' },
  adjustment: { zh: '管理员调整', en: 'Admin adjustment' },
  group: { zh: '集团划拨', en: 'Group transfer' },
  refund: { zh: '退款返还', en: 'Refund' },
  other: { zh: '其他', en: 'Other' }
});

export const CREDIT_LEDGER_DIRECTION_LABELS = Object.freeze({
  all: { zh: '全部收支', en: 'All directions' },
  income: { zh: '收入', en: 'Income' },
  expense: { zh: '支出', en: 'Expense' }
});

export function creditLedgerCategory(type = '', source = '') {
  const normalizedType = String(type || '').toLowerCase();
  const normalizedSource = String(source || '').toLowerCase();
  const combined = `${normalizedType} ${normalizedSource}`;
  if (/voice|speech|tts|audio_generation|audio-generation/.test(combined)) return 'ai_voice';
  if (/video/.test(combined)) return 'ai_video';
  if (normalizedType === 'ai_chat' || /chat/.test(normalizedSource)) return 'ai_chat';
  if (normalizedType === 'ai_tool' || /ai_magic|magic|brief|optimi[sz]e/.test(normalizedSource)) return 'ai_tool';
  if (normalizedType === 'storage' || /storage/.test(normalizedSource)) return 'storage';
  if (normalizedType === 'purchase' || /checkout|purchase|recharge/.test(normalizedSource)) return 'recharge';
  if (normalizedType === 'redemption' || /paid_code|free_code|redemption/.test(normalizedSource)) return 'redemption';
  if (normalizedType === 'signup_bonus' || normalizedType === 'grant' || /bonus|gift|grant/.test(normalizedSource)) return 'grant';
  if (normalizedType === 'adjustment' || /admin_adjustment/.test(normalizedSource)) return 'adjustment';
  if (normalizedType === 'group_transfer' || /group_funding|group_transfer/.test(normalizedSource)) return 'group';
  if (normalizedType === 'refund' || /refund|release|recovery/.test(normalizedSource)) return 'refund';
  if (normalizedType === 'generation' || /generation|image/.test(normalizedSource)) return 'ai_image';
  return 'other';
}

export function creditLedgerModule(category, metadata = {}) {
  if (metadata?.projectId || metadata?.slotId) return 'ecommerce';
  if (metadata?.canvasProjectId) return 'canvas';
  if (category === 'ai_image') return 'image-studio';
  if (category === 'ai_video') return 'video';
  if (category === 'ai_voice') return 'voice';
  if (category === 'ai_chat') return 'chat';
  if (category === 'ai_tool') return 'ai-tool';
  if (category === 'storage') return 'asset-storage';
  if (category === 'recharge' || category === 'redemption') return 'billing';
  if (category === 'group') return 'group-account';
  return 'account';
}

export function creditLedgerCategoryLabel(category, language = 'zh') {
  return CREDIT_LEDGER_CATEGORY_LABELS[category]?.[language] || CREDIT_LEDGER_CATEGORY_LABELS.other[language];
}
