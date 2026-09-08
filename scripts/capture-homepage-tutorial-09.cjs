const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const root = path.resolve(process.cwd(), 'content/homepage-tutorials/09-poem-teaching-illustration');
const prompts = [
  ['01-horizontal-ready.png', '《登鹳雀楼》课堂插画：盛唐边塞山水，黄河奔流进入远方，夕阳依山而落，鹳雀楼高耸，登楼远眺的诗人背影，画面重点对应“白日依山尽，黄河入海流；欲穷千里目，更上一层楼”。中国传统青绿山水与淡彩工笔结合，留出左侧课件标题安全区，横版16:9，无任何文字、印章、水印或现代元素。', '1536x1024'],
  ['02-vertical-ready.png', '《望庐山瀑布》竖版读物封面插画：庐山香炉峰云雾缭绕，巨大瀑布从高山飞泻，阳光照出紫色烟霞，一位唐代诗人站在近景仰望，画面重点对应“日照香炉生紫烟，遥看瀑布挂前川；飞流直下三千尺，疑是银河落九天”。中国水墨设色，竖版2:3，上方和下方保留后期排版空间，无任何文字、印章、水印或现代元素。', '1024x1536'],
  ['03-character-ready.png', '古诗人物教学场景插画：唐代诗人李白与杜甫在山间亭中对坐饮茶论诗，案上有展开的素白诗卷但不出现可辨识文字，远处青山、松树、流云和小瀑布，人物衣冠符合盛唐文人形象，神态自然、有师友交流感。中国工笔人物与水墨山水结合，方形课堂知识卡构图，无文字、印章、水印或现代物品。', '1024x1024']
];
const ids = [
  ['result-horizontal.webp', 'dbc2047f-9f40-4bda-9b7d-eff2d71ec7b7'],
  ['result-vertical.webp', '2b570dfa-3c3c-4afd-a380-df69aadb616a'],
  ['result-character.webp', '4bb33a6c-8a97-416a-8a7f-5e1159c04986'],
  ['result-spirit-slide.webp', '38f8274d-3dd9-4b3f-9de9-2ec0a67ba39d']
];

(async () => {
  await fs.mkdir(path.join(root, 'screens'), { recursive: true });
  await fs.mkdir(path.join(root, 'results'), { recursive: true });
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  const localDb = await import('../api/_lib/local-db.js');
  const admin = localDb.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  const session = localDb.createSession(admin.id, 1);
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await context.addCookies([{ name: 'member_session', value: session.token, url: baseUrl }]);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/#create`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: '单图创作' }).click();
    const workspace = page.locator('.freeImageWorkspace');
    await page.getByRole('button', { name: '唤醒 Pic365精灵' }).click();
    const spiritAnswer = page.getByText('登高望远，胸怀天下', { exact: false }).last();
    await spiritAnswer.waitFor({ state: 'visible' });
    await spiritAnswer.screenshot({ path: path.join(root, 'screens/00-spirit-copy.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '缩小聊天精灵' }).click();
    for (const [name, prompt, size] of prompts) {
      await page.locator('#free-image-prompt').fill(prompt);
      await page.locator('.freeImageControlRail label').filter({ hasText: '画布尺寸' }).locator('select').selectOption(size);
      await page.waitForTimeout(250);
      await workspace.screenshot({ path: path.join(root, 'screens', name), animations: 'disabled' });
    }
    for (const [name, id] of ids) {
      const response = await page.request.get(`${baseUrl}/api/generated?id=${id}`);
      if (!response.ok()) throw new Error(`download ${id}: ${response.status()}`);
      await fs.writeFile(path.join(root, 'results', name), await response.body());
    }
    await sharp(path.join(root, 'results/result-horizontal.webp')).resize(1200, 675, { fit: 'cover' }).webp({ quality: 88 }).toFile(path.join(root, 'cover.webp'));
    await sharp({ create: { width: 1500, height: 860, channels: 3, background: '#efe7d6' } })
      .composite([
        { input: await sharp(path.join(root, 'results/result-horizontal.webp')).resize(900, 600, { fit: 'cover' }).toBuffer(), left: 35, top: 130 },
        { input: await sharp(path.join(root, 'results/result-vertical.webp')).resize(360, 540, { fit: 'cover' }).toBuffer(), left: 975, top: 55 },
        { input: await sharp(path.join(root, 'results/result-character.webp')).resize(360, 360, { fit: 'cover' }).toBuffer(), left: 1105, top: 465 }
      ]).webp({ quality: 88 }).toFile(path.join(root, 'results/teaching-set.webp'));
    await fs.writeFile(path.join(root, 'screens/capture-summary.json'), JSON.stringify({ captureType: 'existing-real-local-generations', generationIds: ids.map((x) => x[1]), screenshots: prompts.map((x) => x[0]) }, null, 2));
  } finally {
    await browser.close();
    localDb.deleteSession(session.token);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
