import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'app.sqlite');
const PASSWORD_SCHEME = 'scrypt-v1';

let database;

function now() {
  return new Date().toISOString();
}

function getDatabasePath() {
  return path.resolve(process.env.APP_DB_PATH || DEFAULT_DB_PATH);
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function migrate(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      credit_balance INTEGER NOT NULL DEFAULT 0 CHECK (credit_balance >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ecommerce_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_name TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      industry_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      brand_name TEXT NOT NULL DEFAULT '',
      target_audience TEXT NOT NULL DEFAULT '',
      selling_points TEXT NOT NULL DEFAULT '[]',
      specifications TEXT NOT NULL DEFAULT '',
      prohibited_content TEXT NOT NULL DEFAULT '',
      ai_brief_originals TEXT NOT NULL DEFAULT '{}',
      identity_spec TEXT NOT NULL DEFAULT '{}',
      template_id TEXT NOT NULL DEFAULT '',
      visual_style_id TEXT NOT NULL DEFAULT 'clean-commercial',
      selected_slots TEXT NOT NULL DEFAULT '[]',
      master_asset_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      reference_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_reservations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      generation_id TEXT,
      amount INTEGER NOT NULL DEFAULT 1 CHECK (amount >= 0),
      status TEXT NOT NULL DEFAULT 'reserved',
      case_id INTEGER,
      prompt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      error_code TEXT
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reservation_id TEXT REFERENCES credit_reservations(id),
      case_id INTEGER,
      project_id TEXT REFERENCES ecommerce_projects(id) ON DELETE SET NULL,
      slot_id TEXT,
      version_number INTEGER NOT NULL DEFAULT 1,
      prompt TEXT NOT NULL,
      model TEXT NOT NULL,
      size TEXT NOT NULL,
      quality TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      provider_request_id TEXT,
      storage_path TEXT,
      output_url TEXT,
      error_code TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ecommerce_project_outputs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ecommerce_projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot_id TEXT NOT NULL,
      generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      prompt TEXT NOT NULL DEFAULT '',
      version_number INTEGER NOT NULL DEFAULT 1,
      locked INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      consistency_status TEXT NOT NULL DEFAULT 'unchecked',
      consistency_score INTEGER,
      consistency_issues TEXT NOT NULL DEFAULT '[]',
      consistency_summary TEXT NOT NULL DEFAULT '',
      checked_at TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ecommerce_project_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ecommerce_projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ecommerce_generation_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES ecommerce_projects(id) ON DELETE CASCADE,
      slot_id TEXT NOT NULL,
      generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      quality TEXT NOT NULL DEFAULT 'medium',
      attempts INTEGER NOT NULL DEFAULT 0,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      request_json TEXT NOT NULL DEFAULT '{}',
      error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ecommerce_delivery_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ecommerce_projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot_id TEXT NOT NULL,
      source_generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
      document_type TEXT NOT NULL DEFAULT 'benefit',
      target_width INTEGER NOT NULL DEFAULT 1024,
      target_height INTEGER NOT NULL DEFAULT 1024,
      output_format TEXT NOT NULL DEFAULT 'png',
      theme_id TEXT NOT NULL DEFAULT 'minimal-light',
      layout_id TEXT NOT NULL DEFAULT 'bottom-left',
      safe_area INTEGER NOT NULL DEFAULT 1,
      include_in_export INTEGER NOT NULL DEFAULT 1,
      module_order INTEGER NOT NULL DEFAULT 0,
      content_json TEXT NOT NULL DEFAULT '{}',
      advanced_json TEXT NOT NULL DEFAULT '{}',
      validation_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ecommerce_user_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      platform_id TEXT NOT NULL,
      industry_id TEXT NOT NULL,
      project_config TEXT NOT NULL DEFAULT '{}',
      delivery_config TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      case_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, case_id)
    );

    CREATE TABLE IF NOT EXISTS credit_products (
      id TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_zh TEXT NOT NULL,
      description_en TEXT NOT NULL DEFAULT '',
      description_zh TEXT NOT NULL DEFAULT '',
      credits INTEGER NOT NULL CHECK (credits > 0),
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'cny',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES credit_products(id),
      status TEXT NOT NULL DEFAULT 'created',
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      credits INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      provider_order_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      processed_at TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (provider, event_id)
    );

    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS generations_user_created_idx ON generations(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ecommerce_projects_user_updated_idx ON ecommerce_projects(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS ecommerce_outputs_project_slot_idx ON ecommerce_project_outputs(project_id, slot_id, version_number DESC);
    CREATE INDEX IF NOT EXISTS ecommerce_assets_project_created_idx ON ecommerce_project_assets(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ecommerce_tasks_project_created_idx ON ecommerce_generation_tasks(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ecommerce_tasks_user_status_idx ON ecommerce_generation_tasks(user_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS ecommerce_delivery_project_slot_unique_idx ON ecommerce_delivery_documents(project_id, slot_id);
    CREATE INDEX IF NOT EXISTS ecommerce_delivery_project_order_idx ON ecommerce_delivery_documents(project_id, module_order ASC);
    CREATE INDEX IF NOT EXISTS ecommerce_user_templates_user_updated_idx ON ecommerce_user_templates(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS ledger_user_created_idx ON credit_ledger(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS reservations_user_status_idx ON credit_reservations(user_id, status);
  `);

  ensureColumn(db, 'generations', 'project_id', 'TEXT');
  ensureColumn(db, 'generations', 'slot_id', 'TEXT');
  ensureColumn(db, 'generations', 'version_number', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'generations', 'archived_at', 'TEXT');
  ensureColumn(db, 'ecommerce_projects', 'master_asset_id', 'TEXT');
  ensureColumn(db, 'ecommerce_projects', 'ai_brief_originals', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'ecommerce_projects', 'identity_spec', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'ecommerce_projects', 'template_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_project_assets', 'purpose', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_project_assets', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'ecommerce_project_outputs', 'locked', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'ecommerce_project_outputs', 'locked_at', 'TEXT');
  ensureColumn(db, 'ecommerce_project_outputs', 'active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'ecommerce_project_outputs', 'consistency_status', "TEXT NOT NULL DEFAULT 'unchecked'");
  ensureColumn(db, 'ecommerce_project_outputs', 'consistency_score', 'INTEGER');
  ensureColumn(db, 'ecommerce_project_outputs', 'consistency_issues', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'ecommerce_project_outputs', 'consistency_summary', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'ecommerce_project_outputs', 'checked_at', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS generations_project_slot_idx ON generations(project_id, slot_id, created_at DESC)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ecommerce_outputs_project_slot_unique_idx ON ecommerce_project_outputs(project_id, slot_id)');

  db.prepare(`
    UPDATE ecommerce_generation_tasks
    SET status = 'interrupted', error_code = 'SERVER_RESTARTED', updated_at = ?, completed_at = ?
    WHERE status = 'running'
  `).run(now(), now());

  const assetProjects = db.prepare('SELECT DISTINCT project_id FROM ecommerce_project_assets').all();
  const updateAssetOrder = db.prepare('UPDATE ecommerce_project_assets SET sort_order = ? WHERE id = ?');
  for (const { project_id: projectId } of assetProjects) {
    const projectAssets = db.prepare(`
      SELECT id FROM ecommerce_project_assets WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC, id ASC
    `).all(projectId);
    projectAssets.forEach((asset, index) => updateAssetOrder.run(index + 1, asset.id));
  }

  const projectRows = db.prepare('SELECT id, user_id, selected_slots FROM ecommerce_projects WHERE status != ?').all('deleted');
  const insertOutput = db.prepare(`
    INSERT OR IGNORE INTO ecommerce_project_outputs
      (id, project_id, user_id, slot_id, status, version_number, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'planned', 0, '{}', ?, ?)
  `);
  for (const project of projectRows) {
    let slotIds = [];
    try {
      const parsed = JSON.parse(project.selected_slots || '[]');
      if (Array.isArray(parsed)) slotIds = parsed;
    } catch {
      slotIds = [];
    }
    for (const slotId of slotIds) {
      const createdAt = now();
      insertOutput.run(randomUUID(), project.id, project.user_id, String(slotId), createdAt, createdAt);
    }
  }

  const emptyOutputs = db.prepare(`
    SELECT id, user_id, project_id, slot_id FROM ecommerce_project_outputs WHERE generation_id IS NULL
  `).all();
  const latestSucceededGeneration = db.prepare(`
    SELECT id, version_number, prompt FROM generations
    WHERE user_id = ? AND project_id = ? AND slot_id = ? AND status = 'succeeded' AND archived_at IS NULL
    ORDER BY version_number DESC, created_at DESC LIMIT 1
  `);
  const selectOutputGeneration = db.prepare(`
    UPDATE ecommerce_project_outputs
    SET generation_id = ?, version_number = ?, prompt = ?, status = 'selected', updated_at = ?
    WHERE id = ?
  `);
  for (const output of emptyOutputs) {
    const generation = latestSucceededGeneration.get(output.user_id, output.project_id, output.slot_id);
    if (generation) {
      selectOutputGeneration.run(generation.id, Number(generation.version_number || 1), generation.prompt || '', now(), output.id);
    }
  }

  const productCount = db.prepare('SELECT COUNT(*) AS count FROM credit_products').get().count;
  if (Number(productCount) === 0) {
    const createdAt = now();
    const insert = db.prepare(`
      INSERT INTO credit_products
        (id, name_en, name_zh, description_en, description_zh, credits, amount_cents, currency, active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);
    insert.run('pack_100', '100 Credits', '100 积分', 'For prompt testing and small image batches.', '适合提示词测试和小批量生图。', 100, 990, 'cny', 10, createdAt, createdAt);
    insert.run('pack_500', '500 Credits', '500 积分', 'For regular creative work and visual iterations.', '适合日常创作和视觉迭代。', 500, 3990, 'cny', 20, createdAt, createdAt);
    insert.run('pack_2000', '2,000 Credits', '2,000 积分', 'For frequent generation and content production.', '适合高频生图和内容生产。', 2000, 12990, 'cny', 30, createdAt, createdAt);
  }
}

export function getDb() {
  if (database) return database;
  const databasePath = getDatabasePath();
  ensureParentDirectory(databasePath);
  database = new DatabaseSync(databasePath);
  migrate(database);
  return database;
}

export function hashSessionToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `${PASSWORD_SCHEME}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyPassword(password, encoded) {
  const [scheme, saltText, hashText] = String(encoded || '').split('$');
  if (scheme !== PASSWORD_SCHEME || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, 'base64url');
    const actual = scryptSync(String(password), Buffer.from(saltText, 'base64url'), expected.length, {
      N: 16384,
      r: 8,
      p: 1
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name || '',
    avatarUrl: row.avatar_url || '',
    role: row.role || 'user',
    isSuperAdmin: row.role === 'super_admin',
    status: row.status || 'active',
    creditBalance: Number(row.credit_balance || 0),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function getUserById(userId) {
  return normalizeUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId));
}

export function getUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email));
}

export function getUserBySessionToken(token) {
  if (!token) return null;
  const row = getDb().prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
  `).get(hashSessionToken(token), now());
  return normalizeUser(row);
}

export function createUser({ email, password, fullName = '' }) {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);
  const createdAt = now();
  const userId = randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, normalizedEmail, hashPassword(password), String(fullName || '').trim().slice(0, 80), createdAt, createdAt);
  return getUserById(userId);
}

export function createSession(userId, days = 30) {
  const token = createSessionToken();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  getDb().prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(hashSessionToken(token), userId, expiresAt, createdAt);
  return { token, expiresAt };
}

export function deleteSession(token) {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token));
}

