import { randomUUID } from 'node:crypto';
import { getDb } from './local-db.js';
import { getNewAPIConfig, sourceForIssuer, getNewAPIAccountCredential, ensureNewAPIAuthorization } from './newapi-account.js';
import { encryptProviderSecret, decryptProviderSecret } from './provider-secrets.js';
import { storageBillingDateParts } from '../../shared/storage-billing.js';
import { getStorageBillingConfig } from './storage-billing.js';

const error = (code) => Object.assign(new Error(code), { code });
const now = () => new Date().toISOString();
const paymentFailures = ['PIC365_STORAGE_INSUFFICIENT_BALANCE', 'PIC365_STORAGE_MONTHLY_LIMIT'];
const definiteFailures = [...paymentFailures, 'PIC365_STORAGE_AUTHORIZATION_REQUIRED'];
const pendingAutomaticSetups = new Map();
let automaticSetupCursor = '';

function sourceAccount(userId) {
  return getDb().prepare('SELECT * FROM newapi_accounts WHERE user_id = ?').get(userId);
}

function authorization(userId) {
  return getDb().prepare('SELECT * FROM newapi_storage_authorizations WHERE user_id = ?').get(userId);
}

export function isNewAPIStorageEnabled(userId) {
  const row = sourceAccount(userId);
  const sourceId = row && sourceForIssuer(row.issuer);
  return Boolean(sourceId && String(process.env[`${sourceId.toUpperCase()}_STORAGE_ENABLED`] || '').toLowerCase() === 'true');
}

function ensureStorageAuthorization(userId, account) {
  getDb().prepare(`INSERT OR IGNORE INTO newapi_storage_authorizations
    (user_id,issuer,subject,mandate_id,credential_encrypted,unit_price_cents,monthly_limit_cents,starts_at,expires_at,state,blocked_since,updated_at)
    VALUES (?,?,?,'','',0,0,?,0,'authorization_required',NULL,?)`)
    .run(userId,account.issuer,account.subject,Math.floor(Date.now()/1000),now());
  return authorization(userId);
}

function overduePaymentSince(userId, auth) {
  const invoice = getDb().prepare(`SELECT created_at FROM newapi_storage_invoices
    WHERE user_id=? AND status='blocked' AND error_code IN (?,?) ORDER BY created_at LIMIT 1`)
    .get(userId, ...paymentFailures);
  if (!invoice) return null;
  // Legacy missing-consent timestamps must not shorten a new payment grace period.
  const createdAt = Date.parse(invoice.created_at);
  const blockedAt = Date.parse(auth?.blocked_since || invoice.created_at);
  if (!Number.isFinite(createdAt)) return null;
  return new Date(Math.max(createdAt, Number.isFinite(blockedAt) ? blockedAt : createdAt)).toISOString();
}

