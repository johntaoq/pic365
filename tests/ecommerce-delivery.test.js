import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeliveryFilename,
  createDeliveryDocumentDraft,
  getDeliveryExportAvailability,
  getDeliveryTextScale,
  getDeliveryWorkflowStep,
  normalizeDeliveryAdvanced,
  resolveDeliveryOverlayBoxes,
  validateDeliveryDocument
} from '../shared/ecommerce-delivery.js';
import { getEcommercePlatform } from '../shared/ecommerce-catalog.js';

const amazon = getEcommercePlatform('amazon');
const project = {
  id: 'project-1',
  platformId: 'amazon',
  industryId: 'general',
  productName: 'Titanium Bottle',
  brandName: 'Example',
  targetAudience: 'Commuters',
  sellingPoints: ['Lightweight', 'Leak resistant'],
  specifications: '500 ml, silver',
  prohibitedContent: '',
  selectedSlots: ['compliant-main', 'dimensions']
};

test('delivery checks are advisory and do not block the export stage', () => {
  const base = { includeInExport: true, sourceGenerationId: 'generation-1', validation: {} };
  assert.equal(getDeliveryWorkflowStep([]), 0);
  assert.equal(getDeliveryWorkflowStep([base]), 1);
  assert.equal(getDeliveryWorkflowStep([{ ...base, validation: { checkedAt: 'now', ready: false } }]), 3);
  assert.equal(getDeliveryWorkflowStep([{ ...base, validation: { checkedAt: 'now', ready: true } }], { dirty: true }), 2);
  assert.equal(getDeliveryWorkflowStep([{ ...base, validation: { checkedAt: 'now', ready: true } }]), 3);
  assert.equal(getDeliveryWorkflowStep([{ ...base, includeInExport: false }]), 0);
});

test('delivery export only requires saved documents with source images', () => {
  const unchecked = { includeInExport: true, sourceGenerationId: 'generation-1', validation: {} };
  const checkedWithIssues = { ...unchecked, validation: { checkedAt: 'now', ready: false } };
  assert.equal(getDeliveryExportAvailability([unchecked]).canExport, true);
  assert.equal(getDeliveryExportAvailability([checkedWithIssues]).canExport, true);
  assert.equal(getDeliveryExportAvailability([checkedWithIssues], { dirty: true }).canExport, false);
  assert.deepEqual(getDeliveryExportAvailability([{ ...unchecked, sourceGenerationId: '' }]), {
    canExport: false,
    includedCount: 1,
    missingSourceCount: 1,
    dirty: false
  });
});

test('delivery validation enforces Amazon main-image rules', () => {
  const slot = amazon.slots.find((item) => item.id === 'compliant-main');
  const document = createDeliveryDocumentDraft({
    project,
    slot,
    output: { selectedGenerationId: 'generation-1' }
  });
  const passed = validateDeliveryDocument({
    document,
    project,
    slot,
    diagnostics: { sourceWidth: 1024, sourceHeight: 1024, whiteCornerRatio: 0.96 }
  });
  assert.equal(passed.ready, true);
  assert.equal(passed.failed, 0);

  const invalid = validateDeliveryDocument({
    document: {
      ...document,
      advanced: { ...document.advanced, showText: true },
      content: { ...document.content, badge: 'SALE', price: '$19.99' }
    },
    project,
    slot,
    diagnostics: { sourceWidth: 1024, sourceHeight: 1024, whiteCornerRatio: 0.3 }
  });
  assert.equal(invalid.ready, false);
  assert.ok(invalid.rules.some((rule) => rule.id === 'amazon-main-overlays' && rule.status === 'failed'));
  assert.ok(invalid.rules.some((rule) => rule.id === 'amazon-white-background' && rule.status === 'failed'));
});

test('professional components require their structured data', () => {
  const slot = amazon.slots.find((item) => item.id === 'dimensions');
  const document = createDeliveryDocumentDraft({
    project,
    slot,
    output: { selectedGenerationId: 'generation-2' }
  });
  const missing = validateDeliveryDocument({ document, project, slot });
  assert.equal(missing.ready, false);
  const complete = validateDeliveryDocument({
    document: {
      ...document,
      content: { ...document.content, dimensions: { width: '70 mm', height: '240 mm', depth: '', weight: '180 g' } }
    },
    project,
    slot
  });
  assert.equal(complete.ready, true);
});

