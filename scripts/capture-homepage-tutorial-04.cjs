const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const root = path.resolve(process.cwd(), 'content/homepage-tutorials/04-batch-product-unification');
const sourceFiles = [
  'source/source-01.jpg',
  'source/source-02.jpg',
  'source/source-03.jpg',
  'source/source-04.webp'
].map((file) => path.join(root, file));
const outputDir = path.join(root, 'screens');
const resultsDir = path.join(root, 'results');
const scenario = process.env.PIC365_TUTORIAL04_SCENARIO === 'outdoor' ? 'outdoor' : 'cinematic';
const scenarioConfig = {
  cinematic: {
    prompt: '分别以每张输入图中的男士通勤斜肩包为唯一商品母版，严格保持该图原有拍摄角度、包体轮廓、深色棋盘纹理、前袋、拉链、背带连接、金属件和原有小尺寸标识不变。统一应用“高端商业 × 电影质感”风格：将商品置于深黑曜石色的大型未来展台中，背景有巨型弧形建筑轮廓和克制空间层次，使用顶部暖金色聚光、侧后方冷青色轮廓光、轻微体积雾和暗色镜面地面，形成强视觉中心、戏剧化明暗对比与奢侈品发布会氛围。按每张原图镜头角度自然适配展台透视，保持原画幅比例，商品完整清晰，不增加人物、文字、装饰道具、口袋、背带或其他商品结构。',
    quality: 'high',
    resultSuffix: 'unified',
    screenPrefix: '',
    summaryFile: 'capture-summary.json'
  },
  outdoor: {
    prompt: '分别以每张输入图中的男士通勤斜肩包为唯一商品母版，严格保持包体轮廓、深色棋盘纹理、前袋、拉链、背带连接、金属件和原有小尺寸标识不变。统一生成真实、高级的休闲户外运动广告摄影：一位 20–28 岁的成年东亚男性模特，阳光帅气、健康利落，穿简洁浅色功能夹克、深色运动长裤和干净运动鞋，将该斜肩包按真实使用方式自然斜跨在背部或胸前，包体占比合理、完整可见，背带贴合肩部与躯干，不遮挡关键结构。场景统一为清晨的现代城市河滨公园绿道，有干净的混凝土路面、绿色树木、远处现代建筑和轻微晨雾，模特可自然步行、慢跑或停下整理背带。使用温暖低角度阳光、清晰轮廓光、自然抓拍动势和运动品牌画册质感，画面通透、有活力但不夸张。保持每张原画幅比例，不增加文字、水印、其他包袋、额外口袋、背带或配件，不改变商品颜色、材质和数量。',
    quality: 'low',
    resultSuffix: 'outdoor',
    screenPrefix: 'outdoor-',
    summaryFile: 'capture-summary-outdoor.json'
  }
}[scenario];
const prompt = scenarioConfig.prompt;
const screenName = (name) => `${scenarioConfig.screenPrefix}${name}`;
const preferredProviderNames = ['企业级GPT-2生图', '高速稳定GPT生图2.0', '低价GPT'];

async function capture(locator, name) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().mouse.move(8, 8);
  await locator.page().waitForTimeout(180);
  await locator.screenshot({ path: path.join(outputDir, name), animations: 'disabled' });
}

async function downloadLatestResults(page, { captureFirst = false } = {}) {
  await fs.mkdir(resultsDir, { recursive: true });
  const downloadedResults = [];
  for (let index = 0; index < sourceFiles.length; index += 1) {
    const sourceName = path.basename(sourceFiles[index]);
    const completedTask = page.locator('.freeImageTaskItem.completed').filter({ hasText: sourceName }).first();
    await completedTask.getByRole('button', { name: '查看图片' }).click();
    const resultImage = page.locator('.freeImageResults img').first();
    await resultImage.waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    const resultUrl = await resultImage.getAttribute('src');
    if (!resultUrl) throw new Error(`Missing result URL for ${sourceName}.`);
    const absoluteResultUrl = new URL(resultUrl, baseUrl).href;
    const response = await page.request.get(absoluteResultUrl);
    if (!response.ok()) throw new Error(`Failed to download ${sourceName}: ${response.status()}`);
    const outputFile = path.join(resultsDir, `${String(index + 1).padStart(2, '0')}-${scenarioConfig.resultSuffix}.png`);
    await fs.writeFile(outputFile, await response.body());
    downloadedResults.push({ sourceName, outputFile: path.relative(root, outputFile).replaceAll('\\', '/'), resultUrl: absoluteResultUrl });
    if (captureFirst && index === 0) await capture(page.locator('.freeImageWorkspace'), screenName('06-result-preview.png'));
  }
  return downloadedResults;
}

