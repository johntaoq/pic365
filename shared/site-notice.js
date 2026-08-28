export const SITE_NOTICE_FORMATS = Object.freeze(['markdown', 'html']);
export const SITE_NOTICE_PLACEMENTS = Object.freeze(['banner', 'modal']);
export const SITE_NOTICE_SNOOZE_STORAGE_KEY = 'pic365-site-notice-snooze';

export const SITE_NOTICE_EXAMPLES = Object.freeze({
  markdown: '**系统维护**  \n今晚 23:00 更新，生图功能不受影响。',
  html: '<p><strong>系统维护</strong></p>\n<p>今晚 23:00 更新，生图功能不受影响。</p>'
});

export function normalizeSiteNoticeFormat(value) {
  return SITE_NOTICE_FORMATS.includes(value) ? value : 'markdown';
}

export function inferSiteNoticeFormat(body, configuredFormat = 'markdown') {
  if (normalizeSiteNoticeFormat(configuredFormat) === 'html') return 'html';
  const source = String(body || '').trim();
  return /<\/?(?:p|br|strong|b|em|i|u|s|del|ul|ol|li|blockquote|code|pre|h[1-4]|a|hr)(?:\s[^<>]*?)?\s*\/?>/i.test(source)
    ? 'html'
    : 'markdown';
}

export function normalizeSiteNoticePlacement(value) {
  return SITE_NOTICE_PLACEMENTS.includes(value) ? value : 'banner';
}

export function siteNoticeLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createSiteNoticeSnoozeValue(version, now = new Date()) {
  return JSON.stringify({
    date: siteNoticeLocalDateKey(now),
    version: String(version || '')
  });
}

export function isSiteNoticeSnoozedToday(value, version, now = new Date()) {
  if (!value || !version) return false;
  try {
    const parsed = JSON.parse(value);
    return parsed?.date === siteNoticeLocalDateKey(now)
      && parsed?.version === String(version);
  } catch {
    return false;
  }
}
