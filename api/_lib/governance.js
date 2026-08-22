import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ADMIN_PERMISSIONS,
  normalizeUserRole,
  roleHasPermission,
  USER_ROLES
} from '../../shared/admin-permissions.js';
import {
  getDb,
  getRechargeConfig,
  getUserById,
  getUserProfile,
  hashPassword
} from './local-db.js';
import { decryptProviderSecret, encryptProviderSecret } from './provider-secrets.js';
import {
  getRegistrationEmailPolicy,
  normalizeRegistrationEmailPolicy,
  REGISTRATION_EMAIL_POLICY_SETTING_KEY
} from './registration-policy.js';

const GLOBAL_MENU_SETTING_KEY = 'global_menu_visibility';
const FREE_PURPOSES = new Set(['activity', 'compensation', 'account_opening', 'checkin', 'other']);
const PAID_SOURCES = new Set(['corporate', 'swx', 'szfb', 'other']);
const POSITIVE_CREDIT_REASONS = new Set(['corporate', 'swx', 'szfb', 'compensation', 'gift', 'manual_plus']);
const NEGATIVE_CREDIT_REASONS = new Set(['clearance', 'manual_minus']);
const FINANCE_AUDIT_CATEGORIES = new Set(['credits', 'redemption', 'finance']);
const OPERATIONS_AUDIT_CATEGORIES = new Set(['channels', 'operations']);
const AUDIT_SCOPE_CATEGORIES = Object.freeze({
  credits: ['credits'],
  'user-settings': ['users', 'roles'],
  redemption: ['redemption'],
  settings: ['settings'],
  channels: ['channels', 'operations']
});

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeBoolean(value, fallback = true) {
  return value == null ? fallback : value !== false && value !== 0 && value !== '0';
}

function cleanText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function actorSnapshot(user) {
  return {
    actorUserId: user?.id || null,
    actorRole: normalizeUserRole(user?.role),
    actorName: user?.fullName || '',
    actorEmail: user?.email || ''
  };
}

export function hasPermission(user, permission) {
  return Boolean(user?.id && roleHasPermission(user.role, permission));
}

export function requirePermission(user, permission) {
  if (!hasPermission(user, permission)) {
    throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' });
  }
  return user;
}

export function requestAuditMetadata(req) {
  return {
    ipAddress: cleanText(String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '').split(',')[0], 120),
    userAgent: cleanText(req?.headers?.['user-agent'], 500)
  };
}

export function recordAdminAuditEvent({ actorUserId, permission, category, action, entityType, entityId, before, after, reason, details, auditMeta = {} }) {
  const actor = permission ? requirePermission(getUserById(actorUserId), permission) : getUserById(actorUserId);
  if (!actor) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' });
  return insertAuditEvent({
    category, action, ...actorSnapshot(actor), entityType, entityId,
    before, after, reason, details, ...auditMeta
  });
}

export function insertAuditEvent(event, db = getDb()) {
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`
    INSERT INTO audit_events
      (id, category, action, result, actor_type, actor_user_id, actor_role,
       actor_name_snapshot, actor_email_snapshot, target_user_id, entity_type, entity_id,
       credit_ledger_id, credit_delta, balance_before, balance_after, amount_cents,
       reason, details, before_json, after_json, request_id, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    cleanText(event.category, 60),
    cleanText(event.action, 100),
    cleanText(event.result || 'success', 30),
    cleanText(event.actorType || 'user', 30),
    event.actorUserId || null,
    cleanText(event.actorRole, 40),
    cleanText(event.actorName, 120),
    cleanText(event.actorEmail, 320),
    event.targetUserId || null,
    cleanText(event.entityType, 80),
    cleanText(event.entityId, 160),
    event.creditLedgerId || null,
    Number.isFinite(Number(event.creditDelta)) ? Math.round(Number(event.creditDelta)) : null,
    Number.isFinite(Number(event.balanceBefore)) ? Math.round(Number(event.balanceBefore)) : null,
    Number.isFinite(Number(event.balanceAfter)) ? Math.round(Number(event.balanceAfter)) : null,
    Number.isFinite(Number(event.amountCents)) ? Math.round(Number(event.amountCents)) : null,
    cleanText(event.reason, 120),
    cleanText(event.details, 1000),
    JSON.stringify(event.before && typeof event.before === 'object' ? event.before : {}),
    JSON.stringify(event.after && typeof event.after === 'object' ? event.after : {}),
    cleanText(event.requestId, 160),
    cleanText(event.ipAddress, 120),
    cleanText(event.userAgent, 500),
    createdAt
  );
  return id;
}

export function getGlobalMenuSettings() {
  const row = getDb().prepare('SELECT value_json, updated_at FROM app_settings WHERE setting_key = ?').get(GLOBAL_MENU_SETTING_KEY);
  const value = parseJson(row?.value_json);
  return {
    templates: normalizeBoolean(value.templates, true),
    cases: normalizeBoolean(value.cases, true),
    api: normalizeBoolean(value.api, true),
    updatedAt: row?.updated_at || null
  };
}

export function updateGlobalMenuSettings(actorUserId, values = {}, auditMeta = {}) {
  const actor = requirePermission(getUserById(actorUserId), ADMIN_PERMISSIONS.MANAGE_GLOBAL_SETTINGS);
  const db = getDb();
  const previous = getGlobalMenuSettings();
  const next = {
    templates: normalizeBoolean(values.templates, previous.templates),
    cases: normalizeBoolean(values.cases, previous.cases),
    api: normalizeBoolean(values.api, previous.api)
  };
  const updatedAt = now();
  const actorData = actorSnapshot(actor);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).run(GLOBAL_MENU_SETTING_KEY, JSON.stringify(next), actor.id, updatedAt);
    db.prepare(`
      INSERT INTO app_setting_audit (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), GLOBAL_MENU_SETTING_KEY, JSON.stringify(previous), JSON.stringify(next), actor.id, updatedAt);
    insertAuditEvent({
      category: 'settings', action: 'global_menu_updated', ...actorData,
      entityType: 'app_setting', entityId: GLOBAL_MENU_SETTING_KEY,
      before: previous, after: next, ...auditMeta
    }, db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getGlobalMenuSettings();
}

