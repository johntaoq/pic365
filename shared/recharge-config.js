export const RECHARGE_CREDITS_PER_YUAN = 100;

const DEFAULT_PACKS = [
  { id: 'recharge-10', amountCents: 1000, bonusPercent: 0, enabled: true },
  { id: 'recharge-20', amountCents: 2000, bonusPercent: 1, enabled: true },
  { id: 'recharge-30', amountCents: 3000, bonusPercent: 1.666667, enabled: true },
  { id: 'recharge-50', amountCents: 5000, bonusPercent: 4, enabled: true },
  { id: 'recharge-100', amountCents: 10000, bonusPercent: 10, enabled: true }
];

export const DEFAULT_RECHARGE_CONFIG = Object.freeze({
  signupBonusCredits: 60,
  creditsPerYuan: RECHARGE_CREDITS_PER_YUAN,
  packs: DEFAULT_PACKS,
  custom: {
    enabled: true,
    minimumAmountCents: 1000,
    bonusThresholdCents: 2000,
    bonusPercent: 1,
    maximumSelfServiceAmountCents: 10000,
    contactMessageZh: '超过100元请联系客服和销售。',
    contactMessageEn: 'For amounts over ¥100, please contact customer service or sales.'
  },
  updatedAt: null
});

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInteger(value, minimum, maximum, fallback) {
  return Math.max(minimum, Math.min(maximum, Math.round(finiteNumber(value, fallback))));
}

function clampPercent(value, fallback = 0) {
  const clamped = Math.max(0, Math.min(1000, finiteNumber(value, fallback)));
  return Math.round(clamped * 1_000_000) / 1_000_000;
}

function normalizePackId(value, index) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return normalized || `recharge-pack-${index + 1}`;
}

export function calculateRechargeCredits(amountCents, bonusPercent = 0, creditsPerYuan = RECHARGE_CREDITS_PER_YUAN) {
  const normalizedAmountCents = Math.max(0, Math.round(finiteNumber(amountCents, 0)));
  const normalizedCreditsPerYuan = clampInteger(creditsPerYuan, 1, 1_000_000, RECHARGE_CREDITS_PER_YUAN);
  const normalizedBonusPercent = clampPercent(bonusPercent, 0);
  const baseCredits = Math.round((normalizedAmountCents / 100) * normalizedCreditsPerYuan);
  const bonusCredits = Math.round(baseCredits * normalizedBonusPercent / 100);
  return {
    amountCents: normalizedAmountCents,
    baseCredits,
    bonusCredits,
    credits: baseCredits + bonusCredits,
    bonusPercent: normalizedBonusPercent
  };
}

export function normalizeRechargeConfig(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const creditsPerYuan = RECHARGE_CREDITS_PER_YUAN;
  const sourcePacks = Array.isArray(source.packs) && source.packs.length ? source.packs : DEFAULT_PACKS;
  const seenIds = new Set();
  const packs = sourcePacks.slice(0, 30).map((pack, index) => {
    const fallback = DEFAULT_PACKS[index] || DEFAULT_PACKS[DEFAULT_PACKS.length - 1];
    let id = normalizePackId(pack?.id, index);
    if (seenIds.has(id)) id = `${id}-${index + 1}`;
    seenIds.add(id);
    const amountCents = clampInteger(pack?.amountCents, 100, 10_000_000, fallback.amountCents);
    const bonusPercent = clampPercent(pack?.bonusPercent, fallback.bonusPercent);
    return {
      id,
      amountCents,
      bonusPercent,
      enabled: pack?.enabled !== false,
      ...calculateRechargeCredits(amountCents, bonusPercent, creditsPerYuan)
    };
  });

  const customSource = source.custom && typeof source.custom === 'object' ? source.custom : {};
  const minimumAmountCents = clampInteger(
    customSource.minimumAmountCents,
    100,
    10_000_000,
    DEFAULT_RECHARGE_CONFIG.custom.minimumAmountCents
  );
  const bonusThresholdCents = clampInteger(
    customSource.bonusThresholdCents,
    minimumAmountCents,
    10_000_000,
    Math.max(minimumAmountCents, DEFAULT_RECHARGE_CONFIG.custom.bonusThresholdCents)
  );
  const maximumSelfServiceAmountCents = clampInteger(
    customSource.maximumSelfServiceAmountCents,
    minimumAmountCents,
    10_000_000,
    Math.max(minimumAmountCents, DEFAULT_RECHARGE_CONFIG.custom.maximumSelfServiceAmountCents)
  );

  return {
    signupBonusCredits: clampInteger(source.signupBonusCredits, 0, 1_000_000, DEFAULT_RECHARGE_CONFIG.signupBonusCredits),
    creditsPerYuan,
    packs,
    custom: {
      enabled: customSource.enabled !== false,
      minimumAmountCents,
      bonusThresholdCents,
      bonusPercent: clampPercent(customSource.bonusPercent, DEFAULT_RECHARGE_CONFIG.custom.bonusPercent),
      maximumSelfServiceAmountCents,
      contactMessageZh: String(customSource.contactMessageZh || DEFAULT_RECHARGE_CONFIG.custom.contactMessageZh).trim().slice(0, 240),
      contactMessageEn: String(customSource.contactMessageEn || DEFAULT_RECHARGE_CONFIG.custom.contactMessageEn).trim().slice(0, 240)
    },
    updatedAt: source.updatedAt || null
  };
}

export function quoteCustomRecharge(amountCents, config = DEFAULT_RECHARGE_CONFIG) {
  const normalized = normalizeRechargeConfig(config);
  const cents = Math.max(0, Math.round(finiteNumber(amountCents, 0)));
  const belowMinimum = cents < normalized.custom.minimumAmountCents;
  const requiresContact = cents > normalized.custom.maximumSelfServiceAmountCents;
  const bonusPercent = cents >= normalized.custom.bonusThresholdCents
    ? normalized.custom.bonusPercent
    : 0;
  return {
    ...calculateRechargeCredits(cents, bonusPercent, normalized.creditsPerYuan),
    enabled: normalized.custom.enabled,
    valid: normalized.custom.enabled && !belowMinimum && !requiresContact,
    belowMinimum,
    requiresContact,
    minimumAmountCents: normalized.custom.minimumAmountCents,
    maximumSelfServiceAmountCents: normalized.custom.maximumSelfServiceAmountCents
  };
}