async function callSource(config, path, { credential = '', body, inference = null } = {}) {
  const headers = { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' };
  if (credential) headers['X-Pic365-Storage'] = credential;
  if (inference) {
    headers.Authorization = `Bearer ${inference.apiKey}`;
    headers['X-Pic365-Client'] = config.secret;
    headers['X-Pic365-Grant'] = inference.binding;
  }
  let response;
  try {
    response = await fetch(`${config.origin}/api/pic365/storage/${path}`, {
      method: body == null ? 'GET' : 'POST', headers,
      ...(body == null ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000), redirect: 'error'
    });
  } catch { throw error('PIC365_STORAGE_PENDING'); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw error(payload.error || 'PIC365_STORAGE_UNAVAILABLE');
  return payload.data;
}

export async function getNewAPIStorageCapabilities(userId) {
  if (!isNewAPIStorageEnabled(userId)) throw error('PIC365_STORAGE_UNAVAILABLE');
  const row = sourceAccount(userId);
  const id = row && sourceForIssuer(row.issuer);
  if (!id) throw error('NEWAPI_NOT_CONFIGURED');
  const config = getNewAPIConfig(id);
  const data = await callSource(config, 'capabilities');
  if (data?.version !== 1 || data?.category !== 'pic365_storage' || data?.billing_source !== 'wallet') throw error('PIC365_STORAGE_UNAVAILABLE');
  return config;
}

export async function authorizeNewAPIStorage(userId, { monthlyLimitCents, days, consent }, price) {
  if (consent !== true || !Number.isSafeInteger(monthlyLimitCents) || monthlyLimitCents < 1 || monthlyLimitCents > 10000000 ||
      !Number.isSafeInteger(days) || days < 1 || days > 365) throw error('PIC365_STORAGE_INVALID_CONSENT');
  if (!Number.isSafeInteger(price) || price < 1 || price > 100000) throw error('PIC365_STORAGE_INVALID_CONSENT');
  await getNewAPIStorageCapabilities(userId);
  // Resolve unknown old receipts before replacing their payment credential.
  await retryNewAPIStorageInvoices({ userId });
  if (getDb().prepare("SELECT 1 FROM newapi_storage_invoices WHERE user_id = ? AND status = 'pending'").get(userId)) throw error('PIC365_STORAGE_PENDING');
  await ensureNewAPIAuthorization(userId);
  const inference = getNewAPIAccountCredential(userId);
  const data = await callSource(inference.config, 'authorize', { inference,
    body: { consent: true, unit_price_cents_per_gib: price, monthly_limit_cents: monthlyLimitCents, days } });
  const mandate = data?.mandate;
  if (!mandate?.id || typeof data.credential !== 'string' || data.credential.length < 32 || !Number.isSafeInteger(mandate.created_at) ||
      !Number.isSafeInteger(mandate.expires_at) || mandate.expires_at <= Math.floor(Date.now()/1000) ||
      mandate.monthly_limit_cents !== monthlyLimitCents || mandate.unit_price_cents_per_gib !== price) throw error('PIC365_STORAGE_UNAVAILABLE');
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare("SELECT 1 FROM newapi_storage_invoices WHERE user_id=? AND status='pending'").get(userId)) throw error('PIC365_STORAGE_PENDING');
    // Definitively rejected, uncharged invoices may be replaced with a new credential.
    db.prepare("UPDATE newapi_storage_invoices SET status = 'cancelled' WHERE user_id = ? AND status = 'blocked'").run(userId);
    db.prepare(`INSERT INTO newapi_storage_authorizations
      (user_id, issuer, subject, mandate_id, credential_encrypted, unit_price_cents, monthly_limit_cents, starts_at, expires_at, state, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      ON CONFLICT(user_id) DO UPDATE SET issuer=excluded.issuer, subject=excluded.subject, mandate_id=excluded.mandate_id, credential_encrypted=excluded.credential_encrypted,
      unit_price_cents=excluded.unit_price_cents, monthly_limit_cents=excluded.monthly_limit_cents, starts_at=excluded.starts_at,
      expires_at=excluded.expires_at, state='active', blocked_since=NULL, updated_at=excluded.updated_at`)
      .run(userId, inference.row.issuer, inference.row.subject, mandate.id, encryptProviderSecret(data.credential), price,
        monthlyLimitCents, mandate.created_at, mandate.expires_at, now());
    db.prepare("UPDATE notification_events SET title=?,body=?,metadata_json=? WHERE type='storage_payment' AND recipient_user_id=?")
      .run('Pic365 自动存储扣费已开启','系统已准备好来源钱包存储结算凭证，无需单独授权。',JSON.stringify({error:null,state:'automatic'}),userId);
    db.exec('COMMIT');
  } catch (cause) { db.exec('ROLLBACK'); throw cause; }
  return getNewAPIStorageSummary(userId);
}

