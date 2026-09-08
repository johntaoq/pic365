import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = (file) => path.join(root, file);
const green = '#76f4a7';
const ink = '#07110d';
const line = '#24354b';
const muted = '#9cafc7';

fs.mkdirSync(out('compare'), { recursive: true });

async function fitted(file, width, height, fit = 'cover') {
  return sharp(out(file)).resize({ width, height, fit, background: '#08111f' }).webp({ quality: 90 }).toBuffer();
}

async function convertResults() {
  for (const name of ['01-minimal', '02-office', '03-luxury', '04-festival', '05-social']) {
    await sharp(out(`results/${name}.png`)).webp({ quality: 90 }).toFile(out(`results/${name}.webp`));
  }
}

async function makeCover() {
  const source = await fitted('source/source-01.jpg', 245, 360, 'contain');
  const minimal = await fitted('results/01-minimal.webp', 410, 580);
  const office = await fitted('results/02-office.webp', 245, 280);
  const luxury = await fitted('results/03-luxury.webp', 245, 280);
  const festival = await fitted('results/04-festival.webp', 245, 280);
  const social = await fitted('results/05-social.webp', 245, 280);
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1080">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#10283a"/><stop offset="0.55" stop-color="#080d14"/><stop offset="1" stop-color="#171226"/></linearGradient></defs>
    <rect width="1440" height="1080" fill="url(#g)"/>
    <rect x="54" y="48" width="200" height="46" rx="23" fill="${green}"/>
    <text x="154" y="79" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="18" font-weight="700" fill="${ink}">真实场景课堂</text>
    <text x="58" y="167" font-family="Microsoft YaHei, Arial" font-size="54" font-weight="800" fill="#fff">一张商品图</text>
    <text x="58" y="235" font-family="Microsoft YaHei, Arial" font-size="54" font-weight="800" fill="${green}">测试五种广告创意</text>
    <text x="60" y="286" font-family="Microsoft YaHei, Arial" font-size="22" fill="${muted}">一次上传 · 五条提示词 · 五种视觉方向</text>
    <rect x="54" y="345" width="276" height="450" rx="28" fill="#0d1725" stroke="${line}" stroke-width="2"/>
    <text x="80" y="390" font-family="Microsoft YaHei, Arial" font-size="18" fill="${muted}">普通商品实拍</text>
    <text x="192" y="835" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="#fff">同一个手机支架</text>
    <path d="M350 555 H420" stroke="${green}" stroke-width="5" stroke-linecap="round"/><path d="M407 540 L426 555 L407 570" fill="none" stroke="${green}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="414" y="345" width="970" height="650" rx="34" fill="#0b1421" stroke="#284056" stroke-width="2"/>
    <text x="452" y="397" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="#fff">Pic365 一次生成五种广告方向</text>
    <text x="61" y="915" font-family="Microsoft YaHei, Arial" font-size="23" fill="#fff">3 分钟学会</text>
    <text x="61" y="955" font-family="Microsoft YaHei, Arial" font-size="19" fill="${muted}">先比较方向，再把预算投入更合适的创意</text>
    <rect x="58" y="987" width="310" height="66" rx="33" fill="${green}"/>
    <text x="213" y="1029" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="23" font-weight="800" fill="${ink}">查看完整教程 →</text>
  </svg>`);
  await sharp({ create: { width: 1440, height: 1080, channels: 4, background: '#060b12' } }).composite([
    { input: background, left: 0, top: 0 },
    { input: source, left: 70, top: 420 },
    { input: minimal, left: 442, top: 425 },
    { input: office, left: 870, top: 425 },
    { input: luxury, left: 1125, top: 425 },
    { input: festival, left: 870, top: 715 },
    { input: social, left: 1125, top: 715 }
  ]).webp({ quality: 90 }).toFile(out('cover.webp'));
}

async function makeCompare() {
  const source = await fitted('source/source-01.jpg', 390, 650, 'contain');
  const files = ['01-minimal.webp', '02-office.webp', '03-luxury.webp', '04-festival.webp', '05-social.webp'];
  const thumbs = await Promise.all(files.map((file) => fitted(`results/${file}`, 250, 300)));
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="960">
    <rect width="1600" height="960" fill="#07101c"/>
    <text x="64" y="74" font-family="Microsoft YaHei, Arial" font-size="34" font-weight="800" fill="#fff">同一个商品，五种广告方向直接比较</text>
    <text x="64" y="112" font-family="Microsoft YaHei, Arial" font-size="18" fill="${muted}">只改变场景、光线和视觉语言，商品结构保持一致</text>
    <rect x="55" y="150" width="455" height="720" rx="30" fill="#0d1725" stroke="${line}" stroke-width="2"/>
    <text x="282" y="835" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="#fff">输入：普通实拍</text>
    <path d="M535 500 H615" stroke="${green}" stroke-width="5"/><path d="M600 484 L620 500 L600 516" fill="none" stroke="${green}" stroke-width="5"/>
    <rect x="650" y="150" width="895" height="720" rx="30" fill="#0d1725" stroke="${line}" stroke-width="2"/>
    <text x="1098" y="835" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="${green}">输出：极简 · 办公 · 轻奢 · 节日 · 社媒</text>
  </svg>`);
  await sharp({ create: { width: 1600, height: 960, channels: 4, background: '#07101c' } }).composite([
    { input: bg, left: 0, top: 0 }, { input: source, left: 88, top: 175 },
    { input: thumbs[0], left: 680, top: 185 }, { input: thumbs[1], left: 950, top: 185 }, { input: thumbs[2], left: 1220, top: 185 },
    { input: thumbs[3], left: 815, top: 505 }, { input: thumbs[4], left: 1085, top: 505 }
  ]).webp({ quality: 90 }).toFile(out('compare/before-after.webp'));
}

await convertResults();
await makeCover();
await makeCompare();
console.log('Sample 03 visuals generated from the new real batch run.');
