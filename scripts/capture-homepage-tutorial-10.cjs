const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

if (process.env.PIC365_ALLOW_TUTORIAL10_SUBMIT !== 'YES') {
  throw new Error('安全保护：该脚本会提交 1 张角色设定图和 6 个真实绘本分镜任务。确需执行时请设置 PIC365_ALLOW_TUTORIAL10_SUBMIT=YES。');
}

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const root = path.resolve(process.cwd(), 'content/homepage-tutorials/10-story-to-picture-book');
const sourceDir = path.join(root, 'source');
const screenDir = path.join(root, 'screens');
const resultDir = path.join(root, 'results');
const characterFile = path.join(sourceDir, 'character-card.png');

const characterPrompt = '原创儿童绘本角色设定卡：一只名叫栗栗的小红熊猫，圆脸，红棕色毛发，奶白色脸颊和耳缘，深棕色大眼睛，短而蓬松的环纹尾巴。固定服装为芥末黄色连帽雨衣、青绿色小背包、蓝色雨靴，胸前有一枚小小的绿色叶片别针。展示正面全身、侧面全身、背面全身和三个表情头像，统一柔和水粉儿童绘本风格，干净米白背景，角色比例和服装细节一致，不生成文字、Logo、水印或其他角色。';
const prompts = [
  '以参考图中的原创小红熊猫“栗栗”为唯一角色母版，严格保持红棕色毛发、奶白脸颊、环纹尾巴、芥末黄色连帽雨衣、青绿色小背包、蓝色雨靴和绿色叶片别针一致。绘本第1幕：雨后的清晨，栗栗在森林小屋门口发现一颗微微发光的蓝色种子，惊喜地双手捧起。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。',
  '以参考图中的原创小红熊猫“栗栗”为唯一角色母版，严格保持外貌和固定服装一致。绘本第2幕：栗栗把蓝色种子小心放进青绿色背包，沿着有水洼和蘑菇的森林小路出发，阳光穿过树叶。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。',
  '以参考图中的原创小红熊猫“栗栗”为唯一角色母版，严格保持外貌和固定服装一致。绘本第3幕：小河上的木桥被雨水冲断，栗栗站在岸边思考，远处山坡上能看见白色灯塔和花园。蓝色种子从背包口发出微光。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。',
  '以参考图中的原创小红熊猫“栗栗”为唯一角色母版，严格保持外貌和固定服装一致。绘本第4幕：栗栗用倒下的细树枝和藤蔓搭成安全的小桥，正谨慎走过河面，动作自然，蓝色种子仍在背包里。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。',
  '以参考图中的原创小红熊猫“栗栗”为唯一角色母版，严格保持外貌和固定服装一致。绘本第5幕：傍晚时分，栗栗到达山顶白色灯塔旁的荒芜小花园，跪下来把发光的蓝色种子种进土里，天空有温暖晚霞。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。',
  '以参考图中的原创小红熊猫“栗栗”为唯一角色母版，严格保持外貌和固定服装一致。绘本第6幕：夜幕下，蓝色种子长成一株发光的蓝色花朵，照亮灯塔花园，栗栗开心地坐在花旁，森林动物从远处好奇观看。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。'
];

async function capture(locator, name) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().mouse.move(8, 8);
  await locator.page().waitForTimeout(250);
  await locator.screenshot({ path: path.join(screenDir, name), animations: 'disabled' });
}

async function downloadImage(page, src, destination) {
  const response = await page.request.get(new URL(src, baseUrl).href);
  if (!response.ok()) throw new Error(`图片下载失败：${response.status()} ${src}`);
  await fs.writeFile(destination, await response.body());
}