export async function ensureAutomaticNewAPIStorage(userId) {
  if (!isNewAPIStorageEnabled(userId) || !getStorageBillingConfig().enabled ||
      String(process.env.STORAGE_BILLING_ENABLED || '').toLowerCase() === 'false') return null;
  if (!getDb().prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(userId)) return null;
  if (pendingAutomaticSetups.has(userId)) return pendingAutomaticSetups.get(userId);
  const setup = configureAutomaticNewAPIStorage(userId);
  pendingAutomaticSetups.set(userId, setup);
  try { return await setup; } finally { pendingAutomaticSetups.delete(userId); }
}

async function configureAutomaticNewAPIStorage(userId) {
  const db = getDb();
  const account = sourceAccount(userId);
  const previous = authorization(userId) || ensureStorageAuthorization(userId, account);
  if (!overduePaymentSince(userId, previous)) {
    db.prepare('UPDATE newapi_storage_authorizations SET blocked_since=NULL WHERE user_id=? AND blocked_since IS NOT NULL').run(userId);
    db.prepare(`UPDATE notification_events SET title=?,body=?,metadata_json=?
      WHERE type='storage_payment' AND recipient_user_id=? AND metadata_json LIKE ?`)
      .run('Pic365 自动存储结算','存储费由系统自动结算，无需单独授权；来源接口暂不可用时会稍后重试。',
        JSON.stringify({error:null,state:'automatic_pending'}),userId,'%"error":"PIC365_STORAGE_AUTHORIZATION_REQUIRED"%');
  }
  // Do not reinstate a payment credential explicitly revoked at the source/user.
  if (previous.state === 'revoked') return getNewAPIStorageSummary(userId);
  const month = storageBillingDateParts().month;
  const monthPrice = db.prepare('SELECT unit_price_cents_per_gb FROM storage_billing_months WHERE user_id=? AND billing_month=?').get(userId, month);
  const price = Number(monthPrice?.unit_price_cents_per_gb || getStorageBillingConfig().unitPriceCentsPerGb);
  const valid = previous.state === 'active' && previous.issuer === account.issuer && previous.subject === account.subject &&
    previous.mandate_id && previous.credential_encrypted && previous.unit_price_cents === price;
  if (valid && previous.expires_at > Math.floor(Date.now()/1000) + 86400) return getNewAPIStorageSummary(userId);
  // Resolve existing money first. A renewal must not erase unpaid or unknown invoices.
  if (previous.mandate_id && db.prepare(`SELECT 1 FROM newapi_storage_invoices WHERE user_id=? AND
    (status='pending' OR (status='blocked' AND error_code IN (?,?)))`).get(userId, ...paymentFailures)) {
    return getNewAPIStorageSummary(userId);
  }
  const sourceId = sourceForIssuer(account.issuer);
  if (previous.mandate_id && previous.credential_encrypted) {
    const status = await callSource(getNewAPIConfig(sourceId), 'status', {
      credential:decryptProviderSecret(previous.credential_encrypted), body:{}
    });
    if (status?.mandate?.id !== previous.mandate_id) throw error('PIC365_STORAGE_UNAVAILABLE');
    if (status.mandate.revoked_at) {
      db.prepare("UPDATE newapi_storage_authorizations SET state='revoked',updated_at=? WHERE user_id=? AND mandate_id=?")
        .run(now(),userId,previous.mandate_id);
      return getNewAPIStorageSummary(userId);
    }
  }
  const monthlyLimitCents = previous.monthly_limit_cents ||
    Number(process.env[`${sourceId.toUpperCase()}_STORAGE_MONTHLY_LIMIT_CENTS`] || 1000);
  const days = previous.expires_at > previous.starts_at
    ? Math.min(365, Math.max(1, Math.round((previous.expires_at-previous.starts_at)/86400))) : 30;
  // Protocol v1 calls its server acknowledgement `consent`. The platform enables
  // storage billing automatically; no browser checkbox or client-supplied rate is used.
  // Source key, client identity, grant binding and source revocation checks still apply.
  return authorizeNewAPIStorage(userId, {monthlyLimitCents, days, consent:true}, price);
}

