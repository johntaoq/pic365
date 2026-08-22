import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-prompt-logging-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');

const db = await import('../api/_lib/local-db.js');

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('prompt audit logging is controlled by the admin switch and stores complete generation context', () => {
  const user = db.createUser({
    email: 'prompt-audit@example.com',
    password: 'testing-1234',
    fullName: 'Prompt Audit'
  });
  assert.equal(db.getPromptLoggingConfig().enabled, false);

  const disabledResult = db.recordPromptAuditLog({
    userId: user.id,
    userEmail: user.email,
    userPrompt: 'not recorded',
    effectivePrompt: 'not recorded with system context',
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'medium'
  });
  assert.equal(disabledResult, null);
  assert.deepEqual(db.listPromptAuditLogs(), []);

  const enabled = db.updatePromptLoggingConfig({ enabled: true }, user.id);
  assert.equal(enabled.enabled, true);
  const generationId = db.createGeneration({
    userId: user.id,
    reservationId: null,
    caseId: null,
    projectId: null,
    slotId: null,
    prompt: 'repair the product label',
    model: 'gpt-image-2',
    size: '1536x1024',
    quality: 'high',
    provider: 'GPT Image'
  });
  const auditId = db.recordPromptAuditLog({
    userId: user.id,
    userEmail: user.email,
    generationId,
    clientTaskId: 'batch-task-1',
    taskMode: 'batch-repair',
    sourceName: 'product-front.png',
    userPrompt: 'repair the product label',
    effectivePrompt: 'Preserve all unpainted areas.\n\nrepair the product label',
    providerId: 'provider-1',
    providerName: 'GPT Image',
    model: 'gpt-image-2',
    size: '1536x1024',
    quality: 'high',
    referenceCount: 1
  });
  assert.ok(auditId);

  const [entry] = db.listPromptAuditLogs();
  assert.equal(entry.userEmail, user.email);
  assert.equal(entry.generationId, generationId);
  assert.equal(entry.taskMode, 'batch-repair');
  assert.equal(entry.sourceName, 'product-front.png');
  assert.equal(entry.userPrompt, 'repair the product label');
  assert.match(entry.effectivePrompt, /Preserve all unpainted areas/);
  assert.equal(entry.model, 'gpt-image-2');
  assert.equal(entry.size, '1536x1024');
  assert.equal(entry.width, 1536);
  assert.equal(entry.height, 1024);
  assert.equal(entry.quality, 'high');
  assert.equal(entry.referenceCount, 1);
  assert.equal(db.recordPromptAuditLog({ generationId, userPrompt: 'duplicate' }), null);

  db.updatePromptLoggingConfig({ enabled: false }, user.id);
  assert.equal(db.recordPromptAuditLog({ userId: user.id, userPrompt: 'later prompt' }), null);
  assert.equal(db.listPromptAuditLogs().length, 1);
});
