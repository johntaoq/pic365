import { authenticateRequest } from './_lib/local-auth.js';
import {
  adjustGroupMemberBudget,
  createGroupAccount,
  fundGroupAccount,
  getGroupAccountSummary,
  getUserProfile,
  inviteGroupMember,
  leaveGroupAccount,
  requestGroupAdminTransfer,
  revokeGroupInvitation,
  respondGroupAdminTransfer,
  respondGroupInvitation,
  setGroupMemberStatus
} from './_lib/local-db.js';
import { readJsonBody } from './_lib/request.js';

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function statusForError(code) {
  if (['GROUP_ADMIN_REQUIRED', 'GROUP_ACCESS_SUSPENDED'].includes(code)) return 403;
  if (['USER_NOT_FOUND', 'GROUP_MEMBER_NOT_FOUND', 'GROUP_MEMBERSHIP_NOT_FOUND', 'GROUP_NOT_FOUND'].includes(code)) return 404;
  if (['GROUP_MEMBERSHIP_EXISTS', 'GROUP_INVITATION_UNAVAILABLE', 'GROUP_INVITATION_EXPIRED', 'GROUP_TRANSFER_UNAVAILABLE'].includes(code)) return 409;
  if (['CREDITS_REQUIRED', 'GROUP_BALANCE_REQUIRED', 'GROUP_BUDGET_REQUIRED'].includes(code)) return 402;
  return 400;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'GET') {
    const account = getGroupAccountSummary(auth.user.id, { includeMembers: true, ledgerLimit: req.query?.limit });
    return json(res, 200, { ok: true, ...account, user: getUserProfile(auth.user.id) });
  }

  let body;
  try {
    body = await readJsonBody(req, { maxBytes: 64 * 1024 });
  } catch (error) {
    return json(res, error?.status || 400, { ok: false, error: error?.code || 'INVALID_GROUP_REQUEST' });
  }

  const action = String(body.action || '').trim();
  try {
    let result;
    if (action === 'create') {
      result = createGroupAccount(auth.user.id, body.name);
    } else if (action === 'fund') {
      result = fundGroupAccount(auth.user.id, body.amount, body.requestId);
    } else if (action === 'invite') {
      result = inviteGroupMember(auth.user.id, body.email);
    } else if (action === 'revoke-invitation') {
      result = revokeGroupInvitation(auth.user.id, String(body.invitationId || ''));
    } else if (action === 'respond-invitation') {
      result = respondGroupInvitation(auth.user.id, String(body.invitationId || ''), Boolean(body.accept));
    } else if (action === 'adjust-budget') {
      result = adjustGroupMemberBudget(auth.user.id, String(body.userId || ''), body.amount, body.requestId);
    } else if (action === 'member-status') {
      result = setGroupMemberStatus(auth.user.id, String(body.userId || ''), String(body.memberAction || ''));
    } else if (action === 'leave') {
      result = leaveGroupAccount(auth.user.id);
    } else if (action === 'request-admin-transfer') {
      result = requestGroupAdminTransfer(auth.user.id, String(body.userId || ''), body.currentPassword);
    } else if (action === 'respond-admin-transfer') {
      result = respondGroupAdminTransfer(auth.user.id, String(body.transferId || ''), Boolean(body.accept));
    } else {
      return json(res, 400, { ok: false, error: 'INVALID_GROUP_ACTION' });
    }
    return json(res, 200, { ok: true, ...result, user: result?.user || getUserProfile(auth.user.id) });
  } catch (error) {
    const code = error?.code || 'GROUP_OPERATION_FAILED';
    if (code === 'GROUP_OPERATION_FAILED') {
      console.warn('Group operation failed', {
        action,
        userId: auth.user.id,
        message: String(error?.message || 'unknown').slice(0, 240)
      });
    }
    return json(res, statusForError(code), { ok: false, error: code, user: getUserProfile(auth.user.id) });
  }
}
