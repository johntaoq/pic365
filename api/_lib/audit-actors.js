// Shared by the ledger trigger and legacy read-time attribution. A billed account
// is not necessarily the operator (group billing, maintenance and admin changes).
export function creditLedgerActorSql(alias = 'ledger') {
  const metadata = `CASE WHEN json_valid(${alias}.metadata) THEN ${alias}.metadata ELSE '{}' END`;
  const field = (key) => `NULLIF(TRIM(json_extract(${metadata}, '$.${key}')), '')`;
  const explicitType = field('actorType');
  const adminId = field('adminUserId');
  const actorId = `COALESCE(${field('actorUserId')}, ${adminId})`;
  const automatic = `(${alias}.source IN (
    'storage_billing', 'generation_recovery', 'generation_release',
    'reservation_settlement_refund', 'ai_tool_refund'
  ) OR ${alias}.type IN ('signup_bonus', 'purchase'))`;
  const userInitiated = `(${alias}.type IN (
    'generation', 'ai_video', 'ai_voice', 'ai_chat', 'ai_tool', 'redemption'
  ) OR ${alias}.source IN ('generation_reservation', 'group_funding'))`;
  const type = `CASE
    WHEN ${explicitType} = 'system' THEN 'system'
    WHEN ${explicitType} = 'user' AND ${actorId} IS NOT NULL THEN 'user'
    WHEN ${adminId} IS NOT NULL THEN 'user'
    WHEN ${automatic} THEN 'system'
    WHEN ${actorId} IS NOT NULL OR ${userInitiated} THEN 'user'
    ELSE 'unknown' END`;
  return {
    type,
    id: `CASE WHEN (${type}) = 'user' THEN COALESCE(${actorId}, ${alias}.user_id) ELSE NULL END`,
    name: field('actorName'),
    email: field('actorEmail'),
    role: field('actorRole')
  };
}

export function installCreditLedgerAuditTrigger(db) {
  const actor = creditLedgerActorSql();
  const sql = `CREATE TRIGGER credit_ledger_audit_insert
    AFTER INSERT ON credit_ledger
    BEGIN
      INSERT INTO audit_events
        (id, category, action, result, actor_type, actor_user_id, actor_role,
         actor_name_snapshot, actor_email_snapshot, target_user_id, entity_type, entity_id,
         credit_ledger_id, credit_delta, reason, after_json, created_at)
      SELECT lower(hex(randomblob(16))), 'credits', 'credit_ledger_posted', 'success',
        attribution.actor_type, attribution.actor_id,
        CASE WHEN attribution.actor_type = 'user' THEN COALESCE(${actor.role}, operator.role, '') ELSE '' END,
        CASE WHEN attribution.actor_type = 'system' THEN 'system'
          WHEN attribution.actor_type = 'user' THEN COALESCE(${actor.name}, NULLIF(TRIM(operator.full_name), ''), ${actor.email}, operator.email, attribution.actor_id, '')
          ELSE '' END,
        CASE WHEN attribution.actor_type = 'user' THEN COALESCE(${actor.email}, operator.email, '') ELSE '' END,
        ledger.user_id, 'credit_ledger', ledger.id, ledger.id, ledger.amount, ledger.source,
        json_object('type', ledger.type, 'source', ledger.source, 'referenceId', ledger.reference_id, 'actorAttributionVersion', 2),
        ledger.created_at
      FROM credit_ledger ledger
      JOIN (SELECT id, ${actor.type} AS actor_type, ${actor.id} AS actor_id
        FROM credit_ledger ledger WHERE id = NEW.id) attribution ON attribution.id = ledger.id
      LEFT JOIN users operator ON operator.id = attribution.actor_id
      WHERE ledger.id = NEW.id;
    END`;
  const existing = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'credit_ledger_audit_insert'").get();
  if (existing?.sql === sql) return;
  // Atomic replacement upgrades existing databases without touching audit rows
  // or leaving a window where ledger inserts could escape auditing.
  db.exec('SAVEPOINT audit_actor_trigger');
  try {
    db.exec('DROP TRIGGER IF EXISTS credit_ledger_audit_insert');
    db.exec(sql);
    db.exec('RELEASE audit_actor_trigger');
  } catch (error) {
    db.exec('ROLLBACK TO audit_actor_trigger');
    db.exec('RELEASE audit_actor_trigger');
    throw error;
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function json(value) {
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}

export function resolveAuditActors(db, rows) {
  const legacy = rows.filter((row) => row.action === 'credit_ledger_posted'
    && !row.actor_user_id && json(row.after_json).actorAttributionVersion !== 2);
  const ledgerIds = [...new Set(legacy.map((row) => row.credit_ledger_id).filter(Boolean))];
  const actor = creditLedgerActorSql();
  const ledgers = new Map(ledgerIds.length ? db.prepare(`
    SELECT ledger.id, ledger.metadata, ${actor.type} AS actor_type, ${actor.id} AS actor_id
    FROM credit_ledger ledger WHERE ledger.id IN (${ledgerIds.map(() => '?').join(',')})
  `).all(...ledgerIds).map((row) => [row.id, row]) : []);
  const identities = rows.map((row) => {
    const ledger = ledgers.get(row.credit_ledger_id);
    const id = text(row.actor_user_id) || text(ledger?.actor_id);
    // Old ledger triggers incorrectly marked every non-admin as system.
    // If evidence is missing, do not silently relabel an unknown actor as system.
    const legacyLedger = legacy.includes(row);
    const type = id ? 'user' : legacyLedger ? (ledger?.actor_type || 'unknown')
      : row.actor_type === 'system' ? 'system'
        : text(row.actor_name_snapshot) || text(row.actor_email_snapshot) ? 'user' : 'unknown';
    return { row, ledger, id, type };
  });
  const ids = [...new Set(identities.map((item) => item.id).filter(Boolean))];
  const users = new Map(ids.length ? db.prepare(`
    SELECT id, full_name, email, role FROM users WHERE id IN (${ids.map(() => '?').join(',')})
  `).all(...ids).map((user) => [user.id, user]) : []);
  return identities.map(({ row, ledger, id, type }) => {
    if (type === 'system') return { actorType: 'system', actorUserId: '', actorName: 'system', actorEmail: '', actorRole: '' };
    const user = users.get(id);
    const metadata = json(ledger?.metadata);
    const email = text(row.actor_email_snapshot) || text(metadata.actorEmail) || text(user?.email);
    return {
      actorType: type,
      actorUserId: id,
      actorName: text(row.actor_name_snapshot) || text(metadata.actorName) || text(user?.full_name) || email || id,
      actorEmail: email,
      actorRole: text(row.actor_role) || text(metadata.actorRole) || text(user?.role)
    };
  });
}
