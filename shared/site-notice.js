export const SITE_NOTICE_FORMATS = Object.freeze(['markdown', 'html']);
export const SITE_NOTICE_PLACEMENTS = Object.freeze(['banner', 'modal']);

export const SITE_NOTICE_EXAMPLES = Object.freeze({
  markdown: '**系统维护**  \n今晚 23:00 更新，生图功能不受影响。',
  html: '<p><strong>系统维护</strong></p>\n<p>今晚 23:00 更新，生图功能不受影响。</p>'
});

export function normalizeSiteNoticeFormat(value) {
  return SITE_NOTICE_FORMATS.includes(value) ? value : 'markdown';
}

export function normalizeSiteNoticePlacement(value) {
  return SITE_NOTICE_PLACEMENTS.includes(value) ? value : 'banner';
}
