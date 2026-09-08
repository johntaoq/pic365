const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const output = path.resolve(process.cwd(), 'content/platform-guides/qa');
let browser;
let localDb;
let session;

(async () => {
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  localDb = await import('../api/_lib/local-db.js');
  const admin = localDb.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  session = localDb.createSession(admin.id, 1);
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  await fs.mkdir(output, { recursive: true });
  const checks = [];
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, colorScheme: 'dark' });
    await context.addCookies([{ name: 'member_session', value: session.token, url: baseUrl }]);
    for (const [pageName, hash] of [['workspace', 'create'], ['home', 'home']]) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${baseUrl}/#${hash}`, { waitUntil: 'networkidle' });
      const link = page.getByRole('link', { name: /使用手册|Guide/ }).first();
      await link.waitFor({ state: 'visible' });
      const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      checks.push({ name, pageName, href: await link.getAttribute('href'), target: await link.getAttribute('target'), overflow: metrics.scrollWidth - metrics.width, errors });
      await page.screenshot({ path: path.join(output, `guide-topbar-${pageName}-${name}.png`), animations: 'disabled' });
      await page.close();
    }
    await context.close();
  }
  const failed = checks.filter((item) => item.href !== '/content/platform-guides/index.html' || item.target !== '_blank' || item.overflow > 0 || item.errors.length);
  process.stdout.write(JSON.stringify({ checks, failed }, null, 2));
  if (failed.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
  if (session?.token && localDb) localDb.deleteSession(session.token);
});
