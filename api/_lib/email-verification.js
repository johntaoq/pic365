import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { getDb, getUserByEmail, getUserProfile, hashPassword, normalizeEmail } from './local-db.js';

const REGISTRATION_PURPOSE = 'register';
const PASSWORD_RESET_PURPOSE = 'password_reset';
const DEFAULT_EXPIRES_MINUTES = 10;
const DEFAULT_RESEND_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 5;

function integerEnv(name, fallback, minimum, maximum) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function expiresMinutes() {
  return integerEnv('EMAIL_VERIFICATION_EXPIRES_MINUTES', DEFAULT_EXPIRES_MINUTES, 3, 30);
}

function resendSeconds() {
  return integerEnv('EMAIL_VERIFICATION_RESEND_SECONDS', DEFAULT_RESEND_SECONDS, 30, 600);
}

function verificationSecret() {
  const configured = String(process.env.EMAIL_VERIFICATION_SECRET || process.env.SESSION_SECRET || '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return 'pic365-local-email-verification-only';
  const error = new Error('EMAIL_VERIFICATION_NOT_CONFIGURED');
  error.code = 'EMAIL_VERIFICATION_NOT_CONFIGURED';
  throw error;
}

function hashCode(email, code, purpose = REGISTRATION_PURPOSE) {
  return createHmac('sha256', verificationSecret())
    .update(`${purpose}:${normalizeEmail(email)}:${String(code || '')}`)
    .digest('hex');
}

function equalHash(left, right) {
  try {
    const a = Buffer.from(String(left || ''), 'hex');
    const b = Buffer.from(String(right || ''), 'hex');
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verificationError(code, metadata = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, metadata);
  return error;
}

function smtpOptions() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true';
  const port = integerEnv('SMTP_PORT', secure ? 465 : 587, 1, 65535);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASSWORD || '');
  const from = String(process.env.SMTP_FROM || '').trim();
  const requireTLS = String(process.env.SMTP_REQUIRE_TLS || '').trim().toLowerCase() === 'true';
  const ignoreTLS = String(process.env.SMTP_IGNORE_TLS || '').trim().toLowerCase() === 'true';
  const rejectUnauthorized = String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').trim().toLowerCase() !== 'false';
  const authMethod = String(process.env.SMTP_AUTH_METHOD || '').trim();
  if (!host || !from || Boolean(user) !== Boolean(pass)) return null;
  return {
    from,
    transport: {
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
      authMethod: authMethod || undefined,
      requireTLS,
      ignoreTLS,
      tls: { rejectUnauthorized }
    }
  };
}

function localPreviewEnabled() {
  if (process.env.NODE_ENV !== 'production') return !smtpOptions();
  return process.env.PIC365_ALLOW_TEST_EMAIL_TRANSPORT === 'true'
    && process.env.EMAIL_VERIFICATION_TRANSPORT === 'test';
}

function emailContent({ code, language, minutes, purpose = REGISTRATION_PURPOSE }) {
  const isEnglish = language === 'en';
  const passwordReset = purpose === PASSWORD_RESET_PURPOSE;
  const subject = passwordReset
    ? (isEnglish ? 'Pic365 password reset code' : '图简单 Pic365 密码重置验证码')
    : (isEnglish ? 'Pic365 email verification code' : '图简单 Pic365 邮箱验证码');
  const intro = passwordReset
    ? (isEnglish ? 'Use this code to reset your Pic365 password:' : '请使用以下验证码重置图简单 Pic365 账户密码：')
    : (isEnglish ? 'Use this code to finish creating your Pic365 account:' : '请使用以下验证码完成图简单 Pic365 账户注册：');
  const expiry = isEnglish ? `The code expires in ${minutes} minutes.` : `验证码将在 ${minutes} 分钟后失效。`;
  const warning = isEnglish ? 'If you did not request this code, ignore this email.' : '如果不是你本人操作，请忽略此邮件。';
  return {
    subject,
    text: `${intro}\n\n${code}\n\n${expiry}\n${warning}`,
    html: `<!doctype html><html><body style="margin:0;background:#07101f;color:#eaf3ff;font-family:Arial,'Microsoft YaHei',sans-serif"><div style="max-width:520px;margin:32px auto;padding:32px;border:1px solid #29405b;border-radius:18px;background:#0d1728"><div style="font-size:14px;color:#91f2d0;letter-spacing:.12em">PIC365</div><h1 style="font-size:22px;margin:12px 0 20px">${subject}</h1><p style="color:#c8d4e5;line-height:1.7">${intro}</p><div style="margin:24px 0;padding:18px;border-radius:12px;background:#101f33;text-align:center;font-size:34px;font-weight:800;letter-spacing:.24em;color:#9ff4d7">${code}</div><p style="color:#aebdd1;line-height:1.7">${expiry}<br>${warning}</p></div></body></html>`
  };
}

