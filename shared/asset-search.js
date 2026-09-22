export const ASSET_DATE_MODES = ['all', 'year', 'month', 'day', 'range'];
export const ASSET_SORTS = ['recent', 'oldest', 'name', 'largest'];
export const ASSET_TIME_ZONE = 'Asia/Shanghai';
const DAY_MS = 86400000;
const OFFSET_MS = 8 * 3600000;

export function normalizeAssetTags(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [values])
    .flatMap(value => String(value || '').split(/[,，;；\n\r]+/))
    .map(value => value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40))
    .filter(value => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
}

export function assetCalendarDate(value = new Date()) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10) : '';
}

function invalidDate() {
  return Object.assign(new Error('INVALID_ASSET_DATE_FILTER'), { code: 'INVALID_ASSET_DATE_FILTER' });
}

function dayStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000 || Number(value.slice(0, 4)) > 9998) throw invalidDate();
  const millis = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(millis) || assetCalendarDate(millis) !== value) throw invalidDate();
  return millis;
}

// Calendar periods use inclusive local dates and an exclusive UTC upper bound.
export function getAssetDateRange({ dateMode = 'all', dateValue = '', dateFrom = '', dateTo = '' } = {}) {
  if (!ASSET_DATE_MODES.includes(dateMode)) throw invalidDate();
  if (dateMode === 'all') return { start: '', end: '' };
  let start;
  let end;
  if (dateMode === 'year') {
    if (!/^\d{4}$/.test(dateValue)) throw invalidDate();
    start = dayStart(`${dateValue}-01-01`);
    end = Date.parse(`${Number(dateValue) + 1}-01-01T00:00:00+08:00`);
  } else if (dateMode === 'month') {
    if (!/^\d{4}-\d{2}$/.test(dateValue)) throw invalidDate();
    start = dayStart(`${dateValue}-01`);
    const nextMonth = new Date(start + OFFSET_MS);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    end = nextMonth.getTime() - OFFSET_MS;
  } else if (dateMode === 'day') {
    start = dayStart(dateValue);
    end = start + DAY_MS;
  } else {
    start = dayStart(dateFrom);
    end = dayStart(dateTo) + DAY_MS;
    if (end <= start) throw invalidDate();
  }
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

export function defaultAssetDateFilter(mode, current = {}) {
  const today = assetCalendarDate();
  let anchor = current.dateValue || current.dateFrom || today;
  if (current.dateMode) {
    try { getAssetDateRange(current); } catch { anchor = today; }
  }
  const year = anchor.slice(0, 4);
  const month = anchor.length >= 7 ? anchor.slice(0, 7) : `${year}-01`;
  const day = anchor.length >= 10 ? anchor.slice(0, 10) : `${month}-01`;
  return {
    dateMode: mode,
    dateValue: mode === 'year' ? year : mode === 'month' ? month : mode === 'day' ? day : '',
    dateFrom: mode === 'range' ? day : '',
    dateTo: mode === 'range' ? day : ''
  };
}
