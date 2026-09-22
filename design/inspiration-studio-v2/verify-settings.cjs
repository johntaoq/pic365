const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const {
    INITIAL_GENERATION_SETTINGS: initial, PREVIEW_SERVICES,
    settingsContext, selectRatio, selectPixelSize, changeService, editDimension, matchingPixelSizes,
  } = await import('./generation-settings.js');
  const { validateImageSizeForModel } = await import('../../shared/image-generation.js');
  const checks = [];
  const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };
  for (const service of PREVIEW_SERVICES) {
    const current = changeService(initial, service.id);
    for (const ratio of settingsContext(current).template.ratios) {
      const value = selectRatio(current, ratio.id);
      check(`${service.id} ${ratio.id}: valid ratio transition`, validateImageSizeForModel(`${value.width}x${value.height}`, service.model).valid);
      const sizes = matchingPixelSizes(value);
      check(`${service.id} ${ratio.id}: nonempty matching choices`, sizes.length > 0);
      for (const size of sizes) {
        const next = selectPixelSize(value, size);
        check(`${service.id} ${ratio.id} ${size}: correct ratio and valid dimensions`, next.ratio === ratio.id && validateImageSizeForModel(size, service.model).valid);
      }
      for (const changed of ['width', 'height']) {
        for (const target of [100, 1050, 99999]) {
          const next = editDimension(value, changed, target);
          const validation = validateImageSizeForModel(`${next.width}x${next.height}`, service.model);
          // The existing dimension helper clamps sides, while the existing
          // validator separately rejects combinations below minimum pixels.
          check(`${service.id} ${ratio.id} ${changed} ${target}: original dimension rules preserved`,
            next.width * ratio.height === next.height * ratio.width && (validation.valid || validation.error === 'MIN_PIXELS'));
        }
      }
    }
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5175/design/inspiration-studio-v2/index.html', { waitUntil: 'networkidle' });
    const provider = page.getByLabel('生图服务', { exact: true });
    const pixel = page.getByLabel('像素尺寸', { exact: true });
    const width = page.getByLabel('宽度 px', { exact: true });
    const height = page.getByLabel('高度 px', { exact: true });
    await page.getByRole('button', { name: '比例 16:9', exact: true }).click();
    const groupSizes = await pixel.locator('optgroup').first().locator('option').evaluateAll(items => items.map(item => item.value));
    check('ratio menu filters matching pixel sizes', groupSizes.every(size => { const [w,h] = size.split('x').map(Number); return w * 9 === h * 16; }));
    await pixel.selectOption('1024x1536');
    check('selecting pixels updates ratio', await page.getByRole('button', { name: '比例 2:3', exact: true }).getAttribute('aria-pressed') === 'true');
    await width.fill('1280'); await width.press('Tab');
    check('width updates linked height', await height.inputValue() === '1920');
    await height.fill('1536'); await height.press('Tab');
    check('height updates linked width', await width.inputValue() === '1024');
    await page.getByRole('button', { name: '自由比例', exact: true }).click();
    await width.fill('1200'); await width.press('Tab');
    check('free ratio edits one side only', await width.inputValue() === '1200' && await height.inputValue() === '1536');
    check('free dimensions show actual aspect', (await page.locator('.canvas-readout').textContent()).includes('25:32'));
    await width.fill('1400'); await width.press('Escape');
    check('escape discards dimension draft', await width.inputValue() === '1200');
    await width.fill('1201'); await width.press('Tab');
    check('step adjustment is visible', (await page.locator('.dimension-notice').textContent()).includes('1200 × 1536'));
    await provider.selectOption('gemini');
    check('Gemini hides free ratio', await page.getByRole('button', { name: '自由比例', exact: true }).count() === 0);
    check('Gemini resolution options', (await page.getByLabel('分辨率', { exact: true }).locator('option').allTextContents()).join(',') === '自动,1K,2K,4K');
    check('incompatible service switch is explained', (await page.locator('.dimension-notice').textContent()).includes('已适配'));
    await page.getByRole('button', { name: '比例 9:16', exact: true }).click();
    await page.getByRole('button', { name: '交换宽高', exact: true }).click();
    check('swap synchronizes ratio', await page.getByRole('button', { name: '比例 16:9', exact: true }).getAttribute('aria-pressed') === 'true');
    await pixel.selectOption('auto');
    check('automatic size clears ratio highlight', await page.locator('.ratio-options [aria-pressed=true]').count() === 0);
    await provider.selectOption('mai');
    check('MAI excludes auto size', await pixel.locator('option[value=auto]').count() === 0);
    check('MAI replaces incompatible auto mode', await width.isVisible());
    await provider.selectOption('gpt-fast');
    check('GPT original quality options restored', (await page.getByLabel('画质', { exact: true }).locator('option').allTextContents()).join(',') === '自动,低,中等,高');
    await page.getByRole('button', { name: '比例 2:3', exact: true }).click();
    await pixel.selectOption('1024x1536');
    await page.getByRole('button', { name: '提示词示例', exact: true }).click();
    await page.getByRole('button', { name: '使用这个示例', exact: true }).click();
    await page.getByRole('button', { name: '自由比例', exact: true }).click();
    await width.fill('480'); await width.press('Tab');
    check('invalid free aspect displays error', await page.locator('.dimension-error').count() === 1);
    check('invalid dimensions prevent generation', await page.getByRole('button', { name: '预览生成', exact: true }).isDisabled());
    await pixel.selectOption('1024x1536');
    check('valid size clears error', await page.locator('.dimension-error').count() === 0);
    for (const screen of [1440, 390, 320]) {
      await page.setViewportSize({ width: screen, height: screen === 1440 ? 1000 : 844 });
      for (const theme of ['浅色', '深色', '黑色']) {
        await page.getByRole('button', { name: `${theme}主题`, exact: true }).click();
        for (const serviceId of ['gpt-fast', 'gemini', 'mai']) {
          await provider.selectOption(serviceId);
          await page.locator('.settings-section').scrollIntoViewIfNeeded();
          check(`${screen} ${theme} ${serviceId}: no overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          const overflow = await page.locator('.generation-settings').evaluate(root => Array.from(root.querySelectorAll('button,select,input')).some(element => {
            const box = element.getBoundingClientRect(); const parent = root.getBoundingClientRect();
            return box.left < parent.left - 1 || box.right > parent.right + 1;
          }));
          check(`${screen} ${theme} ${serviceId}: controls fit`, !overflow);
          if (screen !== 320 && serviceId !== 'mai') await page.locator('.settings-section').screenshot({ path: path.join(__dirname, 'qa', `settings-${screen}-${theme}-${serviceId}.png`) });
        }
      }
    }
    check('no browser errors', errors.length === 0);
    await fs.writeFile(path.join(__dirname, 'qa', 'settings-report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, errors }));
  } finally { await browser?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
