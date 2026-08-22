import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'awesome-gpt-image-delivery-api-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');

const localDb = await import('../api/_lib/local-db.js');
const p1Db = await import('../api/_lib/ecommerce-p1-db.js');
const deliveryDb = await import('../api/_lib/ecommerce-delivery-db.js');
const { createDeliveryDocumentDraft } = await import('../shared/ecommerce-delivery.js');
const { getEcommercePlatform } = await import('../shared/ecommerce-catalog.js');
const { default: deliveryDocumentsHandler } = await import('../api/ecommerce/delivery-documents.js');

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, req = {}) {
  let statusCode = 200;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, ...req }, res))
    .then(() => ({ statusCode, payload }));
}

test('delivery loading includes only successful images adopted in step six', async () => {
  const user = localDb.createUser({
    email: `delivery-${Date.now()}@example.com`,
    password: 'testing-1234',
    fullName: 'Delivery Test'
  });
  localDb.getDb().prepare('UPDATE users SET credit_balance = 1000 WHERE id = ?').run(user.id);
  const session = localDb.createSession(user.id);
  const headers = { cookie: `member_session=${encodeURIComponent(session.token)}` };
  const project = localDb.createEcommerceProject(user.id, {
    projectName: 'Delivery filter',
    platformId: 'taobao-tmall',
    industryId: 'general',
    productName: 'Test product',
    brandName: '',
    coreUser: 'Online shoppers',
    coreScenario: 'Product detail browsing',
    sellingPoints: ['Clear product presentation'],
    specifications: '',
    prohibitedContent: '',
    aiBriefOriginals: {},
    identitySpec: {},
    templateId: '',
    visualStyleId: 'clean-commercial',
    imageProviderId: '',
    selectedSlots: ['main-square', 'white-background']
  });
  p1Db.syncEcommerceProjectOutputs(user.id, project.id, project.selectedSlots);

  const reservation = localDb.reserveCredit(user.id, { prompt: 'delivery test' });
  const generationId = localDb.createGeneration({
    userId: user.id,
    reservationId: reservation.reservationId,
    caseId: null,
    projectId: project.id,
    slotId: 'main-square',
    prompt: 'delivery test',
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
  p1Db.selectEcommerceOutputGeneration(user.id, project.id, 'main-square', generationId);

  const platform = getEcommercePlatform(project.platformId);
  const missingSlot = platform.slots.find((slot) => slot.id === 'white-background');
  deliveryDb.syncEcommerceDeliveryDocument(user.id, createDeliveryDocumentDraft({
    project,
    slot: missingSlot,
    output: p1Db.getEcommerceProjectOutput(user.id, project.id, missingSlot.id),
    order: 2
  }));

  const prepared = await invoke(deliveryDocumentsHandler, {
    method: 'POST',
    headers,
    body: { action: 'prepare', projectId: project.id, language: 'zh' }
  });
  assert.equal(prepared.statusCode, 200);
  assert.deepEqual(prepared.payload.documents.map((document) => document.slotId), ['main-square']);
  assert.equal(prepared.payload.documents[0].sourceGenerationId, generationId);

  const loaded = await invoke(deliveryDocumentsHandler, {
    method: 'GET',
    headers,
    query: { projectId: project.id }
  });
  assert.equal(loaded.statusCode, 200);
  assert.deepEqual(loaded.payload.documents.map((document) => document.slotId), ['main-square']);
});