async function deliverCode({ email, code, language, minutes, purpose = REGISTRATION_PURPOSE }) {
  if (localPreviewEnabled()) return { previewCode: code };
  const smtp = smtpOptions();
  if (!smtp) throw verificationError('EMAIL_NOT_CONFIGURED');
  const transporter = nodemailer.createTransport(smtp.transport);
  const content = emailContent({ code, language, minutes, purpose });
  try {
    await transporter.sendMail({ from: smtp.from, to: email, ...content });
    return { previewCode: '' };
  } catch (error) {
    console.warn('Failed to send email verification code', {
      purpose,
      code: String(error?.code || 'SMTP_FAILED').slice(0, 80),
      message: String(error?.message || 'unknown').slice(0, 200)
    });
    throw verificationError('EMAIL_SEND_FAILED');
  }
}

export async function issueRegistrationVerificationCode(emailValue, { language = 'zh' } = {}) {
  const email = normalizeEmail(emailValue);
  if (getUserByEmail(email)) throw verificationError('EMAIL_ALREADY_REGISTERED');
  const db = getDb();
  const latest = db.prepare(`
    SELECT created_at FROM email_verification_codes
    WHERE email = ? AND purpose = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(email, REGISTRATION_PURPOSE);
  const cooldownMs = resendSeconds() * 1000;
  const elapsed = latest?.created_at ? Date.now() - Date.parse(latest.created_at) : cooldownMs;
  if (Number.isFinite(elapsed) && elapsed < cooldownMs) {
    throw verificationError('VERIFICATION_CODE_COOLDOWN', {
      retryAfterSeconds: Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000))
    });
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const createdAt = new Date().toISOString();
  const minutes = expiresMinutes();
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const id = `email-${randomUUID()}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE email_verification_codes SET consumed_at = ?
      WHERE email = ? AND purpose = ? AND consumed_at IS NULL
    `).run(createdAt, email, REGISTRATION_PURPOSE);
    db.prepare(`
      INSERT INTO email_verification_codes
        (id, email, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, NULL, ?)
    `).run(id, email, REGISTRATION_PURPOSE, hashCode(email, code, REGISTRATION_PURPOSE), DEFAULT_MAX_ATTEMPTS, expiresAt, createdAt);
    db.prepare(`
      DELETE FROM email_verification_codes
      WHERE expires_at < ? AND created_at < ?
    `).run(createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  try {
    const delivery = await deliverCode({ email, code, language, minutes, purpose: REGISTRATION_PURPOSE });
    return {
      expiresInSeconds: minutes * 60,
      resendAfterSeconds: resendSeconds(),
      previewCode: delivery.previewCode || ''
    };
  } catch (error) {
    db.prepare('UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    throw error;
  }
}

export function consumeRegistrationVerificationCode(emailValue, codeValue) {
  const email = normalizeEmail(emailValue);
  const code = String(codeValue || '').trim();
  if (!/^\d{6}$/.test(code)) throw verificationError('VERIFICATION_CODE_REQUIRED');
  const db = getDb();
  const consumedAt = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare(`
      SELECT * FROM email_verification_codes
      WHERE email = ? AND purpose = ? AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(email, REGISTRATION_PURPOSE);
    if (!row) {
      db.exec('ROLLBACK');
      throw verificationError('INVALID_VERIFICATION_CODE');
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      db.prepare('UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?').run(consumedAt, row.id);
      db.exec('COMMIT');
      throw verificationError('VERIFICATION_CODE_EXPIRED');
    }
    if (Number(row.attempts || 0) >= Number(row.max_attempts || DEFAULT_MAX_ATTEMPTS)) {
      db.exec('ROLLBACK');
      throw verificationError('VERIFICATION_CODE_ATTEMPTS_EXCEEDED');
    }
    if (!equalHash(row.code_hash, hashCode(email, code, REGISTRATION_PURPOSE))) {
      const attempts = Number(row.attempts || 0) + 1;
      db.prepare('UPDATE email_verification_codes SET attempts = ? WHERE id = ?').run(attempts, row.id);
      db.exec('COMMIT');
      throw verificationError(
        attempts >= Number(row.max_attempts || DEFAULT_MAX_ATTEMPTS)
          ? 'VERIFICATION_CODE_ATTEMPTS_EXCEEDED'
          : 'INVALID_VERIFICATION_CODE'
      );
    }
    db.prepare('UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?').run(consumedAt, row.id);
    db.exec('COMMIT');
    return { id: row.id, email };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export async function issuePasswordResetVerificationCode(emailValue, { language = 'zh' } = {}) {
  const email = normalizeEmail(emailValue);
  const user = getUserByEmail(email);
  const minutes = expiresMinutes();
  const genericResult = {
    expiresInSeconds: minutes * 60,
    resendAfterSeconds: resendSeconds(),
    previewCode: '',
    accountExists: false
  };
  if (!user || user.status !== 'active') return genericResult;

  const db = getDb();
  const latest = db.prepare(`
    SELECT created_at FROM email_verification_codes
    WHERE email = ? AND purpose = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(email, PASSWORD_RESET_PURPOSE);
  const cooldownMs = resendSeconds() * 1000;
  const elapsed = latest?.created_at ? Date.now() - Date.parse(latest.created_at) : cooldownMs;
  if (Number.isFinite(elapsed) && elapsed < cooldownMs) {
    throw verificationError('VERIFICATION_CODE_COOLDOWN', {
      retryAfterSeconds: Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000))
    });
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const id = `reset-${randomUUID()}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE email_verification_codes SET consumed_at = ?
      WHERE email = ? AND purpose = ? AND consumed_at IS NULL
    `).run(createdAt, email, PASSWORD_RESET_PURPOSE);
    db.prepare(`
      INSERT INTO email_verification_codes
        (id, email, purpose, code_hash, attempts, max_attempts, expires_at, consumed_at, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, NULL, ?)
    `).run(id, email, PASSWORD_RESET_PURPOSE, hashCode(email, code, PASSWORD_RESET_PURPOSE), DEFAULT_MAX_ATTEMPTS, expiresAt, createdAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  try {
    const delivery = await deliverCode({ email, code, language, minutes, purpose: PASSWORD_RESET_PURPOSE });
    return {
      ...genericResult,
      accountExists: true,
      previewCode: delivery.previewCode || ''
    };
  } catch (error) {
    db.prepare('UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    throw error;
  }
}

export function resetPasswordWithVerificationCode(emailValue, codeValue, passwordValue, auditMeta = {}) {
  const email = normalizeEmail(emailValue);
  const code = String(codeValue || '').trim();
  const password = String(passwordValue || '');
  if (!/^\d{6}$/.test(code)) throw verificationError('VERIFICATION_CODE_REQUIRED');
  if (password.length < 8 || password.length > 128) throw verificationError('INVALID_PASSWORD');

  const db = getDb();
  const changedAt = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND status = ?').get(email, 'active');
    const row = db.prepare(`
      SELECT * FROM email_verification_codes
      WHERE email = ? AND purpose = ? AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(email, PASSWORD_RESET_PURPOSE);
    if (!user || !row) {
      db.exec('ROLLBACK');
      throw verificationError('INVALID_VERIFICATION_CODE');
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      db.prepare('UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?').run(changedAt, row.id);
      db.exec('COMMIT');
      throw verificationError('VERIFICATION_CODE_EXPIRED');
    }
    if (Number(row.attempts || 0) >= Number(row.max_attempts || DEFAULT_MAX_ATTEMPTS)) {
      db.exec('ROLLBACK');
      throw verificationError('VERIFICATION_CODE_ATTEMPTS_EXCEEDED');
    }
    if (!equalHash(row.code_hash, hashCode(email, code, PASSWORD_RESET_PURPOSE))) {
      const attempts = Number(row.attempts || 0) + 1;
      db.prepare('UPDATE email_verification_codes SET attempts = ? WHERE id = ?').run(attempts, row.id);
      db.exec('COMMIT');
      throw verificationError(
        attempts >= Number(row.max_attempts || DEFAULT_MAX_ATTEMPTS)
          ? 'VERIFICATION_CODE_ATTEMPTS_EXCEEDED'
          : 'INVALID_VERIFICATION_CODE'
      );
    }

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(password), changedAt, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    db.prepare(`
      UPDATE email_verification_codes SET consumed_at = ?
      WHERE email = ? AND purpose = ? AND consumed_at IS NULL
    `).run(changedAt, email, PASSWORD_RESET_PURPOSE);
    db.prepare(`
      INSERT INTO audit_events
        (id, category, action, result, actor_type, actor_user_id, actor_role,
         actor_name_snapshot, actor_email_snapshot, target_user_id, entity_type, entity_id,
         reason, details, before_json, after_json, ip_address, user_agent, created_at)
      VALUES (?, 'users', 'password_reset', 'success', 'user', ?, ?, ?, ?, ?, 'user', ?,
              'self_service_password_reset', 'Password reset by verified email code.', '{}', ?, ?, ?, ?)
    `).run(
      randomUUID(),
      user.id,
      String(user.role || 'user').slice(0, 30),
      String(user.full_name || '').slice(0, 160),
      String(user.email || '').slice(0, 320),
      user.id,
      user.id,
      JSON.stringify({ sessionsRevoked: true }),
      String(auditMeta.ipAddress || '').slice(0, 120),
      String(auditMeta.userAgent || '').slice(0, 500),
      changedAt
    );
    db.exec('COMMIT');
    return getUserProfile(user.id);
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function getEmailVerificationStatus() {
  const smtp = smtpOptions();
  return {
    required: true,
    delivery: smtp ? 'smtp' : (localPreviewEnabled() ? 'preview' : 'unavailable'),
    expiresInSeconds: expiresMinutes() * 60,
    resendAfterSeconds: resendSeconds()
  };
}
