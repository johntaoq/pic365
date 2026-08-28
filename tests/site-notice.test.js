import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSiteNoticeSnoozeValue,
  inferSiteNoticeFormat,
  isSiteNoticeSnoozedToday,
  siteNoticeLocalDateKey
} from '../shared/site-notice.js';

test('site notice snooze applies only to the same local day and notice version', () => {
  const morning = new Date(2026, 7, 24, 8, 15);
  const evening = new Date(2026, 7, 24, 23, 30);
  const tomorrow = new Date(2026, 7, 25, 0, 1);
  const value = createSiteNoticeSnoozeValue('notice-v1', morning);

  assert.equal(siteNoticeLocalDateKey(morning), '2026-08-24');
  assert.equal(isSiteNoticeSnoozedToday(value, 'notice-v1', evening), true);
  assert.equal(isSiteNoticeSnoozedToday(value, 'notice-v2', evening), false);
  assert.equal(isSiteNoticeSnoozedToday(value, 'notice-v1', tomorrow), false);
});

test('site notice snooze ignores malformed or incomplete storage values', () => {
  const now = new Date(2026, 7, 24, 12, 0);
  assert.equal(isSiteNoticeSnoozedToday('', 'notice-v1', now), false);
  assert.equal(isSiteNoticeSnoozedToday('{bad json', 'notice-v1', now), false);
  assert.equal(isSiteNoticeSnoozedToday(JSON.stringify({ date: '2026-08-24' }), 'notice-v1', now), false);
});

test('site notices infer HTML when legacy configuration says markdown', () => {
  assert.equal(inferSiteNoticeFormat('<p><strong>系统维护</strong></p>', 'markdown'), 'html');
  assert.equal(inferSiteNoticeFormat('**系统维护**', 'markdown'), 'markdown');
  assert.equal(inferSiteNoticeFormat('普通文字', 'html'), 'html');
});
