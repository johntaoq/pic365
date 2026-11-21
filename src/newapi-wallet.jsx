import React, { useEffect, useState } from 'react';
import { RefreshCw, Wallet } from 'lucide-react';

export function newAPIErrorMessage(code, language = 'zh') {
  const zh = language === 'zh';
  if (code === 'PIC365_STORAGE_PAYMENT_REQUIRED') return zh ? '存储费付款宽限期已结束，请检查来源钱包余额或月度扣费限额，无需单独授权。已有资产仍可下载和删除。' : 'Storage payment grace ended. Check source wallet balance or the monthly cap; no separate authorization is needed. Existing assets remain downloadable and deletable.';
  if (code === 'NEWAPI_BALANCE_REQUIRED') return zh ? '来源账户余额不足，请到来源站点充值。' : 'Your source account balance is insufficient. Recharge at the source site.';
  if (code === 'NEWAPI_REAUTH_REQUIRED') return zh ? '来源账户授权已失效，请从来源站点重新进入 Pic365。' : 'Your source authorization expired. Enter Pic365 from the source dashboard again.';
  if (code === 'NEWAPI_MODEL_NOT_ALLOWED') return zh ? '来源账户未授权此模型，请从来源站点重新进入；仍不可用时请联系管理员。' : 'This model is not authorized. Enter from the source dashboard again, or contact the administrator.';
  if (code === 'NEWAPI_BALANCE_UNAVAILABLE') return zh ? '暂时无法读取来源账户余额，请稍后重试。' : 'Your source wallet is temporarily unavailable. Try again later.';
  if (code === 'NEWAPI_AUTH_UNAVAILABLE') return zh ? '来源账户授权校验暂时不可用，请稍后重试。' : 'Source authorization verification is temporarily unavailable. Try again later.';
  if (code === 'NEWAPI_NOT_CONFIGURED') return zh ? '来源站点尚未正确配置，请联系管理员。' : 'The source integration is not configured. Contact the administrator.';
  return '';
}

export default function NewAPIWallet({ language = 'zh', showRecharge = false, account }) {
  const [state, setState] = useState({ wallet: null, error: '', loading: true });
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/newapi-wallet', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error);
        if (active) setState({ wallet: result.wallet, error: '', loading: false });
      } catch (error) {
        if (active) setState({ wallet: null, error: error.message || 'NEWAPI_BALANCE_UNAVAILABLE', loading: false });
      }
    };
    refresh();
    const interval = setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, []);
  const zh = language === 'zh';
  const label = state.wallet?.label || account?.label || 'NewAPI';
  const startUrl = account?.startUrl || '/';
  if (state.error) {
    return <a href={startUrl} className="userStat"><RefreshCw size={15} />{zh ? `重新连接 ${label}` : `Reconnect ${label}`}</a>;
  }
  return <span className="userStat" title={zh ? `使用 ${label} 账户余额生图` : `Images are billed to your ${label} wallet`}><Wallet size={15} />{label} {state.loading ? '...' : `$${Number(state.wallet?.balanceUsd || 0).toFixed(4)}`}{showRecharge && state.wallet ? <a href={state.wallet.rechargeUrl} target="_blank" rel="noopener noreferrer">{zh ? '充值' : 'Recharge'}</a> : null}</span>;
}
