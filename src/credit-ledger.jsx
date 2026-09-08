import React, { useEffect, useMemo, useState } from 'react';
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  Search,
  X
} from 'lucide-react';
import {
  CREDIT_LEDGER_CATEGORIES,
  CREDIT_LEDGER_CATEGORY_LABELS,
  CREDIT_LEDGER_DIRECTION_LABELS,
  CREDIT_LEDGER_PAGE_SIZES,
  creditLedgerPaginationItems,
  creditLedgerCategoryLabel
} from '../shared/credit-ledger.js';

const MODULE_LABELS = {
  ecommerce: { zh: '电商套图', en: 'Product image sets' },
  canvas: { zh: '无限画布', en: 'Infinite canvas' },
  'image-studio': { zh: '灵感生图', en: 'Image Studio' },
  video: { zh: '视频创作', en: 'Video' },
  voice: { zh: 'AI 语音', en: 'AI voice' },
  chat: { zh: '聊天精灵', en: 'AI chat' },
  'ai-tool': { zh: 'AI 工具', en: 'AI tool' },
  'asset-storage': { zh: '资产存储', en: 'Asset storage' },
  billing: { zh: '积分中心', en: 'Billing' },
  'group-account': { zh: '集团账户', en: 'Group account' },
  account: { zh: '账户', en: 'Account' }
};