export function updateRegistrationEmailPolicy(actorUserId, values = {}, auditMeta = {}) {
  const actor = requirePermission(getUserById(actorUserId), ADMIN_PERMISSIONS.MANAGE_GLOBAL_SETTINGS);
  const db = getDb();
  const previous = getRegistrationEmailPolicy();
  const normalized = normalizeRegistrationEmailPolicy(values);
  const next = {
    enabled: normalized.enabled,
    allowlist: normalized.allowlist,
    denylist: normalized.denylist
  };
  const updatedAt = now();
  const actorData = actorSnapshot(actor);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).run(REGISTRATION_EMAIL_POLICY_SETTING_KEY, JSON.stringify(next), actor.id, updatedAt);
    db.prepare(`
      INSERT INTO app_setting_audit (id, setting_key, previous_value_json, next_value_json, updated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), REGISTRATION_EMAIL_POLICY_SETTING_KEY, JSON.stringify(previous), JSON.stringify(next), actor.id, updatedAt);
    insertAuditEvent({
      category: 'settings', action: 'registration_email_policy_updated', ...actorData,
      entityType: 'app_setting', entityId: REGISTRATION_EMAIL_POLICY_SETTING_KEY,
      before: previous, after: next, ...auditMeta
    }, db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getRegistrationEmailPolicy();
}

export function getUserMenuPreferences(userId) {
  const row = userId ? getDb().prepare('SELECT * FROM user_ui_preferences WHERE user_id = ?').get(userId) : null;
  return {
    hideEcommerce: Boolean(row?.hide_ecommerce),
    hideTemplates: Boolean(row?.hide_templates),
    hideCases: Boolean(row?.hide_cases),
    hideApi: Boolean(row?.hide_api),
    updatedAt: row?.updated_at || null
  };
}

export function updateUserMenuPreferences(userId, values = {}) {
  if (!getUserById(userId)) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
  const previous = getUserMenuPreferences(userId);
  const next = {
    hideEcommerce: values.hideEcommerce == null ? previous.hideEcommerce : Boolean(values.hideEcommerce),
    hideTemplates: values.hideTemplates == null ? previous.hideTemplates : Boolean(values.hideTemplates),
    hideCases: values.hideCases == null ? previous.hideCases : Boolean(values.hideCases),
    hideApi: values.hideApi == null ? previous.hideApi : Boolean(values.hideApi)
  };
  const updatedAt = now();
  getDb().prepare(`
    INSERT INTO user_ui_preferences (user_id, hide_ecommerce, hide_templates, hide_cases, hide_api, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      hide_ecommerce = excluded.hide_ecommerce,
      hide_templates = excluded.hide_templates,
      hide_cases = excluded.hide_cases,
      hide_api = excluded.hide_api,
      updated_at = excluded.updated_at
  `).run(userId, Number(next.hideEcommerce), Number(next.hideTemplates), Number(next.hideCases), Number(next.hideApi), updatedAt);
  return getUserMenuPreferences(userId);
}

export function getEffectiveMenuSettings(userId = null) {
  const global = getGlobalMenuSettings();
  const personal = getUserMenuPreferences(userId);
  return {
    global,
    personal,
    effective: {
      ecommerce: !personal.hideEcommerce,
      templates: global.templates && !personal.hideTemplates,
      cases: global.cases && !personal.hideCases,
      api: global.api && !personal.hideApi
    }
  };
}

function countActiveSuperAdmins(db) {
  return Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin' AND status = 'active'").get()?.count || 0);
}

export function editManagedUser({ actorUserId, targetUserId, adminNote, password, role, auditMeta = {} }) {
  const actor = getUserById(actorUserId);
  requirePermission(actor, ADMIN_PERMISSIONS.VIEW_USERS);
  const db = getDb();
  const targetRow = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
  if (!targetRow) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
  const target = getUserById(targetUserId);
  const nextNote = adminNote == null ? String(targetRow.admin_note || '') : cleanText(adminNote, 160);
  const nextPassword = typeof password === 'string' ? password : '';
  const requestedRole = role == null ? target.role : normalizeUserRole(role);
  const noteChanged = nextNote !== String(targetRow.admin_note || '');
  const passwordChanged = Boolean(nextPassword);
  const roleChanged = requestedRole !== target.role;

  if (noteChanged) requirePermission(actor, ADMIN_PERMISSIONS.EDIT_USER_NOTE);
  if (passwordChanged) requirePermission(actor, ADMIN_PERMISSIONS.RESET_USER_PASSWORD);
  if (roleChanged) requirePermission(actor, ADMIN_PERMISSIONS.MANAGE_USER_ROLES);
  if (actor.role === USER_ROLES.ACCOUNTANT && target.role !== USER_ROLES.USER) {
    throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' });
  }
  if (passwordChanged && (nextPassword.length < 8 || nextPassword.length > 128)) {
    throw Object.assign(new Error('INVALID_PASSWORD'), { code: 'INVALID_PASSWORD' });
  }
  if (roleChanged && actor.id === target.id) {
    throw Object.assign(new Error('CANNOT_CHANGE_OWN_ROLE'), { code: 'CANNOT_CHANGE_OWN_ROLE' });
  }
  if (roleChanged && target.role === USER_ROLES.SUPER_ADMIN && requestedRole !== USER_ROLES.SUPER_ADMIN && countActiveSuperAdmins(db) <= 1) {
    throw Object.assign(new Error('LAST_SUPER_ADMIN_REQUIRED'), { code: 'LAST_SUPER_ADMIN_REQUIRED' });
  }
  if (!noteChanged && !passwordChanged && !roleChanged) return { user: { ...target, adminNote: nextNote }, changed: false };

  const updatedAt = now();
  const actorData = actorSnapshot(actor);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE users SET admin_note = ?, password_hash = CASE WHEN ? != '' THEN ? ELSE password_hash END,
        role = ?, updated_at = ? WHERE id = ?
    `).run(nextNote, nextPassword, passwordChanged ? hashPassword(nextPassword) : '', requestedRole, updatedAt, target.id);
    if (passwordChanged) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    insertAuditEvent({
      category: roleChanged ? 'roles' : 'users',
      action: roleChanged ? 'user_role_updated' : passwordChanged ? 'user_password_reset' : 'user_note_updated',
      ...actorData,
      targetUserId: target.id,
      entityType: 'user', entityId: target.id,
      before: { adminNote: targetRow.admin_note || '', role: target.role },
      after: { adminNote: nextNote, role: requestedRole, passwordReset: passwordChanged },
      ...auditMeta
    }, db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const updated = getUserById(target.id);
  return { user: { ...updated, adminNote: nextNote }, changed: true };
}

export function adjustManagedUserCredits({ actorUserId, targetUserId, amount, reasonCode, details, requestId, auditMeta = {} }) {
  const actor = requirePermission(getUserById(actorUserId), ADMIN_PERMISSIONS.ADJUST_CREDITS);
  const normalizedAmount = Number(amount);
  const normalizedRequestId = cleanText(requestId, 160);
  const normalizedDetails = cleanText(details, 500);
  if (!Number.isInteger(normalizedAmount) || !normalizedAmount || Math.abs(normalizedAmount) > 1_000_000 || !normalizedRequestId) {
    throw Object.assign(new Error('INVALID_CREDIT_ADJUSTMENT'), { code: 'INVALID_CREDIT_ADJUSTMENT' });
  }
  const allowedReasons = normalizedAmount > 0 ? POSITIVE_CREDIT_REASONS : NEGATIVE_CREDIT_REASONS;
  if (!allowedReasons.has(reasonCode) || !normalizedDetails) {
    throw Object.assign(new Error('CREDIT_REASON_REQUIRED'), { code: 'CREDIT_REASON_REQUIRED' });
  }
  const db = getDb();
  const duplicate = db.prepare("SELECT target_user_id FROM audit_events WHERE action = 'credit_adjustment' AND result = 'success' AND request_id = ?").get(normalizedRequestId);
  if (duplicate) return { user: getUserProfile(duplicate.target_user_id), duplicate: true };
  const target = getUserById(targetUserId);
  if (!target) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
  if (actor.id === target.id) throw Object.assign(new Error('CANNOT_ADJUST_SELF'), { code: 'CANNOT_ADJUST_SELF' });
  if (actor.role === USER_ROLES.ACCOUNTANT && target.role !== USER_ROLES.USER) {
    throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' });
  }
  const previousBalance = Number(target.creditBalance || 0);
  const nextBalance = previousBalance + normalizedAmount;
  if (nextBalance < 0) throw Object.assign(new Error('CREDITS_INSUFFICIENT'), { code: 'CREDITS_INSUFFICIENT' });
  const createdAt = now();
  const ledgerId = randomUUID();
  const actorData = actorSnapshot(actor);
  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare('UPDATE users SET credit_balance = ?, updated_at = ? WHERE id = ? AND credit_balance = ?')
      .run(nextBalance, createdAt, target.id, previousBalance);
    if (!update.changes) throw Object.assign(new Error('BALANCE_CHANGED'), { code: 'BALANCE_CHANGED' });
    db.prepare(`
      INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
      VALUES (?, ?, ?, 'adjustment', 'admin_adjustment', ?, ?, ?)
    `).run(ledgerId, target.id, normalizedAmount, normalizedRequestId, JSON.stringify({
      reasonCode, details: normalizedDetails, actorUserId: actor.id,
      actorName: actor.fullName || '', actorEmail: actor.email,
      previousBalance, nextBalance
    }), createdAt);
    insertAuditEvent({
      category: 'credits', action: 'credit_adjustment', ...actorData,
      targetUserId: target.id, entityType: 'credit_ledger', entityId: ledgerId,
      creditLedgerId: ledgerId, creditDelta: normalizedAmount,
      balanceBefore: previousBalance, balanceAfter: nextBalance,
      reason: reasonCode, details: normalizedDetails, requestId: normalizedRequestId,
      before: { creditBalance: previousBalance }, after: { creditBalance: nextBalance },
      ...auditMeta
    }, db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { user: getUserProfile(target.id), duplicate: false };
}

function normalizeRedemptionCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function redemptionCodeHash(value) {
  return createHash('sha256').update(normalizeRedemptionCode(value)).digest('hex');
}

function generatePlainRedemptionCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(15);
  let body = '';
  for (let index = 0; index < 15; index += 1) body += alphabet[bytes[index] % alphabet.length];
  return `PIC-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}`;
}

function maskRedemptionCode(value) {
  return `****-****-${String(value || '').slice(-5)}`;
}

function batchNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `RC-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function createRedemptionCodeBatch({ actorUserId, codeType, faceValueCents, quantity, freePurpose, paidSource, sourceDetail, note, paymentConfirmed, expiresAt, auditMeta = {} }) {
  const actor = requirePermission(getUserById(actorUserId), ADMIN_PERMISSIONS.CREATE_REDEMPTION_CODES);
  const type = codeType === 'paid' ? 'paid' : codeType === 'free' ? 'free' : '';
  const valueCents = Math.round(Number(faceValueCents));
  const count = Math.round(Number(quantity));
  const normalizedNote = cleanText(note, 500);
  const normalizedSourceDetail = cleanText(sourceDetail, 240);
  if (!type || !Number.isInteger(valueCents) || valueCents <= 0 || valueCents > 100_000_000 || !Number.isInteger(count) || count < 1 || count > 1000) {
    throw Object.assign(new Error('INVALID_REDEMPTION_BATCH'), { code: 'INVALID_REDEMPTION_BATCH' });
  }
  if (type === 'free' && (!FREE_PURPOSES.has(freePurpose) || !normalizedNote)) {
    throw Object.assign(new Error('FREE_CODE_NOTE_REQUIRED'), { code: 'FREE_CODE_NOTE_REQUIRED' });
  }
  if (type === 'paid' && (!PAID_SOURCES.has(paidSource) || (paidSource === 'other' && !normalizedSourceDetail))) {
    throw Object.assign(new Error('INVALID_PAID_CODE_SOURCE'), { code: 'INVALID_PAID_CODE_SOURCE' });
  }
  const expiration = expiresAt ? new Date(expiresAt) : null;
  if (expiration && (!Number.isFinite(expiration.getTime()) || expiration.getTime() <= Date.now())) {
    throw Object.assign(new Error('INVALID_EXPIRATION'), { code: 'INVALID_EXPIRATION' });
  }
  const db = getDb();
  const batchId = randomUUID();
  const number = batchNumber();
  const creditsPerYuan = Number(getRechargeConfig().creditsPerYuan || 100);
  const creditsPerCode = Math.round((valueCents / 100) * creditsPerYuan);
  const createdAt = now();
  const actorData = actorSnapshot(actor);
  const plainCodes = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO redemption_code_batches
        (id, batch_number, code_type, face_value_cents, credits_per_yuan, credits_per_code, quantity,
         free_purpose, paid_source, source_detail, note, payment_confirmed, expires_at, status,
         created_by, operator_name_snapshot, operator_email_snapshot, operator_role_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `).run(
      batchId, number, type, valueCents, creditsPerYuan, creditsPerCode, count,
      type === 'free' ? freePurpose : '', type === 'paid' ? paidSource : '',
      normalizedSourceDetail, normalizedNote, Number(type === 'paid' && paymentConfirmed),
      expiration?.toISOString() || null,
      actor.id, actor.fullName || '', actor.email || '', actor.role, createdAt
    );
    const insert = db.prepare(`
      INSERT INTO redemption_codes (id, batch_id, code_hash, code_ciphertext, code_masked, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'available', ?)
    `);
    for (let index = 0; index < count; index += 1) {
      let plainCode;
      let inserted = false;
      for (let attempt = 0; attempt < 8 && !inserted; attempt += 1) {
        plainCode = generatePlainRedemptionCode();
        try {
          insert.run(randomUUID(), batchId, redemptionCodeHash(plainCode), encryptProviderSecret(plainCode), maskRedemptionCode(plainCode), createdAt);
          inserted = true;
        } catch (error) {
          if (!String(error?.message || '').includes('UNIQUE')) throw error;
        }
      }
      if (!inserted) throw Object.assign(new Error('REDEMPTION_CODE_GENERATION_FAILED'), { code: 'REDEMPTION_CODE_GENERATION_FAILED' });
      plainCodes.push(plainCode);
    }
    insertAuditEvent({
      category: 'redemption', action: 'redemption_batch_created', ...actorData,
      entityType: 'redemption_batch', entityId: batchId,
      amountCents: valueCents * count,
      reason: type === 'free' ? freePurpose : paidSource,
      details: normalizedNote || normalizedSourceDetail,
      after: { batchNumber: number, codeType: type, faceValueCents: valueCents, creditsPerCode, quantity: count, paymentConfirmed: Boolean(paymentConfirmed), expiresAt: expiration?.toISOString() || null },
      ...auditMeta
    }, db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { batch: getRedemptionBatch(batchId), codes: plainCodes };
}