export async function prepareAutomaticNewAPIStorage({ limit = 50 } = {}) {
  const query = getDb().prepare(`SELECT account.user_id FROM newapi_accounts account JOIN users ON users.id=account.user_id
    WHERE users.status='active' AND account.user_id>? ORDER BY account.user_id LIMIT ?`);
  let accounts = query.all(automaticSetupCursor,limit);
  if (!accounts.length && automaticSetupCursor) accounts = query.all('',limit);
  automaticSetupCursor = accounts.at(-1)?.user_id || '';
  const results = [];
  for (const {user_id:userId} of accounts) {
    if (!isNewAPIStorageEnabled(userId)) continue;
    try { await ensureAutomaticNewAPIStorage(userId); results.push({userId, ok:true}); }
    catch (cause) { results.push({userId, error:cause.code || 'PIC365_STORAGE_UNAVAILABLE'}); }
  }
  return results;
}

export async function revokeNewAPIStorage(userId) {
  const row = authorization(userId);
  if (!row || !row.mandate_id || row.state === 'revoked') return;
  const id = sourceForIssuer(row.issuer);
  if (!id) throw error('NEWAPI_NOT_CONFIGURED');
  await callSource(getNewAPIConfig(id), 'revoke', { credential: decryptProviderSecret(row.credential_encrypted), body: {} });
  getDb().prepare("UPDATE newapi_storage_authorizations SET state = 'revoked', blocked_since = COALESCE(blocked_since, ?), updated_at = ? WHERE user_id = ?")
    .run(now(), now(), userId);
}

export function getNewAPIStorageSummary(userId) {
  const row = sourceAccount(userId);
  if (!row) return null;
  const auth = authorization(userId);
  const month = storageBillingDateParts().month;
  const invoices = getDb().prepare('SELECT * FROM newapi_storage_invoices WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50').all(userId);
  const usage = getDb().prepare('SELECT MAX(owned_bytes) AS bytes FROM storage_billing_daily_usage WHERE user_id = ? AND billing_month = ?').get(userId, month);
  const id = sourceForIssuer(row.issuer);
  return { source: id, walletUrl: id ? `${getNewAPIConfig(id).origin}/wallet` : null,
    automaticPayment: isNewAPIStorageEnabled(userId) && getStorageBillingConfig().enabled &&
      String(process.env.STORAGE_BILLING_ENABLED || '').toLowerCase() !== 'false',
    state: !auth || auth.state === 'authorization_required' ? 'authorization_required' : auth.state === 'revoked' ? 'revoked' : auth.expires_at <= Math.floor(Date.now()/1000) ? 'expired' : auth.state,
    unitPriceCentsPerGib: auth?.unit_price_cents, monthlyLimitCents: auth?.monthly_limit_cents,
    expiresAt: auth?.expires_at, graceDays: 7, blockedSince: overduePaymentSince(userId, auth),
    peakBytes: Number(usage?.bytes || 0),
    invoices: invoices.map((invoice) => ({ id: invoice.id, status: invoice.status, errorCode: invoice.error_code,
      request: JSON.parse(invoice.request_json), receipt: invoice.receipt_json ? JSON.parse(invoice.receipt_json) : null,
      createdAt: invoice.created_at, paidAt: invoice.paid_at })) };
}

export function requireNewAPIStorageWrite(userId) {
  const account = sourceAccount(userId);
  if (!account || !isNewAPIStorageEnabled(userId) || !getStorageBillingConfig().enabled || String(process.env.STORAGE_BILLING_ENABLED || '').toLowerCase() === 'false') return;
  const auth = authorization(userId) || ensureStorageAuthorization(userId,account);
  const blockedSince = overduePaymentSince(userId, auth);
  if (blockedSince && Date.now() - Date.parse(blockedSince) >= 7*24*3600_000) throw error('PIC365_STORAGE_PAYMENT_REQUIRED');
  // Missing/expired settlement credentials and network uncertainty are not unpaid bills.
}

