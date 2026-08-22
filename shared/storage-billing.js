export const STORAGE_BILLING_TIME_ZONE = 'Asia/Shanghai';
export const STORAGE_BILLING_BYTES_PER_GB = 1024 ** 3;
export const STORAGE_BILLING_CREDITS_PER_YUAN = 100;

export const DEFAULT_STORAGE_BILLING_CONFIG = Object.freeze({
  enabled: true,
  unitPriceCentsPerGb: 300,
  timeZone: STORAGE_BILLING_TIME_ZONE,
  runHour: 0,
  runMinute: 0,
  updatedAt: null
});

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeStorageBillingConfig(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    enabled: source.enabled !== false,
    unitPriceCentsPerGb: Math.max(1, Math.min(1_000_000, Math.round(
      finiteNumber(source.unitPriceCentsPerGb, DEFAULT_STORAGE_BILLING_CONFIG.unitPriceCentsPerGb)
    ))),
    timeZone: STORAGE_BILLING_TIME_ZONE,
    runHour: 0,
    runMinute: 0,
    updatedAt: source.updatedAt || null
  };
}

export function storageCreditsForBytes(bytes, unitPriceCentsPerGb = DEFAULT_STORAGE_BILLING_CONFIG.unitPriceCentsPerGb) {
  const normalizedBytes = Math.max(0, Math.floor(finiteNumber(bytes, 0)));
  const normalizedPrice = Math.max(1, Math.round(finiteNumber(unitPriceCentsPerGb, 300)));
  return Math.floor((normalizedBytes * normalizedPrice) / STORAGE_BILLING_BYTES_PER_GB);
}

export function storageBillingDateParts(value = new Date(), timeZone = STORAGE_BILLING_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date,
    month: `${parts.year}-${parts.month}`,
    year: Number(parts.year),
    monthNumber: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

export function storageBillingRunPhase(runDate) {
  const match = String(runDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'daily';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day === 1) return 'month_start';
  if (day === 15) return 'month_mid';
  if (day === lastDay) return 'month_end';
  return 'daily';
}

export function formatStoragePriceYuan(unitPriceCentsPerGb) {
  return (Math.max(0, Number(unitPriceCentsPerGb) || 0) / 100).toFixed(2);
}
