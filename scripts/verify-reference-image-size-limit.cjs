const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5176';
const limitBytes = 15 * 1024 * 1024;
const reportDirectory = path.resolve(process.cwd(), 'work/reference-image-size-qa');
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

let browser;
let db;
let canvasDb;
let session;
let projectId = '';
let adminId = '';

function paddedPng(size) {
  assert.ok(size >= tinyPng.length);
  return Buffer.concat([tinyPng, Buffer.alloc(size - tinyPng.length)]);
}

(async () => {
  await fs.mkdir(reportDirectory, { recursive: true });
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  db = await import('../api/_lib/local-db.js');
  canvasDb = await import('../api/_lib/infinite-canvas-db.js');
  const admin = db.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  assert.ok(admin, 'Local administrator required');
  adminId = admin.id;
  const generation = db.getDb().prepare("SELECT id, size, mime_type FROM generations WHERE user_id = ? AND status = 'succeeded' AND storage_path <> '' ORDER BY completed_at DESC LIMIT 1").get(admin.id);
  assert.ok(generation, 'A local generated image is required');
  projectId = canvasDb.createInfiniteCanvasProject(admin.id, {
    name: `QA-15MB-${Date.now()}`,
    nodes: [{
      id: 'qa-oversized-reference', type: 'image', x: 150, y: 150, parentId: '', name: '超限参考图', prompt: '尺寸限制验证',
      imageUrl: `/api/generated?id=${encodeURIComponent(generation.id)}`,
      thumbnailUrl: `/api/generated?id=${encodeURIComponent(generation.id)}&variant=thumbnail`,
      downloadUrl: `/api/generated?id=${encodeURIComponent(generation.id)}`,
      generationId: generation.id, mimeType: generation.mime_type || 'image/png', size: generation.size || '1024x1024',
      fileSize: limitBytes + 1, status: 'completed', createdAt: new Date().toISOString()
    }],
    viewport: { x: 80, y: 70, zoom: 1 }
  }).id;
  session = db.createSession(admin.id, 1);

  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'member_session', value: session.token, url: baseUrl }]);
  await context.addInitScript(({ userId, targetProjectId }) => {
    localStorage.setItem('language', 'zh');
    localStorage.setItem('pic365.site-theme.v1', 'black');
    localStorage.setItem(`pic365.infinite-image-canvas.v2.last:${userId}`, targetProjectId);
    localStorage.setItem('pic365.infinite-image-canvas.v2.composer', 'open');
  }, { userId: admin.id, targetProjectId: projectId });
  const page = await context.newPage();
  const errors = [];
  const checks = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/generate-image*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'UI_TEST_NO_GENERATION' }) }));
  await page.route('**/api/generation-tasks*', (route) => route.request().method() === 'GET'
    ? route.continue()
    : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'UI_TEST_NO_GENERATION' }) }));

  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  await page.locator('.freeImageStudioV2').waitFor();
  const closeNotice = page.getByRole('button', { name: '关闭', exact: true });
  if (await closeNotice.count() && await closeNotice.first().isVisible().catch(() => false)) await closeNotice.first().click();
  const attachment = page.locator('.freeImagePromptAttachmentButton');
  if (!await page.locator('#free-image-reference-tray').count()) await attachment.click();
  const referenceInput = page.locator('#free-image-reference-tray input[type=file]').first();
  await referenceInput.setInputFiles({ name: 'exactly-15mb.png', mimeType: 'image/png', buffer: paddedPng(limitBytes) });
  await page.locator('.freeImagePrimaryReferenceSlot article').waitFor();
  assert.equal(await page.locator('.freeImagePrimaryReferenceSlot article.oversized').count(), 0);
  checks.push('exactly 15 MB is accepted');
  await page.locator('.freeImagePrimaryReferenceSlot article .remove').evaluate((button) => button.click());
  await page.waitForFunction(() => !document.querySelector('.freeImagePrimaryReferenceSlot article'));

  await referenceInput.setInputFiles({ name: 'over-15mb.png', mimeType: 'image/png', buffer: paddedPng(limitBytes + 1) });
  const oversizedCard = page.locator('.freeImagePrimaryReferenceSlot article.oversized');
  await oversizedCard.waitFor();
  assert.match(await oversizedCard.textContent(), /超过 15 MB/);
  assert.match(await page.locator('.freeImageMessage').textContent(), /单张参考图不能超过 15 MB/);
  assert.equal(await page.locator('.freeImageGenerateButton').first().isDisabled(), true);
  checks.push('studio marks the exact oversized reference red and blocks generation');
  await page.screenshot({ path: path.join(reportDirectory, 'studio-oversized-reference.png'), fullPage: true });

  for (const theme of ['light', 'dark', 'black']) {
    await page.evaluate((value) => localStorage.setItem('pic365.site-theme.v1', value), theme);
    await page.goto(`${baseUrl}/#canvas`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-node-id="qa-oversized-reference"].primarySelected').waitFor();
    const canvasCard = page.locator('.infiniteCanvasPrimaryReference article.oversized');
    await canvasCard.waitFor();
    assert.match(await canvasCard.textContent(), /超过 15 MB/);
    assert.equal(await page.locator('.infiniteCanvasGenerate').isDisabled(), true);
    assert.match(await page.locator('.infiniteCanvasMessage.error').textContent(), /单张参考图不能超过 15 MB/);
    checks.push(`${theme} canvas marks oversized primary and blocks generation`);
  }
  await page.screenshot({ path: path.join(reportDirectory, 'canvas-oversized-reference.png'), fullPage: true });

  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(reportDirectory, 'report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, errors }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
  if (session) db.deleteSession(session.token);
  if (projectId && adminId && canvasDb) {
    const current = canvasDb.getInfiniteCanvasProject(adminId, projectId, { includeDeleted: true });
    if (current) {
      const deleted = canvasDb.deleteInfiniteCanvasProject(adminId, projectId, current.revision);
      const trashed = deleted?.project || canvasDb.getInfiniteCanvasProject(adminId, projectId, { includeDeleted: true });
      if (trashed) canvasDb.permanentlyDeleteInfiniteCanvasProject(adminId, projectId, trashed.revision);
    }
  }
});
