export const USER_ROLES = Object.freeze({
  USER: 'user',
  ACCOUNTANT: 'accountant',
  OPERATIONS: 'operations',
  SUPER_ADMIN: 'super_admin'
});

export const ADMIN_PERMISSIONS = Object.freeze({
  ACCESS_ADMIN: 'admin.access',
  VIEW_USERS: 'users.view',
  EDIT_USER_NOTE: 'users.edit_note',
  RESET_USER_PASSWORD: 'users.reset_password',
  MANAGE_USER_ROLES: 'users.manage_roles',
  MANAGE_SYSTEM_GROUPS: 'users.manage_system_groups',
  ADJUST_CREDITS: 'credits.adjust',
  VIEW_CREDIT_REPORTS: 'credits.reports',
  CREATE_REDEMPTION_CODES: 'redemption.create',
  REVEAL_REDEMPTION_CODES: 'redemption.reveal',
  VOID_REDEMPTION_CODES: 'redemption.void',
  MANAGE_CHANNELS: 'channels.manage',
  MANAGE_PRICING: 'pricing.manage',
  MANAGE_RECHARGE: 'recharge.manage',
  MANAGE_PROMOTIONS: 'promotions.manage',
  MANAGE_NOTIFICATIONS: 'notifications.manage',
  MANAGE_GLOBAL_SETTINGS: 'settings.manage_global',
  VIEW_FINANCE_AUDIT: 'audit.finance',
  VIEW_OPERATIONS_AUDIT: 'audit.operations',
  VIEW_ALL_AUDIT: 'audit.all',
  VIEW_METRICS: 'metrics.view'
});

const ACCOUNTANT_PERMISSIONS = [
  ADMIN_PERMISSIONS.ACCESS_ADMIN,
  ADMIN_PERMISSIONS.ADJUST_CREDITS,
  ADMIN_PERMISSIONS.VIEW_CREDIT_REPORTS,
  ADMIN_PERMISSIONS.CREATE_REDEMPTION_CODES,
  ADMIN_PERMISSIONS.REVEAL_REDEMPTION_CODES,
  ADMIN_PERMISSIONS.VIEW_FINANCE_AUDIT
];

const OPERATIONS_PERMISSIONS = [
  ADMIN_PERMISSIONS.ACCESS_ADMIN,
  ADMIN_PERMISSIONS.MANAGE_CHANNELS,
  ADMIN_PERMISSIONS.VIEW_OPERATIONS_AUDIT
];

const SUPER_ADMIN_PERMISSIONS = Object.values(ADMIN_PERMISSIONS);

export const ROLE_PERMISSIONS = Object.freeze({
  [USER_ROLES.USER]: Object.freeze([]),
  [USER_ROLES.ACCOUNTANT]: Object.freeze(ACCOUNTANT_PERMISSIONS),
  [USER_ROLES.OPERATIONS]: Object.freeze(OPERATIONS_PERMISSIONS),
  [USER_ROLES.SUPER_ADMIN]: Object.freeze(SUPER_ADMIN_PERMISSIONS)
});

export function normalizeUserRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return Object.values(USER_ROLES).includes(role) ? role : USER_ROLES.USER;
}

export function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[normalizeUserRole(role)] || [])];
}

export function roleHasPermission(role, permission) {
  return ROLE_PERMISSIONS[normalizeUserRole(role)]?.includes(permission) === true;
}

export function isAdministrativeRole(role) {
  return roleHasPermission(role, ADMIN_PERMISSIONS.ACCESS_ADMIN);
}

export const ROLE_LABELS = Object.freeze({
  [USER_ROLES.USER]: { zh: '普通用户', en: 'User' },
  [USER_ROLES.ACCOUNTANT]: { zh: '会计', en: 'Accountant' },
  [USER_ROLES.OPERATIONS]: { zh: '运维', en: 'Operations' },
  [USER_ROLES.SUPER_ADMIN]: { zh: '超级管理员', en: 'Super administrator' }
});