const STATUS_LABELS = {
  reserved: { zh: '已预扣', en: 'Reserved' },
  queued: { zh: '排队中', en: 'Queued' },
  processing: { zh: '处理中', en: 'Processing' },
  succeeded: { zh: '已完成', en: 'Completed' },
  completed: { zh: '已完成', en: 'Completed' },
  settled: { zh: '已结算', en: 'Settled' },
  failed: { zh: '失败', en: 'Failed' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
  refunded: { zh: '已退款', en: 'Refunded' },
  released: { zh: '已返还', en: 'Released' },
  created: { zh: '待支付', en: 'Pending payment' },
  paid: { zh: '已支付', en: 'Paid' }
};

function localText(value, language) {
  return value?.[language] || value?.zh || value?.en || '';
}

function amountText(value) {
  const amount = Number(value || 0);
  return `${amount >= 0 ? '+' : ''}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

function numberText(value) {
  const amount = Number(value || 0);
  return Number.isInteger(amount) ? amount.toLocaleString() : amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function dateTime(value, language) {
  if (!value) return '-';
  return new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { hour12: false });
}

function dateBoundary(value, exclusiveEnd = false) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00+08:00`);
  if (exclusiveEnd) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function bytesText(value) {
  if (value == null) return '-';
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(3)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function LedgerDetails({ item, language, admin, onClose }) {
  const zh = language === 'zh';
  const detail = item.detail || {};
  const fields = [
    [zh ? '账单编号' : 'Ledger ID', item.id],
    [zh ? '业务单号' : 'Reference ID', item.referenceId],
    [zh ? '产品模块' : 'Module', localText(MODULE_LABELS[item.module], language)],
    [zh ? '账单类型' : 'Type', creditLedgerCategoryLabel(item.category, language)],
    [zh ? '业务来源' : 'Source', admin ? item.source : ''],
    [zh ? '状态' : 'Status', localText(STATUS_LABELS[item.taskStatus], language) || item.taskStatus],
    [zh ? '扣费主体' : 'Payer', item.billingScope === 'group' ? item.payerName : (zh ? '个人账户' : 'Personal account')],
    [zh ? '请求用户' : 'Requested by', admin ? item.requesterEmail : ''],
    [zh ? '模型' : 'Model', detail.model],
    [zh ? '渠道' : 'Provider', detail.providerName || detail.providerId],
    [zh ? '尺寸' : 'Size', detail.size],
    [zh ? '质量' : 'Quality', detail.quality],
    [zh ? '图片数量' : 'Images', detail.imageCount],
    [zh ? '参考图数量' : 'References', detail.referenceCount],
    [zh ? '视频时长' : 'Video duration', detail.seconds ? `${detail.seconds} s` : ''],
    [zh ? '语音音色' : 'Voice', detail.voice],
    [zh ? '语音语言' : 'Voice language', detail.language],
    [zh ? '音频时长' : 'Audio duration', detail.audioDurationSeconds ? `${detail.audioDurationSeconds} s` : ''],
    [zh ? '输入 Token' : 'Input tokens', detail.inputTokens],
    [zh ? '输出 Token' : 'Output tokens', detail.outputTokens],
    [zh ? '计费月份' : 'Billing month', detail.billingMonth],
    [zh ? '容量采集日' : 'Usage date', detail.usageDate],
    [zh ? '上次计费峰值' : 'Previous billed peak', detail.previousBilledBytes == null ? '' : bytesText(detail.previousBilledBytes)],
    [zh ? '本次计费峰值' : 'Billed peak', detail.billedPeakBytes == null ? '' : bytesText(detail.billedPeakBytes)],
    [zh ? '新增计费容量' : 'Incremental storage', detail.incrementalBytes == null ? '' : bytesText(detail.incrementalBytes)],
    [zh ? '存储单价' : 'Storage price', detail.unitPriceCentsPerGb == null ? '' : `¥${(detail.unitPriceCentsPerGb / 100).toFixed(2)} / GB`],
    [zh ? '支付金额' : 'Payment amount', detail.amountCents == null ? '' : `¥${(detail.amountCents / 100).toFixed(2)} ${detail.currency || ''}`],
    [zh ? '项目编号' : 'Project ID', detail.projectId],
    [zh ? '图片槽位' : 'Slot', detail.slotId],
    [zh ? '促销' : 'Promotion', detail.promotionName],
    [zh ? '调整原因' : 'Reason', detail.reasonCode],
    [zh ? '说明' : 'Details', admin ? detail.details : ''],
    [zh ? '失败原因' : 'Failure reason', detail.errorCode]
  ].filter(([, value]) => value !== '' && value != null);
  return <div className="creditLedgerDetailBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="creditLedgerDetail" role="dialog" aria-modal="true" aria-labelledby="credit-ledger-detail-title">
      <header><div><span>{zh ? '积分账单详情' : 'Credit ledger details'}</span><h3 id="credit-ledger-detail-title">{creditLedgerCategoryLabel(item.category, language)}</h3></div><button type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'}><X size={18} /></button></header>
      <div className="creditLedgerDetailHero">
        <div><span>{zh ? '积分变化' : 'Credit change'}</span><strong className={item.amount >= 0 ? 'positive' : 'negative'}>{amountText(item.amount)}</strong></div>
        <div><span>{zh ? '变动前' : 'Before'}</span><strong>{item.balanceBefore == null ? (zh ? '集团账户' : 'Group account') : numberText(item.balanceBefore)}</strong></div>
        <div><span>{zh ? '变动后' : 'After'}</span><strong>{item.balanceAfter == null ? (zh ? '集团账户' : 'Group account') : numberText(item.balanceAfter)}</strong></div>
      </div>
      <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl>
      {detail.prompt ? <section className="creditLedgerPrompt"><span>{zh ? '已记录的完整提示词' : 'Recorded full prompt'}</span><pre>{detail.prompt}</pre></section> : null}
      <footer><span>{dateTime(item.createdAt, language)}</span><button type="button" onClick={onClose}>{zh ? '关闭' : 'Close'}</button></footer>
    </section>
  </div>;
}

export default function CreditLedgerPanel({ language = 'zh', mode = 'user', refreshToken = '' }) {
  const zh = language === 'zh';
  const admin = mode === 'admin';
  const initialFilters = useMemo(() => ({ search: '', category: 'all', direction: 'all', start: '', end: '' }), []);
  const [filters, setFilters] = useState(initialFilters);
  const [query, setQuery] = useState(initialFilters);
  const [pageSize, setPageSize] = useState(10);
  const [ledger, setLedger] = useState({ items: [], pagination: { page: 1, pageSize: 10, total: 0, pages: 1 }, summary: {} });
  const [status, setStatus] = useState('loading');
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState(null);

  async function load(page = 1, activeQuery = query, activePageSize = pageSize) {
    setStatus('loading');
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(activePageSize),
      category: activeQuery.category,
      direction: activeQuery.direction
    });
    if (admin && activeQuery.search.trim()) params.set('search', activeQuery.search.trim());
    if (activeQuery.start) params.set('startAt', dateBoundary(activeQuery.start));
    if (activeQuery.end) params.set('endAt', dateBoundary(activeQuery.end, true));
    try {
      const response = await fetch(`${admin ? '/api/admin/credit-ledger' : '/api/billing/history'}?${params}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CREDIT_LEDGER_FAILED');
      setLedger(admin ? payload.ledger : payload.ledger);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => { void load(1, query, pageSize); }, [query, refreshToken, pageSize]);

  function submit(event) {
    event.preventDefault();
    setQuery({ ...filters });
  }

  function reset() {
    setFilters(initialFilters);
    setQuery(initialFilters);
  }

  async function exportCsv() {
    if (!admin || exporting) return;
    setExporting(true);
    try {
      const rows = [];
      let exportPage = 1;
      let pages = 1;
      do {
        const params = new URLSearchParams({ page: String(exportPage), pageSize: '100', category: query.category, direction: query.direction });
        if (query.search.trim()) params.set('search', query.search.trim());
        if (query.start) params.set('startAt', dateBoundary(query.start));
        if (query.end) params.set('endAt', dateBoundary(query.end, true));
        const response = await fetch(`/api/admin/credit-ledger?${params}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'CREDIT_LEDGER_EXPORT_FAILED');
        rows.push(...(payload.ledger?.items || []));
        pages = Math.min(Number(payload.ledger?.pagination?.pages || 1), 100);
        exportPage += 1;
      } while (exportPage <= pages);
      const columns = [
        ['time', (item) => item.createdAt], ['user_email', (item) => item.userEmail],
        ['user_name', (item) => item.userName], ['admin_note', (item) => item.userAdminNote],
        ['category', (item) => creditLedgerCategoryLabel(item.category, language)],
        ['module', (item) => localText(MODULE_LABELS[item.module], language)],
        ['source', (item) => item.source], ['amount', (item) => item.amount],
        ['balance_before', (item) => item.balanceBefore], ['balance_after', (item) => item.balanceAfter],
        ['billing_scope', (item) => item.billingScope], ['payer', (item) => item.payerName],
        ['status', (item) => localText(STATUS_LABELS[item.taskStatus], language) || item.taskStatus],
        ['reference_id', (item) => item.referenceId], ['model', (item) => item.detail?.model],
        ['provider', (item) => item.detail?.providerName || item.detail?.providerId],
        ['size', (item) => item.detail?.size], ['quality', (item) => item.detail?.quality],
        ['image_count', (item) => item.detail?.imageCount], ['reference_count', (item) => item.detail?.referenceCount],
        ['video_seconds', (item) => item.detail?.seconds], ['voice', (item) => item.detail?.voice],
        ['audio_seconds', (item) => item.detail?.audioDurationSeconds], ['input_tokens', (item) => item.detail?.inputTokens],
        ['output_tokens', (item) => item.detail?.outputTokens], ['project_id', (item) => item.detail?.projectId],
        ['slot_id', (item) => item.detail?.slotId], ['error_code', (item) => item.detail?.errorCode]
      ];
      const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const csv = `\uFEFF${[columns.map(([name]) => name), ...rows.map((item) => columns.map(([, read]) => read(item)))].map((row) => row.map(quote).join(',')).join('\r\n')}`;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `pic365-credit-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const summary = ledger.summary || {};
  const currentPage = Math.max(1, Number(ledger.pagination?.page || 1));
  const totalPages = Math.max(1, Number(ledger.pagination?.pages || 1));
  const paginationItems = creditLedgerPaginationItems(currentPage, totalPages);
  const summaryItems = [
    [zh ? '收入积分' : 'Income', summary.income || 0, 'positive'],
    [zh ? '支出积分' : 'Expense', summary.expense || 0, 'negative'],
    [zh ? '退款积分' : 'Refunds', summary.refunds || 0, 'refund'],
    [zh ? '净变化' : 'Net change', summary.net || 0, Number(summary.net || 0) >= 0 ? 'positive' : 'negative'],
    [admin ? (zh ? '全平台当前余额' : 'Current platform balance') : (zh ? '当前余额' : 'Current balance'), summary.currentBalanceTotal || 0, 'balance']
  ];

  return <section className={`creditLedgerPanel ${admin ? 'adminCreditLedger' : 'userCreditLedger'}`}>
    <div className="creditLedgerHeading">
      <div><h3>{admin ? <ReceiptText size={18} /> : <Coins size={18} />}{admin ? (zh ? '全平台积分账单' : 'Platform credit ledger') : (zh ? '积分明细' : 'Credit history')}</h3><p>{admin ? (zh ? '所有积分变动均来自不可修改的正式台账，可按用户、业务与时间追溯。' : 'Every change comes from the immutable ledger and can be traced by user, business and time.') : (zh ? '查看每一笔收入、消耗、退款及最终余额。' : 'Review every income, charge, refund and resulting balance.')}</p></div>
      <div className="creditLedgerHeadingActions">{admin ? <button className="creditLedgerRefresh" type="button" onClick={exportCsv} disabled={exporting || status === 'loading'}>{exporting ? <LoaderCircle className="spinIcon" size={15} /> : <Download size={15} />}{zh ? '导出 CSV' : 'Export CSV'}</button> : null}<button className="creditLedgerRefresh" type="button" onClick={() => load(ledger.pagination?.page || 1)} disabled={status === 'loading'}>{status === 'loading' ? <LoaderCircle className="spinIcon" size={15} /> : <RefreshCw size={15} />}{zh ? '刷新' : 'Refresh'}</button></div>
    </div>
    <div className="creditLedgerSummary">{summaryItems.map(([label, value, tone]) => <div className={tone} key={label}><span>{label}</span><strong>{numberText(value)}</strong></div>)}</div>
    <form className="creditLedgerFilters" onSubmit={submit}>
      {admin ? <label className="search"><span>{zh ? '用户或单号' : 'User or reference'}</span><div><Search size={15} /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder={zh ? '邮箱、用户名、备注名、任务单号' : 'Email, name, note or reference'} /></div></label> : null}
      <label><span>{zh ? '账单类型' : 'Type'}</span><select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>{CREDIT_LEDGER_CATEGORIES.map((item) => <option value={item} key={item}>{localText(CREDIT_LEDGER_CATEGORY_LABELS[item], language)}</option>)}</select></label>
      <label><span>{zh ? '收支方向' : 'Direction'}</span><select value={filters.direction} onChange={(event) => setFilters((current) => ({ ...current, direction: event.target.value }))}>{Object.entries(CREDIT_LEDGER_DIRECTION_LABELS).map(([value, labels]) => <option value={value} key={value}>{localText(labels, language)}</option>)}</select></label>
      <label><span>{zh ? '开始日期' : 'Start date'}</span><input type="date" value={filters.start} onChange={(event) => setFilters((current) => ({ ...current, start: event.target.value }))} /></label>
      <label><span>{zh ? '结束日期' : 'End date'}</span><input type="date" value={filters.end} onChange={(event) => setFilters((current) => ({ ...current, end: event.target.value }))} /></label>
      <div className="actions"><button type="button" onClick={reset}>{zh ? '重置' : 'Reset'}</button><button className="primary" type="submit">{zh ? '查询' : 'Search'}</button></div>
    </form>
    {status === 'error' ? <p className="creditLedgerState error">{zh ? '积分账单加载失败。' : 'Failed to load credit ledger.'}</p> : status === 'loading' && !ledger.items.length ? <div className="creditLedgerState"><LoaderCircle className="spinIcon" size={18} />{zh ? '正在加载账单…' : 'Loading ledger…'}</div> : <>
      <div className="creditLedgerTableWrap"><table className="creditLedgerTable"><thead><tr><th>{zh ? '时间' : 'Time'}</th>{admin ? <th>{zh ? '用户' : 'User'}</th> : null}<th>{zh ? '类型 / 来源' : 'Type / source'}</th><th>{zh ? '业务' : 'Business'}</th><th>{zh ? '积分变化' : 'Change'}</th><th>{zh ? '变动后' : 'After'}</th><th>{zh ? '状态' : 'Status'}</th><th>{zh ? '详情' : 'Details'}</th></tr></thead><tbody>{ledger.items?.length ? ledger.items.map((item) => <tr key={item.id}><td data-label={zh ? '时间' : 'Time'}>{dateTime(item.createdAt, language)}</td>{admin ? <td data-label={zh ? '用户' : 'User'}><strong>{item.userName || item.userEmail}</strong><small>{item.userAdminNote || item.userEmail}</small></td> : null}<td data-label={zh ? '类型' : 'Type'}><strong>{creditLedgerCategoryLabel(item.category, language)}{item.category === 'ai_voice' ? <AudioLines size={13} /> : null}</strong><small>{admin ? (item.source || '-') : localText(MODULE_LABELS[item.module], language)}</small></td><td data-label={zh ? '业务' : 'Business'}><strong>{localText(MODULE_LABELS[item.module], language)}</strong><small>{item.detail?.model || item.referenceId || '-'}</small></td><td data-label={zh ? '积分变化' : 'Change'}><b className={item.amount >= 0 ? 'positive' : 'negative'}>{amountText(item.amount)}</b></td><td data-label={zh ? '变动后' : 'After'}>{item.balanceAfter == null ? (zh ? '集团账户' : 'Group') : numberText(item.balanceAfter)}</td><td data-label={zh ? '状态' : 'Status'}><i className={`status is-${item.taskStatus}`}>{localText(STATUS_LABELS[item.taskStatus], language) || item.taskStatus}</i></td><td data-label={zh ? '详情' : 'Details'}><button className="detail" type="button" onClick={() => setSelected(item)}>{zh ? '查看' : 'View'}</button></td></tr>) : <tr><td colSpan={admin ? 8 : 7}>{zh ? '当前筛选条件下没有积分记录。' : 'No ledger entries match these filters.'}</td></tr>}</tbody></table></div>
      <footer className="creditLedgerPagination">
        <span>{zh ? `总页数：${totalPages} · 共 ${ledger.pagination?.total || 0} 条` : `${totalPages} pages · ${ledger.pagination?.total || 0} entries`}</span>
        <nav aria-label={zh ? '积分账单分页' : 'Credit ledger pagination'}>
          <button type="button" aria-label={zh ? '上一页' : 'Previous page'} disabled={currentPage <= 1 || status === 'loading'} onClick={() => load(currentPage - 1)}><ChevronLeft size={15} /></button>
          <div className="creditLedgerPageNumbers">{paginationItems.map((item) => typeof item === 'number'
            ? <button className={item === currentPage ? 'active' : ''} type="button" aria-current={item === currentPage ? 'page' : undefined} onClick={() => load(item)} disabled={status === 'loading'} key={item}>{item}</button>
            : <label className="creditLedgerPageJump" key={item}><span aria-hidden="true">…</span><select value="" aria-label={zh ? '快速定位页码' : 'Jump to page'} onChange={(event) => { const page = Number(event.target.value); if (page) void load(page); }}><option value="" disabled>…</option>{Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => <option value={page} key={page}>{page}</option>)}</select></label>)}</div>
          <button type="button" aria-label={zh ? '下一页' : 'Next page'} disabled={currentPage >= totalPages || status === 'loading'} onClick={() => load(currentPage + 1)}><ChevronRight size={15} /></button>
        </nav>
        <label className="creditLedgerPageSize"><span>{zh ? '每页条数：' : 'Rows per page:'}</span><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{CREDIT_LEDGER_PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
      </footer>
    </>}
    {selected ? <LedgerDetails item={selected} language={language} admin={admin} onClose={() => setSelected(null)} /> : null}
  </section>;
}