test('delivery defaults use verified included items and never treat selling points as comparison facts', () => {
  const slot = amazon.slots.find((item) => item.id === 'package-contents');
  const document = createDeliveryDocumentDraft({
    project: {
      ...project,
      specifications: '',
      identitySpec: { includedItems: 'Bottle ×1; lid ×1; cleaning brush ×1' }
    },
    slot,
    output: { selectedGenerationId: 'generation-package' }
  });
  assert.deepEqual(document.content.packageItems, ['Bottle ×1', 'lid ×1', 'cleaning brush ×1']);
  assert.deepEqual(document.content.comparison.leftItems, []);
});

test('catalog delivery sizes preserve the declared aspect ratio', () => {
  const ratios = { '1:1': 1, '3:4': 3 / 4, '4:3': 4 / 3, '9:16': 9 / 16, '16:9': 16 / 9 };
  for (const platform of ['taobao-tmall', 'douyin', 'amazon', 'shopify'].map(getEcommercePlatform)) {
    for (const slot of platform.slots) {
      if (!ratios[slot.aspectRatio]) continue;
      const [width, height] = slot.recommendedSize.split('x').map(Number);
      assert.ok(Math.abs(width / height - ratios[slot.aspectRatio]) < 0.001, `${platform.id}:${slot.id}`);
    }
  }
});

test('delivery filenames follow product-slot-platform-version convention', () => {
  assert.equal(
    buildDeliveryFilename({
      productName: '钛合金保温杯',
      slotName: '尺寸图',
      platformId: 'amazon',
      versionNumber: 3,
      language: 'zh',
      format: 'jpeg'
    }),
    '钛合金保温杯-尺寸图-Amazon-V3.jpg'
  );
  assert.equal(
    buildDeliveryFilename({
      productName: 'Titanium Bottle',
      slotName: 'Feature Image',
      platformId: 'shopify',
      versionNumber: 2,
      language: 'en',
      format: 'webp'
    }),
    'Titanium Bottle-Feature Image-Shopify-V2.webp'
  );
});

test('editable text mask and text container geometry is normalized and reusable by preview and export', () => {
  const advanced = normalizeDeliveryAdvanced({
    showMask: false,
    maskBox: { x: 0.18, y: 0.2, width: 0.6, height: 0.42 },
    textBox: { x: 0.24, y: 0.27, width: 0.48, height: 0.24 },
    maskOpacity: 0.55,
    textOpacity: 0.72
  });
  const geometry = resolveDeliveryOverlayBoxes({
    targetWidth: 1024,
    targetHeight: 1024,
    layoutId: 'bottom-left',
    advanced
  });
  assert.deepEqual(geometry.maskBox, { x: 0.18, y: 0.2, width: 0.6, height: 0.42 });
  assert.deepEqual(geometry.textBox, { x: 0.24, y: 0.27, width: 0.48, height: 0.24 });
  assert.equal(geometry.maskOpacity, 0.55);
  assert.equal(geometry.textOpacity, 0.72);
  assert.equal(advanced.showMask, false);
  const content = { headline: 'Compact headline', subtitle: 'Supporting copy', bullets: ['One', 'Two', 'Three'] };
  assert.ok(getDeliveryTextScale(content, { width: 0.3, height: 0.12 }) < getDeliveryTextScale(content, { width: 0.65, height: 0.3 }));
});

test('default text bounds fit compact copy instead of filling an oversized panel', () => {
  const slot = amazon.slots.find((item) => item.id === 'feature');
  const document = createDeliveryDocumentDraft({
    project: { ...project, productName: 'Noise cancelling earbuds', sellingPoints: ['Clear calls'] },
    slot,
    output: { selectedGenerationId: 'generation-fit' }
  });
  document.content = { ...document.content, headline: 'Clear calls', subtitle: 'Focused listening', bullets: ['Noise reduction'] };
  const geometry = resolveDeliveryOverlayBoxes(document);
  assert.ok(geometry.textBox.height < 0.24);
  assert.ok(geometry.maskBox.height < 0.3);
  assert.ok(geometry.maskBox.height > geometry.textBox.height);
});

test('legacy no-text documents also hide the text panel', () => {
  const advanced = normalizeDeliveryAdvanced({ showText: false });
  assert.equal(advanced.showText, false);
  assert.equal(advanced.showMask, false);
});
