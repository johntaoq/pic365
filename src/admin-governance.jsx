import React, { useEffect, useState } from 'react';
import {
  Check, Coins, Copy, FileSpreadsheet, KeyRound,
  LoaderCircle, RotateCcw, Settings, ShieldCheck, Ticket, Trash2, UserCog, X
} from 'lucide-react';
import { ADMIN_PERMISSIONS, ROLE_LABELS, USER_ROLES } from '../shared/admin-permissions.js';

function apiError(payload, fallback) {
  return payload?.error || fallback;
}

function roleLabel(role, language) {
  return ROLE_LABELS[role]?.[language] || role;
}

function formatMoney(cents, language = 'zh') {
  return new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency', currency: 'CNY'
  }).format(Number(cents || 0) / 100);
}

function permission(profile, value) {
  return profile?.adminPermissions?.includes(value) === true;
}

export function GlobalMenuSettingsPanel({ language = 'zh', onChanged }) {
  const zh = language === 'zh';
  const [settings, setSettings] = useState({ templates: true, cases: true, api: true });
  const [registrationPolicy, setRegistrationPolicy] = useState({ enabled: true, allowlist: [], denylist: [] });
  const [ecommercePrompt, setEcommercePrompt] = useState({ prompt: '', defaultPrompt: '', isDefault: true });
  const [status, setStatus] = useState('loading');
  const [registrationStatus, setRegistrationStatus] = useState('loading');
  const [ecommercePromptStatus, setEcommercePromptStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [ecommercePromptMessage, setEcommercePromptMessage] = useState('');

  async function load() {
    setStatus('loading');
    setRegistrationStatus('loading');
    setEcommercePromptStatus('loading');
    const [menuResponse, registrationResponse, ecommercePromptResponse] = await Promise.all([
      fetch('/api/admin/global-settings', { cache: 'no-store' }),
      fetch('/api/admin/registration-settings', { cache: 'no-store' }),
      fetch('/api/admin/ecommerce-system-prompt', { cache: 'no-store' })
    ]);
    const [menuPayload, registrationPayload, ecommercePromptPayload] = await Promise.all([
      menuResponse.json().catch(() => ({})),
      registrationResponse.json().catch(() => ({})),
      ecommercePromptResponse.json().catch(() => ({}))
    ]);
    if (!menuResponse.ok || !menuPayload.ok) {
      setStatus('error');
      setMessage(zh ? '全局设置加载失败。' : 'Global settings failed to load.');
    } else {
      setSettings(menuPayload.settings);
      setStatus('idle');
    }
    if (!registrationResponse.ok || !registrationPayload.ok) {
      setRegistrationStatus('error');
      setRegistrationMessage(zh ? '注册域名策略加载失败。' : 'Registration domain policy failed to load.');
    } else {
      setRegistrationPolicy(registrationPayload.settings);
      setRegistrationStatus('idle');
    }
    if (!ecommercePromptResponse.ok || !ecommercePromptPayload.ok) {
      setEcommercePromptStatus('error');
      setEcommercePromptMessage(zh ? '电商生图系统提示词加载失败。' : 'Ecommerce generation system prompt failed to load.');
    } else {
      setEcommercePrompt(ecommercePromptPayload.settings);
      setEcommercePromptStatus('idle');
    }
  }

  useEffect(() => { load(); }, []);

  async function save(event) {
    event.preventDefault();
    setStatus('loading');
    setMessage('');
    const response = await fetch('/api/admin/global-settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setStatus('error');
      setMessage(zh ? '全局设置保存失败。' : 'Global settings could not be saved.');
      return;
    }
    setSettings(payload.settings);
    setStatus('success');
    setMessage(zh ? '全局菜单设置已保存。' : 'Global menu settings saved.');
    onChanged?.();
  }

  async function saveRegistrationPolicy() {
    setRegistrationStatus('loading');
    setRegistrationMessage('');
    const response = await fetch('/api/admin/registration-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationPolicy)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setRegistrationStatus('error');
      setRegistrationMessage(zh ? '注册域名策略保存失败。' : 'Registration domain policy could not be saved.');
      return;
    }
    setRegistrationPolicy(payload.settings);
    setRegistrationStatus('success');
    setRegistrationMessage(zh ? '注册域名策略已保存。' : 'Registration domain policy saved.');
  }

  async function saveEcommercePrompt() {
    setEcommercePromptStatus('loading');
    setEcommercePromptMessage('');
    const response = await fetch('/api/admin/ecommerce-system-prompt', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: ecommercePrompt.prompt })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setEcommercePromptStatus('error');
      setEcommercePromptMessage(zh ? '电商生图系统提示词保存失败。' : 'Ecommerce generation system prompt could not be saved.');
      return;
    }
    setEcommercePrompt(payload.settings);
    setEcommercePromptStatus('success');
    setEcommercePromptMessage(zh ? '电商生图系统提示词已保存，后续任务将自动引用。' : 'Saved. Future ecommerce image tasks will use this prompt automatically.');
  }

  function updateDomainRules(key, value) {
    setRegistrationPolicy((current) => ({
      ...current,
      [key]: String(value || '')
    }));
  }

  function domainRulesText(value) {
    return Array.isArray(value) ? value.join('\n') : String(value || '');
  }

  return <form className="adminBlock governanceSettingsPanel" onSubmit={save}>
    <div className="adminSectionHeading"><div><h3><Settings size={18} />{zh ? '全局设置' : 'Global settings'}</h3><p>{zh ? '全局关闭后，所有用户都不能通过个人设置重新开启。' : 'Globally disabled menu items cannot be re-enabled by users.'}</p></div></div>
    <div className="governanceSwitchGrid">
      {[
        ['templates', zh ? '允许显示“模板”' : 'Allow Templates'],
        ['cases', zh ? '允许显示“范例”' : 'Allow Examples'],
        ['api', zh ? '允许显示“API”' : 'Allow API']
      ].map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>)}
    </div>
    <button className="adminProviderAction adminProviderSave" type="submit" disabled={status === 'loading'}>{status === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <Check size={16} />}{zh ? '保存全局设置' : 'Save global settings'}</button>
    {message ? <p className={`adminNotice ${status === 'error' ? 'error' : ''}`}>{message}</p> : null}
    <section className="ecommerceSystemPromptPolicy">
      <div className="adminSectionHeading">
        <div>
          <h3><ShieldCheck size={18} />{zh ? '电商生图系统提示词' : 'Ecommerce generation system prompt'}</h3>
          <p>{zh ? '服务端会在每一次电商首图、套图、精修和重试任务中自动注入；普通用户不可见。' : 'Automatically injected server-side into every ecommerce generation, refinement, and retry. Hidden from ordinary users.'}</p>
        </div>
      </div>
      <textarea
        rows="22"
        maxLength="30000"
        value={ecommercePrompt.prompt}
        onChange={(event) => setEcommercePrompt((current) => ({ ...current, prompt: event.target.value, isDefault: event.target.value === current.defaultPrompt }))}
        disabled={ecommercePromptStatus === 'loading'}
      />
      <div className="ecommerceSystemPromptActions">
        <button className="adminProviderAction" type="button" onClick={() => setEcommercePrompt((current) => ({ ...current, prompt: current.defaultPrompt, isDefault: true }))} disabled={ecommercePromptStatus === 'loading' || ecommercePrompt.isDefault}>
          <RotateCcw size={16} />{zh ? '恢复基础设置' : 'Restore default'}
        </button>
        <button className="adminProviderAction adminProviderSave" type="button" onClick={saveEcommercePrompt} disabled={ecommercePromptStatus === 'loading' || !ecommercePrompt.prompt.trim()}>
          {ecommercePromptStatus === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <Check size={16} />}{zh ? '保存系统提示词' : 'Save system prompt'}
        </button>
      </div>
      {ecommercePromptMessage ? <p className={`adminNotice ${ecommercePromptStatus === 'error' ? 'error' : ''}`}>{ecommercePromptMessage}</p> : null}
    </section>
    <section className="registrationDomainPolicy">
      <div className="adminSectionHeading">
        <div>
          <h3><ShieldCheck size={18} />{zh ? '注册邮箱域名策略' : 'Registration email domains'}</h3>
          <p>{zh ? '黑名单优先；白名单留空时允许其他域名，填写后只允许白名单。支持 *.example.com。' : 'The denylist wins. An empty allowlist permits other domains; a populated allowlist permits only matching domains. Wildcards such as *.example.com are supported.'}</p>
        </div>
      </div>
      <label className="registrationPolicyToggle">
        <input type="checkbox" checked={registrationPolicy.enabled !== false} onChange={(event) => setRegistrationPolicy((current) => ({ ...current, enabled: event.target.checked }))} />
        <span>{zh ? '启用域名白名单和黑名单校验' : 'Enable domain allowlist and denylist checks'}</span>
      </label>
      <div className="registrationDomainGrid">
        <label>
          <span>{zh ? '白名单' : 'Allowlist'}</span>
          <textarea rows="6" value={domainRulesText(registrationPolicy.allowlist)} onChange={(event) => updateDomainRules('allowlist', event.target.value)} placeholder={'example.com\n*.example.com'} />
        </label>
        <label>
          <span>{zh ? '黑名单' : 'Denylist'}</span>
          <textarea rows="6" value={domainRulesText(registrationPolicy.denylist)} onChange={(event) => updateDomainRules('denylist', event.target.value)} placeholder={'blocked.example\n*.blocked.example'} />
        </label>
      </div>
      <button className="adminProviderAction adminProviderSave" type="button" onClick={saveRegistrationPolicy} disabled={registrationStatus === 'loading'}>{registrationStatus === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <ShieldCheck size={16} />}{zh ? '保存注册域名策略' : 'Save registration domain policy'}</button>
      {registrationMessage ? <p className={`adminNotice ${registrationStatus === 'error' ? 'error' : ''}`}>{registrationMessage}</p> : null}
    </section>
  </form>;
}

