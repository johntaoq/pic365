const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const email = process.env.PIC365_TEST_EMAIL;
const password = process.env.PIC365_TEST_PASSWORD;
const sourceFile = path.resolve(
  process.cwd(),
  'content/homepage-tutorials/03-one-product-five-campaigns/source/source-01.jpg'
);
const outputDir = path.resolve(
  process.cwd(),
  'content/homepage-tutorials/03-one-product-five-campaigns/screens'
);
const prompts = [
  '保持图中黑色金属手机支架的圆形底座、旋转关节、倾斜支撑板、三条竖向开孔、两个承托钩和整体比例完全一致。制作极简浅灰棚拍广告图，柔和阴影，主体居中，背景干净，不增加文字、Logo、手机或配件。',
  '保持图中黑色金属手机支架的全部结构和比例完全一致。放在现代办公桌面，自然窗光，旁边只出现简洁键盘与笔记本电脑边缘，商品仍是视觉主体，不增加文字、Logo，不遮挡底座和承托钩。',
  '保持图中黑色金属手机支架的全部结构和比例完全一致。制作黑金轻奢广告视觉，深色渐变背景与克制轮廓光，放置在低矮展台上，突出金属质感，不增加文字、Logo、手机或额外结构。',
  '保持图中黑色金属手机支架的全部结构和比例完全一致。制作温暖节日礼赠氛围，红色与金色背景、柔和灯串虚化和少量礼盒装饰，商品完整清晰，不增加文字、Logo，不让装饰遮挡商品。',
  '保持图中黑色金属手机支架的全部结构和比例完全一致。制作年轻社交媒体广告图，使用明快绿色与蓝色几何背景，商品主体醒目，右上角保留干净文案区，但画面内不生成任何文字、Logo、手机或额外配件。'
];

if (process.env.PIC365_ALLOW_TUTORIAL03_RESUBMIT !== 'YES') {
  throw new Error('安全保护：该脚本会再次提交 5 个计费任务。如确需重跑，请显式设置 PIC365_ALLOW_TUTORIAL03_RESUBMIT=YES。');
}

if (!email || !password) throw new Error('PIC365_TEST_EMAIL and PIC365_TEST_PASSWORD are required.');

async function capture(locator, name) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().mouse.move(8, 8);
  await locator.page().waitForTimeout(150);
  await locator.screenshot({ path: path.join(outputDir, name), animations: 'disabled' });
}

let browser;
(async () => {
  await fs.mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
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
  await page.getByRole('tab', { name: '批量生图' }).click();
  const composer = page.locator('.freeImageComposer');
  await capture(composer, '01-batch-entry.png');

  await page.locator('input[type=file]').nth(0).setInputFiles(sourceFile);
  await page.waitForTimeout(700);
  await capture(composer, '02-source-uploaded.png');

  await page.locator('textarea').first().fill(prompts[0]);
  for (let index = 1; index < prompts.length; index += 1) {
    await page.getByRole('button', { name: '增加提示词' }).click();
    await page.locator('textarea').nth(index).fill(prompts[index]);
  }
  const preserveOriginal = page.getByRole('checkbox', { name: '保留原图尺寸' });
  if (await preserveOriginal.isChecked()) await preserveOriginal.uncheck();
  await page.locator('select').nth(1).selectOption('1024x1536');
  await page.waitForTimeout(800);
  await capture(composer, '03-five-prompts.png');

  const initialTaskText = await page.getByRole('tab', { name: /任务列表/ }).textContent();
  await page.getByRole('button', { name: /一键提交/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: /任务列表/ }).click();
  await page.waitForTimeout(500);
  await capture(page.locator('.freeImageWorkspace'), '04-task-list.png');

  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return !/生成中|排队中|等待中/.test(text) && /任务列表/.test(text);
  }, null, { timeout: 240000 });
  await page.waitForTimeout(1200);
  await capture(page.locator('.freeImageWorkspace'), '05-task-complete.png');

  await page.getByRole('tab', { name: '批量生图' }).click();
  await page.waitForTimeout(500);
  await capture(page.locator('.freeImageWorkspace'), '06-results.png');

  const summary = {
    captureType: 'new-real-execution',
    sourceFile: 'source/source-01.jpg',
    promptCount: prompts.length,
    initialTaskText,
    screenshots: [
      '01-batch-entry.png',
      '02-source-uploaded.png',
      '03-five-prompts.png',
      '04-task-list.png',
      '05-task-complete.png',
      '06-results.png'
    ],
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
