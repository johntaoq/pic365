import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import JSZip from 'jszip';
import sharp from 'sharp';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-delivery-watermark-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'images');
const db = await import('../api/_lib/local-db.js');
const p1Db = await import('../api/_lib/ecommerce-p1-db.js');
const { default: documentsHandler } = await import('../api/ecommerce/delivery-documents.js');
const { default: settingsHandler } = await import('../api/ecommerce/watermark-settings.js');
const { default: renderHandler } = await import('../api/ecommerce/delivery-render.js');
const { renderDetailPage } = await import('../api/_lib/ecommerce-renderer.js');

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, req = {}) {
  const response = { statusCode: 200, headers: {}, payload: null, bytes: null };
  const res = {
    status(code) { response.statusCode = code; return this; },
    setHeader(name, value) { response.headers[name.toLowerCase()] = value; },
    json(value) { response.payload = value; return this; },
    end(value) { response.bytes = Buffer.from(value); }
  };
  Object.defineProperty(res, 'statusCode', {
    set(value) { response.statusCode = value; },
    get() { return response.statusCode; }
  });
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, ...req }, res)).then(() => response);
}

async function fixture() {
  const user = db.createUser({
    email: `delivery-watermark-${crypto.randomUUID()}@example.com`,
    password: 'testing-1234',
    fullName: 'Export User'
  });
  db.getDb().prepare('UPDATE users SET credit_balance = 1000 WHERE id = ?').run(user.id);
  const session = db.createSession(user.id);
  const headers = { cookie: `member_session=${encodeURIComponent(session.token)}` };
  const project = db.createEcommerceProject(user.id, {
    projectName: 'Watermark Export',
    platformId: 'taobao-tmall',
    industryId: 'general',
    productName: 'Test product',
    brandName: '',
    coreUser: 'Online shoppers',
    coreScenario: 'Product details',
    sellingPoints: ['True benefit'],
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
  const sources = [];
  for (const [index, slotId] of project.selectedSlots.entries()) {
    const reservation = db.reserveCredit(user.id, { prompt: 'delivery export fixture' });
    const generationId = db.createGeneration({
      userId: user.id, reservationId: reservation.reservationId, caseId: null,
      projectId: project.id, slotId, prompt: 'delivery export fixture',
      model: 'test-image-model', size: '1024x1024', quality: 'medium', provider: 'test'
    });
    const storagePath = `${user.id}/${generationId}.png`;
    const source = await sharp({ create: {
      width: 650, height: 650, channels: 3, background: index ? '#f3f9f4' : '#fffaf6'
    } }).png().toBuffer();
    fs.mkdirSync(path.dirname(path.join(process.env.LOCAL_STORAGE_ROOT, storagePath)), { recursive: true });
    fs.writeFileSync(path.join(process.env.LOCAL_STORAGE_ROOT, storagePath), source);
    sources.push({ storagePath, source });
    db.updateGeneration(generationId, {
      status: 'succeeded', storage_path: storagePath, completed_at: new Date().toISOString()
    });
    db.completeCreditReservation(reservation.reservationId);
    p1Db.selectEcommerceOutputGeneration(user.id, project.id, slotId, generationId);
  }
  const prepared = await invoke(documentsHandler, {
    method: 'POST', headers, body: { action: 'prepare', projectId: project.id, language: 'zh' }
  });
  assert.equal(prepared.statusCode, 200);
  assert.equal(prepared.payload.documents.length, 2);
  return { user, headers, project, documents: prepared.payload.documents, sources };
}

test('download opt-in marks individual assets, ZIP, and long page while leaving preview and archives unchanged', async () => {
  const { user, headers, project, documents, sources } = await fixture();
  const watermarkImage = await sharp({ create: {
    width: 120, height: 45, channels: 4, background: '#f61832'
  } }).png().toBuffer();
  const preset = {
    angle: -45, columns: 2, textEnabled: false, text: '', textImageDataUrl: '',
    imageEnabled: true, imageDataUrl: `data:image/png;base64,${watermarkImage.toString('base64')}`,
    imageName: 'logo.png'
  };
  assert.equal((await invoke(settingsHandler, { method: 'PATCH', headers, body: {
    userId: user.id, settings: preset
  } })).statusCode, 200);
  const firstId = documents[0].id;
  const cleanPreview = await invoke(renderHandler, { headers, query: { documentId: firstId } });
  const cleanDownload = await invoke(renderHandler, {
    headers, query: { documentId: firstId, download: '1' }
  });
  const previewWithQuery = await invoke(renderHandler, {
    headers, query: { documentId: firstId, watermark: '1' }
  });
  const markedDownload = await invoke(renderHandler, {
    headers, query: { documentId: firstId, download: '1', watermark: '1' }
  });
  for (const response of [cleanPreview, cleanDownload, previewWithQuery, markedDownload]) {
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'image/png');
    assert.deepEqual(await sharp(response.bytes).metadata().then(({ width, height }) => ({ width, height })),
      { width: documents[0].targetWidth, height: documents[0].targetHeight });
  }
  assert.deepEqual(cleanPreview.bytes, cleanDownload.bytes);
  assert.deepEqual(cleanPreview.bytes, previewWithQuery.bytes);
  assert.notDeepEqual(markedDownload.bytes, cleanDownload.bytes);

  const zipResponse = await invoke(renderHandler, { method: 'POST', headers, body: {
    projectId: project.id, includeDetailPage: true, language: 'zh', watermark: true
  } });
  assert.equal(zipResponse.statusCode, 200, JSON.stringify(zipResponse.payload));
  const zip = await JSZip.loadAsync(zipResponse.bytes);
  const manifestName = Object.keys(zip.files).find((name) => name.endsWith('.json'));
  const manifest = JSON.parse(await zip.file(manifestName).async('string'));
  assert.equal(manifest.files.length, 2);
  assert.ok(manifest.files.every((file) => file.watermarked));
  const marked = await Promise.all(manifest.files.map(async (file) => zip.file(file.filename).async('nodebuffer')));
  assert.deepEqual(marked[0], markedDownload.bytes);
  const detailName = Object.keys(zip.files).find((name) => name.includes('详情长图') && name.endsWith('.png'));
  assert.ok(detailName, Object.keys(zip.files).join(' | '));
  assert.ok(!detailName.includes('/'), detailName);
  const detail = await zip.file(detailName).async('nodebuffer');
  assert.deepEqual(detail, await renderDetailPage(marked.map((bytes) => ({ bytes }))));

  const cleanZip = await invoke(renderHandler, { method: 'POST', headers, body: {
    projectId: project.id, includeDetailPage: true, language: 'zh'
  } });
  assert.equal(cleanZip.statusCode, 200);
  const cleanArchive = await JSZip.loadAsync(cleanZip.bytes);
  const cleanManifest = JSON.parse(await cleanArchive.file(manifestName).async('string'));
  assert.ok(cleanManifest.files.every((file) => !file.watermarked));
  assert.deepEqual(await cleanArchive.file(cleanManifest.files[0].filename).async('nodebuffer'), cleanDownload.bytes);
  assert.notDeepEqual(await cleanArchive.file(detailName).async('nodebuffer'), detail);
  for (const { storagePath, source } of sources) {
    assert.deepEqual(fs.readFileSync(path.join(process.env.LOCAL_STORAGE_ROOT, storagePath)), source);
  }
});

test('marked delivery requires a valid personal preset and never uses another account preset', async () => {
  const { headers, project, documents } = await fixture();
  const single = await invoke(renderHandler, {
    headers, query: { documentId: documents[0].id, download: '1', watermark: '1' }
  });
  assert.equal(single.statusCode, 400);
  assert.equal(single.payload.error, 'WATERMARK_SETTINGS_INCOMPLETE');
  const zip = await invoke(renderHandler, {
    method: 'POST', headers, body: { projectId: project.id, watermark: true }
  });
  assert.equal(zip.statusCode, 400);
  assert.equal(zip.payload.error, 'WATERMARK_SETTINGS_INCOMPLETE');
  const clean = await invoke(renderHandler, {
    headers, query: { documentId: documents[0].id, download: '1' }
  });
  assert.equal(clean.statusCode, 200);
});
