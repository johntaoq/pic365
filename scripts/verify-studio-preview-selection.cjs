const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5176';
let browser;
let db;
let session;

(async () => {
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  db = await import('../api/_lib/local-db.js');
  const admin = db.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  assert.ok(admin, 'Local administrator required');
  session = db.createSession(admin.id, 1);
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'member_session', value: session.token, url: baseUrl }]);
  await context.addInitScript(() => {
    localStorage.setItem('language', 'zh');
    localStorage.setItem('pic365.site-theme.v1', 'black');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const task = {
    id: 'preview-selection-task',
    status: 'completed',
    taskMode: 'single',
    prompt: '任务结果',
    count: 2,
    size: '1024x1024',
    quality: 'low',
    createdAt: new Date().toISOString(),
    results: [
      { id: 'task-latest', generationId: 'task-latest', imageUrl: '/images/case519.jpg', thumbnailUrl: '/images/case519.jpg', prompt: '任务最新图', size: '1024x1024', quality: 'low', downloadAllowed: true },
      { id: 'task-manual', generationId: 'task-manual', imageUrl: '/images/case517.jpg', thumbnailUrl: '/images/case517.jpg', prompt: '任务手动选择图', size: '1024x1024', quality: 'low', downloadAllowed: true }
    ]
  };
  const historyItem = {
    id: 'history-manual',
    generationId: 'history-manual',
    imageUrl: '/images/case518.jpg',
    thumbnailUrl: '/images/case518.jpg',
    prompt: '历史手动选择图',
    size: '1024x1024',
    quality: 'low',
    status: 'succeeded',
    downloadAllowed: true
  };

  await page.route('**/api/generation-tasks*', (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'UI_TEST_NO_WRITE' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tasks: [{ ...task, results: task.results.map((item) => ({ ...item })) }] }) });
  });
  await page.route('**/api/generations*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, generations: [{ ...historyItem }], hasMore: false, nextOffset: 1 })
  }));
  await page.route('**/api/generate-image*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'UI_TEST_NO_GENERATION' }) }));

  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  await page.locator('.freeImageStudioV2').waitFor();
  const close = page.getByRole('button', { name: '关闭', exact: true });
  if (await close.count() && await close.first().isVisible().catch(() => false)) await close.first().click();

  await page.locator('.freeImageHeaderTabs [role=tab]').nth(2).click();
  await page.locator('.freeImageTaskItem').click();
  await page.locator('.studioFilmstrip button').nth(1).click();
  assert.ok((await page.locator('.studioMainPreview img').getAttribute('src')).endsWith('case517.jpg'), 'manual task result should be selected');
  await page.waitForTimeout(3200);
  assert.ok((await page.locator('.studioMainPreview img').getAttribute('src')).endsWith('case517.jpg'), 'task polling must preserve the manually selected result');

  await page.locator('.freeImageHeaderTabs [role=tab]').first().click();
  await page.locator('.studioRecentHistoryPreview').click();
  assert.ok((await page.locator('.studioMainPreview img').getAttribute('src')).endsWith('case518.jpg'), 'history image should replace the main preview');
  await page.waitForTimeout(3200);
  assert.ok((await page.locator('.studioMainPreview img').getAttribute('src')).endsWith('case518.jpg'), 'task polling must not overwrite a manually selected history image');
  assert.equal(await page.locator('.freeImageTaskItem.selected').count(), 0, 'history selection should release the previous task selection');

  await page.locator('.studioPreviewExpand').click();
  const dialog = page.locator('.freeImagePreviewDialog');
  const canvas = page.locator('.freeImagePreviewCanvas');
  const footer = dialog.locator('> footer');
  await dialog.waitFor();
  const footerBounds = await footer.boundingBox();
  assert.ok(footerBounds && footerBounds.y + footerBounds.height <= 1000, 'preview controls must remain inside the viewport');
  const zoomIn = page.locator('.freeImagePreviewZoomControls button').last();
  for (let index = 0; index < 4; index += 1) await zoomIn.click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.freeImagePreviewCanvas')).cursor === 'grab');
  assert.equal(await canvas.evaluate((element) => getComputedStyle(element).cursor), 'grab', 'zoomed image should expose the hand cursor');
  const canvasBounds = await canvas.boundingBox();
  assert.ok(canvasBounds, 'preview canvas must be visible');
  const center = { x: canvasBounds.x + canvasBounds.width / 2, y: canvasBounds.y + canvasBounds.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x - 220, center.y - 220, { steps: 6 });
  await page.mouse.up();
  const negativePan = await page.locator('.freeImagePreviewCanvas img').evaluate((image) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
    return { x: matrix.m41, y: matrix.m42 };
  });
  assert.ok(negativePan.x < -20 && negativePan.y < -20, 'dragging should reveal the lower-right image area');
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 520, center.y + 520, { steps: 8 });
  await page.mouse.up();
  const positivePan = await page.locator('.freeImagePreviewCanvas img').evaluate((image) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
    return { x: matrix.m41, y: matrix.m42 };
  });
  assert.ok(positivePan.x > 20 && positivePan.y > 20, 'dragging in the opposite direction should reveal the upper-left image area');
  assert.deepEqual(errors, [], 'preview selection flow should not create runtime errors');
  console.log(JSON.stringify({ passed: 8, errors }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
  if (session) db.deleteSession(session.token);
});
