const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const output = path.resolve(process.cwd(), 'content/platform-guides/05-companion/screens/01-panel.png');
let browser;
let localDb;
let session;

(async () => {
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  localDb = await import('../api/_lib/local-db.js');
  const admin = localDb.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  session = localDb.createSession(admin.id, 1);
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1320, height: 974 }, colorScheme: 'dark' });
  await context.addCookies([{ name: 'member_session', value: session.token, url: baseUrl }]);
  const page = await context.newPage();
  await page.route('**/api/chat?limit=60', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, messages: [], provider: { name: 'gpt-5.6-luna' } })
  }));
  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  await page.locator('.chatCompanionOrb').click();
  const panel = page.locator('.chatCompanionPanel');
  await panel.waitFor({ state: 'visible' });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output, animations: 'disabled' });
  process.stdout.write(output);
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
  if (session?.token && localDb) localDb.deleteSession(session.token);
});
