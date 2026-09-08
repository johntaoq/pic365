const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const root = path.resolve(process.cwd(), 'content/platform-guides');
const pages = [
  ['index', 'index.html'],
  ['image-studio', '01-image-studio/index.html'],
  ['infinite-canvas', '02-infinite-canvas/index.html'],
  ['ecommerce-suite', '03-ecommerce-suite/index.html'],
  ['media-assets', '04-media-assets/index.html'],
  ['companion', '05-companion/index.html']
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const results = [];
  for (const [name, route] of pages) {
    for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport, colorScheme: 'dark' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('requestfailed', (request) => errors.push(`${request.failure()?.errorText}: ${request.url()}`));
      const response = await page.goto(`${baseUrl}/content/platform-guides/${route}`, { waitUntil: 'networkidle' });
      const metrics = await page.evaluate(() => ({
        title: document.title,
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        imageCount: document.images.length,
        brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src'))
      }));
      const out = path.join(root, 'qa', `${name}-${label}.png`);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out, fullPage: true, animations: 'disabled' });
      results.push({ name, label, status: response?.status(), overflow: metrics.scrollWidth - metrics.width, ...metrics, errors });
      await context.close();
    }
  }
  await browser.close();
  await fs.writeFile(path.join(root, 'qa-summary.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((item) => item.status !== 200 || item.overflow > 0 || item.brokenImages.length || item.errors.length);
  process.stdout.write(JSON.stringify({ checked: results.length, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
