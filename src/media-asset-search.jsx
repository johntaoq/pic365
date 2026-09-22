import { useEffect, useState } from 'react';
import { CalendarDays, Check, Search, Tags, X } from 'lucide-react';
import { ASSET_DATE_MODES, ASSET_SORTS, defaultAssetDateFilter, getAssetDateRange, normalizeAssetTags } from '../shared/asset-search.js';
import './media-asset-search.css';

const labels = {
  zh: {
    keyword: '搜索名称、分类、标签', clearKeyword: '清除关键词', search: '搜索',
    tag: '标签', allTags: '全部标签', source: '来源', allSources: '全部来源', upload: '本地上传', generated: 'AI 生成结果',
    sort: '排序', recent: '最新入库', oldest: '最早入库', name: '名称 A–Z', largest: '文件从大到小',
    time: '入库时间', timezone: '北京时间', all: '全部时间', year: '年度', month: '月份', day: '日期', range: '区间',
    dateValue: '选择时间', dateFrom: '开始日期', dateTo: '结束日期', applyDate: '应用日期',
    invalidDate: '请选择有效日期，结束日期不能早于开始日期。',
    addTag: '新增标签', removeTag: '移除标签', limit: '最多 20 个标签', emptyTags: '暂无标签'
  },
  en: {
    keyword: 'Search names, categories, tags', clearKeyword: 'Clear keyword', search: 'Search',
    tag: 'Tag', allTags: 'All tags', source: 'Source', allSources: 'All sources', upload: 'Local upload', generated: 'AI result',
    sort: 'Sort', recent: 'Newest first', oldest: 'Oldest first', name: 'Name A–Z', largest: 'Largest first',
    time: 'Added', timezone: 'UTC+8', all: 'Any time', year: 'Year', month: 'Month', day: 'Day', range: 'Range',
    dateValue: 'Select period', dateFrom: 'Start date', dateTo: 'End date', applyDate: 'Apply dates',
    invalidDate: 'Select valid dates. The end cannot be before the start.',
    addTag: 'Add tag', removeTag: 'Remove tag', limit: 'Up to 20 tags', emptyTags: 'No tags'
  }
};

export function AssetTagEditor({ value, onChange, language = 'zh', disabled = false }) {
  const t = labels[language] || labels.en;
  const [input, setInput] = useState('');
  const tags = normalizeAssetTags(value);
  function commit(text = input) {
    if (!text.trim() || disabled) return;
    onChange(normalizeAssetTags([...tags, text]));
    setInput('');
  }
  return <div className="assetTagEditor">
    <div className="assetTagTokens">
      {tags.map(tag => <span className="assetTagToken" key={tag}><Tags size={12} /><span title={tag}>{tag}</span><button type="button" disabled={disabled} onClick={() => onChange(tags.filter(item => item !== tag))} aria-label={`${t.removeTag}: ${tag}`}><X size={12} /></button></span>)}
      {!tags.length ? <span className="assetTagEmpty">{t.emptyTags}</span> : null}
    </div>
    <input aria-label={t.addTag} placeholder={tags.length >= 20 ? t.limit : t.addTag} maxLength={840} value={input} disabled={disabled || tags.length >= 20}
      onChange={event => setInput(event.target.value)}
      onBlur={() => commit()}
      onKeyDown={event => {
        if (!event.nativeEvent.isComposing && ['Enter', ',', '，', ';', '；'].includes(event.key)) {
          event.preventDefault();
          commit();
        }
      }}
      onPaste={event => {
        const text = event.clipboardData.getData('text');
        if (/[,，;；\r\n]/.test(text)) {
          event.preventDefault();
          commit(input + text);
        }
      }} />
  </div>;
}

