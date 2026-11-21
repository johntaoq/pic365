export const DEFAULT_ASSET_RETENTION_DAYS = 30;
export const MAX_ASSET_RETENTION_DAYS = 36_500;
export const ASSET_RETENTION_TIME_ZONE = 'Asia/Shanghai';
export const ASSET_RETENTION_RUN_HOUR = 2;

export function normalizeAssetRetentionDays(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return DEFAULT_ASSET_RETENTION_DAYS;
  if (!['number', 'string'].includes(typeof value)) throw new Error('INVALID_ASSET_RETENTION_DAYS');
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_ASSET_RETENTION_DAYS) {
    throw new Error('INVALID_ASSET_RETENTION_DAYS');
  }
  return days;
}

export function assetRetentionCutoff(days, value = new Date()) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error('INVALID_ASSET_RETENTION_DATE');
  return new Date(time - normalizeAssetRetentionDays(days) * 86_400_000).toISOString();
}

export function assetRetentionDateParts(value = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: ASSET_RETENTION_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function assetRetentionNightWindow(value = new Date()) {
  const parts = assetRetentionDateParts(value);
  return parts.hour >= ASSET_RETENTION_RUN_HOUR && parts.hour < 6 ? parts.date : '';
}
