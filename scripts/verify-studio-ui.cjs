const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(process.cwd(), 'work/studio-ui-qa');
const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5176';
let browser, db, session;
(async () => {
  await fs.mkdir(root, { recursive: true });
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  db = await import('../api/_lib/local-db.js');
  const admin = db.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  assert.ok(admin, 'Local administrator required');
  session = db.createSession(admin.id, 1);
  browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'member_session', value: session.token, url: baseUrl }]);
  let theme = 'light';
  await context.addInitScript(() => localStorage.setItem('language', 'zh'));
  const page = await context.newPage();
  const errors = [], checks = [];
  const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
  page.on('pageerror', error => errors.push(error.message));
  // A UI acceptance run must never generate billable work.
  await page.route('**/api/generate-image*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'UI_TEST_NO_GENERATION' }) }));
  await page.route('**/api/generation-tasks*', route => route.request().method() === 'GET' ? route.continue() : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'UI_TEST_NO_GENERATION' }) }));
  await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
  await page.locator('.freeImageStudioV2').waitFor();
  await page.evaluate(() => localStorage.setItem('pic365.site-theme.v1', 'light'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.freeImageStudioV2').waitFor();
  const close = page.getByRole('button', { name: '关闭', exact: true });
  if (await close.count() && await close.first().isVisible()) await close.first().click();
  await page.locator('.freeImageStudioV2').waitFor();
  const previewTab = page.locator('#studio-results-tab-preview');
  const historyTab = page.locator('#studio-results-tab-history');
  const recentPreview = page.locator('.studioRecentHistoryPreview').first();
  await recentPreview.waitFor();
  check('history is inside right panel, not below workspace', await page.locator('.freeImageResults .freeImageHistory').count() === 1 && await page.locator('.freeImageWorkspace > .freeImageHistory').count() === 0);
  check('recent history keeps reference, delete and clear controls', await page.locator('.studioRecentHistoryReference').count() > 0 && await page.locator('.studioRecentHistoryDelete').count() > 0 && await page.locator('.studioRecentClearHistory').count() === 1);
  const recentCardBox = await recentPreview.boundingBox();
  check('recent history thumbnails are square', recentCardBox && Math.abs(recentCardBox.width - recentCardBox.height) <= 1);
  const recentCardControls = await page.locator('.studioRecentRail article').first().evaluate((card) => {
    const cardBox = card.getBoundingClientRect();
    const reference = card.querySelector('.studioRecentHistoryReference')?.getBoundingClientRect();
    const remove = card.querySelector('.studioRecentHistoryDelete')?.getBoundingClientRect();
    return {
      reference: reference?.toJSON(),
      remove: remove?.toJSON(),
      referenceInset: reference ? { top: reference.top - cardBox.top, left: reference.left - cardBox.left } : null,
      removeInset: remove ? { top: remove.top - cardBox.top, right: cardBox.right - remove.right } : null
    };
  });
  check('recent history controls are compact', recentCardControls.reference?.width <= 18 && recentCardControls.reference?.height <= 18 && recentCardControls.remove?.width <= 18 && recentCardControls.remove?.height <= 18);
  check('recent history controls hug the upper corners', recentCardControls.referenceInset?.top <= 3 && recentCardControls.referenceInset?.left <= 3 && recentCardControls.removeInset?.top <= 3 && recentCardControls.removeInset?.right <= 3);
  await recentPreview.hover();
  await page.locator('.studioRecentHoverPreview').waitFor();
  await page.waitForTimeout(160);
  const recentHoverBox = await page.locator('.studioRecentHoverPreview').boundingBox();
  check('recent history hover preview is 130 percent', recentCardBox && recentHoverBox && Math.abs(recentHoverBox.width / recentCardBox.width - 1.3) <= 0.04);
  check('recent history hover preview is visibly separate', recentCardBox && recentHoverBox && (recentHoverBox.y + recentHoverBox.height <= recentCardBox.y - 8 || recentHoverBox.y >= recentCardBox.y + recentCardBox.height + 8));
  await page.screenshot({ path: path.join(root, 'recent-history-hover.png') });
  await page.locator('.studioRecentHistoryReference').first().hover();
  await page.waitForTimeout(40);
  check('reference control does not trigger history preview', await page.locator('.studioRecentHoverPreview').count() === 0);
  await page.locator('.studioRecentHistoryDelete').first().hover();
  await page.waitForTimeout(40);
  check('delete control does not trigger history preview', await page.locator('.studioRecentHoverPreview').count() === 0);
  const recentRail = page.locator('.studioRecentRail');
  const recentRailMetrics = await recentRail.evaluate(element => ({ scroll: element.scrollLeft, width: element.clientWidth, scrollWidth: element.scrollWidth }));
  check('recent history has frosted navigation controls', await page.locator('.studioRecentRailNav.previous').count() === 1 && await page.locator('.studioRecentRailNav.next').count() === 1);
  if (recentRailMetrics.scrollWidth > recentRailMetrics.width) {
    const nextRailButton = page.locator('.studioRecentRailNav.next');
    await page.waitForFunction(() => !document.querySelector('.studioRecentRailNav.next')?.disabled);
    await nextRailButton.click();
    await page.waitForTimeout(360);
    check('recent history next control scrolls the card rail', await recentRail.evaluate(element => element.scrollLeft) > recentRailMetrics.scroll);
  }
  await recentPreview.click();
  check('recent artwork opens main preview', await page.locator('.studioMainPreview img').count() === 1);
  await page.locator('.studioPreviewExpand').click();
  check('preview expand preserves original dialog', await page.locator('.freeImagePreviewDialog').isVisible());
  await page.locator('.freeImagePreviewDialog').getByRole('button', { name: 'Close', exact: true }).click();
  await historyTab.click();
  check('history panel replaces preview', await page.locator('#studio-results-history').isVisible() && !await page.locator('#studio-results-preview').isVisible());
  await page.getByLabel('搜索生图历史', { exact: true }).fill('no-matching-history-unique-query');
  check('history search empty state', await page.locator('.studioHistoryPreview').count() === 0);
  await page.getByLabel('搜索生图历史', { exact: true }).fill('');
  check('history delete and reference controls preserved', await page.locator('.studioHistoryPanel .freeImageHistoryDelete').count() > 0 && await page.locator('.studioHistoryPanel .freeImageHistoryReference').count() > 0);
  await page.locator('.studioHistoryPreview').first().click();
  check('history thumbnail returns to preview', await previewTab.getAttribute('aria-selected') === 'true');
  await historyTab.focus(); await page.keyboard.press('ArrowLeft');
  check('result tabs support keyboard switching', await previewTab.getAttribute('aria-selected') === 'true');
  await page.screenshot({ path: path.join(root, 'initial.png'), fullPage: true });
  const provider = page.locator('.studioProviderField select');
  const options = await provider.locator('option').evaluateAll(items => items.map(item => ({ value: item.value, label: item.textContent })));
  check('real provider list available', options.length > 0);
  console.log(JSON.stringify({ providers: options.map(item => item.label) }));
  await page.getByRole('button', { name: '比例 2:3', exact: true }).click();
  await page.getByLabel('像素尺寸', { exact: true }).selectOption('1024x1536');
  const width = page.locator('.freeImageDimensionRail input[type=number]').first();
  const height = page.locator('.freeImageDimensionRail input[type=number]').last();
  check('pixel selection preserves actual dimensions', await width.inputValue() === '1024' && await height.inputValue() === '1536');
  await width.fill('1280'); await width.press('Tab');
  check('existing proportional dimension handler', await height.inputValue() === '1920');
  await page.getByRole('button', { name: '自由比例', exact: true }).click();
  await width.fill('1200'); await width.press('Tab');
  check('existing free dimension handler', await height.inputValue() === '1920');
  await page.getByLabel('像素尺寸', { exact: true }).selectOption('1024x1536');
  check('pixel choice synchronizes ratio', await page.getByRole('button', { name: '比例 2:3', exact: true }).getAttribute('aria-pressed') === 'true');
  const gemini = options.find(item => /香蕉|Gemini/i.test(item.label));
  if (gemini) {
    await provider.selectOption(gemini.value);
    check('Gemini ratio constraints preserved', await page.getByRole('button', { name: '自由比例', exact: true }).count() === 0);
    check('Gemini quality labels preserved', (await page.locator('.studioQualityRail select').first().locator('option').allTextContents()).join(',') === '自动,1K,2K,4K');
    await provider.selectOption(options.find(item => /GPT/i.test(item.label)).value);
  }
  const attachment = page.locator('.freeImagePromptAttachmentButton');
  await attachment.click();
  check('attachment tray opens below prompt', await page.locator('.freeImageReferenceTrayExpanded').isVisible());
  const location = await page.evaluate(() => ({
    prompt: document.querySelector('.freeImagePromptWrap').getBoundingClientRect().bottom,
    tray: document.querySelector('.freeImageReferenceTray').getBoundingClientRect().top,
  }));
  check('attachment tray stays below input', location.tray >= location.prompt);
  await attachment.click();
  check('empty tray collapses', await page.locator('.freeImageReferenceTrayExpanded').count() === 0);
  await page.locator('#free-image-prompt').fill('测试画面描述，不发起生成。');
  await page.locator('.studioPromptModifiers summary').click();
  check('quick phrase controls preserved', await page.locator('.freeImagePromptModifiers').isVisible());
  await page.locator('.studioPromptModifiers summary').click();
  await page.locator('.freeImagePromptStyleTrigger').click();
  check('style selector remains available', await page.locator('.freeImageStylePopover').isVisible());
  await page.screenshot({ path: path.join(root, 'style-open.png') });
  await page.locator('.freeImagePromptStyleTrigger').click();
  let releaseGeneration;
  const generationGate = new Promise(resolve => { releaseGeneration = resolve; });
  let generationRequests = 0;
  let generationBody;
  await page.route('**/api/generate-image', async route => {
    generationRequests++;
    generationBody = route.request().postDataJSON();
    await generationGate;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'UI_TEST_NO_GENERATION' }) });
  });
  const generateButton = page.locator('.freeImageGenerateButton').first();
  await page.waitForFunction(() => !document.querySelector('.freeImageGenerateButton').disabled);
  await generateButton.evaluate(button => { button.click(); button.click(); button.click(); });
  check('single generation locks synchronously', await generateButton.isDisabled());
  await page.waitForFunction(() => document.querySelector('.freeImageGenerateButton')?.getAttribute('aria-busy') === 'true');
  for (let attempts = 0; !generationRequests && attempts < 30; attempts++) await page.waitForTimeout(100);
  check('multiple clicks only submit once', generationRequests === 1);
  check('real generation payload preserved', generationBody.prompt === '测试画面描述，不发起生成。' && generationBody.references.length === 0 && generationBody.providerId);
  releaseGeneration();
  await page.waitForFunction(() => document.querySelector('.freeImageGenerateButton')?.getAttribute('aria-busy') === 'false');
  check('failed generation releases lock', await generateButton.getAttribute('aria-busy') === 'false');
  const tabs = page.locator('.freeImageHeaderTabs');
  await tabs.getByRole('tab').nth(1).click();
  const batchText = page.locator('.freeImageBatchPromptList textarea').first();
  check('zero-reference prompt remains editable', await batchText.isEnabled());
  await batchText.fill('批量测试，不发起生成。');
  const batchUpload = page.locator('.freeImageBatchImagePanel input[type=file]');
  await batchUpload.setInputFiles(path.resolve('data/images/case519.jpg'));
  await page.waitForFunction(() => document.querySelectorAll('.freeImageBatchRepairGrid article').length === 1);
  check('one reference preserves prompt', await batchText.inputValue() === '批量测试，不发起生成。');
  await page.locator('.freeImageBatchPromptPanel header button').first().click();
  check('one image supports multiple prompts', await page.locator('.freeImageBatchPromptList textarea').count() === 2);
  await page.locator('.freeImageBatchPromptList textarea').nth(1).fill('第二条批量提示词');
  await batchUpload.setInputFiles(path.resolve('data/images/case517.jpg'));
  await page.waitForFunction(() => document.querySelectorAll('.freeImageBatchRepairGrid article').length === 2);
  check('multiple images retain paired prompts', await page.locator('.freeImageBatchPromptList textarea').count() === 2);
  await page.getByRole('radio', { name: '统一提示词', exact: true }).click();
  check('multiple images shared prompt', await page.locator('.freeImageBatchPromptList textarea').count() === 1);
  await page.getByRole('radio', { name: '逐图填写', exact: true }).click();
  check('switching mode retains second prompt', await page.locator('.freeImageBatchPromptList textarea').nth(1).inputValue() === '第二条批量提示词');
  check('preserve original size disables ratio', await page.getByRole('button', { name: '比例 1:1', exact: true }).isDisabled());
  await page.screenshot({ path: path.join(root, 'batch.png') });
  await tabs.getByRole('tab').nth(2).click();
  const splitter = page.locator('.freeImagePanelResizeHandle');
  await splitter.focus();
  await page.keyboard.press('ArrowLeft');
  const priorWidth = Number(await splitter.getAttribute('aria-valuenow'));
  const splitterBox = await splitter.boundingBox();
  await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + 200);
  await page.mouse.down();
  await page.mouse.move(splitterBox.x - 500, splitterBox.y + 200, { steps: 5 });
  await page.mouse.up();
  check('dragging respects original minimum width', Number(await splitter.getAttribute('aria-valuenow')) === 440 && priorWidth >= 440);
  const stats = await page.locator('.freeImageTaskSummary > span').evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
  check('queue indicators remain on one row', new Set(stats).size === 1);
  for (const width of [1440, 1280, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 1000 });
    for (theme of ['light', 'dark', 'black']) {
      await page.evaluate(value => localStorage.setItem('pic365.site-theme.v1', value), theme);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.freeImageStudioV2').waitFor();
      if (await close.count() && await close.first().isVisible()) await close.first().click();
      for (let tab = 0; tab < 3; tab++) {
        await page.locator('.freeImageHeaderTabs [role=tab]').nth(tab).click();
        const dimensions = await page.evaluate(() => {
          const root = document.querySelector('.freeImageStudioV2');
          const form = root.querySelector('.freeImageComposer');
          return {
            width: document.documentElement.scrollWidth, viewport: innerWidth,
            form: form?.getBoundingClientRect().toJSON(),
            footer: root.querySelector('.studioComposerFooter')?.getBoundingClientRect().toJSON(),
            body: root.querySelector('.studioComposerBody')?.getBoundingClientRect().toJSON(),
          };
        });
        check(`${width}/${theme}/${tab}: no horizontal overflow`, dimensions.width <= dimensions.viewport);
        if (dimensions.form) check(`${width}/${theme}/${tab}: footer within editor`, dimensions.footer.right <= dimensions.form.right + 1 && dimensions.footer.left >= dimensions.form.left - 1);
        if (width <= 1180 && dimensions.form) check(`${width}/${theme}/${tab}: no covered form content`, dimensions.footer.top >= dimensions.body.bottom - 1);
        if (tab === 0) {
          const controls = await page.locator('.studioQualityRail select').evaluateAll(items => items.map(item => item.getBoundingClientRect().toJSON()));
          check(`${width}/${theme}: quality and count stay on one row`, controls.length === 2 && Math.abs(controls[0].top - controls[1].top) <= 1);
          check(`${width}/${theme}: quality and count have equal widths`, Math.abs(controls[0].width - controls[1].width) <= 1 && controls[0].right < controls[1].left);
          const prompt = page.locator('#free-image-prompt');
          await prompt.click();
          const promptFocus = await page.locator('.freeImagePromptInputFrame').evaluate(frame => {
            const input = frame.querySelector('textarea');
            return {
              frameShadow: getComputedStyle(frame).boxShadow,
              inputOutlineStyle: getComputedStyle(input).outlineStyle,
            };
          });
          check(`${width}/${theme}: prompt focus has no separate textarea outline`, promptFocus.inputOutlineStyle === 'none');
          check(`${width}/${theme}: prompt focus ring stays within its frame`, promptFocus.frameShadow.includes('inset'));
          if (width === 1440 || width === 390) {
            await page.locator('.studioQualityRail').screenshot({ path: path.join(root, `quality-${width}-${theme}.png`) });
          }
        }
        if (width === 1440 || width === 390) {
          if (await page.locator('.studioRecentHistoryPreview').count()) await page.locator('.studioRecentHistoryPreview').first().click();
          await page.locator('.freeImageStudioV2').screenshot({ path: path.join(root, `${width}-${theme}-${tab}.png`) });
          await historyTab.click();
          await page.locator('.studioResultsPanel').screenshot({ path: path.join(root, `history-${width}-${theme}-${tab}.png`) });
          const historyBounds = await page.locator('.studioHistoryPanel').evaluate(element => ({ scroll: element.scrollHeight, height: element.clientHeight, overflow: getComputedStyle(element).overflowY, width: element.clientWidth, scrollWidth: element.scrollWidth }));
          check(`${width}/${theme}/${tab}: history scrollable`, historyBounds.scroll <= historyBounds.height || historyBounds.overflow === 'auto');
          check(`${width}/${theme}/${tab}: history cards not clipped horizontally`, historyBounds.scrollWidth <= historyBounds.width + 1);
          await previewTab.click();
          const imageBounds = await page.locator('.studioMainPreview img').boundingBox();
          check(`${width}/${theme}/${tab}: main preview is nonzero`, imageBounds && imageBounds.width > 100 && imageBounds.height > 100);
        }
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.freeImageHeaderTabs [role=tab]').first().click();
  await page.locator('#free-image-prompt').fill('本地模拟多图结果，禁止请求上游。');
  await page.locator('.freeImageCountPreview select').selectOption('2');
  await page.route('**/api/generate-image', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, images: [
        { image: '/images/case519.jpg', size: '1024x1536', quality: 'low', downloadAllowed: true },
        { image: '/images/case517.jpg', size: '1024x1536', quality: 'low', downloadAllowed: true },
      ],
    }),
  }));
  await historyTab.click();
  await page.locator('.freeImageGenerateButton').click();
  await page.locator('.studioCurrentResults .studioFilmstrip button').nth(1).waitFor();
  check('generation automatically reveals preview', await previewTab.getAttribute('aria-selected') === 'true');
  check('multiple outputs retained', await page.locator('.studioCurrentResults .studioFilmstrip button').count() === 2);
  await page.locator('.studioCurrentResults .studioFilmstrip button').nth(1).click();
  check('second output selects correct full image', (await page.locator('.studioMainPreview img').getAttribute('src')).endsWith('case517.jpg'));
  check('download uses selected output', (await page.locator('.studioMainPreview a[download]').getAttribute('href')).endsWith('case517.jpg'));
  await page.locator('.studioCurrentResults .studioFilmstrip button').first().click();
  check('first output remains accessible', (await page.locator('.studioMainPreview img').getAttribute('src')).endsWith('case519.jpg'));
  check('no runtime exceptions', errors.length === 0);
  await fs.writeFile(path.join(root, 'report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (session) db.deleteSession(session.token);
});