let browser;
let localDb;
let session;
(async () => {
  const downloadOnly = process.env.PIC365_TUTORIAL04_DOWNLOAD_ONLY === '1';
  if (!downloadOnly && process.env.PIC365_ALLOW_TUTORIAL04_REMAKE !== 'YES') {
    throw new Error('Set PIC365_ALLOW_TUTORIAL04_REMAKE=YES to submit this real four-image remake.');
  }
  await fs.mkdir(outputDir, { recursive: true });
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
  page.setDefaultTimeout(25000);
  const startedAt = new Date().toISOString();

  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  if (downloadOnly) {
    await page.getByRole('tab', { name: /任务列表/ }).click();
    await page.locator('.freeImageTaskItem.completed').filter({ hasText: 'source-01.jpg' }).first().waitFor({ state: 'visible' });
    const downloadedResults = await downloadLatestResults(page, { captureFirst: true });
    console.log(JSON.stringify({ captureType: 'download-existing-remake', downloadedResults }, null, 2));
    return;
  }
  if (process.env.PIC365_TUTORIAL04_REDO === '1') {
    await page.getByRole('tab', { name: /任务列表/ }).click();
    const sourceTask = page.locator('.freeImageTaskItem.completed').filter({ hasText: 'source-03.jpg' }).first();
    await sourceTask.waitFor({ state: 'visible' });
    await sourceTask.getByRole('button', { name: '重做' }).click();
    await page.waitForTimeout(900);
    await capture(page.locator('.freeImageWorkspace'), '06-redo-queued.png');
    await page.waitForFunction(() => {
      const items = [...document.querySelectorAll('.freeImageTaskItem')]
        .filter((item) => item.textContent?.includes('source-03.jpg'));
      return items.length >= 2 && items[0].classList.contains('completed');
    }, null, { timeout: 360000 });
    await page.waitForTimeout(1200);
    await capture(page.locator('.freeImageWorkspace'), '07-redo-complete.png');
    console.log(JSON.stringify({ captureType: 'single-redo', startedAt, source: 'source-03.jpg' }, null, 2));
    return;
  }
  await page.getByRole('tab', { name: '批量生图' }).click();
  const composer = page.locator('.freeImageComposer');
  await capture(composer, screenName('01-batch-entry.png'));

  await page.locator('input[type=file]').first().setInputFiles(sourceFiles);
  await page.locator('.freeImageBatchRepairGrid article').nth(3).waitFor({ state: 'visible' });
  await page.waitForTimeout(900);
  await capture(composer, screenName('02-four-images.png'));

  await page.getByRole('radio', { name: '统一提示词' }).click();
  await page.locator('.freeImageBatchPromptList textarea').fill(prompt);
  const providerSelect = composer.getByRole('combobox', { name: '生图服务' });
  const providerOptions = await providerSelect.locator('option').evaluateAll((items) => items.map((item) => ({
    value: item.value,
    label: item.textContent?.trim() || ''
  })));
  const selectedProvider = preferredProviderNames
    .map((name) => providerOptions.find((item) => item.label === name))
    .find(Boolean) || providerOptions[0];
  if (!selectedProvider) throw new Error('No image provider is available for tutorial 04 remake.');
  await providerSelect.selectOption(selectedProvider.value);
  const qualitySelect = composer.getByRole('combobox', { name: '质量' });
  await qualitySelect.selectOption(scenarioConfig.quality);
  const preserveOriginal = page.getByRole('checkbox', { name: '保留原图尺寸' });
  if (!(await preserveOriginal.isChecked())) await preserveOriginal.check();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('一键提交'));
    return button && !button.disabled;
  });
  await capture(composer, screenName('03-shared-prompt.png'));

  const submit = page.getByRole('button', { name: /一键提交/ });
  const priceText = (await submit.textContent())?.trim() || '';
  await submit.click();
  await page.getByRole('tab', { name: /任务列表/ }).waitFor({ state: 'visible' });
  await page.waitForTimeout(900);
  await capture(page.locator('.freeImageWorkspace'), screenName('04-task-list.png'));

  await page.waitForFunction(({ names }) => {
    const items = [...document.querySelectorAll('.freeImageTaskItem')]
      .filter((item) => names.some((name) => item.textContent?.includes(name)));
    return items.length >= names.length && items.every((item) => item.classList.contains('completed'));
  }, { names: sourceFiles.map((file) => path.basename(file)) }, { timeout: 360000 });
  await page.waitForTimeout(1200);
  await capture(page.locator('.freeImageWorkspace'), screenName('05-task-complete.png'));

  const downloadedResults = await downloadLatestResults(page, { captureFirst: true });

  const summary = {
    captureType: 'new-real-execution',
    startedAt,
    sourceFiles: sourceFiles.map((file) => path.relative(root, file).replaceAll('\\', '/')),
    sourceCount: sourceFiles.length,
    promptMode: 'shared',
    prompt,
    providerId: selectedProvider.value,
    providerName: selectedProvider.label,
    scenario,
    quality: scenarioConfig.quality,
    preserveOriginalSize: true,
    priceText,
    downloadedResults,
    screenshots: [
      screenName('01-batch-entry.png'),
      screenName('02-four-images.png'),
      screenName('03-shared-prompt.png'),
      screenName('04-task-list.png'),
      screenName('05-task-complete.png'),
      screenName('06-result-preview.png')
    ],
    url: page.url(),
    title: await page.title()
  };
  await fs.writeFile(path.join(outputDir, scenarioConfig.summaryFile), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch(() => undefined);
  if (session?.token && localDb) localDb.deleteSession(session.token);
});
