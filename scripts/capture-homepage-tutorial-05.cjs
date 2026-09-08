const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

if (process.env.PIC365_ALLOW_TUTORIAL05_SUBMIT !== 'YES') {
  throw new Error('安全保护：该脚本会提交 1 个真实生图任务。如确需执行，请设置 PIC365_ALLOW_TUTORIAL05_SUBMIT=YES。');
}

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const root = path.resolve(process.cwd(), 'content/homepage-tutorials/05-toy-precision-retouch');
const sourceFile = path.join(root, 'source/source-01.png');
const outputDir = path.join(root, 'screens');
const markedFile = path.join(root, 'compare/marked-source.png');
const resultFile = path.join(root, 'results/result-01.png');
const prompt = '仅删除图1涂抹区域内的蜻蜓及其运动轨迹，用周围墙面与窗帘的真实颜色、纹理和光线自然补全。除涂抹区域外，猪八戒玩偶、孙悟空玩偶、右侧机器人、球拍、底座、桌面、背景、构图、色彩、光线和所有细节必须保持不变。不要新增文字、物体或改变任何角色造型。';

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
  await fs.mkdir(path.dirname(markedFile), { recursive: true });
  await fs.mkdir(path.dirname(resultFile), { recursive: true });
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  localDb = await import('../api/_lib/local-db.js');
  const admin = localDb.getDb().prepare("SELECT id FROM users WHERE role = 'super_admin' AND status = 'active' ORDER BY created_at LIMIT 1").get();
  if (!admin?.id) throw new Error('No active super administrator found for local tutorial capture.');
  session = localDb.createSession(admin.id, 1);

  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await context.addCookies([{ name: 'member_session', value: session.token, url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const startedAt = new Date().toISOString();

  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '单图创作' }).click();
  const workspace = page.locator('.freeImageWorkspace');
  await capture(workspace, '01-single-entry.png');

  await page.locator('.freeImageReferenceInput').nth(1).setInputFiles(sourceFile);
  const primaryCard = page.locator('.freeImagePrimaryReferenceSlot article');
  await primaryCard.waitFor({ state: 'visible' });
  const sizeSelect = page.locator('.freeImageControlRail label').filter({ hasText: '画布尺寸' }).locator('select');
  const ratioSelect = page.locator('.freeImageControlRail label').filter({ hasText: '比例锁定' }).locator('select');
  await sizeSelect.selectOption('custom');
  await ratioSelect.selectOption('free');
  const dimensionInputs = page.locator('.freeImageDimensionRail input[type="number"]');
  await dimensionInputs.nth(0).fill('768');
  await dimensionInputs.nth(0).press('Enter');
  await dimensionInputs.nth(1).fill('1344');
  await dimensionInputs.nth(1).press('Enter');
  await page.waitForTimeout(900);
  await capture(workspace, '02-source-uploaded.png');

  await primaryCard.locator('button.edit').click();
  const editor = page.locator('.freeReferenceEditorDialog');
  await editor.waitFor({ state: 'visible' });
  await capture(editor, '03-editor-open.png');

  const canvas = editor.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Annotation canvas is not visible.');
  const points = [
    [0.68, 0.15], [0.72, 0.13], [0.77, 0.14], [0.82, 0.17],
    [0.79, 0.20], [0.74, 0.19], [0.69, 0.17]
  ];
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => {};
    element.releasePointerCapture = () => {};
  });
  const dispatchPointer = async (type, [x, y], buttons) => {
    await canvas.dispatchEvent(type, {
      pointerId: 7,
      pointerType: 'mouse',
      isPrimary: true,
      bubbles: true,
      buttons,
      clientX: box.x + box.width * x,
      clientY: box.y + box.height * y
    });
  };
  await dispatchPointer('pointerdown', points[0], 1);
  await page.waitForTimeout(180);
  for (const point of points.slice(1, -1)) {
    await dispatchPointer('pointermove', point, 1);
    await page.waitForTimeout(100);
  }
  await dispatchPointer('pointerup', points.at(-1), 0);
  await editor.getByText('1 个标记', { exact: true }).waitFor({ state: 'visible' });
  await canvas.screenshot({ path: markedFile, animations: 'disabled' });
  await capture(editor, '04-region-marked.png');

  await editor.getByRole('button', { name: '应用标记' }).click();
  await page.locator('.freeImageLockedPromptRule').waitFor({ state: 'visible' });
  const textarea = page.locator('#free-image-prompt');
  const currentPrompt = await textarea.inputValue();
  const token = currentPrompt.match(/@图-[^\s]+/)?.[0] || '';
  await textarea.fill(`${prompt}\n${token}`.trim());
  await page.waitForTimeout(300);
  await capture(workspace, '05-prompt-ready.png');

  const generateButton = page.locator('.freeImageGenerateButton').first();
  const priceText = (await generateButton.textContent())?.replace(/\s+/g, ' ').trim() || '';
  await generateButton.click();
  await page.locator('.freeImageResults.generating').waitFor({ state: 'visible' });
  await capture(workspace, '06-generating.png');

  const resultImage = page.locator('.freeImageResultGrid article img').first();
  await resultImage.waitFor({ state: 'visible', timeout: 360000 });
  await page.waitForFunction(() => {
    const image = document.querySelector('.freeImageResultGrid article img');
    return image?.complete && image.naturalWidth > 0;
  }, null, { timeout: 60000 });
  await capture(workspace, '07-result-complete.png');

  const resultUrl = await resultImage.getAttribute('src');
  if (!resultUrl) throw new Error('Generated result URL is missing.');
  const response = await page.request.get(new URL(resultUrl, baseUrl).href);
  if (!response.ok()) throw new Error(`Result download failed: ${response.status()}`);
  await fs.writeFile(resultFile, await response.body());

  await resultImage.dblclick();
  const preview = page.locator('.freeImagePreviewDialog');
  await preview.waitFor({ state: 'visible' });
  await capture(preview, '08-result-preview.png');

  const generationId = resultUrl.match(/[?&]id=([^&]+)/)?.[1] || '';
  const summary = {
    captureType: 'new-real-local-edit-execution',
    startedAt,
    sourceFile: 'source/source-01.png',
    prompt,
    markedTarget: '右上方蜻蜓及其运动轨迹',
    priceText,
    generationId,
    screenshots: [
      '01-single-entry.png',
      '02-source-uploaded.png',
      '03-editor-open.png',
      '04-region-marked.png',
      '05-prompt-ready.png',
      '06-generating.png',
      '07-result-complete.png',
      '08-result-preview.png'
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
  if (session?.token && localDb) localDb.deleteSession(session.token);
});
