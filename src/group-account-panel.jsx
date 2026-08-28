import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Coins, LoaderCircle, Pause, Play, Send, UserMinus, UserPlus, Users, X } from 'lucide-react';

function requestId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

function money(value) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function memberStatusText(status, zh) {
  if (status === 'active') return zh ? '正常' : 'Active';
  if (status === 'paused') return zh ? '已暂停' : 'Paused';
  if (status === 'leaving') return zh ? '待结算移除' : 'Pending removal';
  return status || '-';
}

function ledgerDisplay(row, zh) {
  if (row.type === 'budget_adjustment') {
    return {
      label: zh ? '成员预算调整' : 'Member budget adjustment',
      amount: Number(row.metadata?.deltaCenti || 0) / 100
    };
  }
  if (row.type === 'funding') {
    return { label: zh ? '个人余额转入' : 'Personal balance funding', amount: row.amount };
  }
  return { label: row.source, amount: row.amount };
}

const ERROR_TEXT = {
  GROUP_NAME_REQUIRED: '请输入集团名称。',
  GROUP_MEMBERSHIP_EXISTS: '该用户已经加入集团。',
  USER_NOT_FOUND: '没有找到已注册的用户。',
  GROUP_CANNOT_INVITE_SELF: '不能邀请自己。',
  GROUP_BALANCE_REQUIRED: '集团可分配余额不足。',
  GROUP_BUDGET_REQUIRED: '成员预算不足。',
  CREDITS_REQUIRED: '个人积分不足。',
  GROUP_BUDGET_IN_USE: '可回收预算不足，处理中金额不能回收。',
  INVALID_CURRENT_PASSWORD: '当前密码不正确。',
  GROUP_ADMIN_CANNOT_LEAVE: '管理员需要先转让管理员身份。',
  GROUP_INVITATION_UNAVAILABLE: '邀请已处理或不可用。',
  GROUP_INVITATION_EXPIRED: '邀请已经过期。'
};