function recordStorageFailure(userId, code) {
  if (!paymentFailures.includes(code)) return;
  const db = getDb();
  db.prepare("UPDATE newapi_storage_authorizations SET blocked_since=COALESCE(blocked_since, ?), updated_at=? WHERE user_id=?").run(now(), now(), userId);
  const entityId = `newapi-storage:${userId}`;
  const previous = db.prepare("SELECT id, metadata_json FROM notification_events WHERE type='storage_payment' AND entity_id=?").get(entityId);
  db.prepare(`INSERT INTO notification_events (id, type, recipient_user_id, audience, title, body, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, 'storage_payment', ?, 'user', ?, ?, 'storage', ?, ?, ?)
    ON CONFLICT(type,entity_type,entity_id) WHERE entity_id != ''
    DO UPDATE SET title=excluded.title, body=excluded.body, metadata_json=excluded.metadata_json, created_at=excluded.created_at`)
    .run(randomUUID(), userId, 'Pic365 存储费待支付', '请检查来源钱包余额和月度扣费限额，无需单独授权。付款宽限期为7天；到期后限制新增存储，已有资产仍可下载和删除。', entityId, JSON.stringify({ error: code }), now());
  if (previous && JSON.parse(previous.metadata_json).error !== code) db.prepare('DELETE FROM notification_receipts WHERE notification_id=? AND user_id=?').run(previous.id,userId);
}

async function settleInvoice(row) {
  const account = sourceAccount(row.user_id);
  const id = sourceForIssuer(row.issuer);
  if (!id || !account || account.issuer !== row.issuer || account.subject !== row.subject) throw error('NEWAPI_IDENTITY_MISMATCH');
  const config = getNewAPIConfig(id);
  const credential = decryptProviderSecret(row.credential_encrypted);
  const request = JSON.parse(row.request_json);
  const db = getDb();
  db.prepare('UPDATE newapi_storage_invoices SET last_attempt_at=? WHERE id=?').run(now(), row.id);
  try {
    // Query first after any attempt: a lost response may already have debited the wallet.
    let receipt;
    if (row.last_attempt_at) {
      try { receipt = await callSource(config, 'status', { credential, body: { invoice_id: row.id } }); }
      catch (cause) { if (cause.code !== 'PIC365_STORAGE_INVOICE_NOT_FOUND') throw cause; }
    }
    if (!receipt) receipt = await callSource(config, 'charge', { credential, body: request });
    if (receipt?.invoice_id !== row.id || receipt.billing_month !== request.billing_month || receipt.usage_date !== request.usage_date ||
        receipt.peak_bytes !== request.peak_bytes || receipt.target_cents !== request.target_cents ||
        receipt.unit_price_cents_per_gib !== request.unit_price_cents_per_gib || !Number.isSafeInteger(receipt.amount_cents) ||
        receipt.amount_cents <= 0 || receipt.amount_cents > request.target_cents || !Number.isSafeInteger(receipt.quota) || receipt.quota <= 0 ||
        receipt.balance_before - receipt.balance_after !== receipt.quota) throw error('PIC365_STORAGE_PENDING');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE newapi_storage_invoices SET status='paid', receipt_json=?, paid_at=?, error_code=NULL WHERE id=?")
        .run(JSON.stringify(receipt), now(), row.id);
      // Re-publishing an old paid receipt must not clear another unpaid bill's grace period.
      if (!db.prepare("SELECT 1 FROM newapi_storage_invoices WHERE user_id=? AND status='blocked' AND error_code IN (?,?)")
        .get(row.user_id,...paymentFailures)) {
        db.prepare("UPDATE newapi_storage_authorizations SET blocked_since=NULL, updated_at=? WHERE user_id=? AND state='active'").run(now(), row.user_id);
        db.prepare("UPDATE notification_events SET title=?,body=?,metadata_json=? WHERE type='storage_payment' AND recipient_user_id=?")
          .run('Pic365 存储费已支付','来源钱包已完成存储费结算。',JSON.stringify({error:null,state:'paid'}),row.user_id);
      }
      db.exec('COMMIT');
    } catch (cause) { db.exec('ROLLBACK'); throw cause; }
    return receipt;
  } catch (cause) {
    const code = cause.code || 'PIC365_STORAGE_PENDING';
    // An expired settlement credential does not forgive an already confirmed
    // unpaid bill, or let automatic setup cancel it and restart its grace period.
    const previous = db.prepare('SELECT status,error_code FROM newapi_storage_invoices WHERE id=?').get(row.id);
    const retainedPaymentFailure = code === 'PIC365_STORAGE_AUTHORIZATION_REQUIRED' &&
      previous?.status === 'blocked' && paymentFailures.includes(previous.error_code);
    const result = db.prepare("UPDATE newapi_storage_invoices SET status=?, error_code=? WHERE id=? AND status <> 'paid'")
      .run(retainedPaymentFailure || definiteFailures.includes(code) ? 'blocked' : 'pending',
        retainedPaymentFailure ? previous.error_code : code,row.id);
    if (result.changes) recordStorageFailure(row.user_id, code);
    throw cause;
  }
}

