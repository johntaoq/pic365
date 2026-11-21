import React, { useEffect, useState } from 'react';
import { HardDrive, LoaderCircle, ExternalLink, RefreshCw } from 'lucide-react';

export default function NewAPIStorage({ language = 'zh', label = 'NewAPI' }) {
  const zh = language === 'zh';
  const [storage,setStorage] = useState(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  async function load() {
    const response = await fetch('/api/newapi-storage',{ cache:'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error);
    setStorage(payload.storage);
  }
  useEffect(() => { load().catch(() => setMessage(zh ? '暂时无法读取存储账单。' : 'Storage billing is temporarily unavailable.')); },[]);
  async function retrySettlement() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/newapi-storage',{ method:'POST',headers:{ 'Content-Type':'application/json' },body:'{}' });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      setStorage(payload.storage);
    } catch (cause) {
      setMessage(cause.message === 'NEWAPI_REAUTH_REQUIRED'
        ? zh ? '来源账户连接已失效，请从来源站点重新进入；无需单独授权存储扣费。' : 'Reconnect from your source dashboard; no separate storage payment authorization is needed.'
        : zh ? '结算暂未完成，系统会继续重试；已有账单不会重复扣款。' : 'Settlement is not complete. The system will retry without duplicate charges.');
    } finally { setBusy(false); }
  }
  return <section className="newapiStorage" aria-label={zh ? '资产存储计费' : 'Asset storage billing'}>
    <h3><HardDrive size={18} />{zh ? '资产存储' : 'Asset storage'}</h3>
    {!storage ? <LoaderCircle size={18} className="spinIcon" /> : <>
      <p>{zh ? '月度峰值计费，增量补差' : 'Monthly peak usage, incremental charges'} · ¥{Number(storage.unitPriceCentsPerGib || storage.configuredUnitPriceCentsPerGib)/100}/GiB</p>
      <p>{storage.automaticPayment === false ? zh ? '此来源暂未启用存储扣费。' : 'Storage billing is not enabled for this source.' : zh ? `存储费自动从 ${label} 钱包结算，无需单独授权。` : `Storage fees are settled automatically from your ${label} wallet. No separate authorization is needed.`}</p>
      <p>{zh ? '本月峰值' : 'Monthly peak'}: {(storage.peakBytes/2**30).toFixed(3)} GiB · {zh ? '结算状态' : 'Settlement'}: {({active:zh?'自动结算中':'Automatic',revoked:zh?'来源结算已停用':'Disabled at source',expired:zh?'系统续期中':'Renewal pending',authorization_required:zh?'系统准备中':'Setup pending'})[storage.state]}</p>
      {storage.monthlyLimitCents > 0 ? <p>{zh ? '每月扣费上限' : 'Monthly limit'}: ¥{storage.monthlyLimitCents/100}</p> : null}
      <div className="storageActions"><button type="button" className="secondary" disabled={busy || !storage.available} onClick={retrySettlement}>{busy?<LoaderCircle size={16} className="spinIcon"/>:<RefreshCw size={16}/>} {zh?'重试结算':'Retry settlement'}</button><a href={storage.walletUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>{zh?'来源钱包与月度账单':'Source wallet and monthly statements'}</a></div>
      {!storage.available ? <p role="status">{zh?'来源存储结算接口暂不可用，系统会稍后重试，不会因未授权影响生图。':'Source storage settlement is temporarily unavailable. The system will retry; missing authorization does not block image generation.'}</p> : null}
      {storage.state === 'revoked' ? <p role="status">{zh?'来源存储结算已被停用，请联系管理员。':'Storage settlement was disabled at the source. Contact the administrator.'}</p> : null}
      {storage.blockedSince ? <p role="status">{zh?'存储费待支付，请检查来源钱包余额或月度扣费限额。付款宽限期为7天，已有资产仍可下载和删除。':'Storage payment needs attention. Check source wallet balance or the monthly cap. A 7-day payment grace period applies; existing assets remain downloadable and deletable.'}</p> : null}
      <div className="storageInvoiceList">{storage.invoices.map((invoice)=><article key={invoice.id}><strong>{invoice.request.billing_month} · {zh?'Pic365 存储费':'Pic365 storage fee'}</strong><span>{invoice.status==='paid' ? `¥${(invoice.receipt.amount_cents/100).toFixed(2)}` : invoice.status==='cancelled' ? zh?'已取消':'Cancelled' : invoice.status==='blocked' ? zh?'待处理':'Needs attention' : zh?'待确认':'Pending confirmation'} · {invoice.id}</span>{invoice.errorCode && invoice.status==='blocked' ? <small>{({PIC365_STORAGE_INSUFFICIENT_BALANCE:zh?'来源钱包余额不足':'Insufficient source balance',PIC365_STORAGE_MONTHLY_LIMIT:zh?'超过月度扣费限额':'Monthly cap exceeded',PIC365_STORAGE_AUTHORIZATION_REQUIRED:zh?'来源结算凭证待恢复':'Source settlement credential needs recovery'})[invoice.errorCode]}</small> : null}</article>)}</div>
    </>}
    {message ? <><p role="alert">{message}</p><button type="button" className="secondary" disabled={busy} onClick={()=>load().then(()=>setMessage('')).catch(()=>{})}><RefreshCw size={16}/>{zh?'刷新账单':'Refresh invoices'}</button></> : null}
  </section>;
}
