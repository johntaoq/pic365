const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5176';
const qaTheme = process.env.PIC365_QA_THEME || 'black';
const reportDirectory = path.resolve(process.cwd(), 'work/canvas-reference-naming-qa');
let browser;
let db;
let canvasDb;
let session;
let projectId = '';
let adminId = '';

(async () => {
  await fs.mkdir(reportDirectory, { recursive: true });
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  db = await import('../api/_lib/local-db.js');
  canvasDb = await import('../api/_lib/infinite-canvas-db.js');
  const mediaAssets = await import('../api/_lib/media-assets.js');
  const admin = db.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  assert.ok(admin, 'Local administrator required');
  adminId = admin.id;
  const assets = mediaAssets.listAssets(admin.id, { mediaType: 'image', limit: 3, isSuperAdmin: true }).assets;
  assert.equal(assets.length, 3, 'Three local image assets are required');

  const nodeFromAsset = (asset, id, name, x, referenceLinks = []) => ({
    id,
    type: 'image',
    x,
    y: 150,
    name,
    prompt: `${name}测试图`,
    draftPrompt: '',
    imageUrl: asset.originalUrl,
    thumbnailUrl: asset.thumbnailUrl,
    downloadUrl: asset.downloadUrl,
    assetId: asset.id,
    mimeType: asset.mimeType,
    size: `${asset.width}x${asset.height}`,
    width: asset.width,
    height: asset.height,
    referenceLinks,
    createdAt: new Date().toISOString()
  });
  const project = canvasDb.createInfiniteCanvasProject(admin.id, {
    name: `QA-参考图别名-${Date.now()}`,
    nodes: [
      nodeFromAsset(assets[0], 'qa-primary', '商品主体', 120, [
        { nodeId: 'qa-style', role: 'style', order: 1 },
        { nodeId: 'qa-color', role: 'color', order: 2 }
      ]),
      nodeFromAsset(assets[1], 'qa-style', '风格样片', 470),
      nodeFromAsset(assets[2], 'qa-color', '配色样片', 820)
    ],
    viewport: { x: 70, y: 55, zoom: 0.8 }
  });
  projectId = project.id;
  session = db.createSession(admin.id, 1);

  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'member_session', value: session.token, url: baseUrl }]);
  await context.addInitScript(({ userId, targetProjectId, theme }) => {
    localStorage.setItem('language', 'zh');
    localStorage.setItem('pic365.site-theme.v1', theme);
    localStorage.setItem(`pic365.infinite-image-canvas.v2.last:${userId}`, targetProjectId);
    localStorage.setItem('pic365.infinite-image-canvas.v2.composer', 'open');
  }, { userId: admin.id, targetProjectId: project.id, theme: qaTheme });

  const page = await context.newPage();
  const errors = [];
  const checks = [];
  let submittedBody = null;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/api/image-pricing*', async (route) => {
    const url = new URL(route.request().url());
    const providerId = url.searchParams.get('providerId') || '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        promotion: { enabled: false },
        pricing: { source: 'server', providerId, size: url.searchParams.get('size') || '1024x1024', quality: url.searchParams.get('quality') || 'low', referenceCount: Number(url.searchParams.get('referenceCount') || 0), credits: 1, originalCredits: 1, totalCredits: 1 }
      })
    });
  });
  await page.route('**/api/generation-tasks*', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tasks: [] }) });
    }
    submittedBody = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, task: { id: submittedBody.clientTaskId, status: 'queued' } }) });
  });

  await page.goto(`${baseUrl}/#canvas`, { waitUntil: 'domcontentloaded' });
  await page.locator('.infiniteCanvasLayout').waitFor();
  const closeNotice = page.getByRole('button', { name: '关闭', exact: true });
  if (await closeNotice.count() && await closeNotice.first().isVisible().catch(() => false)) await closeNotice.first().click();
  await page.locator('[data-node-id="qa-primary"].primarySelected').waitFor();
  if (qaTheme === 'light') {
    const referenceLineStyle = await page.locator('.infiniteCanvasReferenceConnection .referenceLink').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        stroke: style.stroke,
        strokeWidth: Number.parseFloat(style.strokeWidth),
        strokeDasharray: style.strokeDasharray,
        filter: style.filter,
        animationName: style.animationName
      };
    });
    assert.ok(referenceLineStyle.strokeWidth <= 2.4, `Light reference line is too thick: ${referenceLineStyle.strokeWidth}px`);
    assert.match(referenceLineStyle.stroke, /rgba?\(82, 164, 255(?:, 0\.92)?\)/, `Light reference line must use the dark-theme blue: ${referenceLineStyle.stroke}`);
    assert.equal(referenceLineStyle.strokeDasharray, '10px, 8px');
    assert.notEqual(referenceLineStyle.filter, 'none');
    assert.equal(referenceLineStyle.animationName, 'infiniteCanvasReferenceFlow');
    const referenceHitStyle = await page.locator('.infiniteCanvasReferenceConnection .infiniteCanvasReferenceHit').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { stroke: style.stroke, strokeWidth: Number.parseFloat(style.strokeWidth), filter: style.filter };
    });
    assert.ok(['none', 'transparent', 'rgba(0, 0, 0, 0)'].includes(referenceHitStyle.stroke), `Reference hit area must remain invisible: ${referenceHitStyle.stroke}`);
    assert.ok(referenceHitStyle.strokeWidth >= 18, 'Reference hit area must remain easy to target');
    assert.equal(referenceHitStyle.filter, 'none');
    checks.push('light theme completed references use the same flowing blue dashed line as dark theme');
  }
  await page.locator('.infiniteCanvasReferenceDetailsToggle').click();

  const primaryBadge = page.locator('.infiniteCanvasPrimaryReference article > button:first-child span');
  assert.equal(await primaryBadge.textContent(), '参考图1');
  assert.equal(await page.locator('.infiniteCanvasPrimaryIdentity small').textContent(), '主图 / 母版 / 图1 = 参考图1');
  checks.push('primary image shows Reference 1 with Primary, Master and Image 1 aliases');
  const supportLabels = await page.locator('.infiniteCanvasReferenceThumb i').allTextContents();
  assert.deepEqual(supportLabels, ['参考图2', '参考图3']);
  checks.push('supporting references follow Reference 2 and Reference 3 order');
  const hint = await page.locator('.infiniteCanvasReferencePromptHint').textContent();
  assert.match(hint, /参考图1 \/ 图1 \/ 主图 \/ 母版/);
  assert.match(hint, /参考图2 \/ 图2、参考图3 \/ 图3/);
  checks.push('prompt alias explanation is visible and exact');

  const primaryBox = await primaryBadge.boundingBox();
  const primaryButtonBox = await page.locator('.infiniteCanvasPrimaryReference article > button:first-child').boundingBox();
  assert.ok(primaryBox && primaryButtonBox && primaryBox.x >= primaryButtonBox.x && primaryBox.x + primaryBox.width <= primaryButtonBox.x + primaryButtonBox.width + 1, 'Primary alias badge must stay inside its thumbnail');
  assert.ok(primaryBox.y >= primaryButtonBox.y && primaryBox.y + primaryBox.height <= primaryButtonBox.y + primaryButtonBox.height + 1, 'Primary alias badge must stay vertically inside its thumbnail');
  assert.ok(await page.locator('.infiniteCanvasPrimaryIdentity small').evaluate((element) => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1), 'Primary alias explanation must not be clipped');
  checks.push('primary alias badge remains fully visible');

  await page.screenshot({ path: path.join(reportDirectory, `canvas-reference-naming-${qaTheme}.png`), fullPage: true });

  await page.locator('.infiniteCanvasPromptRow textarea').fill('保持主图商品，参考图2只参考风格，参考图3只参考配色');
  const generate = page.locator('.infiniteCanvasGenerate');
  await assert.doesNotReject(() => generate.waitFor({ state: 'visible' }));
  await page.waitForFunction(() => {
    const button = document.querySelector('.infiniteCanvasGenerate');
    return button && !button.disabled;
  });
  await generate.click();
  await page.waitForTimeout(250);
  assert.ok(submittedBody, 'Generation request should be intercepted');
  assert.deepEqual(submittedBody.canvasReferenceNodeIds, ['qa-primary', 'qa-style', 'qa-color']);
  assert.deepEqual(submittedBody.references.map((item) => item.assetId), assets.map((asset) => asset.id));
  assert.match(submittedBody.prompt, /参考图1 \/ 图1 \/ 主图 \/ 母版 = 输入图1/);
  assert.match(submittedBody.prompt, /参考图2 \/ 图2 = 输入图2/);
  assert.match(submittedBody.prompt, /参考图3 \/ 图3 = 输入图3/);
  assert.match(submittedBody.prompt, /“主图”和“母版”固定代表参考图1/);
  checks.push('submitted image order and prompt aliases use the same mapping');

  assert.deepEqual(errors, [], 'Canvas reference naming flow should not create runtime errors');
  await fs.writeFile(path.join(reportDirectory, 'report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
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