export default function GroupAccountPanel({ language = 'zh', profile, onProfileChange }) {
  const zh = language === 'zh';
  const [payload, setPayload] = useState({ membership: profile?.groupAccount || null, invitations: [] });
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [groupName, setGroupName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [fundAmount, setFundAmount] = useState('');
  const [budgetAmounts, setBudgetAmounts] = useState({});
  const [transferTarget, setTransferTarget] = useState('');
  const [transferPassword, setTransferPassword] = useState('');

  const membership = payload.membership;
  const members = Array.isArray(membership?.members) ? membership.members : [];
  const ordinaryMembers = useMemo(() => members.filter((item) => item.role === 'member'), [members]);

  async function load() {
    setStatus('loading');
    try {
      const response = await fetch('/api/groups', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'GROUP_LOAD_FAILED');
      setPayload(data);
      if (data.user) onProfileChange?.(data.user);
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(ERROR_TEXT[error.message] || (zh ? '集团账户加载失败。' : 'Group account could not be loaded.'));
    }
  }

  useEffect(() => {
    load();
  }, [profile?.id]);

  async function act(action, values = {}) {
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...values })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'GROUP_OPERATION_FAILED');
      setPayload(data);
      if (data.user) onProfileChange?.(data.user);
      setStatus('idle');
      setMessage(zh ? '操作已完成。' : 'Saved.');
      return true;
    } catch (error) {
      setStatus('error');
      setMessage(ERROR_TEXT[error.message] || (zh ? '操作失败，请稍后重试。' : 'The operation failed.'));
      return false;
    }
  }

  async function submitCreate(event) {
    event.preventDefault();
    if (await act('create', { name: groupName })) setGroupName('');
  }

  async function submitInvite(event) {
    event.preventDefault();
    if (await act('invite', { email: inviteEmail })) setInviteEmail('');
  }

  async function submitFund(event) {
    event.preventDefault();
    if (await act('fund', { amount: Number(fundAmount), requestId: requestId('group-fund') })) setFundAmount('');
  }

  async function adjustBudget(member, direction) {
    const amount = Number(budgetAmounts[member.userId] || 0);
    if (!(amount > 0)) return;
    const signedAmount = direction === 'remove' ? -amount : amount;
    if (await act('adjust-budget', { userId: member.userId, amount: signedAmount, requestId: requestId('group-budget') })) {
      setBudgetAmounts((current) => ({ ...current, [member.userId]: '' }));
    }
  }

  const busy = status === 'loading';

  return (
    <section className="groupAccountCard">
      <header className="groupAccountHeading">
        <div><h3><Building2 size={18} />{zh ? '集团账户' : 'Group account'}</h3><p>{zh ? '共享集团余额，并为每位成员设置可用预算。' : 'Share one group balance with a controlled budget for each member.'}</p></div>
        {busy ? <LoaderCircle className="spinIcon" size={18} /> : null}
      </header>

      {payload.invitations?.length ? (
        <div className="groupInvitationList">
          {payload.invitations.map((invitation) => (
            <article key={invitation.id}>
              <div><strong>{invitation.groupName}</strong><span>{zh ? `${invitation.inviterName || invitation.inviterEmail} 邀请你加入` : `Invited by ${invitation.inviterName || invitation.inviterEmail}`}</span></div>
              <button type="button" disabled={busy} onClick={() => act('respond-invitation', { invitationId: invitation.id, accept: true })}><Check size={15} />{zh ? '加入' : 'Join'}</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => act('respond-invitation', { invitationId: invitation.id, accept: false })}><X size={15} />{zh ? '拒绝' : 'Decline'}</button>
            </article>
          ))}
        </div>
      ) : null}

      {!membership ? (
        <form className="groupInlineForm" onSubmit={submitCreate}>
          <label><span>{zh ? '创建集团账户' : 'Create a group'}</span><input value={groupName} maxLength={80} onChange={(event) => setGroupName(event.target.value)} placeholder={zh ? '集团名称' : 'Group name'} required /></label>
          <button type="submit" disabled={busy}><Users size={16} />{zh ? '创建' : 'Create'}</button>
        </form>
      ) : (
        <>
          <div className="groupAccountTitle"><div><strong>{membership.name}</strong><span>{membership.role === 'admin' ? (zh ? '集团管理员' : 'Administrator') : (zh ? '一般用户' : 'Member')}</span></div><em>{membership.status === 'active' ? (zh ? '正常' : 'Active') : membership.status}</em></div>
          <div className="groupAccountMetrics">
            <div><span>{zh ? '集团总余额' : 'Group balance'}</span><strong>{money(membership.balance)}</strong></div>
            <div><span>{membership.role === 'admin' ? (zh ? '管理员可用' : 'Admin available') : (zh ? '我的预算' : 'My budget')}</span><strong>{money(membership.available)}</strong></div>
            <div><span>{zh ? '处理中' : 'Reserved'}</span><strong>{money(membership.reserved)}</strong></div>
            <div><span>{zh ? '累计使用' : 'Spent'}</span><strong>{money(membership.spent)}</strong></div>
          </div>

          {membership.pendingAdminTransfer ? (
            <div className="groupTransferNotice"><span>{zh ? `${membership.pendingAdminTransfer.fromName || membership.pendingAdminTransfer.fromEmail} 邀请你接任集团管理员` : 'You have been asked to become the administrator.'}</span><button type="button" disabled={busy} onClick={() => act('respond-admin-transfer', { transferId: membership.pendingAdminTransfer.id, accept: true })}>{zh ? '接受' : 'Accept'}</button><button type="button" className="secondary" disabled={busy} onClick={() => act('respond-admin-transfer', { transferId: membership.pendingAdminTransfer.id, accept: false })}>{zh ? '拒绝' : 'Decline'}</button></div>
          ) : null}

          {membership.role === 'admin' ? (
            <>
              <div className="groupAdminForms">
                <form className="groupInlineForm" onSubmit={submitFund}><label><span>{zh ? `从个人余额转入（可用 ${money(membership.personalBalance)}）` : `Fund from personal balance (${money(membership.personalBalance)})`}</span><input type="number" min="0.01" step="0.01" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} required /></label><button type="submit" disabled={busy}><Coins size={16} />{zh ? '转入集团' : 'Fund'}</button></form>
                <form className="groupInlineForm" onSubmit={submitInvite}><label><span>{zh ? '邀请已注册用户' : 'Invite a registered user'}</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" required /></label><button type="submit" disabled={busy}><Send size={16} />{zh ? '发送邀请' : 'Invite'}</button></form>
              </div>

              {membership.outgoingInvitations?.length ? <div className="groupPendingInvites">{membership.outgoingInvitations.map((item) => <div key={item.id}><span>{item.email} · {zh ? '等待确认' : 'Pending'}</span><button type="button" className="secondary" disabled={busy} onClick={() => act('revoke-invitation', { invitationId: item.id })}>{zh ? '撤销' : 'Revoke'}</button></div>)}</div> : null}

              <div className="groupMemberList">
                {ordinaryMembers.length ? ordinaryMembers.map((member) => (
                  <article key={member.userId}>
                    <div className="groupMemberIdentity"><strong>{member.fullName || member.email}</strong><span>{member.email} · {memberStatusText(member.status, zh)}</span></div>
                    <div className="groupMemberNumbers"><span>{zh ? '可用' : 'Available'} <b>{money(member.budget)}</b></span><span>{zh ? '处理中' : 'Reserved'} <b>{money(member.reserved)}</b></span><span>{zh ? '已用' : 'Spent'} <b>{money(member.spent)}</b></span></div>
                    <div className="groupBudgetControls"><input type="number" min="0.01" step="0.01" placeholder={zh ? '积分' : 'Credits'} value={budgetAmounts[member.userId] || ''} onChange={(event) => setBudgetAmounts((current) => ({ ...current, [member.userId]: event.target.value }))} /><button type="button" disabled={busy} onClick={() => adjustBudget(member, 'add')}>{zh ? '增加' : 'Add'}</button><button type="button" className="secondary" disabled={busy} onClick={() => adjustBudget(member, 'remove')}>{zh ? '收回' : 'Recover'}</button></div>
                    <div className="groupMemberActions"><button type="button" className="secondary" disabled={busy} onClick={() => act('member-status', { userId: member.userId, memberAction: member.status === 'paused' ? 'resume' : 'pause' })}>{member.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}{member.status === 'paused' ? (zh ? '恢复' : 'Resume') : (zh ? '暂停' : 'Pause')}</button><button type="button" className="danger" disabled={busy} onClick={() => act('member-status', { userId: member.userId, memberAction: 'remove' })}><UserMinus size={14} />{zh ? '移除' : 'Remove'}</button></div>
                  </article>
                )) : <p className="groupEmpty">{zh ? '还没有一般用户。' : 'No members yet.'}</p>}
              </div>

              {ordinaryMembers.some((item) => item.status === 'active') ? <form className="groupTransferForm" onSubmit={async (event) => { event.preventDefault(); if (await act('request-admin-transfer', { userId: transferTarget, currentPassword: transferPassword })) setTransferPassword(''); }}><label><span>{zh ? '转让集团管理员' : 'Transfer administrator'}</span><select value={transferTarget} onChange={(event) => setTransferTarget(event.target.value)} required><option value="">{zh ? '选择成员' : 'Choose member'}</option>{ordinaryMembers.filter((item) => item.status === 'active').map((item) => <option key={item.userId} value={item.userId}>{item.fullName || item.email}</option>)}</select></label><label><span>{zh ? '当前密码' : 'Current password'}</span><input type="password" value={transferPassword} onChange={(event) => setTransferPassword(event.target.value)} minLength={8} required /></label><button type="submit" disabled={busy}><UserPlus size={16} />{zh ? '发起转让' : 'Request transfer'}</button></form> : null}

              {membership.ledger?.length ? <div className="groupLedger"><h4>{zh ? '最近集团流水' : 'Recent group ledger'}</h4>{membership.ledger.map((row) => { const display = ledgerDisplay(row, zh); return <div key={row.id}><span>{display.label} · {row.chargedEmail || row.actorEmail || '-'}</span><strong className={display.amount >= 0 ? 'positive' : 'negative'}>{display.amount >= 0 ? '+' : ''}{money(display.amount)}</strong></div>; })}</div> : null}
            </>
          ) : (
            <div className="groupMemberSelf"><p>{zh ? `集团管理员：${membership.adminName || membership.adminEmail}` : `Administrator: ${membership.adminName || membership.adminEmail}`}</p><button type="button" className="danger" disabled={busy} onClick={() => act('leave')}><UserMinus size={16} />{zh ? '退出集团' : 'Leave group'}</button></div>
          )}
        </>
      )}
      {message ? <p className={`groupAccountMessage ${status === 'error' ? 'error' : ''}`}>{message}</p> : null}
    </section>
  );
}