function effectiveRedemptionCodeStatus(row) {
  if (!row) return '';
  return row.status === 'available' && row.disabled_at ? 'disabled' : row.status;
}

function normalizeCodeRow(row, { includePlain = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    batchId: row.batch_id,
    batchNumber: row.batch_number || '',
    codeType: row.code_type || '',
    faceValueCents: Number(row.face_value_cents || 0),
    creditsPerCode: Number(row.credits_per_code || 0),
    operatorName: row.operator_name_snapshot || '',
    operatorEmail: row.operator_email_snapshot || '',
    maskedCode: row.code_masked,
    code: includePlain ? decryptProviderSecret(row.code_ciphertext) : undefined,
    status: effectiveRedemptionCodeStatus(row),
    redeemedBy: row.redeemed_by || '',
    redeemedAt: row.redeemed_at || null,
    disabledAt: row.disabled_at || null,
    voidedAt: row.voided_at || null,
    voidReason: row.void_reason || '',
    createdAt: row.created_at
  };
}

export function getRedemptionBatch(batchId) {
  const row = getDb().prepare(`
    SELECT batch.*,
      SUM(CASE WHEN code.status = 'available' AND code.disabled_at IS NULL THEN 1 ELSE 0 END) AS available_count,
      SUM(CASE WHEN code.status = 'available' AND code.disabled_at IS NOT NULL THEN 1 ELSE 0 END) AS disabled_count,
      SUM(CASE WHEN code.status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed_count,
      SUM(CASE WHEN code.status = 'voided' THEN 1 ELSE 0 END) AS voided_count,
      SUM(CASE WHEN code.status = 'expired' THEN 1 ELSE 0 END) AS expired_count
    FROM redemption_code_batches batch
    LEFT JOIN redemption_codes code ON code.batch_id = batch.id
    WHERE batch.id = ? GROUP BY batch.id
  `).get(batchId);
  if (!row) return null;
  return {
    id: row.id, batchNumber: row.batch_number, codeType: row.code_type,
    faceValueCents: Number(row.face_value_cents), creditsPerYuan: Number(row.credits_per_yuan),
    creditsPerCode: Number(row.credits_per_code), quantity: Number(row.quantity),
    freePurpose: row.free_purpose, paidSource: row.paid_source, sourceDetail: row.source_detail,
    note: row.note, paymentConfirmed: Boolean(row.payment_confirmed), expiresAt: row.expires_at,
    status: row.status, createdBy: row.created_by,
    operatorName: row.operator_name_snapshot, operatorEmail: row.operator_email_snapshot,
    operatorRole: row.operator_role_snapshot, createdAt: row.created_at,
    counts: {
      available: Number(row.available_count || 0), redeemed: Number(row.redeemed_count || 0),
      disabled: Number(row.disabled_count || 0), voided: Number(row.voided_count || 0),
      expired: Number(row.expired_count || 0)
    }
  };
}

