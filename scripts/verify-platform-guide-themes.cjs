const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const output = path.resolve(process.cwd(), 'content/platform-guides/qa/themes');
const pages = [
  ['index', 'index.html'],
  ['image-studio', '01-image-studio/index.html']
];
const themes = ['light', 'dark', 'black'];
const viewports = [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]];

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const checks = [];
  for (const theme of themes) {
    for (const [viewportName, viewport] of viewports) {
      for (const [pageName, route] of pages) {
        const context = await browser.newContext({ viewport, colorScheme: theme === 'light' ? 'light' : 'dark' });
        await context.addInitScript((value) => localStorage.setItem('pic365.site-theme.v1', value), theme);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const response = await page.goto(`${baseUrl}/content/platform-guides/${route}`, { waitUntil: 'networkidle' });
        const state = await page.evaluate(() => ({
          theme: document.documentElement.dataset.theme,
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          background: getComputedStyle(document.body).backgroundColor,
          color: getComputedStyle(document.body).color,
          brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length
        }));
        await page.screenshot({ path: path.join(output, `${theme}-${pageName}-${viewportName}.png`), fullPage: pageName === 'index', animations: 'disabled' });
        checks.push({ expectedTheme: theme, viewportName, pageName, status: response?.status(), overflow: state.scrollWidth - state.width, errors, ...state });
        await context.close();
      }
    }
  }
  await browser.close();
  const failed = checks.filter((item) => item.status !== 200 || item.theme !== item.expectedTheme || item.overflow > 0 || item.errors.length || item.brokenImages);
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(checks, null, 2));
  process.stdout.write(JSON.stringify({ checked: checks.length, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
