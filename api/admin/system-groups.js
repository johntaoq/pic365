import { authenticateRequest } from '../_lib/local-auth.js';
import {
  deleteSystemUserGroup,
  getSystemUserGroup,
  listImageProviderConfigs,
  listSystemChannelCatalog,
  listSystemUserGroups,
  saveSystemUserGroup
} from '../_lib/local-db.js';
import { listChatProviderConfigs } from '../_lib/chat-engine.js';
import { listVideoProviderConfigs } from '../_lib/video-provider-config.js';
import { readJsonBody } from '../_lib/request.js';
import { recordAdminAuditEvent, requestAuditMetadata, requirePermission } from '../_lib/governance.js';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';

function clean(value, length = 500) {
  return String(value || '').trim().slice(0, length);
}

function loadPayload() {
  listImageProviderConfigs({ admin: true });
  listVideoProviderConfigs({ admin: true });
  listChatProviderConfigs({ admin: true });
  return {
    groups: listSystemUserGroups(),
    channels: listSystemChannelCatalog()
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_SYSTEM_GROUPS);
    if (req.method === 'GET') return res.status(200).json({ ok: true, ...loadPayload() });

    const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
    if (req.method === 'DELETE') {
      const id = clean(body.id || req.query?.id, 80);
      const before = getSystemUserGroup(id);
      const deleted = deleteSystemUserGroup(id);
      if (!deleted) return res.status(404).json({ ok: false, error: 'SYSTEM_GROUP_NOT_FOUND' });
      recordAdminAuditEvent({
        actorUserId: auth.user.id,
        permission: ADMIN_PERMISSIONS.MANAGE_SYSTEM_GROUPS,
        category: 'users',
        action: 'system_user_group_deleted',
        entityType: 'system_user_group',
        entityId: id,
        before: before || {},
        after: {},
        auditMeta: requestAuditMetadata(req)
      });
      return res.status(200).json({ ok: true, ...loadPayload() });
    }

    const id = clean(body.id, 80);
    const before = id ? getSystemUserGroup(id) : null;
    const group = saveSystemUserGroup({
      id,
      name: clean(body.name, 80),
      description: clean(body.description, 500),
      channels: body.channels
    });
    recordAdminAuditEvent({
      actorUserId: auth.user.id,
      permission: ADMIN_PERMISSIONS.MANAGE_SYSTEM_GROUPS,
      category: 'users',
      action: before ? 'system_user_group_updated' : 'system_user_group_created',
      entityType: 'system_user_group',
      entityId: group.id,
      before: before || {},
      after: group,
      auditMeta: requestAuditMetadata(req)
    });
    return res.status(before ? 200 : 201).json({ ok: true, group, ...loadPayload() });
  } catch (error) {
    const code = error?.code || 'SYSTEM_GROUP_UPDATE_FAILED';
    const status = code === 'FORBIDDEN' ? 403
      : code === 'SYSTEM_GROUP_NOT_FOUND' ? 404
        : 400;
    return res.status(status).json({ ok: false, error: code });
  }
}
