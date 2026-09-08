const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const output = path.resolve(process.cwd(), 'output/pdf/Pic365-平台介绍.pdf');

(async () => {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => errors.push(`${request.failure()?.errorText}: ${request.url()}`));
  const response = await page.goto(`${baseUrl}/content/pic365-introduction/index.html`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Introduction page failed: ${response?.status()}`);
  const state = await page.evaluate(() => ({
    slideCount: document.querySelectorAll('.slide').length,
    brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src'))
  }));
  if (state.slideCount !== 16 || state.brokenImages.length || errors.length) throw new Error(JSON.stringify({ state, errors }));
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: output, printBackground: true, preferCSSPageSize: true, tagged: true });
  await browser.close();
  process.stdout.write(JSON.stringify({ output, pages: state.slideCount }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
