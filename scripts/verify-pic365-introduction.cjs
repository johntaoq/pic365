const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const output = path.resolve(process.cwd(), 'content/pic365-introduction/qa');

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const checks = [];
  for (const [name, viewport] of [['desktop', { width: 1600, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, colorScheme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => errors.push(`${request.failure()?.errorText}: ${request.url()}`));
    const response = await page.goto(`${baseUrl}/content/pic365-introduction/index.html`, { waitUntil: 'networkidle' });
    const state = await page.evaluate(() => ({
      slideCount: document.querySelectorAll('.slide').length,
      brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src')),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    for (const index of [0, 3, 7, 9, 12, 14, 15]) {
      await page.locator('.slide').nth(index).screenshot({ path: path.join(output, `${name}-${String(index + 1).padStart(2, '0')}.png`), animations: 'disabled' });
    }
    checks.push({ name, status: response?.status(), errors, ...state });
    await context.close();
  }
  await browser.close();
  const failed = checks.filter((item) => item.status !== 200 || item.slideCount !== 16 || item.brokenImages.length || item.overflow > 0 || item.errors.length);
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(checks, null, 2));
  process.stdout.write(JSON.stringify({ checks, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