export default function MediaAssetSearch({
  language, query, onQuery, onSearch, onComposition, tag, tagOptions, onTag,
  source, onSource, sort, onSort, dateFilter, onDate
}) {
  const t = labels[language] || labels.en;
  const [draft, setDraft] = useState(dateFilter);
  useEffect(() => { setDraft(dateFilter); }, [dateFilter]);
  let validDate = true;
  try { getAssetDateRange(draft); } catch { validDate = false; }
  const dirtyDate = JSON.stringify(draft) !== JSON.stringify(dateFilter);
  const availableTags = tagOptions.map(item => item.tag.toLowerCase() === tag.toLowerCase() ? { ...item, tag } : item);
  const options = tag && !availableTags.some(item => item.tag === tag)
    ? [{ tag, assetCount: 0 }, ...availableTags] : availableTags;

  function changeMode(mode) {
    const next = defaultAssetDateFilter(mode, draft);
    setDraft(next);
    onDate(next);
  }
  return <section className="assetExplorerSearch" aria-label={t.search}>
    <form className="assetExplorerKeyword" onSubmit={event => { event.preventDefault(); onSearch(); }}>
      <Search size={18} />
      <input aria-label={t.keyword} placeholder={t.keyword} value={query} maxLength={200}
        onChange={event => onQuery(event.target.value)}
        onCompositionStart={() => onComposition(true)} onCompositionEnd={() => onComposition(false)} />
      {query ? <button type="button" className="assetExplorerIcon" aria-label={t.clearKeyword} title={t.clearKeyword} onClick={() => onQuery('')}><X size={16} /></button> : null}
      <button className="assetExplorerSubmit" type="submit" title={t.search} aria-label={t.search}><Search size={17} /></button>
    </form>
    <div className="assetExplorerFilters">
      <label><span><Tags size={14} />{t.tag}</span><select aria-label={t.tag} value={tag} onChange={event => onTag(event.target.value)}><option value="">{t.allTags}</option>{options.map(item => <option value={item.tag} key={item.tag}>{item.tag} ({item.assetCount})</option>)}</select></label>
      <label><span>{t.source}</span><select aria-label={t.source} value={source} onChange={event => onSource(event.target.value)}><option value="">{t.allSources}</option><option value="upload">{t.upload}</option><option value="generated">{t.generated}</option></select></label>
      <label><span>{t.sort}</span><select aria-label={t.sort} value={sort} onChange={event => onSort(event.target.value)}>{ASSET_SORTS.map(value => <option value={value} key={value}>{t[value]}</option>)}</select></label>
    </div>
    <div className="assetExplorerDate">
      <span className="assetExplorerDateLabel" title={t.timezone}><CalendarDays size={15} />{t.time}<small>{t.timezone}</small></span>
      <div className="assetExplorerDateModes" role="group" aria-label={t.time}>{ASSET_DATE_MODES.map(mode => <button type="button" aria-pressed={draft.dateMode === mode} onClick={() => changeMode(mode)} key={mode}>{t[mode]}</button>)}</div>
      {draft.dateMode !== 'all' ? <form className="assetExplorerDateFields" onSubmit={event => { event.preventDefault(); if (validDate) onDate(draft); }}>
        {draft.dateMode === 'range' ? <>
          <input type="date" aria-label={t.dateFrom} value={draft.dateFrom} min="1000-01-01" max="9998-12-31" onInput={event => setDraft({ ...draft, dateFrom: event.currentTarget.value })} />
          <span aria-hidden="true">–</span>
          <input type="date" aria-label={t.dateTo} value={draft.dateTo} min={draft.dateFrom || '1000-01-01'} max="9998-12-31" onInput={event => setDraft({ ...draft, dateTo: event.currentTarget.value })} />
        </> : <input type={draft.dateMode === 'year' ? 'number' : draft.dateMode === 'month' ? 'month' : 'date'} aria-label={t.dateValue}
          min={draft.dateMode === 'year' ? '1000' : draft.dateMode === 'month' ? '1000-01' : '1000-01-01'}
          max={draft.dateMode === 'year' ? '9998' : draft.dateMode === 'month' ? '9998-12' : '9998-12-31'}
          value={draft.dateValue} onInput={event => setDraft({ ...draft, dateValue: event.currentTarget.value })} />}
        <button type="submit" disabled={!validDate || !dirtyDate} title={t.applyDate} aria-label={t.applyDate}><Check size={16} /></button>
        {!validDate ? <small className="assetExplorerDateError" role="status">{t.invalidDate}</small> : null}
      </form> : null}
    </div>
  </section>;
}
