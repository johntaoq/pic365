import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'awesome-gpt-image-project-copy-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const localDb = await import('../api/_lib/local-db.js');
const p1Db = await import('../api/_lib/ecommerce-p1-db.js');
const deliveryDb = await import('../api/_lib/ecommerce-delivery-db.js');
const projectCopy = await import('../api/_lib/ecommerce-project-copy.js');
const storage = await import('../api/_lib/storage.js');
const { createDeliveryDocumentDraft } = await import('../shared/ecommerce-delivery.js');
const { getEcommercePlatform, getEcommerceTemplates } = await import('../shared/ecommerce-catalog.js');

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

async function fixture() {
  const user = localDb.createUser({ email: `copy-${Date.now()}@example.com`, password: 'testing-1234' });
  localDb.getDb().prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(user.id);
  const project = localDb.createEcommerceProject(user.id, {
    projectName: 'Reusable bottle launch',
    platformId: 'amazon',
    industryId: 'appliances-kitchen',
    subcategoryId: 'drinkware',
    productName: 'Aero bottle',
    brandName: 'Aero',
    coreUser: 'Urban commuters',
    coreScenario: 'Daily subway travel and desk hydration',
    sellingPoints: ['Lightweight', 'Leak resistant'],
    specifications: '500 ml',
    prohibitedContent: 'Unsupported claims',
    aiBriefOriginals: {},
    identitySpec: { structure: 'Keep the cylindrical body.' },
    templateId: '',
    visualStyleId: 'clean-commercial',
    selectedSlots: ['compliant-main', 'feature', 'dimensions']
  });
  p1Db.syncEcommerceProjectOutputs(user.id, project.id, project.selectedSlots);

  const assetId = crypto.randomUUID();
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==';
  const persisted = await storage.persistProjectAsset({ userId: user.id, projectId: project.id, assetId, image });
  localDb.createEcommerceProjectAsset(user.id, {
    id: assetId,
    projectId: project.id,
    assetType: 'product',
    fileName: 'bottle.png',
    mimeType: persisted.contentType,
    fileSize: persisted.byteLength,
    storagePath: persisted.storagePath,
    purpose: 'master',
    sortOrder: 1
  });
  localDb.setEcommerceProjectMasterAsset(user.id, project.id, assetId);

  const reservation = localDb.reserveCredit(user.id, { prompt: 'existing output' });
  const generationId = localDb.createGeneration({
    userId: user.id,
    reservationId: reservation.reservationId,
    caseId: null,
    projectId: project.id,
    slotId: 'compliant-main',
    prompt: 'existing output',
    model: 'test-image-model',
    size: '1024x1024',
    quality: 'medium',
    provider: 'test'
  });
  localDb.updateGeneration(generationId, { status: 'succeeded', storage_path: 'source-only.png' });
  localDb.completeCreditReservation(reservation.reservationId);
  p1Db.selectEcommerceOutputGeneration(user.id, project.id, 'compliant-main', generationId);

  const slot = getEcommercePlatform('amazon').slots.find((item) => item.id === 'feature');
  const document = deliveryDb.createEcommerceDeliveryDocument(user.id, createDeliveryDocumentDraft({ project, slot, output: null, order: 1 }));
  deliveryDb.updateEcommerceDeliveryDocument(user.id, document.id, {
    ...document,
    content: { ...document.content, logoAssetId: assetId }
  });
  return { user, project, assetId };
}

test('same-platform duplication physically copies assets and layouts but not generated images', async () => {
  const { user, project, assetId } = await fixture();
  const duplicate = await projectCopy.duplicateEcommerceProject(user.id, project.id);

  assert.equal(duplicate.platformId, project.platformId);
  assert.equal(duplicate.productName, project.productName);
  assert.equal(duplicate.subcategoryId, project.subcategoryId);
  assert.equal(duplicate.coreUser, project.coreUser);
  assert.equal(duplicate.coreScenario, project.coreScenario);
  assert.deepEqual(duplicate.selectedSlots, project.selectedSlots);
  assert.equal(localDb.listEcommerceProjectGenerations(user.id, duplicate.id).length, 0);
  assert.ok(p1Db.listEcommerceProjectOutputs(user.id, duplicate.id).every((output) => !output.selectedGenerationId));

  const sourceAsset = localDb.listEcommerceProjectAssets(user.id, project.id)[0];
  const copiedAsset = localDb.listEcommerceProjectAssets(user.id, duplicate.id)[0];
  assert.notEqual(copiedAsset.id, assetId);
  assert.notEqual(copiedAsset.storagePath, sourceAsset.storagePath);
  assert.equal(duplicate.masterAssetId, copiedAsset.id);
  assert.deepEqual((await storage.readStoredImage(copiedAsset.storagePath)).bytes, (await storage.readStoredImage(sourceAsset.storagePath)).bytes);

  const copiedDocument = deliveryDb.listEcommerceDeliveryDocuments(user.id, duplicate.id)[0];
  assert.equal(copiedDocument.sourceGenerationId, '');
  assert.equal(copiedDocument.content.logoAssetId, copiedAsset.id);
});

test('cross-platform adaptation keeps product facts and assets while adopting target recommendations', async () => {
  const { user, project } = await fixture();
  const adapted = await projectCopy.duplicateEcommerceProject(user.id, project.id, { targetPlatformId: 'taobao-tmall' });
  const recommended = getEcommerceTemplates('taobao-tmall', project.industryId)[0];

  assert.equal(adapted.platformId, 'taobao-tmall');
  assert.equal(adapted.productName, project.productName);
  assert.equal(adapted.subcategoryId, project.subcategoryId);
  assert.equal(adapted.coreUser, project.coreUser);
  assert.equal(adapted.coreScenario, project.coreScenario);
  assert.deepEqual(adapted.sellingPoints, project.sellingPoints);
  assert.deepEqual(adapted.selectedSlots, recommended.selectedSlotIds);
  assert.equal(localDb.listEcommerceProjectAssets(user.id, adapted.id).length, 1);
  assert.equal(deliveryDb.listEcommerceDeliveryDocuments(user.id, adapted.id).length, 0);
  assert.equal(localDb.listEcommerceProjectGenerations(user.id, adapted.id).length, 0);
});

test('a failed asset copy removes the partial target project and copied storage objects', async () => {
  const { user, project } = await fixture();
  localDb.createEcommerceProjectAsset(user.id, {
    projectId: project.id,
    assetType: 'packaging',
    fileName: 'missing.png',
    mimeType: 'image/png',
    fileSize: 100,
    storagePath: 'fixtures/does-not-exist.png',
    purpose: 'supporting',
    sortOrder: 2
  });
  const projectCountBefore = localDb.listEcommerceProjects(user.id).length;
  const fileCountBefore = fs.readdirSync(process.env.LOCAL_STORAGE_ROOT, { recursive: true })
    .filter((entry) => String(entry).endsWith('.png')).length;

  await assert.rejects(() => projectCopy.duplicateEcommerceProject(user.id, project.id));
  assert.equal(localDb.listEcommerceProjects(user.id).length, projectCountBefore);
  const files = fs.readdirSync(process.env.LOCAL_STORAGE_ROOT, { recursive: true })
    .filter((entry) => String(entry).endsWith('.png'));
  assert.equal(files.length, fileCountBefore);
});
