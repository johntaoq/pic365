import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('hot reloading the database module does not interrupt active generation tasks', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-hot-reload-'));
  process.env.APP_DB_PATH = path.join(directory, 'app.sqlite');
  const first = await import(`../api/_lib/local-db.js?hot-reload-first=${Date.now()}`);
  const user = first.createUser({
    email: `hot-reload-${Date.now()}@example.com`,
    password: 'testing-1234',
    fullName: 'Hot Reload Test'
  });
  const project = first.createEcommerceProject(user.id, {
    projectName: 'Hot reload project',
    platformId: 'test',
    industryId: 'test',
    productName: 'Test product',
    brandName: '',
    coreUser: '',
    coreScenario: '',
    sellingPoints: [],
    specifications: '',
    prohibitedContent: '',
    aiBriefOriginals: {},
    identitySpec: {},
    templateId: '',
    visualStyleId: 'clean-commercial',
    imageProviderId: '',
    selectedSlots: ['hero']
  });
  first.getDb().prepare('UPDATE users SET credit_balance = 100 WHERE id = ?').run(user.id);
  const reservation = first.reserveCredit(user.id, { prompt: 'active generation', amount: 20 });
  const generationId = first.createGeneration({
    userId: user.id,
    reservationId: reservation.reservationId,
    caseId: null,
    projectId: project.id,
    slotId: 'hero',
    prompt: 'active generation',
    model: 'test-image',
    size: '1024x1024',
    quality: 'low',
    provider: 'test'
  });
  const timestamp = new Date().toISOString();
  first.getDb().prepare(`
    INSERT INTO ecommerce_generation_tasks
      (id, user_id, project_id, slot_id, generation_id, status, quality, request_json, created_at, updated_at, started_at)
    VALUES ('active-task', ?, ?, 'hero', ?, 'running', 'low', '{}', ?, ?, ?)
  `).run(user.id, project.id, generationId, timestamp, timestamp, timestamp);

  const second = await import(`../api/_lib/local-db.js?hot-reload-second=${Date.now()}`);
  const secondDb = second.getDb();
  assert.equal(secondDb.prepare('SELECT status FROM generations WHERE id = ?').get(generationId).status, 'processing');
  assert.equal(secondDb.prepare("SELECT status FROM ecommerce_generation_tasks WHERE id = 'active-task'").get().status, 'running');
  assert.equal(secondDb.prepare('SELECT status FROM credit_reservations WHERE id = ?').get(reservation.reservationId).status, 'reserved');

  secondDb.close();
  first.getDb().close();
  fs.rmSync(directory, { recursive: true, force: true });
});
