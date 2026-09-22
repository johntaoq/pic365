const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(process.cwd(), 'work/infinite-toolbar-qa');
const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5176';
const toolbarStorageKey = 'pic365.infinite-image-canvas.v2.top-toolbar-position.v2';
let browser;
let db;
let session;

(async () => {
  await fs.mkdir(root, { recursive: true });
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
  });
  const page = await context.newPage();
  const checks = [];
  const errors = [];
  const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
  page.on('pageerror', (error) => errors.push(error.message));

  async function dismissNotice() {
    const close = page.getByRole('button', { name: '关闭', exact: true });
    if (await close.count() && await close.first().isVisible().catch(() => false)) await close.first().click();
  }

  async function loadCanvas(theme, width) {
    await page.setViewportSize({ width, height: width <= 640 ? 844 : 1000 });
    if (!page.url().startsWith(baseUrl)) await page.goto(`${baseUrl}/#canvas`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ theme: nextTheme, storageKey }) => {
      localStorage.setItem('pic365.site-theme.v1', nextTheme);
      localStorage.setItem(storageKey, JSON.stringify({ x: 8, y: 8 }));
    }, { theme, storageKey: toolbarStorageKey });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.infiniteCanvasFloatingToolbar').waitFor();
    await dismissNotice();
  }

  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark', 'black']) {
      await loadCanvas(theme, width);
      const layout = await page.evaluate(() => {
        const toolbar = document.querySelector('.infiniteCanvasFloatingToolbar');
        const canvas = document.querySelector('.infiniteCanvasLayout');
        const handle = document.querySelector('.infiniteCanvasToolbarHandle');
        const style = toolbar ? getComputedStyle(toolbar) : null;
        return {
          rootWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          toolbarTop: toolbar?.style.top,
          toolbarLeft: toolbar?.style.left,
          toolbarPosition: style?.position,
          toolbarRect: toolbar?.getBoundingClientRect().toJSON(),
          layoutRect: canvas?.getBoundingClientRect().toJSON(),
          handleRect: handle?.getBoundingClientRect().toJSON(),
          dockCount: document.querySelectorAll('.infiniteCanvasProjectDock').length,
          toolCount: document.querySelectorAll('.infiniteCanvasTools').length,
          toolbarDockCount: toolbar?.querySelectorAll('.infiniteCanvasProjectDock').length,
          toolbarToolCount: toolbar?.querySelectorAll('.infiniteCanvasTools').length,
          toolbarBorder: style?.borderColor
        };
      });
      check(`${width}/${theme}: one combined toolbar`, layout.dockCount === 1 && layout.toolCount === 1 && layout.toolbarDockCount === 1 && layout.toolbarToolCount === 1);
      check(`${width}/${theme}: toolbar remains floating`, layout.toolbarPosition === 'absolute' && layout.toolbarRect && layout.layoutRect && layout.toolbarRect.top >= layout.layoutRect.top - 1);
      check(`${width}/${theme}: no page-level horizontal overflow`, layout.rootWidth <= layout.viewportWidth);
      check(`${width}/${theme}: toolbar starts at stored position`, Number.parseFloat(layout.toolbarTop) === 8 && Number.parseFloat(layout.toolbarLeft) === 8);
      if (width === 1440) check(`${width}/${theme}: toolbar shrink-wraps its controls`, layout.toolbarRect.width < layout.layoutRect.width - 100);
      if (theme === 'black') check(`${width}/${theme}: green black-theme toolbar border`, /72, 255, 155/.test(layout.toolbarBorder));
      if (width === 1440) {
        await page.screenshot({ path: path.join(root, `toolbar-${width}-${theme}.png`) });
      }
    }
  }

  await loadCanvas('black', 1440);
  const beforeDrag = await page.evaluate(() => {
    const handle = document.querySelector('.infiniteCanvasToolbarHandle').getBoundingClientRect();
    const toolbar = document.querySelector('.infiniteCanvasFloatingToolbar');
    return { handle, left: Number.parseFloat(toolbar.style.left), top: Number.parseFloat(toolbar.style.top) };
  });
  await page.mouse.move(beforeDrag.handle.left + beforeDrag.handle.width / 2, beforeDrag.handle.top + beforeDrag.handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeDrag.handle.left + beforeDrag.handle.width / 2 + 120, beforeDrag.handle.top + beforeDrag.handle.height / 2 + 96, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const movedPosition = await page.locator('.infiniteCanvasFloatingToolbar').evaluate((toolbar) => ({
    x: Number.parseFloat(toolbar.style.left),
    y: Number.parseFloat(toolbar.style.top)
  }));
  check('toolbar can move horizontally and vertically', movedPosition.x > beforeDrag.left && movedPosition.y > beforeDrag.top);
  const handleAfterMove = await page.locator('.infiniteCanvasToolbarHandle').evaluate((handle) => handle.getBoundingClientRect().toJSON());
  await page.mouse.move(handleAfterMove.left + handleAfterMove.width / 2, handleAfterMove.top + handleAfterMove.height / 2);
  await page.mouse.down();
  await page.mouse.move(-200, -200, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const clampedPosition = await page.locator('.infiniteCanvasFloatingToolbar').evaluate((toolbar) => ({
    x: Number.parseFloat(toolbar.style.left),
    y: Number.parseFloat(toolbar.style.top)
  }));
  check('toolbar remains inside the top-left boundary', clampedPosition.x === 8 && clampedPosition.y === 8);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.infiniteCanvasFloatingToolbar').waitFor();
  check('toolbar position persists locally', await page.locator('.infiniteCanvasFloatingToolbar').evaluate((toolbar) => Number.parseFloat(toolbar.style.left) === 8 && Number.parseFloat(toolbar.style.top) === 8));
  check('no canvas runtime exceptions', errors.length === 0);
  await fs.writeFile(path.join(root, 'report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
  if (session) db.deleteSession(session.token);
});
