import {
  getDb,
  getUserById,
  getUserProfile,
  hashPassword,
  hashSessionToken,
  verifyPassword
} from './local-db.js';
import { insertAuditEvent } from './governance.js';

export function changeOwnPassword({
  userId,
  currentPassword,
  newPassword,
  currentSessionToken = '',
  auditMeta = {}
}) {
  const db = getDb();
  const rawUser = db.prepare('SELECT * FROM users WHERE id = ? AND status = ?').get(userId, 'active');
  if (!rawUser) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' });
  if (!verifyPassword(currentPassword, rawUser.password_hash)) {
    throw Object.assign(new Error('INVALID_CURRENT_PASSWORD'), { code: 'INVALID_CURRENT_PASSWORD' });
  }
  if (verifyPassword(newPassword, rawUser.password_hash)) {
    throw Object.assign(new Error('PASSWORD_UNCHANGED'), { code: 'PASSWORD_UNCHANGED' });
  }

  const actor = getUserById(userId);
  const changedAt = new Date().toISOString();
  const currentTokenHash = currentSessionToken ? hashSessionToken(currentSessionToken) : '';
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(newPassword), changedAt, userId);
    const revokedSessions = currentTokenHash
      ? db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, currentTokenHash).changes
      : db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
    insertAuditEvent({
      category: 'users',
      action: 'password_changed',
      result: 'success',
      actorType: 'user',
      actorUserId: actor.id,
      actorRole: actor.role,
      actorName: actor.fullName,
      actorEmail: actor.email,
      targetUserId: actor.id,
      entityType: 'users',
      entityId: actor.id,
      reason: 'self_service_password_change',
      details: 'Password changed after current-password verification.',
      before: { otherSessionsRevoked: false },
      after: { otherSessionsRevoked: revokedSessions > 0 },
      ...auditMeta
    }, db);
    db.exec('COMMIT');
    return { user: getUserProfile(userId), revokedSessions };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
