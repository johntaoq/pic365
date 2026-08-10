import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'awesome-gpt-image-p1-'));
const databasePath = path.join(tempDirectory, 'app.sqlite');
process.env.APP_DB_PATH = databasePath;

const localDb = await import('../api/_lib/local-db.js');
const p1Db = await import('../api/_lib/ecommerce-p1-db.js');

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function createProjectFixture() {
  const user = localDb.createUser({
    email: `p1-${Date.now()}@example.com`,
    password: 'testing-1234',
    fullName: 'P1 Test'
  });
  localDb.getDb().prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(user.id);
  const project = localDb.createEcommerceProject(user.id, {
    projectName: 'P1 fixture',
    platformId: 'taobao-tmall',
    industryId: 'general',
    productName: 'Test product',
    brandName: '',
    coreUser: 'Marketplace operators',
    coreScenario: 'Preparing a new product listing',
    sellingPoints: ['Stable identity'],
    specifications: 'One product',
    prohibitedContent: '',
    aiBriefOriginals: {},
    identitySpec: { structure: 'Keep the body shape unchanged.' },
    templateId: 'tmall-clean-launch',
    visualStyleId: 'clean-commercial',
    selectedSlots: ['main-square', 'white-background']
  });
  p1Db.syncEcommerceProjectOutputs(user.id, project.id, project.selectedSlots);
  return { user, project };
}

test('project briefs persist core users and core scenarios independently', () => {
  const { user, project } = createProjectFixture();
  assert.equal(project.coreUser, 'Marketplace operators');
  assert.equal(project.coreScenario, 'Preparing a new product listing');

  const updated = localDb.updateEcommerceProject(user.id, project.id, {
    ...project,
    coreUser: 'First-time online shoppers',
    coreScenario: 'Comparing product details before checkout'
  });
  assert.equal(updated.coreUser, 'First-time online shoppers');
  assert.equal(updated.coreScenario, 'Comparing product details before checkout');
  assert.equal(updated.targetAudience, 'First-time online shoppers\nComparing product details before checkout');

  const clearedUser = localDb.updateEcommerceProject(user.id, project.id, {
    ...updated,
    coreUser: '',
    coreScenario: 'Using the product at home'
  });
  assert.equal(clearedUser.coreUser, '');
  assert.equal(clearedUser.coreScenario, 'Using the product at home');
  assert.equal(clearedUser.targetAudience, 'Using the product at home');
});

function createSucceededGeneration(userId, projectId, slotId, prompt) {
  const reservation = localDb.reserveCredit(userId, { prompt });
  const generationId = localDb.createGeneration({
    userId,
    reservationId: reservation.reservationId,
    caseId: null,
    projectId,
    slotId,
    prompt,
    model: 'test-image-model',
    size: '1024x1024',
    quality: 'medium',
    provider: 'test'
  });
  localDb.updateGeneration(generationId, {
    status: 'succeeded',
    storage_path: `generated/${generationId}.png`,
    completed_at: new Date().toISOString()
  });
  localDb.completeCreditReservation(reservation.reservationId);
  return generationId;
}

test('P1 outputs support adoption, locking, consistency and archiving', () => {
  const { user, project } = createProjectFixture();
  const first = createSucceededGeneration(user.id, project.id, 'main-square', 'first');
  const second = createSucceededGeneration(user.id, project.id, 'main-square', 'second');

  assert.equal(p1Db.selectEcommerceOutputGeneration(user.id, project.id, 'main-square', first)?.selectedGenerationId, first);
  assert.equal(p1Db.setEcommerceOutputLocked(user.id, project.id, 'main-square', true)?.locked, true);
  assert.equal(p1Db.selectEcommerceOutputGeneration(user.id, project.id, 'main-square', second), null);
  assert.equal(p1Db.archiveEcommerceGeneration(user.id, project.id, 'main-square', first).error, 'SELECTED_VERSION');

  p1Db.setEcommerceOutputLocked(user.id, project.id, 'main-square', false);
  assert.equal(p1Db.selectEcommerceOutputGeneration(user.id, project.id, 'main-square', second)?.selectedGenerationId, second);
  assert.equal(p1Db.archiveEcommerceGeneration(user.id, project.id, 'main-square', first).ok, true);

  const checked = p1Db.updateEcommerceOutputConsistency(user.id, project.id, 'main-square', {
    status: 'passed', score: 94, issues: [], summary: 'Identity is stable.'
  });
  assert.equal(checked.consistencyStatus, 'passed');
  assert.equal(checked.consistencyScore, 94);
});

