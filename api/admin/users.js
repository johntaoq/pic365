import { authenticateRequest } from '../_lib/local-auth.js';
import { listAdminUsers } from '../_lib/local-db.js';
import { ADMIN_PERMISSIONS, roleHasPermission, USER_ROLES } from '../../shared/admin-permissions.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.status || 401, { ok: false, error: auth.error });
  }

  try {
    const canManageUsers = roleHasPermission(auth.user.role, ADMIN_PERMISSIONS.VIEW_USERS);
    const canAdjustCredits = roleHasPermission(auth.user.role, ADMIN_PERMISSIONS.ADJUST_CREDITS);
    if (!canManageUsers && !canAdjustCredits) {
      return json(res, 403, { ok: false, error: 'FORBIDDEN' });
    }
    const users = listAdminUsers(100);
    const visibleUsers = canManageUsers
      ? users
      : users
          .filter((user) => user.role === USER_ROLES.USER)
          .map((user) => ({
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
            adminNote: user.adminNote,
            role: user.role,
            status: user.status,
            creditBalance: user.creditBalance,
            usage: user.usage
          }));
    return json(res, 200, {
      ok: true,
      scope: canManageUsers ? 'user-management' : 'credit-management',
      users: visibleUsers
    });
  } catch (error) {
    if (error?.code === 'FORBIDDEN') return json(res, 403, { ok: false, error: 'FORBIDDEN' });
    console.warn('Failed to list admin users', {
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return json(res, 500, { ok: false, error: 'ADMIN_USERS_LOAD_FAILED' });
  }
}
