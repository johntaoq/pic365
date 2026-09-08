const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const root = path.resolve(process.cwd(), 'content/platform-guides');

async function shot(locator, file) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.page().waitForTimeout(350);
  await locator.screenshot({ path: file, animations: 'disabled' });
}

async function clickIfVisible(locator) {
  if (await locator.count() && await locator.first().isVisible().catch(() => false)) {
    await locator.first().click();
    return true;
  }
  return false;
}

let browser;
let localDb;
let session;

(async () => {
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  localDb = await import('../api/_lib/local-db.js');
  const admin = localDb.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  if (!admin?.id) throw new Error('No active local administrator found.');
  session = localDb.createSession(admin.id, 1);

  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await context.addInitScript(() => {
    localStorage.setItem('language', 'zh');
    localStorage.setItem('pic365.site-theme.v1', 'black');
  });
  await context.addCookies([{ name: 'member_session', value: session.token, url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const summary = { capturedAt: new Date().toISOString(), baseUrl, screenshots: [], warnings: [] };

  const record = async (name, locator, relative) => {
    try {
      const file = path.join(root, relative);
      await shot(locator, file);
      summary.screenshots.push(relative.replaceAll('\\', '/'));
    } catch (error) {
      summary.warnings.push(`${name}: ${error.message}`);
    }
  };

  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  await page.locator('.freeImageWorkspace').waitFor({ state: 'visible' });
  await page.addStyleTag({ content: '.freeImageHistory,.createCaseLibrary{display:none!important}' });
  await record('image-single', page.locator('.freeImageWorkspace'), '01-image-studio/screens/01-single.png');
  const styleButton = page.locator('.freeImagePromptStyleTrigger').first();
  if (await clickIfVisible(styleButton)) {
    await page.waitForTimeout(300);
    await record('image-style', page.locator('.freeImageWorkspace'), '01-image-studio/screens/02-style-library.png');
    await clickIfVisible(styleButton);
  }
  await page.getByRole('tab', { name: '批量生图' }).click();
  await record('image-batch', page.locator('.freeImageWorkspace'), '01-image-studio/screens/03-batch.png');
  await page.getByRole('tab', { name: /任务列表/ }).click();
  await record('image-tasks', page.locator('.freeImageWorkspace'), '01-image-studio/screens/04-tasks.png');

  await page.goto(`${baseUrl}/#canvas`, { waitUntil: 'domcontentloaded' });
  await page.locator('.infiniteCanvasLayout').waitFor({ state: 'visible' });
  await clickIfVisible(page.getByRole('button', { name: '无限画布' }));
  await clickIfVisible(page.getByRole('tab', { name: /我的画布/ }));
  const firstProject = page.locator('.infiniteCanvasProjectOpen').first();
  if (await firstProject.count() && await firstProject.isEnabled().catch(() => false)) await firstProject.click();
  await page.waitForTimeout(900);
  await record('canvas-overview', page.locator('.infiniteCanvasLayout'), '02-infinite-canvas/screens/01-overview.png');
  await clickIfVisible(page.getByRole('button', { name: '适应内容' }));
  await record('canvas-fit', page.locator('.infiniteCanvasLayout'), '02-infinite-canvas/screens/02-fit-content.png');
  const firstNode = page.locator('.infiniteCanvasNode.image').first();
  if (await firstNode.count()) {
    await firstNode.click();
    await record('canvas-selected', page.locator('.infiniteCanvasLayout'), '02-infinite-canvas/screens/03-selected.png');
  }

  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  await clickIfVisible(page.getByRole('button', { name: '电商套图' }));
  await page.locator('.ecommerceWorkspace').waitFor({ state: 'visible' });
  await record('ecommerce-product', page.locator('.ecommerceWorkspace'), '03-ecommerce-suite/screens/01-product.png');
  const workflow = page.locator('.ecommerceWorkflow button');
  const names = ['02-images.png', '03-plan.png', '04-generate.png', '05-delivery.png'];
  for (let index = 1; index <= 4; index += 1) {
    const button = workflow.nth(index);
    if (await button.count() && await button.isEnabled().catch(() => false)) {
      await button.click();
      await page.waitForTimeout(450);
      await record(`ecommerce-${index}`, page.locator('.ecommerceWorkspace'), `03-ecommerce-suite/screens/${names[index - 1]}`);
    }
  }

  await page.goto(`${baseUrl}/#assets`, { waitUntil: 'domcontentloaded' });
  await page.locator('.mediaAssetCenter').waitFor({ state: 'visible' });
  await record('assets-overview', page.locator('.mediaAssetCenter'), '04-media-assets/screens/01-overview.png');
  await clickIfVisible(page.getByRole('button', { name: /^图片/ }));
  await record('assets-images', page.locator('.mediaAssetCenter'), '04-media-assets/screens/02-images.png');
  const firstAsset = page.locator('.mediaAssetCard').first();
  if (await firstAsset.count()) {
    await firstAsset.click();
    const dialog = page.locator('[role="dialog"]').last();
    if (await dialog.count()) await record('assets-detail', dialog, '04-media-assets/screens/03-detail.png');
    await clickIfVisible(page.getByRole('button', { name: /关闭/ }).last());
  }
  await clickIfVisible(page.getByRole('button', { name: '批量选择' }));
  await record('assets-bulk', page.locator('.mediaAssetCenter'), '04-media-assets/screens/04-bulk.png');

  await page.route('**/api/chat?limit=60', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [], provider: { name: 'gpt-5.6-luna' } }) });
  });
  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  await page.locator('.chatCompanionOrb').waitFor({ state: 'visible' });
  await page.locator('.chatCompanionOrb').click();
  await page.locator('.chatCompanionPanel').waitFor({ state: 'visible' });
  await record('companion-panel', page.locator('.chatCompanionPanel'), '05-companion/screens/01-panel.png');

  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'capture-summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
  if (session?.token && localDb) localDb.deleteSession(session.token);
});