test('P1 tasks survive state transitions and can be retried or cancelled', () => {
  const { user, project } = createProjectFixture();
  const [first, second] = p1Db.createEcommerceGenerationTasks(user.id, project.id, [
    { slotId: 'main-square', quality: 'medium', projectUpdatedAt: project.updatedAt },
    { slotId: 'white-background', quality: 'low', projectUpdatedAt: project.updatedAt }
  ]);

  assert.equal(first.status, 'queued');
  assert.throws(
    () => p1Db.createEcommerceGenerationTasks(user.id, project.id, [{ slotId: 'main-square' }]),
    (error) => error?.code === 'TASK_ALREADY_ACTIVE'
  );
  assert.equal(p1Db.claimEcommerceGenerationTask(user.id, first.id)?.status, 'running');
  assert.equal(p1Db.completeEcommerceGenerationTask(user.id, first.id, { status: 'failed', errorCode: 'TEST_FAILURE' })?.status, 'failed');
  const updatedProject = localDb.updateEcommerceProject(user.id, project.id, { ...project, projectName: 'Updated while queued' });
  const retried = p1Db.retryEcommerceGenerationTask(user.id, first.id);
  assert.equal(retried?.status, 'queued');
  assert.equal(retried?.request.projectUpdatedAt, updatedProject.updatedAt);
  assert.equal(p1Db.claimEcommerceGenerationTask(user.id, first.id)?.attempts, 2);
  assert.equal(p1Db.requestEcommerceGenerationTaskCancellation(user.id, first.id)?.cancelRequested, true);
  assert.equal(p1Db.completeEcommerceGenerationTask(user.id, first.id, { status: 'cancelled', errorCode: 'GENERATION_CANCELLED' })?.status, 'cancelled');

  const cancelledQueued = p1Db.requestEcommerceGenerationTaskCancellation(user.id, second.id);
  assert.equal(cancelledQueued.status, 'cancelled');
  assert.equal(cancelledQueued.cancelRequested, true);
});

test('P1 asset purpose and ordering are persisted', () => {
  const { user, project } = createProjectFixture();
  const first = localDb.createEcommerceProjectAsset(user.id, {
    projectId: project.id,
    assetType: 'product',
    fileName: 'front.png',
    mimeType: 'image/png',
    fileSize: 10,
    storagePath: 'assets/front.png',
    sortOrder: 1
  });
  const second = localDb.createEcommerceProjectAsset(user.id, {
    projectId: project.id,
    assetType: 'reference',
    fileName: 'light.png',
    mimeType: 'image/png',
    fileSize: 10,
    storagePath: 'assets/light.png',
    sortOrder: 2
  });
  const packaging = localDb.createEcommerceProjectAsset(user.id, {
    projectId: project.id,
    assetType: 'packaging',
    fileName: 'box.png',
    mimeType: 'image/png',
    fileSize: 10,
    storagePath: 'assets/box.png',
    sortOrder: 3
  });

  assert.equal(p1Db.updateEcommerceAssetPurpose(user.id, project.id, second.id, 'lighting'), true);
  assert.equal(p1Db.reorderEcommerceProjectAssets(user.id, project.id, [second.id, first.id, packaging.id]), true);
  const assets = localDb.listEcommerceProjectAssets(user.id, project.id);
  assert.deepEqual(assets.map((asset) => asset.id), [second.id, first.id, packaging.id]);
  assert.equal(assets[0].purpose, 'lighting');
  assert.equal(localDb.setEcommerceProjectMasterAsset(user.id, project.id, packaging.id), null);
  assert.equal(localDb.setEcommerceProjectMasterAsset(user.id, project.id, first.id)?.masterAssetId, first.id);
});