export function listRedemptionBatches({ limit = 100, offset = 0 } = {}) {
  const rows = getDb().prepare('SELECT id FROM redemption_code_batches ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(Math.max(1, Math.min(200, Number(limit) || 100)), Math.max(0, Number(offset) || 0));
  return rows.map((row) => getRedemptionBatch(row.id));
}

export function listRedemptionCodes(batchId = '', { limit = 200, offset = 0 } = {}) {
  const normalizedBatchId = cleanText(batchId, 120);
  const cappedLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const sql = `
    SELECT code.*, batch.batch_number, batch.code_type, batch.face_value_cents,
      batch.credits_per_code, batch.operator_name_snapshot, batch.operator_email_snapshot
    FROM redemption_codes code
    JOIN redemption_code_batches batch ON batch.id = code.batch_id
    ${normalizedBatchId ? 'WHERE code.batch_id = ?' : ''}
    ORDER BY code.created_at DESC, code.id DESC
    LIMIT ? OFFSET ?
  `;
  const rows = normalizedBatchId
    ? getDb().prepare(sql).all(normalizedBatchId, cappedLimit, safeOffset)
    : getDb().prepare(sql).all(cappedLimit, safeOffset);
  return rows.map((row) => normalizeCodeRow(row));
}

export function revealRedemptionCode({ actorUserId, codeId, auditMeta = {} }) {
  const actor = requirePermission(getUserById(actorUserId), ADMIN_PERMISSIONS.REVEAL_REDEMPTION_CODES);
  const row = getDb().prepare('SELECT * FROM redemption_codes WHERE id = ?').get(codeId);
  if (!row) throw Object.assign(new Error('REDEMPTION_CODE_NOT_FOUND'), { code: 'REDEMPTION_CODE_NOT_FOUND' });
  insertAuditEvent({
    category: 'redemption', action: 'redemption_code_revealed', ...actorSnapshot(actor),
    entityType: 'redemption_code', entityId: row.id,
    after: { maskedCode: row.code_masked, batchId: row.batch_id }, ...auditMeta
  });
  return normalizeCodeRow(row, { includePlain: true });
}

export function setRedemptionCodeStatus({ actorUserId, codeId, nextStatus, reason = '', auditMeta = {} }) {
  const requestedStatus = cleanText(nextStatus, 40);
  const permission = requestedStatus === 'voided'
    ? ADMIN_PERMISSIONS.VOID_REDEMPTION_CODES
    : ADMIN_PERMISSIONS.CREATE_REDEMPTION_CODES;
  const actor = requirePermission(getUserById(actorUserId), permission);
  if (!['available', 'disabled', 'voided'].includes(requestedStatus)) {
    throw Object.assign(new Error('INVALID_REDEMPTION_CODE_STATUS'), { code: 'INVALID_REDEMPTION_CODE_STATUS' });
  }
  const normalizedReason = cleanText(reason, 500);
  const db = getDb();
  const row = db.prepare('SELECT * FROM redemption_codes WHERE id = ?').get(codeId);
  if (!row) throw Object.assign(new Error('REDEMPTION_CODE_NOT_FOUND'), { code: 'REDEMPTION_CODE_NOT_FOUND' });
  const previousStatus = effectiveRedemptionCodeStatus(row);
  const allowed = (previousStatus === 'available' && requestedStatus === 'disabled')
    || (previousStatus === 'disabled' && ['available', 'voided'].includes(requestedStatus));
  if (!allowed) {
    throw Object.assign(new Error('INVALID_REDEMPTION_CODE_STATUS_TRANSITION'), { code: 'INVALID_REDEMPTION_CODE_STATUS_TRANSITION' });
  }
  const changedAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    let changed;
    if (requestedStatus === 'disabled') {
      changed = db.prepare("UPDATE redemption_codes SET disabled_by = ?, disabled_at = ? WHERE id = ? AND status = 'available' AND disabled_at IS NULL")
        .run(actor.id, changedAt, row.id);
    } else if (requestedStatus === 'available') {
      changed = db.prepare("UPDATE redemption_codes SET disabled_by = NULL, disabled_at = NULL WHERE id = ? AND status = 'available' AND disabled_at IS NOT NULL")
        .run(row.id);
    } else {
      changed = db.prepare("UPDATE redemption_codes SET status = 'voided', disabled_by = NULL, disabled_at = NULL, voided_by = ?, voided_at = ?, void_reason = ? WHERE id = ? AND status = 'available' AND disabled_at IS NOT NULL")
        .run(actor.id, changedAt, normalizedReason, row.id);
    }
    if (!changed.changes) {
      throw Object.assign(new Error('INVALID_REDEMPTION_CODE_STATUS_TRANSITION'), { code: 'INVALID_REDEMPTION_CODE_STATUS_TRANSITION' });
    }
    const action = requestedStatus === 'disabled'
      ? 'redemption_code_disabled'
      : requestedStatus === 'available'
        ? 'redemption_code_enabled'
        : 'redemption_code_voided';
    insertAuditEvent({
      category: 'redemption', action, ...actorSnapshot(actor),
      entityType: 'redemption_code', entityId: row.id,
      reason: requestedStatus, details: normalizedReason,
      before: { status: previousStatus }, after: { status: requestedStatus }, ...auditMeta
    }, db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return normalizeCodeRow(db.prepare('SELECT * FROM redemption_codes WHERE id = ?').get(row.id));
}

export function voidRedemptionCode({ actorUserId, codeId, reason, auditMeta = {} }) {
  return setRedemptionCodeStatus({ actorUserId, codeId, nextStatus: 'voided', reason, auditMeta });
}

export function redeemCode({ userId, code, requestId = '', auditMeta = {} }) {
  const user = getUserById(userId);
  if (!user) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' });
  const codeHash = redemptionCodeHash(code);
  if (!codeHash || normalizeRedemptionCode(code).length < 12) throw Object.assign(new Error('REDEMPTION_CODE_UNAVAILABLE'), { code: 'REDEMPTION_CODE_UNAVAILABLE' });
  const db = getDb();
  const redeemedAt = now();
  let transactionOpen = false;
  db.exec('BEGIN IMMEDIATE');
  transactionOpen = true;
  try {
    const row = db.prepare(`
      SELECT code.*, batch.code_type, batch.credits_per_code, batch.face_value_cents, batch.expires_at, batch.status AS batch_status,
        batch.free_purpose, batch.paid_source
      FROM redemption_codes code JOIN redemption_code_batches batch ON batch.id = code.batch_id
      WHERE code.code_hash = ?
    `).get(codeHash);
    if (!row || row.status !== 'available' || row.disabled_at || row.batch_status !== 'active') {
      throw Object.assign(new Error('REDEMPTION_CODE_UNAVAILABLE'), { code: 'REDEMPTION_CODE_UNAVAILABLE' });
    }
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
      db.prepare("UPDATE redemption_codes SET status = 'expired' WHERE id = ? AND status = 'available'").run(row.id);
      insertAuditEvent({
        category: 'redemption', action: 'redemption_code_expired', ...actorSnapshot(user),
        targetUserId: user.id, entityType: 'redemption_code', entityId: row.id,
        reason: 'expired', before: { status: 'available' }, after: { status: 'expired' }, ...auditMeta
      }, db);
      db.exec('COMMIT');
      transactionOpen = false;
      throw Object.assign(new Error('REDEMPTION_CODE_UNAVAILABLE'), { code: 'REDEMPTION_CODE_UNAVAILABLE' });
    }
    const beforeBalance = Number(db.prepare('SELECT credit_balance FROM users WHERE id = ?').get(user.id)?.credit_balance || 0);
    const credits = Number(row.credits_per_code || 0);
    const afterBalance = beforeBalance + credits;
    const updated = db.prepare("UPDATE redemption_codes SET status = 'redeemed', redeemed_by = ?, redeemed_at = ? WHERE id = ? AND status = 'available' AND disabled_at IS NULL")
      .run(user.id, redeemedAt, row.id);
    if (!updated.changes) throw Object.assign(new Error('REDEMPTION_CODE_UNAVAILABLE'), { code: 'REDEMPTION_CODE_UNAVAILABLE' });
    db.prepare('UPDATE users SET credit_balance = ?, updated_at = ? WHERE id = ?').run(afterBalance, redeemedAt, user.id);
    const ledgerId = randomUUID();
    db.prepare(`
      INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
      VALUES (?, ?, ?, 'redemption', ?, ?, ?, ?)
    `).run(ledgerId, user.id, credits, row.code_type === 'paid' ? 'paid_code' : 'free_code', row.id, JSON.stringify({
      batchId: row.batch_id, codeType: row.code_type, faceValueCents: row.face_value_cents,
      purpose: row.free_purpose || '', paidSource: row.paid_source || ''
    }), redeemedAt);
    insertAuditEvent({
      category: 'redemption', action: 'redemption_code_redeemed', ...actorSnapshot(user),
      targetUserId: user.id, entityType: 'redemption_code', entityId: row.id,
      creditLedgerId: ledgerId, creditDelta: credits,
      balanceBefore: beforeBalance, balanceAfter: afterBalance,
      amountCents: row.face_value_cents,
      reason: row.code_type === 'paid' ? row.paid_source : row.free_purpose,
      requestId: cleanText(requestId, 160), after: { status: 'redeemed', batchId: row.batch_id }, ...auditMeta
    }, db);
    db.exec('COMMIT');
    transactionOpen = false;
    return { credits, user: getUserProfile(user.id), codeType: row.code_type };
  } catch (error) {
    if (transactionOpen) db.exec('ROLLBACK');
    throw error;
  }
}

export function getRedemptionFinancialReport() {
  const rows = getDb().prepare(`
    SELECT batch.code_type, batch.free_purpose, batch.paid_source,
      COUNT(code.id) AS generated_count,
      SUM(CASE WHEN code.status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed_count,
      SUM(CASE WHEN code.status = 'available' AND code.disabled_at IS NULL THEN 1 ELSE 0 END) AS available_count,
      SUM(CASE WHEN code.status = 'available' AND code.disabled_at IS NOT NULL THEN 1 ELSE 0 END) AS disabled_count,
      SUM(CASE WHEN code.status = 'voided' THEN 1 ELSE 0 END) AS voided_count,
      SUM(CASE WHEN code.status = 'redeemed' THEN batch.face_value_cents ELSE 0 END) AS redeemed_cents,
      SUM(CASE WHEN code.status = 'available' AND code.disabled_at IS NULL THEN batch.face_value_cents ELSE 0 END) AS available_cents,
      SUM(CASE WHEN code.status = 'available' AND code.disabled_at IS NOT NULL THEN batch.face_value_cents ELSE 0 END) AS disabled_cents,
      SUM(CASE WHEN code.status = 'voided' THEN batch.face_value_cents ELSE 0 END) AS voided_cents,
      SUM(CASE WHEN code.status = 'redeemed' THEN batch.credits_per_code ELSE 0 END) AS redeemed_credits
    FROM redemption_code_batches batch
    JOIN redemption_codes code ON code.batch_id = batch.id
    GROUP BY batch.code_type, batch.free_purpose, batch.paid_source
    ORDER BY batch.code_type, batch.free_purpose, batch.paid_source
  `).all();
  return rows.map((row) => ({
    codeType: row.code_type, purpose: row.free_purpose || '', paidSource: row.paid_source || '',
    generatedCount: Number(row.generated_count || 0), redeemedCount: Number(row.redeemed_count || 0),
    availableCount: Number(row.available_count || 0), disabledCount: Number(row.disabled_count || 0),
    voidedCount: Number(row.voided_count || 0),
    redeemedCents: Number(row.redeemed_cents || 0), availableCents: Number(row.available_cents || 0),
    disabledCents: Number(row.disabled_cents || 0), voidedCents: Number(row.voided_cents || 0),
    redeemedCredits: Number(row.redeemed_credits || 0)
  }));
}

export function getCreditAdjustmentFinancialReport() {
  return getDb().prepare(`
    SELECT reason,
      COUNT(*) AS adjustment_count,
      COUNT(DISTINCT target_user_id) AS affected_users,
      SUM(CASE WHEN credit_delta > 0 THEN credit_delta ELSE 0 END) AS credits_added,
      SUM(CASE WHEN credit_delta < 0 THEN ABS(credit_delta) ELSE 0 END) AS credits_removed,
      SUM(COALESCE(credit_delta, 0)) AS net_credits
    FROM audit_events
    WHERE action = 'credit_adjustment' AND result = 'success'
    GROUP BY reason
    ORDER BY reason
  `).all().map((row) => ({
    reason: row.reason || '',
    adjustmentCount: Number(row.adjustment_count || 0),
    affectedUsers: Number(row.affected_users || 0),
    creditsAdded: Number(row.credits_added || 0),
    creditsRemoved: Number(row.credits_removed || 0),
    netCredits: Number(row.net_credits || 0)
  }));
}

export function getFinancialGovernanceReport() {
  const redemption = getRedemptionFinancialReport();
  const creditAdjustments = getCreditAdjustmentFinancialReport();
  return {
    generatedAt: now(),
    redemption,
    creditAdjustments,
    totals: {
      paidCodeRedeemedCents: redemption
        .filter((row) => row.codeType === 'paid')
        .reduce((total, row) => total + row.redeemedCents, 0),
      freeCodeRedeemedCredits: redemption
        .filter((row) => row.codeType === 'free')
        .reduce((total, row) => total + row.redeemedCredits, 0),
      paidCodeRedeemedCredits: redemption
        .filter((row) => row.codeType === 'paid')
        .reduce((total, row) => total + row.redeemedCredits, 0),
      manualCreditsAdded: creditAdjustments.reduce((total, row) => total + row.creditsAdded, 0),
      manualCreditsRemoved: creditAdjustments.reduce((total, row) => total + row.creditsRemoved, 0),
      manualCreditsNet: creditAdjustments.reduce((total, row) => total + row.netCredits, 0)
    }
  };
}

export function listAuditEventsForUser(actorUserId, { category = '', scope = '', limit = 200, offset = 0 } = {}) {
  const actor = getUserById(actorUserId);
  const canAll = hasPermission(actor, ADMIN_PERMISSIONS.VIEW_ALL_AUDIT);
  const canFinance = hasPermission(actor, ADMIN_PERMISSIONS.VIEW_FINANCE_AUDIT);
  const canOperations = hasPermission(actor, ADMIN_PERMISSIONS.VIEW_OPERATIONS_AUDIT);
  if (!canAll && !canFinance && !canOperations) throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' });
  const requested = cleanText(category, 60);
  const requestedScope = cleanText(scope, 60);
  if (requestedScope && !AUDIT_SCOPE_CATEGORIES[requestedScope]) {
    throw Object.assign(new Error('INVALID_AUDIT_SCOPE'), { code: 'INVALID_AUDIT_SCOPE' });
  }
  let allowedCategories = null;
  if (!canAll) allowedCategories = canFinance ? FINANCE_AUDIT_CATEGORIES : OPERATIONS_AUDIT_CATEGORIES;
  if (requested && allowedCategories && !allowedCategories.has(requested)) throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' });
  const scopedCategories = requestedScope ? AUDIT_SCOPE_CATEGORIES[requestedScope] : [];
  if (scopedCategories.length && allowedCategories && scopedCategories.some((item) => !allowedCategories.has(item))) {
    throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' });
  }
  const where = [];
  const params = [];
  if (scopedCategories.length) {
    where.push(`category IN (${scopedCategories.map(() => '?').join(',')})`);
    params.push(...scopedCategories);
  } else if (requested) {
    where.push('category = ?');
    params.push(requested);
  } else if (allowedCategories) {
    where.push(`category IN (${[...allowedCategories].map(() => '?').join(',')})`);
    params.push(...allowedCategories);
  }
  params.push(Math.max(1, Math.min(500, Number(limit) || 200)), Math.max(0, Number(offset) || 0));
  return getDb().prepare(`
    SELECT * FROM audit_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params).map((row) => ({
    id: row.id, category: row.category, action: row.action, result: row.result,
    actorUserId: row.actor_user_id || '', actorRole: row.actor_role,
    actorName: row.actor_name_snapshot, actorEmail: row.actor_email_snapshot,
    targetUserId: row.target_user_id || '', entityType: row.entity_type, entityId: row.entity_id,
    creditDelta: row.credit_delta == null ? null : Number(row.credit_delta),
    balanceBefore: row.balance_before == null ? null : Number(row.balance_before),
    balanceAfter: row.balance_after == null ? null : Number(row.balance_after),
    amountCents: row.amount_cents == null ? null : Number(row.amount_cents),
    reason: row.reason, details: row.details,
    before: parseJson(row.before_json), after: parseJson(row.after_json),
    requestId: row.request_id, ipAddress: row.ip_address, userAgent: row.user_agent,
    createdAt: row.created_at
  }));
}

export const REDEMPTION_OPTIONS = Object.freeze({
  freePurposes: [...FREE_PURPOSES],
  paidSources: [...PAID_SOURCES],
  positiveCreditReasons: [...POSITIVE_CREDIT_REASONS],
  negativeCreditReasons: [...NEGATIVE_CREDIT_REASONS]
});