export async function retryNewAPIStorageInvoices({ userId = null, limit = 50 } = {}) {
  const rows = getDb().prepare(`SELECT * FROM newapi_storage_invoices WHERE status IN ('pending','blocked')
    AND (? IS NULL OR user_id=?) ORDER BY created_at ASC LIMIT ?`).all(userId, userId, limit);
  const results = [];
  for (const row of rows) {
    if (!isNewAPIStorageEnabled(row.user_id)) continue;
    try { results.push(await settleInvoice(row)); }
    catch (cause) { results.push({ id: row.id, error: cause.code || 'PIC365_STORAGE_PENDING' }); }
  }
  const unpublished = getDb().prepare("SELECT * FROM newapi_storage_invoices WHERE status='paid' AND (? IS NULL OR user_id=?) AND receipt_json LIKE '%\"log_published\":false%' LIMIT ?").all(userId,userId,limit);
  for (const row of unpublished) {
    if (!isNewAPIStorageEnabled(row.user_id)) continue;
    try { await settleInvoice(row); } catch { /* authoritative paid receipt is retained */ }
  }
  return results;
}

export async function billNewAPIStorageForDate({ userId, runDate, ownedBytes, ownedAssetCount = 0, measuredAt = now(), unitPriceCentsPerGb }) {
  if (!isNewAPIStorageEnabled(userId)) return { userId, runDate, status: 'external_disabled', chargedCredits: 0, ownedBytes };
  if (!Number.isSafeInteger(ownedBytes) || ownedBytes < 0 || ownedBytes > 2**50 || !/^\d{4}-\d{2}-\d{2}$/.test(runDate)) throw error('INVALID_STORAGE_BILLING_DATE');
  const db = getDb();
  const account = sourceAccount(userId);
  try { await ensureAutomaticNewAPIStorage(userId); }
  catch { /* record usage and retry setup later; never require user consent */ }
  const auth = authorization(userId);
  const authorized = auth && auth.issuer === account?.issuer && auth.subject === account?.subject && auth.state === 'active' && auth.expires_at > Math.floor(Date.now()/1000);
  const startDate = auth ? storageBillingDateParts(new Date(auth.starts_at*1000)).date : runDate;
  const billingMonth = runDate.slice(0,7);
  const pending = db.prepare("SELECT * FROM newapi_storage_invoices WHERE user_id=? AND status IN ('pending','blocked') ORDER BY created_at LIMIT 1").get(userId);
  if (pending) {
    try { await settleInvoice(pending); } catch { /* retain immutable pending bill */ }
  }
  let invoice;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT OR IGNORE INTO storage_billing_daily_usage
      (user_id, usage_date, billing_month, run_phase, owned_bytes, owned_asset_count, result_status, incremental_credits, balance_before, balance_after, measured_at)
      VALUES (?, ?, ?, 'daily', ?, ?, 'external_newapi', 0, 0, 0, ?)`)
      .run(userId, runDate, billingMonth, ownedBytes, ownedAssetCount, measuredAt);
    if (authorized && runDate >= startDate) {
      const monthState = db.prepare('SELECT unit_price_cents_per_gb,created_at FROM storage_billing_months WHERE user_id=? AND billing_month=?').get(userId, billingMonth);
      // Measurements before the settlement credential started are not retroactive debt.
      if (!monthState) {
        db.prepare(`UPDATE storage_billing_daily_usage SET owned_bytes=?,owned_asset_count=?,measured_at=?
          WHERE user_id=? AND usage_date=? AND measured_at < ?`)
          .run(ownedBytes,ownedAssetCount,measuredAt,userId,runDate,new Date(auth.starts_at*1000).toISOString());
      }
      const price = Number(monthState?.unit_price_cents_per_gb || unitPriceCentsPerGb);
      if (price !== auth.unit_price_cents) throw error('PIC365_STORAGE_AUTHORIZATION_REQUIRED');
      db.prepare(`INSERT OR IGNORE INTO storage_billing_months
        (user_id,billing_month,unit_price_cents_per_gb,billed_peak_bytes,charged_credits,created_at,updated_at) VALUES (?,?,?,0,0,?,?)`)
        .run(userId, billingMonth, price, measuredAt, measuredAt);
      // Credential renewal must not erase the month's already measured peak.
      const billingStartDate = monthState ? storageBillingDateParts(new Date(monthState.created_at)).date : startDate;
      const peak = Number(db.prepare('SELECT MAX(owned_bytes) AS peak FROM storage_billing_daily_usage WHERE user_id=? AND billing_month=? AND usage_date>=?').get(userId,billingMonth,billingStartDate)?.peak || 0);
      const target = Number(BigInt(peak)*BigInt(price)/BigInt(2**30)); // Integer CNY cents; never NewAPI quota or discounted inference pricing.
      const paid = db.prepare("SELECT receipt_json FROM newapi_storage_invoices WHERE user_id=? AND billing_month=? AND status='paid'").all(userId,billingMonth)
        .reduce((sum,row) => sum+JSON.parse(row.receipt_json).amount_cents,0);
      if (target > paid && !db.prepare("SELECT 1 FROM newapi_storage_invoices WHERE user_id=? AND status IN ('pending','blocked')").get(userId)) {
        const request = { invoice_id: randomUUID().replaceAll('-',''), billing_month: billingMonth, usage_date: runDate,
          peak_bytes: peak, unit_price_cents_per_gib: price, target_cents: target };
        db.prepare(`INSERT INTO newapi_storage_invoices
          (id,user_id,issuer,subject,mandate_id,credential_encrypted,billing_month,request_json,status,created_at)
          VALUES (?,?,?,?,?,?,?,?,'pending',?)`).run(request.invoice_id,userId,account.issuer,account.subject,auth.mandate_id,
            auth.credential_encrypted,billingMonth,JSON.stringify(request),measuredAt);
        invoice = db.prepare('SELECT * FROM newapi_storage_invoices WHERE id=?').get(request.invoice_id);
      }
    } else {
      if (!auth) ensureStorageAuthorization(userId,account);
    }
    db.exec('COMMIT');
  } catch (cause) { db.exec('ROLLBACK'); recordStorageFailure(userId,cause.code); throw cause; }
  if (invoice) {
    try { await settleInvoice(invoice); } catch { /* paid/blocked/pending state is durable */ }
  }
  return { userId, runDate, billingMonth, status: 'external_newapi', chargedCredits: 0, ownedBytes };
}