const FREE_PURPOSE_LABELS = {
  activity: '活动赠送', compensation: '补偿', account_opening: '开户赠送', checkin: '签到赠送', other: '其他'
};
const PAID_SOURCE_LABELS = { corporate: '对公', swx: 'SWX', szfb: 'SZFB', other: '其他（含现金）' };

const AUDIT_SCOPE_OPTIONS = Object.freeze([
  { value: '', zh: '全部记录', en: 'All events', roles: ['super_admin', 'accountant', 'operations'] },
  { value: 'credits', zh: '积分', en: 'Credits', roles: ['super_admin', 'accountant'] },
  { value: 'user-settings', zh: '用户修改', en: 'User changes', roles: ['super_admin'] },
  { value: 'redemption', zh: '兑换码', en: 'Redemption codes', roles: ['super_admin', 'accountant'] },
  { value: 'settings', zh: '系统设置', en: 'System settings', roles: ['super_admin'] },
  { value: 'channels', zh: '渠道配置', en: 'Channels', roles: ['super_admin', 'operations'] }
]);

const AUDIT_CATEGORY_LABELS = Object.freeze({
  credits: { zh: '积分', en: 'Credits' },
  finance: { zh: '财务', en: 'Finance' },
  users: { zh: '用户修改', en: 'User changes' },
  roles: { zh: '角色权限', en: 'Roles' },
  redemption: { zh: '兑换码', en: 'Redemption' },
  settings: { zh: '系统设置', en: 'Settings' },
  channels: { zh: '渠道配置', en: 'Channels' },
  operations: { zh: '运维操作', en: 'Operations' }
});