export function getUserUsage(userId) {
  const row = getDb().prepare(`
    SELECT
      COUNT(*) AS total_generations,
      COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) AS succeeded_generations,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_generations,
      COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) AS total_generation_credits
    FROM generations
    WHERE user_id = ?
  `).get(userId);
  return {
    totalGenerations: Number(row?.total_generations || 0),
    totalGenerationCredits: Number(row?.total_generation_credits || 0),
    succeededGenerations: Number(row?.succeeded_generations || 0),
    failedGenerations: Number(row?.failed_generations || 0)
  };
}

export function getUserProfile(userId) {
  const user = getUserById(userId);
  if (!user) return null;
  return {
    ...user,
    usage: getUserUsage(userId),
    freeUsed: false,
    freeGenerationsUsed: 0
  };
}

export function reserveCredit(userId, { caseId = null, prompt = '', generationId = null } = {}) {
  const db = getDb();
  const reservationId = randomUUID();
  const createdAt = now();
  db.exec('BEGIN IMMEDIATE');
  try {
    const user = db.prepare('SELECT id, role, credit_balance FROM users WHERE id = ? AND status = ?').get(userId, 'active');
    if (!user || (user.role !== 'super_admin' && Number(user.credit_balance) < 1)) {
      const error = new Error('CREDITS_REQUIRED');
      error.code = 'CREDITS_REQUIRED';
      throw error;
    }
    if (user.role !== 'super_admin') {
      db.prepare('UPDATE users SET credit_balance = credit_balance - 1, updated_at = ? WHERE id = ? AND credit_balance >= 1').run(createdAt, userId);
    }
    db.prepare(`
      INSERT INTO credit_reservations (id, user_id, generation_id, amount, status, case_id, prompt, created_at)
      VALUES (?, ?, ?, 1, 'reserved', ?, ?, ?)
    `).run(reservationId, userId, generationId, caseId, prompt, createdAt);
    if (user.role !== 'super_admin') {
      db.prepare(`
        INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
        VALUES (?, ?, -1, 'generation', 'generation_reservation', ?, '{}', ?)
      `).run(randomUUID(), userId, reservationId, createdAt);
    }
    db.exec('COMMIT');
    return {
      reservationId,
      creditAmount: user.role === 'super_admin' ? 0 : 1,
      creditBalance: Number(getUserById(userId)?.creditBalance || 0)
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function completeCreditReservation(reservationId) {
  getDb().prepare(`
    UPDATE credit_reservations
    SET status = 'succeeded', completed_at = ?
    WHERE id = ? AND status = 'reserved'
  `).run(now(), reservationId);
}

export function releaseCreditReservation(reservationId, errorCode = 'GENERATION_FAILED') {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const reservation = db.prepare(`
      SELECT r.*, u.role
      FROM credit_reservations r
      JOIN users u ON u.id = r.user_id
      WHERE r.id = ? AND r.status = 'reserved'
    `).get(reservationId);
    if (!reservation) {
      db.exec('COMMIT');
      return;
    }
    if (reservation.role !== 'super_admin' && Number(reservation.amount) > 0) {
      db.prepare('UPDATE users SET credit_balance = credit_balance + ?, updated_at = ? WHERE id = ?').run(reservation.amount, now(), reservation.user_id);
      db.prepare(`
        INSERT INTO credit_ledger (id, user_id, amount, type, source, reference_id, metadata, created_at)
        VALUES (?, ?, ?, 'refund', 'generation_release', ?, ?, ?)
      `).run(randomUUID(), reservation.user_id, reservation.amount, reservation.id, JSON.stringify({ errorCode }), now());
    }
    db.prepare(`
      UPDATE credit_reservations SET status = 'released', error_code = ?, completed_at = ? WHERE id = ?
    `).run(errorCode, now(), reservation.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function createGeneration({ userId, reservationId, caseId, projectId = null, slotId = null, prompt, model, size, quality, provider }) {
  const id = randomUUID();
  const createdAt = now();
  const db = getDb();
  const versionNumber = projectId && slotId
    ? Number(db.prepare(`
      SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
      FROM generations WHERE user_id = ? AND project_id = ? AND slot_id = ?
    `).get(userId, projectId, slotId)?.next_version || 1)
    : 1;
  db.prepare(`
    INSERT INTO generations
      (id, user_id, reservation_id, case_id, project_id, slot_id, version_number, prompt, model, size, quality, provider, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?)
  `).run(id, userId, reservationId, caseId, projectId, slotId, versionNumber, prompt, model, size, quality, provider, createdAt);
  db.prepare('UPDATE credit_reservations SET generation_id = ? WHERE id = ?').run(id, reservationId);
  return id;
}

export function updateGeneration(id, updates) {
  const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const columns = entries.map(([key]) => `${key} = ?`).join(', ');
  getDb().prepare(`UPDATE generations SET ${columns} WHERE id = ?`).run(...entries.map(([, value]) => value), id);
}

export function listGenerations(userId, limit = 30) {
  return getDb().prepare(`
    SELECT id, project_id, slot_id, version_number, prompt, model, size, quality, status, storage_path, output_url, error_code, archived_at, created_at, completed_at
    FROM generations
    WHERE user_id = ? AND archived_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

export function getGeneration(userId, generationId) {
  return getDb().prepare(`
    SELECT id, project_id, slot_id, version_number, prompt, model, size, quality, status,
      storage_path, output_url, error_code, archived_at, created_at, completed_at
    FROM generations WHERE id = ? AND user_id = ?
  `).get(generationId, userId);
}

export function listEcommerceProjectGenerations(userId, projectId, limit = 200) {
  return getDb().prepare(`
    SELECT id, project_id, slot_id, version_number, prompt, model, size, quality, status,
      storage_path, output_url, error_code, archived_at, created_at, completed_at
    FROM generations
    WHERE user_id = ? AND project_id = ? AND archived_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, projectId, Math.max(1, Math.min(Number(limit) || 200, 500)));
}

export function listCreditProducts() {
  return getDb().prepare(`
    SELECT * FROM credit_products WHERE active = 1 ORDER BY sort_order ASC
  `).all();
}

export function listCreditLedger(userId, limit = 30) {
  return getDb().prepare(`
    SELECT id, amount, type, source, reference_id, metadata, created_at
    FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit);
}

export function addFavorite(userId, caseId) {
  getDb().prepare(`
    INSERT OR IGNORE INTO favorites (user_id, case_id, created_at) VALUES (?, ?, ?)
  `).run(userId, caseId, now());
  return getDb().prepare('SELECT user_id, case_id, created_at FROM favorites WHERE user_id = ? AND case_id = ?').get(userId, caseId);
}

export function removeFavorite(userId, caseId) {
  getDb().prepare('DELETE FROM favorites WHERE user_id = ? AND case_id = ?').run(userId, caseId);
}

export function listFavorites(userId) {
  return getDb().prepare('SELECT user_id, case_id, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

export function isAdminUser(userId) {
  return getUserById(userId)?.isSuperAdmin === true;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeEcommerceProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    projectName: row.project_name || '',
    platformId: row.platform_id || '',
    industryId: row.industry_id || '',
    productName: row.product_name || '',
    brandName: row.brand_name || '',
    targetAudience: row.target_audience || '',
    sellingPoints: parseJsonArray(row.selling_points),
    specifications: row.specifications || '',
    prohibitedContent: row.prohibited_content || '',
    aiBriefOriginals: parseJsonObject(row.ai_brief_originals),
    identitySpec: parseJsonObject(row.identity_spec),
    templateId: row.template_id || '',
    visualStyleId: row.visual_style_id || 'clean-commercial',
    selectedSlots: parseJsonArray(row.selected_slots),
    masterAssetId: row.master_asset_id || '',
    status: row.status || 'draft',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function listEcommerceProjects(userId, limit = 50) {
  return getDb().prepare(`
    SELECT * FROM ecommerce_projects
    WHERE user_id = ? AND status != 'deleted'
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(userId, Math.max(1, Math.min(Number(limit) || 50, 100))).map(normalizeEcommerceProject);
}

export function getEcommerceProject(userId, projectId) {
  return normalizeEcommerceProject(getDb().prepare(`
    SELECT * FROM ecommerce_projects WHERE id = ? AND user_id = ? AND status != 'deleted'
  `).get(projectId, userId));
}

export function createEcommerceProject(userId, values) {
  const id = randomUUID();
  const createdAt = now();
  getDb().prepare(`
    INSERT INTO ecommerce_projects (
      id, user_id, project_name, platform_id, industry_id, product_name, brand_name,
      target_audience, selling_points, specifications, prohibited_content, ai_brief_originals, identity_spec, template_id,
      visual_style_id, selected_slots, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
  `).run(
    id,
    userId,
    values.projectName,
    values.platformId,
    values.industryId,
    values.productName,
    values.brandName,
    values.targetAudience,
    JSON.stringify(values.sellingPoints || []),
    values.specifications,
    values.prohibitedContent,
    JSON.stringify(values.aiBriefOriginals || {}),
    JSON.stringify(values.identitySpec || {}),
    values.templateId || '',
    values.visualStyleId,
    JSON.stringify(values.selectedSlots || []),
    createdAt,
    createdAt
  );
  return getEcommerceProject(userId, id);
}

export function updateEcommerceProject(userId, projectId, values) {
  if (!getEcommerceProject(userId, projectId)) return null;
  getDb().prepare(`
    UPDATE ecommerce_projects SET
      project_name = ?, platform_id = ?, industry_id = ?, product_name = ?, brand_name = ?,
      target_audience = ?, selling_points = ?, specifications = ?, prohibited_content = ?,
      ai_brief_originals = ?, identity_spec = ?, template_id = ?, visual_style_id = ?, selected_slots = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    values.projectName,
    values.platformId,
    values.industryId,
    values.productName,
    values.brandName,
    values.targetAudience,
    JSON.stringify(values.sellingPoints || []),
    values.specifications,
    values.prohibitedContent,
    JSON.stringify(values.aiBriefOriginals || {}),
    JSON.stringify(values.identitySpec || {}),
    values.templateId || '',
    values.visualStyleId,
    JSON.stringify(values.selectedSlots || []),
    now(),
    projectId,
    userId
  );
  return getEcommerceProject(userId, projectId);
}

export function deleteEcommerceProject(userId, projectId) {
  const project = getEcommerceProject(userId, projectId);
  if (!project) return null;
  getDb().prepare('DELETE FROM ecommerce_projects WHERE id = ? AND user_id = ?').run(projectId, userId);
  return project;
}

export function normalizeEcommerceProjectAsset(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    assetType: row.asset_type || 'product',
    fileName: row.file_name || '',
    mimeType: row.mime_type || 'image/png',
    fileSize: Number(row.file_size || 0),
    storagePath: row.storage_path || '',
    purpose: row.purpose || '',
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at || ''
  };
}

export function createEcommerceProjectAsset(userId, values) {
  const id = values.id || randomUUID();
  const createdAt = now();
  getDb().prepare(`
    INSERT INTO ecommerce_project_assets
      (id, project_id, user_id, asset_type, file_name, mime_type, file_size, storage_path, purpose, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    values.projectId,
    userId,
    values.assetType,
    values.fileName,
    values.mimeType,
    values.fileSize,
    values.storagePath,
    values.purpose || '',
    Number(values.sortOrder || 0),
    createdAt
  );
  return getEcommerceProjectAsset(userId, id);
}

export function getEcommerceProjectAsset(userId, assetId) {
  return normalizeEcommerceProjectAsset(getDb().prepare(`
    SELECT * FROM ecommerce_project_assets WHERE id = ? AND user_id = ?
  `).get(assetId, userId));
}

export function listEcommerceProjectAssets(userId, projectId) {
  return getDb().prepare(`
    SELECT * FROM ecommerce_project_assets
    WHERE user_id = ? AND project_id = ?
    ORDER BY sort_order ASC, created_at ASC, id ASC
  `).all(userId, projectId).map(normalizeEcommerceProjectAsset);
}

export function deleteEcommerceProjectAsset(userId, assetId) {
  const asset = getEcommerceProjectAsset(userId, assetId);
  if (!asset) return null;
  getDb().prepare(`
    UPDATE ecommerce_projects SET master_asset_id = NULL, updated_at = ?
    WHERE id = ? AND user_id = ? AND master_asset_id = ?
  `).run(now(), asset.projectId, userId, assetId);
  getDb().prepare('DELETE FROM ecommerce_project_assets WHERE id = ? AND user_id = ?').run(assetId, userId);
  return asset;
}

export function setEcommerceProjectMasterAsset(userId, projectId, assetId) {
  const project = getEcommerceProject(userId, projectId);
  const asset = getEcommerceProjectAsset(userId, assetId);
  if (!project || !asset || asset.projectId !== projectId || !['product', 'packaging'].includes(asset.assetType)) return null;
  getDb().prepare(`
    UPDATE ecommerce_projects SET master_asset_id = ?, updated_at = ? WHERE id = ? AND user_id = ?
  `).run(assetId, now(), projectId, userId);
  return getEcommerceProject(userId, projectId);
}
