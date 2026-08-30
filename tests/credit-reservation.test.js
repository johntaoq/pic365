import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'awesome-gpt-image-credit-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
const localDb = await import('../api/_lib/local-db.js');

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('credit reservations debit and refund a variable image price', () => {
  const user = localDb.createUser({
    email: `pricing-${Date.now()}@example.com`,
    password: 'testing-1234',
    fullName: 'Pricing Test'
  });
  localDb.getDb().prepare('UPDATE users SET credit_balance = 1000 WHERE id = ?').run(user.id);

  const reservation = localDb.reserveCredit(user.id, {
    prompt: 'test image',
    amount: 320,
    metadata: { pricingBand: 'xlarge', quality: 'high' }
  });
  assert.equal(reservation.creditAmount, 320);
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 680);

  localDb.releaseCreditReservation(reservation.reservationId, 'TEST_REFUND');
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 1000);
});

test('variable reservations fail when the full quoted amount is unavailable', () => {
  const user = localDb.createUser({
    email: `pricing-low-${Date.now()}@example.com`,
    password: 'testing-1234',
    fullName: 'Pricing Low Balance'
  });
  localDb.getDb().prepare('UPDATE users SET credit_balance = 319 WHERE id = ?').run(user.id);
  assert.throws(
    () => localDb.reserveCredit(user.id, { prompt: 'test image', amount: 320 }),
    (error) => error?.code === 'CREDITS_REQUIRED'
  );
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 319);
});

test('each AI magic tool call deducts one credit outside image promotions', () => {
  const user = localDb.createUser({
    email: `ai-magic-${Date.now()}@example.com`,
    password: 'testing-1234',
    fullName: 'AI Magic Test'
  });
  localDb.getDb().prepare('UPDATE users SET credit_balance = 2 WHERE id = ?').run(user.id);

  const profile = localDb.chargeAiToolCredit(user.id, {
    source: 'ai_magic_prompt',
    metadata: { test: true }
  });
  assert.equal(profile.creditBalance, 1);
  const ledger = localDb.getDb().prepare(`
    SELECT amount, type, source FROM credit_ledger
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(user.id);
  assert.equal(ledger.amount, -1);
  assert.equal(ledger.type, 'ai_tool');
  assert.equal(ledger.source, 'ai_magic_prompt');

  localDb.chargeAiToolCredit(user.id, { source: 'ai_magic_brief' });
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 0);
  assert.throws(
    () => localDb.chargeAiToolCredit(user.id, { source: 'ai_magic_prompt' }),
    (error) => error?.code === 'CREDITS_REQUIRED'
  );
});

test('failed AI magic calls refund once using the request reference', () => {
  const user = localDb.createUser({
    email: `ai-magic-refund-${Date.now()}@example.com`,
    password: 'testing-1234',
    fullName: 'AI Magic Refund Test'
  });
  localDb.getDb().prepare('UPDATE users SET credit_balance = 2 WHERE id = ?').run(user.id);
  const referenceId = `prompt-${Date.now()}`;

  localDb.chargeAiToolCredit(user.id, {
    source: 'ai_magic_prompt',
    referenceId,
    metadata: { model: 'gpt-5.6-luna' }
  });
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 1);

  localDb.refundAiToolCredit(user.id, { referenceId, errorCode: 'MODEL_FAILED' });
  localDb.refundAiToolCredit(user.id, { referenceId, errorCode: 'MODEL_FAILED' });
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 2);
  assert.equal(localDb.getDb().prepare(`
    SELECT COUNT(*) AS count FROM credit_ledger
    WHERE user_id = ? AND reference_id = ? AND type = 'refund' AND source = 'ai_tool_refund'
  `).get(user.id, referenceId).count, 1);
});

test('image promotion settings persist and retain an audit trail', () => {
  const updated = localDb.updateImagePromotionConfig({
    enabled: true,
    name: 'Test promotion',
    payPercent: 75,
    startsAt: '2030-01-01T00:00:00.000Z',
    endsAt: '2030-01-31T00:00:00.000Z'
  }, 'test-admin');
  assert.equal(updated.enabled, true);
  assert.equal(updated.name, 'Test promotion');
  assert.equal(updated.payPercent, 75);
  assert.equal(localDb.getImagePromotionConfig().endsAt, '2030-01-31T00:00:00.000Z');
  const audit = localDb.getDb().prepare(`
    SELECT setting_key, updated_by FROM app_setting_audit ORDER BY created_at DESC LIMIT 1
  `).get();
  assert.equal(audit.setting_key, 'image_promotion');
  assert.equal(audit.updated_by, 'test-admin');
});

test('startup recovery atomically fails processing work and releases reserved credits once', () => {
  const user = localDb.createUser({
    email: `restart-recovery-${Date.now()}@example.com`,
    password: 'testing-1234',
    fullName: 'Restart Recovery'
  });
  const db = localDb.getDb();
  db.prepare('UPDATE users SET credit_balance = 100 WHERE id = ?').run(user.id);

  const reservation = localDb.reserveCredit(user.id, { prompt: 'interrupted image', amount: 40 });
  const generationId = localDb.createGeneration({
    userId: user.id,
    reservationId: reservation.reservationId,
    caseId: null,
    projectId: null,
    slotId: null,
    prompt: 'interrupted image',
    model: 'test-image',
    size: '1024x1024',
    quality: 'low',
    provider: 'test'
  });
  const timestamp = new Date().toISOString();
  const projectId = `project-${Date.now()}`;
  const taskId = `task-${Date.now()}`;
  db.prepare(`
    INSERT INTO ecommerce_projects
      (id, user_id, project_name, platform_id, industry_id, product_name, created_at, updated_at)
    VALUES (?, ?, 'Recovery project', 'test', 'test', 'Recovery product', ?, ?)
  `).run(projectId, user.id, timestamp, timestamp);
  db.prepare(`
    INSERT INTO ecommerce_generation_tasks
      (id, user_id, project_id, slot_id, generation_id, status, quality, request_json, created_at, updated_at, started_at)
    VALUES (?, ?, ?, 'hero', ?, 'running', 'low', '{}', ?, ?, ?)
  `).run(taskId, user.id, projectId, generationId, timestamp, timestamp, timestamp);

  assert.equal(localDb.getUserProfile(user.id).creditBalance, 60);
  const recovered = localDb.reconcileInterruptedGenerationState(db);
  assert.deepEqual(recovered, {
    releasedReservations: 1,
    interruptedGenerations: 1,
    interruptedTasks: 1,
    interruptedFreeTasks: 0,
    interruptedVideoTasks: 0
  });
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 100);
  assert.equal(db.prepare('SELECT status, error_code FROM credit_reservations WHERE id = ?').get(reservation.reservationId).status, 'released');
  const generation = db.prepare('SELECT status, error_code FROM generations WHERE id = ?').get(generationId);
  assert.equal(generation.status, 'failed');
  assert.equal(generation.error_code, 'SERVER_RESTARTED');
  const task = db.prepare('SELECT status, error_code FROM ecommerce_generation_tasks WHERE id = ?').get(taskId);
  assert.equal(task.status, 'interrupted');
  assert.equal(task.error_code, 'SERVER_RESTARTED');

  const secondPass = localDb.reconcileInterruptedGenerationState(db);
  assert.deepEqual(secondPass, {
    releasedReservations: 0,
    interruptedGenerations: 0,
    interruptedTasks: 0,
    interruptedFreeTasks: 0,
    interruptedVideoTasks: 0
  });
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 100);
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM credit_ledger
    WHERE reference_id = ? AND source = 'generation_recovery'
  `).get(reservation.reservationId).count, 1);
});
