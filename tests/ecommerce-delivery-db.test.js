import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'awesome-gpt-image-delivery-db-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');

const localDb = await import('../api/_lib/local-db.js');
const deliveryDb = await import('../api/_lib/ecommerce-delivery-db.js');
const { createDeliveryDocumentDraft } = await import('../shared/ecommerce-delivery.js');
const { getEcommercePlatform } = await import('../shared/ecommerce-catalog.js');

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function fixture() {
  const user = localDb.createUser({ email: `delivery-${Date.now()}@example.com`, password: 'testing-1234' });
  const project = localDb.createEcommerceProject(user.id, {
    projectName: 'Delivery fixture',
    platformId: 'amazon',
    industryId: 'general',
    productName: 'Bottle',
    brandName: '',
    targetAudience: '',
    sellingPoints: ['Lightweight'],
    specifications: '500 ml',
    prohibitedContent: '',
    aiBriefOriginals: {},
    identitySpec: {},
    templateId: '',
    visualStyleId: 'clean-commercial',
    selectedSlots: ['compliant-main', 'dimensions']
  });
  return { user, project };
}

test('delivery documents persist editing, validation and order', () => {
  const { user, project } = fixture();
  const platform = getEcommercePlatform(project.platformId);
  const first = deliveryDb.createEcommerceDeliveryDocument(user.id, createDeliveryDocumentDraft({
    project,
    slot: platform.slots.find((slot) => slot.id === 'compliant-main'),
    output: null,
    order: 1
  }));
  const second = deliveryDb.createEcommerceDeliveryDocument(user.id, createDeliveryDocumentDraft({
    project,
    slot: platform.slots.find((slot) => slot.id === 'dimensions'),
    output: null,
    order: 2
  }));

  const updated = deliveryDb.updateEcommerceDeliveryDocument(user.id, second.id, {
    ...second,
    content: { ...second.content, dimensions: { width: '70 mm', height: '240 mm', depth: '', weight: '180 g' } },
    advanced: {
      ...second.advanced,
      maskBox: { x: 0.12, y: 0.18, width: 0.66, height: 0.4 },
      textBox: { x: 0.18, y: 0.25, width: 0.52, height: 0.22 },
      maskOpacity: 0.58,
      textOpacity: 0.76
    },
    outputFormat: 'webp'
  });
  assert.equal(updated.outputFormat, 'webp');
  assert.equal(updated.content.dimensions.height, '240 mm');
  assert.deepEqual(updated.advanced.maskBox, { x: 0.12, y: 0.18, width: 0.66, height: 0.4 });
  assert.deepEqual(updated.advanced.textBox, { x: 0.18, y: 0.25, width: 0.52, height: 0.22 });
  assert.equal(updated.advanced.maskOpacity, 0.58);
  assert.equal(updated.advanced.textOpacity, 0.76);

  const checked = deliveryDb.updateEcommerceDeliveryValidation(user.id, second.id, { ready: true, score: 100, checkedAt: new Date().toISOString() });
  assert.equal(checked.validation.ready, true);

  const excluded = deliveryDb.updateEcommerceDeliveryDocument(user.id, second.id, {
    ...checked,
    includeInExport: false,
    advanced: { ...checked.advanced, showSafeArea: true }
  });
  assert.equal(excluded.includeInExport, false);
  assert.equal(excluded.advanced.showSafeArea, true);
  assert.equal(excluded.validation.ready, true, 'preview and sequencing changes should preserve a successful platform check');

  const changedFormat = deliveryDb.updateEcommerceDeliveryDocument(user.id, second.id, {
    ...excluded,
    outputFormat: 'png'
  });
  assert.deepEqual(changedFormat.validation, {}, 'render-affecting changes must require a new platform check');

  assert.equal(deliveryDb.setEcommerceDeliveryDocumentsInclusion(user.id, project.id, [first.id, second.id], false), true);
  assert.ok(deliveryDb.listEcommerceDeliveryDocuments(user.id, project.id).every((item) => !item.includeInExport));
  assert.equal(deliveryDb.setEcommerceDeliveryDocumentsInclusion(user.id, project.id, [first.id], true), true);
  assert.equal(deliveryDb.getEcommerceDeliveryDocument(user.id, first.id).includeInExport, true);
  assert.equal(deliveryDb.setEcommerceDeliveryDocumentsInclusion(user.id, project.id, ['unknown-document'], false), false);

  assert.equal(deliveryDb.reorderEcommerceDeliveryDocuments(user.id, project.id, [second.id, first.id]), true);
  assert.deepEqual(deliveryDb.listEcommerceDeliveryDocuments(user.id, project.id).map((item) => item.id), [second.id, first.id]);
});

test('personal delivery templates can be saved and removed', () => {
  const { user, project } = fixture();
  const template = deliveryDb.createEcommerceUserTemplate(user.id, {
    name: 'Amazon standard',
    platformId: project.platformId,
    industryId: project.industryId,
    projectConfig: { platformId: project.platformId, industryId: project.industryId },
    deliveryConfig: [{ slotId: 'compliant-main', themeId: 'minimal-light' }]
  });
  assert.equal(deliveryDb.listEcommerceUserTemplates(user.id).length, 1);
  assert.equal(deliveryDb.getEcommerceUserTemplate(user.id, template.id).name, 'Amazon standard');
  assert.equal(deliveryDb.deleteEcommerceUserTemplate(user.id, template.id), true);
  assert.equal(deliveryDb.listEcommerceUserTemplates(user.id).length, 0);
});
