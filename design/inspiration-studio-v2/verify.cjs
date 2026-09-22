const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const url = 'http://127.0.0.1:5175/design/inspiration-studio-v2/index.html';
const output = path.join(__dirname, 'qa');
(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const checks = [];
  const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
  async function layout(label) {
    const result = await page.evaluate(() => ({
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
      brokenImages: Array.from(document.images).filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src),
      footer: document.querySelector('.generate-footer')?.getBoundingClientRect().toJSON(),
      editor: document.querySelector('.editor-scroll')?.getBoundingClientRect().toJSON(),
    }));
    check(`${label}: no horizontal overflow`, result.width <= result.viewport);
    check(`${label}: all images loaded`, result.brokenImages.length === 0);
    if (result.viewport <= 860 && result.footer) check(`${label}: footer does not cover settings`, result.footer.top >= result.editor.bottom - 1);
  }
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '提示词示例', exact: true }).click();
    await page.getByRole('button', { name: '使用这个示例' }).click();
    await page.getByRole('button', { name: '添加图片', exact: true }).click();
    check('attachment tray expands under prompt', await page.locator('.attachment-tray').isVisible());
    const positions = await page.evaluate(() => ({
      promptBottom: document.querySelector('.prompt-box').getBoundingClientRect().bottom,
      trayTop: document.querySelector('.attachment-tray').getBoundingClientRect().top,
    }));
    check('attachment position', positions.trayTop >= positions.promptBottom);
    await page.getByRole('button', { name: '添加图片', exact: true }).click();
    check('empty tray collapses with paperclip', await page.locator('.attachment-tray').count() === 0);
    for (const theme of ['浅色', '深色', '黑色']) {
      await page.getByRole('button', { name: `${theme}主题`, exact: true }).click();
      await layout(`desktop ${theme}`);
      await page.screenshot({ path: path.join(output, `desktop-${theme}.png`) });
    }
    await page.reload({ waitUntil: 'networkidle' });
    check('theme persists after refresh', await page.locator('html').getAttribute('data-theme') === 'black');
    check('prompt persists after refresh', (await page.getByRole('textbox', { name: '画面描述', exact: true }).inputValue()).length > 20);
    await page.getByRole('button', { name: '浅色主题', exact: true }).click();
    await page.getByRole('button', { name: '添加图片', exact: true }).click();
    await page.getByRole('button', { name: '从资源库选择', exact: true }).click();
    await page.getByRole('button', { name: '薄荷玫瑰香水', exact: true }).click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    check('library selection becomes master', await page.locator('.master-column .image-tile').count() === 1);
    await page.screenshot({ path: path.join(output, 'desktop-attachments.png') });
    const separator = page.getByRole('separator');
    await separator.focus();
    await page.keyboard.press('Home');
    check('minimum panel width 400', await separator.getAttribute('aria-valuenow') === '400');
    const box = await separator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 100, { steps: 6 });
    await page.mouse.up();
    check('pointer resizes panel', Number(await separator.getAttribute('aria-valuenow')) > 450);
    await page.getByRole('tab', { name: '批量生图', exact: true }).click();
    check('same width in batch mode', Number(await separator.getAttribute('aria-valuenow')) > 450);
    await page.getByRole('textbox', { name: '提示词 1', exact: true }).fill('纯文字商品摄影');
    check('zero images allows submission', await page.getByRole('button', { name: '预览批量生成', exact: true }).isEnabled());
    await page.getByRole('button', { name: '批量导入', exact: true }).click();
    await page.getByRole('textbox', { name: '导入提示词内容' }).fill('第一条提示词\n第二条提示词\n第三条提示词');
    await page.getByRole('button', { name: '导入', exact: true }).click();
    check('newline import creates three prompts', await page.locator('.prompt-row').count() === 3);
    await page.getByRole('button', { name: '上移提示词 2', exact: true }).click();
    check('prompt reorder', await page.getByRole('textbox', { name: '提示词 1', exact: true }).inputValue() === '第二条提示词');
    await page.getByRole('button', { name: '资源库', exact: true }).click();
    await page.getByRole('button', { name: '薄荷玫瑰香水', exact: true }).click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    check('one image keeps all prompts', (await page.locator('.mapping-summary').textContent()).includes('共用 1 张参考图'));
    await page.getByRole('button', { name: '继续添加图片', exact: true }).click();
    await page.getByRole('button', { name: '夏日冰饮广告', exact: true }).click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    check('extra prompt is retained', await page.locator('.prompt-row.inactive').count() === 1);
    await page.getByRole('button', { name: '统一提示词', exact: true }).click();
    check('shared prompt maps to two images', (await page.locator('.mapping-summary').textContent()).includes('1 条提示词 → 2'));
    await page.getByRole('button', { name: '逐图匹配', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'desktop-batch.png') });
    await page.getByRole('tab', { name: /任务列表/ }).click();
    await separator.focus(); await page.keyboard.press('Home');
    const statRows = await page.locator('.task-stats button').evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
    check('task counters stay on one row at minimum width', new Set(statRows).size === 1);
    await page.screenshot({ path: path.join(output, 'desktop-tasks.png') });
    await page.getByRole('tab', { name: '单图创作', exact: true }).click();
    await page.getByRole('button', { name: '预览生成', exact: true }).click();
    check('submission locks immediately', await page.locator('.primary-button[type=submit]').isDisabled());
    await page.getByRole('button', { name: '预览生成', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '放大预览', exact: true }).click();
    check('preview dialog visible', await page.locator('dialog').isVisible());
    await page.keyboard.press('Escape');
    check('escape closes dialog', await page.locator('dialog').count() === 0);
    await page.getByRole('button', { name: '添加图片', exact: true }).click();
    const oversizedInput = page.locator('input[type=file]').first();
    await oversizedInput.setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(15 * 1024 * 1024 + 1) });
    check('oversized image rejected', (await page.locator('.toast').textContent()).includes('15 MB'));
    const imageBytes = await fs.readFile(path.resolve(__dirname, '../../data/images/case519.jpg'));
    await page.locator('.prompt-box').evaluate((element, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(bytes)], 'dropped-photo.jpg', { type: 'image/jpeg' }));
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, Array.from(imageBytes));
    check('drag into prompt adds attachment', await page.locator('.attachment-tray .image-tile').count() === 2);
    await page.getByRole('textbox', { name: '画面描述', exact: true }).press('End');
    await page.getByRole('textbox', { name: '画面描述', exact: true }).press('@');
    check('at mention opens attachment picker', await page.locator('dialog').isVisible());
    await page.keyboard.press('Escape');
    for (const width of [1440, 1366, 1024, 860, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 861 ? 844 : 900 });
      for (const theme of ['浅色', '深色', '黑色']) {
        await page.getByRole('button', { name: `${theme}主题`, exact: true }).click();
        for (const tab of ['单图创作', '批量生图', '任务列表']) {
          await page.getByRole('tab', { name: tab === '任务列表' ? /任务列表/ : tab, exact: tab !== '任务列表' }).click();
          await page.waitForTimeout(70);
          await layout(`${width} ${theme} ${tab}`);
        }
        if (width === 390) {
          await page.getByRole('tab', { name: '单图创作', exact: true }).click();
          await page.screenshot({ path: path.join(output, `mobile-${theme}.png`), fullPage: true });
        }
      }
    }
    await page.getByRole('tab', { name: '单图创作', exact: true }).click();
    await page.getByRole('button', { name: '风格', exact: true }).click();
    check('mobile style dialog stays within viewport', await page.locator('dialog').evaluate(element => element.getBoundingClientRect().width <= innerWidth));
    await page.getByRole('button', { name: '复古海报', exact: true }).click();
    check('style choice applied', await page.getByRole('button', { name: '复古海报', exact: true }).isVisible());
    await page.getByRole('button', { name: '放大预览', exact: true }).click();
    const closeBounds = await page.getByRole('button', { name: '关闭弹窗' }).boundingBox();
    check('mobile modal close accessible', closeBounds.x >= 0 && closeBounds.x + closeBounds.width <= 320 && closeBounds.y >= 0);
    await page.keyboard.press('Escape');
    check('no runtime or HTTP errors', errors.length === 0);
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ url, checks, errors, passed: checks.length }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
