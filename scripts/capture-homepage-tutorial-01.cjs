const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const email = process.env.PIC365_TEST_EMAIL;
const password = process.env.PIC365_TEST_PASSWORD;
const projectName = '教学Demo01 · 男士通勤斜肩包';
const outputDir = path.resolve(
  process.cwd(),
  'content/homepage-tutorials/01-backpack-store-set/screens'
);
const screenshotNames = [
  '01-product.png',
  '02-images.png',
  '03-plan.png',
  '04-shot-list.png',
  '05-generate.png',
  '06-delivery.png'
];

if (!email || !password) {
  throw new Error('PIC365_TEST_EMAIL and PIC365_TEST_PASSWORD are required.');
}

async function captureElement(locator, name) {
  await locator.page().mouse.move(8, 8);
  await locator.page().waitForTimeout(120);
  await locator.screenshot({ path: path.join(outputDir, name), animations: 'disabled' });
}

async function selectStage(page, number, label) {
  const stage = page.getByRole('button', { name: new RegExp(`^${number}\\s*${label}`) }).first();
  await stage.scrollIntoViewIfNeeded();
  await stage.click();
  await page.waitForTimeout(500);
}

async function captureSection(page, contentId, fileName) {
  const content = page.locator(`#${contentId}`);
  await content.waitFor({ state: 'visible' });
  const section = content.locator('xpath=..');
  await section.scrollIntoViewIfNeeded();
  await captureElement(section, fileName);
}

let browser;

(async () => {
  await fs.mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: 'dark'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  const login = await page.evaluate(async ({ email, password }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return { ok: response.ok, payload: await response.json() };
  }, { email, password });
  if (!login.ok) throw new Error(`Login failed: ${login.payload?.error || 'unknown'}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const ecommerceButton = page.getByRole('button', { name: '电商套图', exact: true });
  await ecommerceButton.waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  await ecommerceButton.click();
  await page.getByText('一图入，全套生').waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);

  const expandProjects = page.getByRole('button', { name: /展开项目列表/ });
  if (await expandProjects.count()) await expandProjects.click();
  const projectButton = page.getByRole('button', { name: /教学Demo01.*男士通勤斜肩包/ }).first();
  await projectButton.click();
  await page.waitForTimeout(900);

  await selectStage(page, 1, '商品');
  await captureSection(page, 'ecommerce-brief-section', '01-product.png');
  await selectStage(page, 2, '图片');
  await captureSection(page, 'ecommerce-assets-section', '02-images.png');
  await selectStage(page, 3, '方案');
  await captureSection(page, 'ecommerce-visual-section', '03-plan.png');
  await captureSection(page, 'ecommerce-outputs-section', '04-shot-list.png');
  await selectStage(page, 4, '生成');
  await captureSection(page, 'ecommerce-production-section', '05-generate.png');
  await selectStage(page, 5, '交付');
  await page.locator('.deliverySlotItems article').first().waitFor({ state: 'visible', timeout: 30000 });
  await captureSection(page, 'ecommerce-delivery-section', '06-delivery.png');

  const summary = {
    projectName,
    screenshots: screenshotNames,
    url: page.url(),
    title: await page.title()
  };
  await fs.writeFile(path.join(outputDir, 'capture-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
});
