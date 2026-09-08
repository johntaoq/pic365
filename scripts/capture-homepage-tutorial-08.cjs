const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const root = path.resolve(process.cwd(), 'content/homepage-tutorials/08-canvas-video-storyboard');
const screens = path.join(root, 'screens');
const results = path.join(root, 'results');
const projectId = '7155500b-b178-4ef8-ae9b-1538aa1ce6ea';
const imageIds = [
  ['01-opening.png', 'c521ea06-be70-4a04-a110-8af4dd9b6223'],
  ['02-character.png', '846684ad-a9a6-4e74-b1bc-efd363646733'],
  ['03-riding.png', '4148a2ca-473c-4cad-9703-5106a9e1f0b6'],
  ['04-battle.png', '75b285ca-80b3-4608-ac58-a5e4a6ae1729']
];
const videoAssetId = '02b70922-2ccb-43e7-8198-410dd1a8dbff';

async function capture(locator, file) {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.screenshot({ path: path.join(screens, file), animations: 'disabled' });
}

let browser;
let localDb;
let session;
(async () => {
  await fs.mkdir(screens, { recursive: true });
  await fs.mkdir(results, { recursive: true });
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  localDb = await import('../api/_lib/local-db.js');
  const admin = localDb.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  if (!admin?.id) throw new Error('No active super administrator found.');
  session = localDb.createSession(admin.id, 1);

  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await context.addCookies([{ name: 'member_session', value: session.token, url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${baseUrl}/#canvas`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '无限画布' }).click();
  await page.getByRole('tab', { name: /我的画布/ }).click();
  await page.locator('.infiniteCanvasProjectOpen').filter({ hasText: '红楼梦开始' }).click();
  await page.locator(`[data-node-id="task-dc127331-7e46-4c24-9226-e2cde4a1ebe2"]`).waitFor({ state: 'visible' });

  const workspace = page.locator('.infiniteCanvasLayout');
  await capture(workspace, '01-project-open.png');
  await page.getByRole('button', { name: '适应内容' }).click();
  await page.waitForTimeout(500);
  await capture(workspace, '02-storyboard-overview.png');

  const nodeShots = [
    ['branch-a1.png', 'task-dc127331-7e46-4c24-9226-e2cde4a1ebe2'],
    ['branch-a2-video.png', 'video-task-8d1aecdc-f89a-4ca8-b966-f1703de4cf1a'],
    ['branch-b-source.png', 'upload-b4a1db6f-6dfa-4b43-9ee1-d0b7a748f2d1'],
    ['branch-b1.png', 'task-1700de78-0e04-4bbd-a06e-d53645fb95db'],
    ['branch-b2.png', 'task-0c42add9-d55c-4d90-87af-81ebe34cb8ff'],
    ['branch-b3-video.png', 'video-task-7fca3f29-ddf5-4669-8987-bea7a2471b7a']
  ];
  for (const [file, id] of nodeShots) {
    await page.locator(`[data-node-id="${id}"]`).screenshot({ path: path.join(results, file), animations: 'disabled' });
  }

  await page.locator(`[data-node-id="task-1700de78-0e04-4bbd-a06e-d53645fb95db"]`).click();
  await page.waitForTimeout(250);
  await capture(workspace, '03-locked-character.png');

  const motionSource = page.locator(`[data-node-id="task-0c42add9-d55c-4d90-87af-81ebe34cb8ff"]`);
  await motionSource.click();
  await motionSource.getByRole('button', { name: '让图片动起来' }).click();
  await page.waitForTimeout(250);
  await capture(workspace, '04-video-settings.png');

  const videoNode = page.locator(`[data-node-id="video-task-7fca3f29-ddf5-4669-8987-bea7a2471b7a"]`);
  await videoNode.getByRole('button', { name: '播放视频' }).click();
  const preview = page.locator('.infiniteCanvasPreview.videoPreview');
  await preview.waitFor({ state: 'visible' });
  await capture(preview, '05-video-preview.png');

  for (const [file, id] of imageIds) {
    const response = await page.request.get(`${baseUrl}/api/generated?id=${id}`);
    if (!response.ok()) throw new Error(`Image ${id} download failed: ${response.status()}`);
    await fs.writeFile(path.join(results, file), await response.body());
  }
  const video = await page.request.get(`${baseUrl}/api/assets/file?id=${videoAssetId}&variant=original&download=1`);
  if (!video.ok()) throw new Error(`Video download failed: ${video.status()}`);
  await fs.writeFile(path.join(results, 'storyboard-preview.mp4'), await video.body());
  const poster = await page.request.get(`${baseUrl}/api/assets/file?id=${videoAssetId}&variant=poster`);
  if (poster.ok()) await fs.writeFile(path.join(results, 'storyboard-preview-poster.jpg'), await poster.body());

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const mobilePage = await mobile.newPage();
  const pageErrors = [];
  mobilePage.on('pageerror', (error) => pageErrors.push(error.message));
  await mobilePage.goto(`${baseUrl}/content/homepage-tutorials/08-canvas-video-storyboard/index.html`, { waitUntil: 'networkidle' });
  const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (mobileOverflow > 0) throw new Error(`Mobile horizontal overflow: ${mobileOverflow}px`);
  await mobilePage.screenshot({ path: path.join(screens, '06-mobile.png'), fullPage: true, animations: 'disabled' });
  await mobile.close();
  if (pageErrors.length) throw new Error(`Tutorial page errors: ${pageErrors.join('; ')}`);

  const summary = {
    captureType: 'existing-real-local-canvas-project-review',
    capturedAt: new Date().toISOString(), projectId, projectName: '红楼梦开始',
    entityCount: 14, imageResultCount: 4, videoAssetId,
    displayedBranches: ['A1 → A2 视频', 'B → B1 → B2 → B3 视频'],
    mobileOverflow, pageErrors,
    screenshots: ['01-project-open.png','02-storyboard-overview.png','03-locked-character.png','04-video-settings.png','05-video-preview.png','06-mobile.png']
  };
  await fs.writeFile(path.join(screens, 'capture-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
  if (session?.token && localDb) localDb.deleteSession(session.token);
});
