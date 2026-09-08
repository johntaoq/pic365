const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

if (process.env.PIC365_ALLOW_TUTORIAL10_SUBMIT !== 'YES') throw new Error('需要 PIC365_ALLOW_TUTORIAL10_SUBMIT=YES');
const baseUrl = process.env.PIC365_LOCAL_URL || 'http://127.0.0.1:5173';
const root = path.resolve(process.cwd(), 'content/homepage-tutorials/10-story-to-picture-book');
const characterFile = path.join(root, 'source/character-card.png');
const resultDir = path.join(root, 'results');
const prompts = [
  '以图1中的原创小红熊猫“栗栗”为唯一角色母版，严格保持红棕色毛发、奶白脸颊、环纹尾巴、芥末黄色连帽雨衣、青绿色小背包、蓝色雨靴和绿色叶片别针一致。绘本第1幕：雨后的清晨，栗栗在森林小屋门口发现一颗微微发光的蓝色种子，惊喜地双手捧起。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。',
  '以图1中的原创小红熊猫“栗栗”为唯一角色母版，严格保持红棕色毛发、奶白脸颊、环纹尾巴、芥末黄色连帽雨衣、青绿色小背包、蓝色雨靴和绿色叶片别针一致。绘本第2幕：栗栗把蓝色种子小心放进青绿色背包，沿着有水洼和蘑菇的森林小路出发，阳光穿过树叶。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。',
  '以图1中的原创小红熊猫“栗栗”为唯一角色母版，严格保持红棕色毛发、奶白脸颊、环纹尾巴、芥末黄色连帽雨衣、青绿色小背包、蓝色雨靴和绿色叶片别针一致。绘本第3幕：小河上的木桥被雨水冲断，栗栗站在岸边思考，远处山坡上能看见白色灯塔和花园。蓝色种子从背包口发出微光。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。',
  '以图1中的原创小红熊猫“栗栗”为唯一角色母版，严格保持红棕色毛发、奶白脸颊、环纹尾巴、芥末黄色连帽雨衣、青绿色小背包、蓝色雨靴和绿色叶片别针一致。绘本第4幕：栗栗用倒下的细树枝和藤蔓搭成安全的小桥，正谨慎走过河面，动作自然，蓝色种子仍在背包里。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。',
  '以图1中的原创小红熊猫“栗栗”为唯一角色母版，严格保持红棕色毛发、奶白脸颊、环纹尾巴、芥末黄色连帽雨衣、青绿色小背包、蓝色雨靴和绿色叶片别针一致。绘本第5幕：傍晚时分，栗栗到达山顶白色灯塔旁的荒芜小花园，跪下来把发光的蓝色种子种进土里，天空有温暖晚霞。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。',
  '以图1中的原创小红熊猫“栗栗”为唯一角色母版，严格保持红棕色毛发、奶白脸颊、环纹尾巴、芥末黄色连帽雨衣、青绿色小背包、蓝色雨靴和绿色叶片别针一致。绘本第6幕：夜幕下，蓝色种子长成一株发光的蓝色花朵，照亮灯塔花园，栗栗开心地坐在花旁，森林动物从远处好奇观看。柔和水粉儿童绘本，横版3:2，无文字、Logo、水印。'
];

let browser, localDb, session;
(async () => {
  process.env.APP_DB_PATH = path.resolve(process.cwd(), 'data/app.sqlite');
  localDb = await import('../api/_lib/local-db.js');
  const admin = localDb.getDb().prepare("SELECT id FROM users WHERE role='super_admin' AND status='active' ORDER BY created_at LIMIT 1").get();
  session = localDb.createSession(admin.id, 1);
  browser = await chromium.launch({ headless:true, executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const context = await browser.newContext({ viewport:{width:1440,height:1000}, colorScheme:'dark' });
  await context.addCookies([{ name:'member_session', value:session.token, url:baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const ids = [];
  for (let i = 0; i < prompts.length; i += 1) {
    let row = localDb.getDb().prepare('SELECT id,status,storage_path FROM generations WHERE user_id=? AND prompt=? ORDER BY created_at DESC LIMIT 1').get(admin.id, prompts[i]);
    if (!row || row.status === 'cancelled' || row.status === 'failed') {
      await page.goto(`${baseUrl}/#create`, { waitUntil:'domcontentloaded' });
      await page.getByRole('tab', { name:'单图创作' }).click();
      await page.locator('.freeImageReferenceInput').first().setInputFiles(characterFile);
      await page.waitForTimeout(600);
      await page.locator('#free-image-prompt').fill(prompts[i]);
      const select = page.locator('.freeImageControlRail label').filter({ hasText:'画布尺寸' }).locator('select');
      await select.selectOption('1536x1024');
      await page.locator('.freeImageGenerateButton').first().click();
      await page.waitForTimeout(800);
      row = localDb.getDb().prepare('SELECT id,status,storage_path FROM generations WHERE user_id=? AND prompt=? ORDER BY created_at DESC LIMIT 1').get(admin.id, prompts[i]);
    }
    const deadline = Date.now() + 480000;
    while (row && ['pending','processing'].includes(row.status) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      row = localDb.getDb().prepare('SELECT id,status,storage_path FROM generations WHERE id=?').get(row.id);
    }
    if (!row || row.status !== 'succeeded') throw new Error(`scene ${i+1} failed: ${row?.status || 'missing'}`);
    const src = `/api/generated?id=${encodeURIComponent(row.id)}`;
    const response = await page.request.get(new URL(src, baseUrl).href);
    if (!response.ok()) throw new Error(`scene ${i+1} download failed: ${response.status()}`);
    await fs.writeFile(path.join(resultDir, `scene-${String(i+1).padStart(2,'0')}.png`), await response.body());
    ids.push(row.id);
    console.log(`scene ${i+1}/6 ${ids.at(-1)}`);
  }
  await fs.writeFile(path.join(root,'screens/scene-generation-summary.json'), JSON.stringify({prompts,generationIds:ids},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser) await browser.close().catch(()=>undefined);
  if(session?.token&&localDb) localDb.deleteSession(session.token);
});