function emptyRedemptionDraft() {
  return {
    codeType: 'free', faceValueYuan: '10', quantity: '1', freePurpose: 'activity',
    paidSource: 'corporate', sourceDetail: '', note: '', paymentConfirmed: false, expiresAt: ''
  };
}

export function RedemptionCodesPanel({ language = 'zh', profile }) {
  const zh = language === 'zh';
  const [draft, setDraft] = useState(emptyRedemptionDraft);
  const [codes, setCodes] = useState([]);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState({});
  const [workingCodeId, setWorkingCodeId] = useState('');
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const canManageStatus = permission(profile, ADMIN_PERMISSIONS.CREATE_REDEMPTION_CODES);
  const canVoid = permission(profile, ADMIN_PERMISSIONS.VOID_REDEMPTION_CODES);

  async function load() {
    setStatus('loading');
    const response = await fetch('/api/admin/redemption-codes?codeLimit=1000', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setStatus('error'); setMessage(zh ? '兑换码数据加载失败。' : 'Redemption data failed to load.'); return;
    }
    setCodes(payload.codes || []);
    setStatus('idle');
  }

  useEffect(() => { load(); }, []);

  async function createBatch(event) {
    event.preventDefault();
    setStatus('loading'); setMessage('');
    const response = await fetch('/api/admin/redemption-codes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draft,
        faceValueCents: Math.round(Number(draft.faceValueYuan) * 100),
        quantity: Number(draft.quantity),
        expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setStatus('error'); setMessage(`${zh ? '生成失败' : 'Creation failed'}：${apiError(payload, 'INVALID_REDEMPTION_BATCH')}`); return;
    }
    setDraft(emptyRedemptionDraft());
    setStatus('success'); setMessage(zh ? '兑换码已生成，可在下方列表直接复制。' : 'Redemption codes created and ready to copy below.');
    await load();
  }

  async function reveal(codeId) {
    const response = await fetch('/api/admin/redemption-codes/reveal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codeId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) { setMessage(zh ? '完整兑换码读取失败。' : 'Could not reveal the full code.'); return ''; }
    setRevealed((current) => ({ ...current, [codeId]: payload.code.code }));
    return payload.code.code;
  }

  async function copyCode(codeRow) {
    const fullCode = revealed[codeRow.id] || await reveal(codeRow.id);
    if (!fullCode) return;
    await navigator.clipboard.writeText(fullCode);
    setMessage(zh ? '完整兑换码已复制，本次查看已记录审计。' : 'Full code copied and audited.');
  }

  async function changeCodeStatus(codeId, action) {
    if (action === 'void' && !globalThis.confirm?.(zh ? '确定作废该兑换码吗？作废后不能恢复。' : 'Void this code permanently? This cannot be undone.')) return;
    setWorkingCodeId(codeId);
    const response = await fetch('/api/admin/redemption-codes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codeId, action })
    });
    const payload = await response.json().catch(() => ({}));
    setWorkingCodeId('');
    if (!response.ok || !payload.ok) {
      setMessage(zh ? '兑换码状态修改失败。' : 'Code status could not be changed.');
      return;
    }
    const successText = action === 'disable'
      ? (zh ? '兑换码已禁用。' : 'Code disabled.')
      : action === 'enable'
        ? (zh ? '兑换码已开启。' : 'Code enabled.')
        : (zh ? '兑换码已作废，不能恢复。' : 'Code voided permanently.');
    setMessage(successText);
    await load();
  }

  function codeStatusLabel(value) {
    const labels = {
      available: zh ? '可用' : 'Available',
      disabled: zh ? '已禁用' : 'Disabled',
      redeemed: zh ? '已兑换' : 'Redeemed',
      voided: zh ? '已作废' : 'Voided',
      expired: zh ? '已过期' : 'Expired'
    };
    return labels[value] || (zh ? '未知' : 'Unknown');
  }
  const displayedCodes = showAvailableOnly ? codes.filter((code) => code.status === 'available') : codes;

  return <div className="adminDashboard redemptionAdmin">
    <form className="adminBlock redemptionCreateForm" onSubmit={createBatch}>
      <div className="adminSectionHeading"><div><h3><Ticket size={18} />{zh ? '兑换码管理' : 'Redemption codes'}</h3><p>{zh ? '一码一兑；面值和到账积分生成后不可修改。' : 'Single-use codes. Face value and credits are immutable after creation.'}</p></div></div>
      <div className="redemptionFormGrid">
        <label><span>{zh ? '类型' : 'Type'}</span><select value={draft.codeType} onChange={(e) => setDraft((c) => ({ ...c, codeType: e.target.value }))}><option value="free">{zh ? '免费码' : 'Free'}</option><option value="paid">{zh ? '付费码' : 'Paid'}</option></select></label>
        <label><span>{zh ? '单码面值（元）' : 'Face value (CNY)'}</span><input type="number" min="0.01" step="0.01" value={draft.faceValueYuan} onChange={(e) => setDraft((c) => ({ ...c, faceValueYuan: e.target.value }))} /></label>
        <label><span>{zh ? '数量' : 'Quantity'}</span><input type="number" min="1" max="1000" step="1" value={draft.quantity} onChange={(e) => setDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
        <label><span>{zh ? '有效期（可选）' : 'Expiry (optional)'}</span><input type="datetime-local" value={draft.expiresAt} onChange={(e) => setDraft((c) => ({ ...c, expiresAt: e.target.value }))} /></label>
        {draft.codeType === 'free' ? <label><span>{zh ? '用途' : 'Purpose'}</span><select value={draft.freePurpose} onChange={(e) => setDraft((c) => ({ ...c, freePurpose: e.target.value }))}>{Object.entries(FREE_PURPOSE_LABELS).map(([value, label]) => <option value={value} key={value}>{zh ? label : value}</option>)}</select></label> : <>
          <label><span>{zh ? '收款来源' : 'Payment source'}</span><select value={draft.paidSource} onChange={(e) => setDraft((c) => ({ ...c, paidSource: e.target.value }))}>{Object.entries(PAID_SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          {draft.paidSource === 'other' ? <label><span>{zh ? '来源说明' : 'Source details'}</span><input required value={draft.sourceDetail} onChange={(e) => setDraft((c) => ({ ...c, sourceDetail: e.target.value }))} /></label> : null}
          <label className="redemptionPaymentConfirm"><input type="checkbox" checked={draft.paymentConfirmed} onChange={(e) => setDraft((c) => ({ ...c, paymentConfirmed: e.target.checked }))} /><span>{zh ? '已确认收款' : 'Payment confirmed'}</span><small>{zh ? '仅用于财务标记，不影响生成兑换码' : 'Financial marker only; code creation is still allowed'}</small></label>
        </>}
        <label className="wide"><span>{zh ? `备注${draft.codeType === 'free' ? '（必填）' : '（可选）'}` : 'Note'}</span><textarea required={draft.codeType === 'free'} rows="3" maxLength="500" value={draft.note} onChange={(e) => setDraft((c) => ({ ...c, note: e.target.value }))} /></label>
      </div>
      <button className="adminProviderAction adminProviderSave" type="submit" disabled={status === 'loading'}>{status === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <KeyRound size={16} />}{zh ? '生成兑换码' : 'Create codes'}</button>
      {message ? <p className={`adminNotice ${status === 'error' ? 'error' : ''}`}>{message}</p> : null}
    </form>

    <section className="adminBlock redemptionCodeList">
      <div className="redemptionCodeHeading"><h3><KeyRound size={18} />{zh ? '已有兑换码' : 'Existing codes'}</h3><button className="adminProviderAction adminProviderCancel" type="button" onClick={() => setShowAvailableOnly((current) => !current)}>{showAvailableOnly ? (zh ? '查看全部' : 'View all') : (zh ? '显示可用' : 'Available only')}</button></div>
      <div className="adminTableWrap"><table className="adminTable redemptionCodeTable"><thead><tr><th>{zh ? '兑换码' : 'Code'}</th><th>{zh ? '批次' : 'Batch'}</th><th>{zh ? '类型 / 面值' : 'Type / value'}</th><th>{zh ? '状态' : 'Status'}</th><th>{zh ? '经办与时间' : 'Operator / time'}</th><th>{zh ? '操作' : 'Actions'}</th></tr></thead><tbody>{displayedCodes.length ? displayedCodes.map((code) => {
        const working = workingCodeId === code.id;
        return <tr key={code.id}>
          <td><code className="redemptionCodeValue">{revealed[code.id] || code.maskedCode}</code></td>
          <td><strong>{code.batchNumber || '-'}</strong></td>
          <td>{code.codeType === 'free' ? (zh ? '免费码' : 'Free') : (zh ? '付费码' : 'Paid')}<small>{formatMoney(code.faceValueCents, language)} · {code.creditsPerCode}{zh ? '积分' : ' credits'}</small></td>
          <td><span className={`redemptionStatusBadge is-${code.status}`}>{codeStatusLabel(code.status)}</span>{code.redeemedAt ? <small>{new Date(code.redeemedAt).toLocaleString()}</small> : null}</td>
          <td>{code.operatorName || code.operatorEmail || '-'}<small>{code.createdAt ? new Date(code.createdAt).toLocaleString() : ''}</small></td>
          <td><div className="tableActionGroup">
            <button className="tableAction" type="button" onClick={() => copyCode(code)} disabled={working}><Copy size={14} />{zh ? '复制' : 'Copy'}</button>
            {canManageStatus && code.status === 'available' ? <button className="tableAction warning" type="button" onClick={() => changeCodeStatus(code.id, 'disable')} disabled={working}>{working ? <LoaderCircle className="spinIcon" size={14} /> : <X size={14} />}{zh ? '禁用' : 'Disable'}</button> : null}
            {canManageStatus && code.status === 'disabled' ? <button className="tableAction" type="button" onClick={() => changeCodeStatus(code.id, 'enable')} disabled={working}>{working ? <LoaderCircle className="spinIcon" size={14} /> : <Check size={14} />}{zh ? '开启' : 'Enable'}</button> : null}
            {canVoid && code.status === 'disabled' ? <button className="tableAction danger" type="button" onClick={() => changeCodeStatus(code.id, 'void')} disabled={working}><Trash2 size={14} />{zh ? '作废' : 'Void'}</button> : null}
          </div></td>
        </tr>;
      }) : <tr><td colSpan="6">{status === 'loading' ? (zh ? '正在加载…' : 'Loading…') : (zh ? '暂无兑换码。' : 'No redemption codes yet.')}</td></tr>}</tbody></table></div>
    </section>

  </div>;
}

export function FinancialReportsPanel({ language = 'zh' }) {
  const zh = language === 'zh';
  const [report, setReport] = useState({ redemption: [], creditAdjustments: [], totals: {} });
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    fetch('/api/admin/finance-report', { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      setReport(payload.report || { redemption: [], creditAdjustments: [], totals: {} });
      setStatus('idle');
    }).catch(() => setStatus('error'));
  }, []);
  const redemptionRows = report.redemption || [];
  const creditRows = report.creditAdjustments || [];

  function exportCsv() {
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csvRows = [
      ['section', 'type_or_reason', 'generated_or_count', 'redeemed_or_added', 'available_or_removed', 'voided_or_net'],
      ...redemptionRows.map((row) => ['redemption', row.codeType === 'free' ? row.purpose : row.paidSource, row.generatedCount, row.redeemedCents, row.availableCents, row.voidedCents]),
      ...creditRows.map((row) => ['credit_adjustment', row.reason, row.adjustmentCount, row.creditsAdded, row.creditsRemoved, row.netCredits])
    ];
    const blob = new Blob([`\uFEFF${csvRows.map((row) => row.map(quote).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pic365-finance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (status === 'loading') return <section className="adminBlock financialReportPanel"><div className="adminState"><LoaderCircle className="spinIcon" size={18} />{zh ? '加载财务报表…' : 'Loading financial report…'}</div></section>;
  if (status === 'error') return <section className="adminBlock financialReportPanel"><p className="adminNotice error">{zh ? '财务报表加载失败。' : 'Financial report failed to load.'}</p></section>;
  return <div className="adminDashboard financialGovernanceDashboard">
    <section className="adminBlock financialReportPanel">
      <div className="adminSectionHeading"><div><h3><FileSpreadsheet size={18} />{zh ? '积分与兑换码报表' : 'Credits and redemption report'}</h3><p>{zh ? '只汇总财务数据，不导出完整兑换码或密钥。' : 'Financial aggregates only; full codes and secrets are excluded.'}</p></div><button className="adminProviderAction adminProviderCancel" type="button" onClick={exportCsv}><FileSpreadsheet size={15} />{zh ? '导出 CSV' : 'Export CSV'}</button></div>
      <div className="adminMetricGrid"><div className="adminMetricCard"><strong>{formatMoney(report.totals?.paidCodeRedeemedCents || 0, language)}</strong><span>{zh ? '付费码已兑面值' : 'Paid code value'}</span></div><div className="adminMetricCard"><strong>{report.totals?.freeCodeRedeemedCredits || 0}</strong><span>{zh ? '免费码发放积分' : 'Free-code credits'}</span></div><div className="adminMetricCard"><strong>{report.totals?.manualCreditsAdded || 0}</strong><span>{zh ? '手工增加积分' : 'Manual credits added'}</span></div><div className="adminMetricCard"><strong>{report.totals?.manualCreditsRemoved || 0}</strong><span>{zh ? '手工扣减积分' : 'Manual credits removed'}</span></div></div>
    </section>
    <section className="adminBlock financialReportPanel"><h3><Ticket size={18} />{zh ? '兑换码汇总' : 'Redemption summary'}</h3><div className="adminTableWrap"><table className="adminTable"><thead><tr><th>{zh ? '类型' : 'Type'}</th><th>{zh ? '用途 / 来源' : 'Purpose / source'}</th><th>{zh ? '生成数' : 'Generated'}</th><th>{zh ? '已兑换' : 'Redeemed'}</th><th>{zh ? '未兑换面值' : 'Available value'}</th><th>{zh ? '作废面值' : 'Voided value'}</th></tr></thead><tbody>{redemptionRows.map((row, index) => <tr key={`${row.codeType}-${row.purpose}-${row.paidSource}-${index}`}><td>{row.codeType === 'free' ? (zh ? '免费码' : 'Free') : (zh ? '付费码' : 'Paid')}</td><td>{row.codeType === 'free' ? (FREE_PURPOSE_LABELS[row.purpose] || row.purpose) : (PAID_SOURCE_LABELS[row.paidSource] || row.paidSource)}</td><td>{row.generatedCount}</td><td>{row.redeemedCount} / {formatMoney(row.redeemedCents, language)}</td><td>{formatMoney(row.availableCents, language)}</td><td>{formatMoney(row.voidedCents, language)}</td></tr>)}</tbody></table></div></section>
    <section className="adminBlock financialReportPanel"><h3><Coins size={18} />{zh ? '手工积分调整汇总' : 'Manual credit adjustments'}</h3><div className="adminTableWrap"><table className="adminTable"><thead><tr><th>{zh ? '原因' : 'Reason'}</th><th>{zh ? '次数' : 'Count'}</th><th>{zh ? '影响用户' : 'Users'}</th><th>{zh ? '增加' : 'Added'}</th><th>{zh ? '扣减' : 'Removed'}</th><th>{zh ? '净变化' : 'Net'}</th></tr></thead><tbody>{creditRows.length ? creditRows.map((row) => <tr key={row.reason}><td>{POSITIVE_REASON_LABELS[row.reason] || NEGATIVE_REASON_LABELS[row.reason] || row.reason}</td><td>{row.adjustmentCount}</td><td>{row.affectedUsers}</td><td>{row.creditsAdded}</td><td>{row.creditsRemoved}</td><td>{row.netCredits > 0 ? '+' : ''}{row.netCredits}</td></tr>) : <tr><td colSpan="6">{zh ? '暂无手工积分调整。' : 'No manual credit adjustments.'}</td></tr>}</tbody></table></div></section>
  </div>;
}

export function AuditEventsPanel({ language = 'zh', profile }) {
  const zh = language === 'zh';
  const [events, setEvents] = useState([]);
  const [scope, setScope] = useState('');
  const [status, setStatus] = useState('loading');
  const availableScopes = AUDIT_SCOPE_OPTIONS.filter((item) => item.roles.includes(profile?.role || ''));
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const query = new URLSearchParams({ limit: '300' });
    if (scope) query.set('scope', scope);
    fetch(`/api/admin/audit?${query.toString()}`, { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      if (!cancelled) { setEvents(payload.events || []); setStatus('idle'); }
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [scope]);
  return <section className="adminBlock auditEventsPanel">
    <div className="adminSectionHeading auditEventsHeading"><div><h3><ShieldCheck size={18} />{zh ? '审计记录' : 'Audit events'}</h3><p>{zh ? '记录只追加，不能编辑或删除；敏感密钥和完整兑换码不会写入审计正文。' : 'Append-only records. Secrets and full codes are excluded.'}</p></div><label className="auditScopeFilter"><span>{zh ? '分类' : 'Category'}</span><select value={scope} onChange={(event) => setScope(event.target.value)}>{availableScopes.map((item) => <option value={item.value} key={item.value || 'all'}>{zh ? item.zh : item.en}</option>)}</select></label></div>
    {status === 'loading' ? <div className="adminState"><LoaderCircle className="spinIcon" size={18} />{zh ? '加载中' : 'Loading'}</div> : status === 'error' ? <p className="adminNotice error">{zh ? '审计记录加载失败。' : 'Audit events failed to load.'}</p> : <><div className="auditResultCount">{zh ? `共 ${events.length} 条记录` : `${events.length} events`}</div><div className="adminTableWrap"><table className="adminTable"><thead><tr><th>{zh ? '时间' : 'Time'}</th><th>{zh ? '操作员' : 'Actor'}</th><th>{zh ? '分类' : 'Category'}</th><th>{zh ? '操作' : 'Action'}</th><th>{zh ? '对象/变化' : 'Target/change'}</th><th>{zh ? '原因' : 'Reason'}</th></tr></thead><tbody>{events.length ? events.map((event) => <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString()}</td><td><strong>{event.actorName || event.actorEmail || '-'}</strong><small>{roleLabel(event.actorRole, language)}</small></td><td>{AUDIT_CATEGORY_LABELS[event.category]?.[language] || event.category}</td><td>{event.action}</td><td>{event.creditDelta == null ? `${event.entityType}:${event.entityId}` : `${event.creditDelta > 0 ? '+' : ''}${event.creditDelta} (${event.balanceBefore} → ${event.balanceAfter})`}</td><td>{event.reason || event.details || '-'}</td></tr>) : <tr><td colSpan="6">{zh ? '当前分类暂无记录。' : 'No events in this category.'}</td></tr>}</tbody></table></div></>}
  </section>;
}

export function UserEditDialog({ language = 'zh', profile, user, onClose, onSaved }) {
  const zh = language === 'zh';
  const [adminNote, setAdminNote] = useState(user?.adminNote || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(user?.role || USER_ROLES.USER);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  useEffect(() => {
    setAdminNote(user?.adminNote || '');
    setPassword('');
    setRole(user?.role || USER_ROLES.USER);
    setStatus('idle');
    setMessage('');
  }, [user?.id]);
  if (!user) return null;
  const canPassword = permission(profile, ADMIN_PERMISSIONS.RESET_USER_PASSWORD);
  const canRoles = permission(profile, ADMIN_PERMISSIONS.MANAGE_USER_ROLES);
  async function submit(event) {
    event.preventDefault(); setStatus('loading'); setMessage('');
    const body = { userId: user.id, adminNote, role };
    if (password.length > 0) body.password = password;
    const response = await fetch('/api/admin/users/edit', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) { setStatus('error'); setMessage(apiError(payload, 'USER_UPDATE_FAILED')); return; }
    await onSaved?.(payload.user); onClose?.();
  }
  return <div className="adminUserEditBackdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && status !== 'loading' && onClose?.()}><form className="adminAdjustForm governanceUserEdit" onSubmit={submit} role="dialog" aria-modal="true"><header><div><span>{zh ? '编辑用户' : 'Edit user'}</span><strong>{user.email}</strong></div><button className="adminEditClose" type="button" onClick={onClose} disabled={status === 'loading'}><X size={18} /></button></header><div className="governanceReadonlyGrid"><label><span>{zh ? '登录邮箱（不可修改）' : 'Login email'}</span><input value={user.email} readOnly /></label><label><span>{zh ? '用户名（不可修改）' : 'Username'}</span><input value={user.fullName || ''} readOnly /></label></div><label><span>{zh ? '管理员备注名' : 'Administrator note'}</span><input maxLength="160" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} /></label>{canRoles ? <label><span>{zh ? '角色' : 'Role'}</span><select value={role} onChange={(e) => setRole(e.target.value)}>{Object.values(USER_ROLES).map((item) => <option value={item} key={item}>{roleLabel(item, language)}</option>)}</select></label> : null}{canPassword ? <label><span>{zh ? '新密码（留空不修改）' : 'New password (leave blank to keep)'}</span><input key={user.id} name={`admin-new-password-${user.id}`} type="password" autoComplete="new-password" data-lpignore="true" minLength="8" maxLength="128" value={password} placeholder={zh ? '不修改密码请保持为空' : 'Leave empty to keep the current password'} onChange={(e) => setPassword(e.target.value)} /></label> : null}{message ? <p className="authMessage error">{message}</p> : null}<footer><button className="secondary" type="button" onClick={onClose} disabled={status === 'loading'}>{zh ? '取消' : 'Cancel'}</button><button type="submit" disabled={status === 'loading'}>{status === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <UserCog size={16} />}{zh ? '保存用户' : 'Save user'}</button></footer></form></div>;
}

const POSITIVE_REASON_LABELS = { corporate: '对公', swx: 'SWX', szfb: 'SZFB', compensation: '补偿', gift: '赠送', manual_plus: '手工调整+' };
const NEGATIVE_REASON_LABELS = { clearance: '清退', manual_minus: '手工调整-' };

export function CreditAdjustmentDialog({ language = 'zh', user, onClose, onSaved }) {
  const zh = language === 'zh';
  const [amount, setAmount] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [details, setDetails] = useState('');
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const value = Number(amount);
  const reasonOptions = value < 0 ? NEGATIVE_REASON_LABELS : POSITIVE_REASON_LABELS;
  useEffect(() => { if (!reasonOptions[reasonCode]) setReasonCode(Object.keys(reasonOptions)[0]); setPreview(false); }, [value < 0]);
  if (!user) return null;
  const after = Number(user.creditBalance || 0) + (Number.isInteger(value) ? value : 0);
  function showPreview(event) {
    event.preventDefault();
    if (!Number.isInteger(value) || !value || after < 0 || !reasonCode || !details.trim()) { setMessage(zh ? '请填写有效积分数量、变动原因和具体说明。' : 'Enter a valid amount, reason and details.'); return; }
    setMessage(''); setPreview(true);
  }
  async function confirm() {
    setStatus('loading'); setMessage('');
    const response = await fetch('/api/admin/credits/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, amount: value, reasonCode, details, requestId: crypto.randomUUID() }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) { setStatus('error'); setMessage(apiError(payload, 'CREDIT_ADJUSTMENT_FAILED')); return; }
    onSaved?.(payload.user); onClose?.();
  }
  return <div className="adminUserEditBackdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && status !== 'loading' && onClose?.()}><form className="adminAdjustForm governanceCreditAdjust" onSubmit={showPreview} role="dialog" aria-modal="true"><header><div><span>{zh ? '调整积分' : 'Adjust credits'}</span><strong>{user.email}</strong></div><button className="adminEditClose" type="button" onClick={onClose}><X size={18} /></button></header><div className="governanceUserSummary"><span>{zh ? '用户名' : 'Username'}<strong>{user.fullName || '-'}</strong></span><span>{zh ? '备注名' : 'Note'}<strong>{user.adminNote || '-'}</strong></span><span>{zh ? '当前积分' : 'Current credits'}<strong>{user.creditBalance}</strong></span></div>{preview ? <div className="creditAdjustmentPreview"><h3>{zh ? '变化概览' : 'Change summary'}</h3><dl><div><dt>{zh ? '用户' : 'User'}</dt><dd>{user.fullName || '-'} · {user.email}</dd></div><div><dt>{zh ? '管理员备注' : 'Admin note'}</dt><dd>{user.adminNote || '-'}</dd></div><div><dt>{zh ? '当前积分' : 'Current'}</dt><dd>{user.creditBalance}</dd></div><div><dt>{zh ? '积分变化' : 'Change'}</dt><dd className={value > 0 ? 'positive' : 'negative'}>{value > 0 ? '+' : ''}{value}</dd></div><div><dt>{zh ? '修改后积分' : 'After'}</dt><dd>{after}</dd></div><div><dt>{zh ? '原因' : 'Reason'}</dt><dd>{reasonOptions[reasonCode]}</dd></div><div><dt>{zh ? '说明' : 'Details'}</dt><dd>{details}</dd></div></dl></div> : <><label><span>{zh ? '积分变更数量（支持正负整数）' : 'Credit change'}</span><input type="number" step="1" value={amount} onChange={(e) => { setAmount(e.target.value); setPreview(false); }} /></label><label><span>{zh ? '变动原因' : 'Reason'}</span><select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>{Object.entries(reasonOptions).map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></label><label><span>{zh ? '具体说明（必填）' : 'Details (required)'}</span><textarea rows="3" maxLength="500" value={details} onChange={(e) => setDetails(e.target.value)} /></label></>}{message ? <p className="authMessage error">{message}</p> : null}<footer><button className="secondary" type="button" onClick={preview ? () => setPreview(false) : onClose}>{preview ? (zh ? '返回修改' : 'Back') : (zh ? '取消' : 'Cancel')}</button>{preview ? <button type="button" onClick={confirm} disabled={status === 'loading'}>{status === 'loading' ? <LoaderCircle className="spinIcon" size={16} /> : <Check size={16} />}{zh ? '确认调整' : 'Confirm adjustment'}</button> : <button type="submit"><Coins size={16} />{zh ? '预览' : 'Preview'}</button>}</footer></form></div>;
}

export function RedeemCodeCard({ language = 'zh', profile, onProfileChanged, onRedeemed, className = '' }) {
  const zh = language === 'zh';
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  async function redeem(event) {
    event.preventDefault(); setStatus('loading'); setMessage('');
    const response = await fetch('/api/billing/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, requestId: crypto.randomUUID() }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) { setStatus('error'); setMessage(zh ? '兑换码无效或不可用。' : 'The redemption code is invalid or unavailable.'); return; }
    setCode(''); setStatus('success'); setMessage(zh ? `兑换成功，到账 ${payload.credits} 积分。` : `Redeemed ${payload.credits} credits.`); onProfileChanged?.(payload.user); await onRedeemed?.(payload);
  }
  if (!profile) return null;
  return <form className={`accountGovernanceCard redeemCodeCard ${className}`.trim()} onSubmit={redeem}><h3><Ticket size={17} />{zh ? '积分兑换' : 'Redeem credits'}</h3><p>{zh ? '输入兑换码，兑换成功后积分立即到账。' : 'Enter a code to add credits immediately.'}</p><div><input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PIC-XXXXX-XXXXX-XXXXX" /><button type="submit" disabled={status === 'loading'}>{status === 'loading' ? <LoaderCircle className="spinIcon" size={15} /> : <Check size={15} />}{zh ? '兑换' : 'Redeem'}</button></div>{message ? <p className={`adminNotice ${status === 'error' ? 'error' : ''}`}>{message}</p> : null}</form>;
}

export function PersonalMenuSettings({ language = 'zh', profile, onMenuChanged }) {
  const zh = language === 'zh';
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    fetch('/api/menu-settings', { cache: 'no-store' }).then((r) => r.json()).then((p) => p.ok && setMenu(p.menu)).catch(() => undefined);
  }, []);
  async function updatePreference(key, checked) {
    const next = { ...menu.personal, [key]: checked };
    setMenu((current) => ({ ...current, personal: next }));
    const response = await fetch('/api/menu-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok) { setMenu(payload.menu); onMenuChanged?.(payload.menu); }
  }
  if (!profile) return null;
  return <div className="accountGovernanceGrid personalSettingsOnly"><section className="accountGovernanceCard"><h3><Settings size={17} />{zh ? '界面设置' : 'Interface settings'}</h3><p>{zh ? '隐藏不常用的顶部菜单。全局关闭的项目不能由个人重新开启。' : 'Hide unused top menu items.'}</p>{menu ? <div className="accountMenuPreferences">{[
    ['hideEcommerce', null, zh ? '隐藏“电商套图”' : 'Hide Product image sets'],
    ['hideTemplates', 'templates', zh ? '隐藏“模板”' : 'Hide Templates'],
    ['hideCases', 'cases', zh ? '隐藏“范例”' : 'Hide Examples'],
    ['hideApi', 'api', zh ? '隐藏“API”' : 'Hide API']
  ].map(([preference, globalKey, label]) => {
    const globallyDisabled = Boolean(globalKey && !menu.global[globalKey]);
    return <label className={globallyDisabled ? 'globallyDisabled' : ''} key={preference}><input type="checkbox" checked={globallyDisabled || Boolean(menu.personal[preference])} disabled={globallyDisabled} onChange={(e) => updatePreference(preference, e.target.checked)} /><span>{label}</span>{globallyDisabled ? <em>{zh ? '全局已关闭' : 'Disabled globally'}</em> : null}</label>;
  })}</div> : <LoaderCircle className="spinIcon" size={18} />}</section></div>;
}
