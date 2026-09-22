import assert from 'node:assert/strict';
import test from 'node:test';
import { assetCalendarDate, defaultAssetDateFilter, getAssetDateRange, normalizeAssetTags } from '../shared/asset-search.js';

test('tags support Chinese punctuation, paste, phrases, deduplication and limits', () => {
  assert.deepEqual(normalizeAssetTags('春季，产品; Hero\nhero； red dress, '), ['春季', '产品', 'Hero', 'red dress']);
  assert.deepEqual(normalizeAssetTags(['A,B', ' a ', 'C\r\nD']), ['A', 'B', 'C', 'D']);
  assert.equal(normalizeAssetTags(Array.from({ length: 30 }, (_, i) => `tag-${i}`)).length, 20);
  assert.equal(normalizeAssetTags('a'.repeat(50))[0].length, 40);
  assert.deepEqual(normalizeAssetTags(null), []);
});

test('asset calendar uses Beijing boundaries independent of machine timezone', () => {
  assert.equal(assetCalendarDate('2026-09-21T16:00:00.000Z'), '2026-09-22');
  assert.equal(assetCalendarDate('2026-09-21T15:59:59.999Z'), '2026-09-21');
  assert.equal(assetCalendarDate('not-a-date'), '');
  assert.deepEqual(getAssetDateRange({ dateMode: 'day', dateValue: '2026-09-22' }), {
    start: '2026-09-21T16:00:00.000Z', end: '2026-09-22T16:00:00.000Z'
  });
});

test('annual, monthly, leap-day and inclusive date range boundaries are exact', () => {
  assert.deepEqual(getAssetDateRange({ dateMode: 'year', dateValue: '2026' }), {
    start: '2025-12-31T16:00:00.000Z', end: '2026-12-31T16:00:00.000Z'
  });
  assert.deepEqual(getAssetDateRange({ dateMode: 'month', dateValue: '2024-02' }), {
    start: '2024-01-31T16:00:00.000Z', end: '2024-02-29T16:00:00.000Z'
  });
  assert.deepEqual(getAssetDateRange({ dateMode: 'month', dateValue: '2026-12' }), {
    start: '2026-11-30T16:00:00.000Z', end: '2026-12-31T16:00:00.000Z'
  });
  assert.deepEqual(getAssetDateRange({ dateMode: 'range', dateFrom: '2024-02-29', dateTo: '2024-03-01' }), {
    start: '2024-02-28T16:00:00.000Z', end: '2024-03-01T16:00:00.000Z'
  });
  assert.deepEqual(getAssetDateRange({ dateMode: 'range', dateFrom: '2026-09-22', dateTo: '2026-09-22' }), getAssetDateRange({ dateMode: 'day', dateValue: '2026-09-22' }));
});

test('invalid and incomplete date filters are rejected rather than widened', () => {
  for (const options of [
    { dateMode: 'century' }, { dateMode: 'year', dateValue: '26' },
    { dateMode: 'year', dateValue: '0000' }, { dateMode: 'month', dateValue: '2026-13' },
    { dateMode: 'day', dateValue: '2026-02-29' }, { dateMode: 'day', dateValue: '2026-04-31' },
    { dateMode: 'day', dateValue: '' }, { dateMode: 'range', dateFrom: '2026-01-01', dateTo: '' },
    { dateMode: 'range', dateFrom: '2026-01-02', dateTo: '2026-01-01' }
  ]) assert.throws(() => getAssetDateRange(options), { code: 'INVALID_ASSET_DATE_FILTER' });
  assert.deepEqual(getAssetDateRange(), { start: '', end: '' });
});

test('switching calendar dimensions retains the selected period', () => {
  assert.equal(defaultAssetDateFilter('year', { dateValue: '2024-02-29' }).dateValue, '2024');
  assert.equal(defaultAssetDateFilter('month', { dateValue: '2024' }).dateValue, '2024-01');
  assert.equal(defaultAssetDateFilter('day', { dateValue: '2024-02' }).dateValue, '2024-02-01');
  assert.equal(defaultAssetDateFilter('month', { dateFrom: '2025-06-12' }).dateValue, '2025-06');
});