let browser;
let localDb;
let session;
(async () => {
  await Promise.all([sourceDir, screenDir, resultDir].map(dir => fs.mkdir(dir, { recursive: true })));
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  localDb = await import('../api/_lib/local-db.js');
  const admin = localDb.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  if (!admin?.id) throw new Error('没有找到可用的主账号。');
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
  await page.locator('#free-image-prompt').fill(characterPrompt);
  const sizeSelect = page.locator('.freeImageControlRail label').filter({ hasText: '画布尺寸' }).locator('select');
  await sizeSelect.selectOption('1536x1024');
  await capture(workspace, '01-character-setting.png');
  await page.locator('.freeImageGenerateButton').first().click();
  const characterImage = page.locator('.freeImageResultGrid article img').first();
  await characterImage.waitFor({ state: 'visible', timeout: 360000 });
  await page.waitForFunction(() => {
    const image = document.querySelector('.freeImageResultGrid article img');
    return image?.complete && image.naturalWidth > 0;
  }, null, { timeout: 60000 });
  await capture(workspace, '02-character-result.png');
  const characterSrc = await characterImage.getAttribute('src');
  if (!characterSrc) throw new Error('角色设定图地址缺失。');
  await downloadImage(page, characterSrc, characterFile);
  const characterGenerationId = characterSrc.match(/[?&]id=([^&]+)/)?.[1] || '';

  await page.getByRole('tab', { name: '批量生图' }).click();
  await page.locator('input[type=file]').nth(0).setInputFiles(characterFile);
  await page.waitForTimeout(900);
  await capture(workspace, '03-character-reference.png');

  await page.locator('textarea').first().fill(prompts[0]);
  for (let index = 1; index < prompts.length; index += 1) {
    await page.getByRole('button', { name: '增加提示词' }).click();
    await page.locator('textarea').nth(index).fill(prompts[index]);
  }
  const preserveOriginal = page.getByRole('checkbox', { name: '保留原图尺寸' });
  if (await preserveOriginal.isChecked()) await preserveOriginal.uncheck();
  const batchSelects = page.locator('select');
  for (let i = 0; i < await batchSelects.count(); i += 1) {
    const options = await batchSelects.nth(i).locator('option').allTextContents();
    if (options.some(text => text.includes('1536') && text.includes('1024'))) {
      await batchSelects.nth(i).selectOption('1536x1024');
      break;
    }
  }
  await capture(workspace, '04-six-story-prompts.png');

  const initialTaskText = await page.getByRole('tab', { name: /任务列表/ }).textContent();
  await page.getByRole('button', { name: /一键提交/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: /任务列表/ }).click();
  await capture(workspace, '05-task-list.png');
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return !/生成中|排队中|等待中/.test(text) && /任务列表/.test(text);
  }, null, { timeout: 480000 });
  await page.waitForTimeout(1200);
  await capture(workspace, '06-task-complete.png');

  await page.getByRole('tab', { name: '批量生图' }).click();
  await page.waitForTimeout(800);
  await capture(workspace, '07-six-results.png');
  const resultImages = page.locator('.freeImageResultGrid article img');
  const resultCount = await resultImages.count();
  if (resultCount < 6) throw new Error(`绘本结果不足 6 张，当前 ${resultCount} 张。`);
  const generationIds = [];
  for (let index = 0; index < 6; index += 1) {
    const src = await resultImages.nth(index).getAttribute('src');
    if (!src) throw new Error(`第 ${index + 1} 张绘本图片地址缺失。`);
    await downloadImage(page, src, path.join(resultDir, `scene-${String(index + 1).padStart(2, '0')}.png`));
    generationIds.push(src.match(/[?&]id=([^&]+)/)?.[1] || '');
  }

  const summary = {
    captureType: 'new-real-storybook-execution', startedAt, characterPrompt, prompts,
    characterGenerationId, generationIds, initialTaskText, resultCount: 6,
    screenshots: ['01-character-setting.png','02-character-result.png','03-character-reference.png','04-six-story-prompts.png','05-task-list.png','06-task-complete.png','07-six-results.png'],
    url: page.url(), title: await page.title()
  };
  await fs.writeFile(path.join(screenDir, 'capture-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
  if (session?.token && localDb) localDb.deleteSession(session.token);
});
