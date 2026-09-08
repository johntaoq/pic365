const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

if (process.env.PIC365_ALLOW_TUTORIAL07_SUBMIT !== 'YES') {
  throw new Error('安全保护：该脚本会提交 1 个真实多参考图任务。如确需执行，请设置 PIC365_ALLOW_TUTORIAL07_SUBMIT=YES。');
}

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const root = path.resolve(process.cwd(), 'content/homepage-tutorials/07-multi-reference-creative-ad');
const sourceFiles = [
  'source/source-01-person.png',
  'source/source-02-bag.webp',
  'source/source-03-earbuds.png',
  'source/source-04-fox.png',
  'source/source-05-scene.webp'
].map(file => path.join(root, file));
const outputDir = path.join(root, 'screens');
const resultFile = path.join(root, 'results/result-01.png');
const prompt = '以图1中的成年女性为人物身份母版，保持她的脸型、五官、肤色、黑色长发和自然微笑可识别；把服装调整为适合东方幻想旅行的简洁青绿色长外套，呈现健康、非性感的商业广告形象。图2只提供黑色斜肩包的包体轮廓、棋盘纹理、前袋、拉链和背带结构，让人物自然斜挎该包；不要复制或生成任何品牌文字。图3只提供银色真无线耳机的形态与颜色：必须在人物左右耳中各出现一枚清晰可见的银色短柄入耳式耳机，耳机不能被头发遮住，不要用耳环代替，不生成品牌文字。图4只提供红色狐狸伙伴的红白配色、尖耳、蓬松长尾和友善表情，让它站在人物腰侧。图5只参考云海山峦、石桥、远山建筑、冷青色调和晨光氛围，不复制图5中的人物。最终制作一张2:3竖版东方幻想旅行广告，采用腰部以上的中近景构图：人物位于石桥前景，斜挎黑色包，双耳银色耳机清楚可见，红色狐狸在腰侧抬头陪伴，远处是云海群山与建筑；画面写实、电影感、空间关系自然，不生成文字、Logo、水印、耳环或额外人物。';

async function capture(locator, name) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().mouse.move(8, 8);
  await locator.page().waitForTimeout(180);
  await locator.screenshot({ path: path.join(outputDir, name), animations: 'disabled' });
}

let browser;
let localDb;
let session;
(async () => {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.dirname(resultFile), { recursive: true });
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
  const startedAt = new Date().toISOString();

  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '单图创作' }).click();
  const workspace = page.locator('.freeImageWorkspace');
  await capture(workspace, '01-single-entry.png');

  await page.locator('.freeImageReferenceInput').first().setInputFiles(sourceFiles);
  await page.waitForFunction(() => document.querySelectorAll('.freeImagePrimaryReferenceSlot article,.freeImageReferenceList article').length === 5);
  await page.waitForTimeout(1000);
  await capture(workspace, '02-five-references.png');

  await page.locator('#free-image-prompt').fill(prompt);
  const sizeSelect = page.locator('.freeImageControlRail label').filter({ hasText: '画布尺寸' }).locator('select');
  await sizeSelect.selectOption('1024x1536');
  await page.waitForTimeout(500);
  await capture(workspace, '03-numbered-prompt.png');

  const generateButton = page.locator('.freeImageGenerateButton').first();
  const priceText = (await generateButton.textContent())?.replace(/\s+/g, ' ').trim() || '';
  await generateButton.click();
  await page.locator('.freeImageResults.generating').waitFor({ state: 'visible' });
  await capture(workspace, '04-generating.png');

  const resultImage = page.locator('.freeImageResultGrid article img').first();
  await resultImage.waitFor({ state: 'visible', timeout: 360000 });
  await page.waitForFunction(() => {
    const image = document.querySelector('.freeImageResultGrid article img');
    return image?.complete && image.naturalWidth > 0;
  }, null, { timeout: 60000 });
  await capture(workspace, '05-result-complete.png');

  const resultUrl = await resultImage.getAttribute('src');
  if (!resultUrl) throw new Error('Generated result URL is missing.');
  const response = await page.request.get(new URL(resultUrl, baseUrl).href);
  if (!response.ok()) throw new Error(`Result download failed: ${response.status()}`);
  await fs.writeFile(resultFile, await response.body());

  await resultImage.dblclick();
  const preview = page.locator('.freeImagePreviewDialog');
  await preview.waitFor({ state: 'visible' });
  await capture(preview, '06-result-preview.png');

  const generationId = resultUrl.match(/[?&]id=([^&]+)/)?.[1] || '';
  const summary = {
    captureType: 'new-real-five-reference-execution', startedAt,
    sourceFiles: sourceFiles.map(file => path.relative(root, file).replaceAll('\\', '/')),
    prompt, referenceCount: 5, priceText, generationId,
    screenshots: ['01-single-entry.png','02-five-references.png','03-numbered-prompt.png','04-generating.png','05-result-complete.png','06-result-preview.png'],
    url: page.url(), title: await page.title()
  };
  await fs.writeFile(path.join(outputDir, 'capture-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
  if (session?.token && localDb) localDb.deleteSession(session.token);
});
