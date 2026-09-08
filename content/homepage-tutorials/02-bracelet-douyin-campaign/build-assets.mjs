import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = (relative) => path.join(root, relative);
const green = '#76f4a7';
const ink = '#07110d';
const line = '#24354b';
const muted = '#9cafc7';

fs.mkdirSync(output('compare'), { recursive: true });

async function fitted(file, width, height, fit = 'cover') {
  return sharp(output(file)).resize({ width, height, fit, background: '#08111f' }).webp({ quality: 90 }).toBuffer();
}

async function convertResults() {
  const names = ['cover-square', 'material-portrait', 'person-scene', 'detail-closeup', 'promotion-label', 'three-second-benefit', 'video-cover'];
  await Promise.all(names.map((name) => sharp(output(`results/${name}.png`)).webp({ quality: 90 }).toFile(output(`results/${name}.webp`))));
}

async function convertSources() {
  const names = ['source-01', 'source-02', 'source-03', 'source-04'];
  await Promise.all(names.map((name) => sharp(output(`source/${name}.jpg`)).webp({ quality: 82, effort: 6 }).toFile(output(`source/${name}.webp`))));
}

async function makeCover() {
  const source = await fitted('source/source-01.jpg', 245, 310, 'contain');
  const hero = await fitted('results/cover-square.webp', 570, 570);
  const person = await fitted('results/person-scene.webp', 300, 410);
  const detail = await fitted('results/detail-closeup.webp', 300, 300);
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1080">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#172717"/><stop offset="0.55" stop-color="#080d12"/><stop offset="1" stop-color="#2b170c"/></linearGradient></defs>
    <rect width="1440" height="1080" fill="url(#g)"/>
    <rect x="54" y="48" width="200" height="46" rx="23" fill="${green}"/>
    <text x="154" y="79" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="18" font-weight="700" fill="${ink}">真实场景课堂</text>
    <text x="58" y="167" font-family="Microsoft YaHei, Arial" font-size="54" font-weight="800" fill="#fff">一串手链</text>
    <text x="58" y="235" font-family="Microsoft YaHei, Arial" font-size="54" font-weight="800" fill="${green}">变成抖音广告素材</text>
    <text x="60" y="286" font-family="Microsoft YaHei, Arial" font-size="22" fill="${muted}">商品封面 · 佩戴场景 · 细节特写 · 竖屏封面</text>
    <rect x="54" y="345" width="276" height="410" rx="28" fill="#0d1725" stroke="${line}" stroke-width="2"/>
    <text x="80" y="390" font-family="Microsoft YaHei, Arial" font-size="18" fill="${muted}">普通商品实拍</text>
    <text x="192" y="800" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="#fff">4 张真实素材</text>
    <path d="M350 540 H420" stroke="${green}" stroke-width="5" stroke-linecap="round"/>
    <path d="M407 525 L426 540 L407 555" fill="none" stroke="${green}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="414" y="345" width="970" height="650" rx="34" fill="#0b1421" stroke="#284056" stroke-width="2"/>
    <text x="452" y="397" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="#fff">Pic365 按抖音用途生成不同画面</text>
    <text x="61" y="885" font-family="Microsoft YaHei, Arial" font-size="23" fill="#fff">4 分钟看懂</text>
    <text x="61" y="930" font-family="Microsoft YaHei, Arial" font-size="19" fill="${muted}">一套素材如何覆盖商品卡、佩戴图和短视频封面</text>
    <rect x="58" y="972" width="310" height="70" rx="35" fill="${green}"/>
    <text x="213" y="1017" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="23" font-weight="800" fill="${ink}">查看完整教程 →</text>
  </svg>`);
  await sharp({ create: { width: 1440, height: 1080, channels: 4, background: '#060b12' } }).composite([
    { input: background, left: 0, top: 0 },
    { input: source, left: 70, top: 420 },
    { input: hero, left: 442, top: 425 },
    { input: person, left: 1030, top: 425 },
    { input: detail, left: 1030, top: 695 }
  ]).webp({ quality: 90 }).toFile(output('cover.webp'));
}

async function makeCompare() {
  const source = await fitted('source/source-01.jpg', 420, 630, 'contain');
  const files = ['cover-square.webp', 'person-scene.webp', 'detail-closeup.webp', 'video-cover.webp'];
  const thumbs = await Promise.all(files.map((file) => fitted(`results/${file}`, 330, 280)));
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="960">
    <rect width="1600" height="960" fill="#07101c"/>
    <text x="64" y="74" font-family="Microsoft YaHei, Arial" font-size="34" font-weight="800" fill="#fff">从普通实拍，到抖音商品内容组合</text>
    <text x="64" y="112" font-family="Microsoft YaHei, Arial" font-size="18" fill="${muted}">商品身份不变，构图分别服务于封面、佩戴、细节和视频入口</text>
    <rect x="58" y="154" width="480" height="710" rx="30" fill="#0d1725" stroke="${line}" stroke-width="2"/>
    <text x="298" y="830" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="#fff">输入：商品母版</text>
    <path d="M566 500 H650" stroke="${green}" stroke-width="5"/><path d="M635 484 L655 500 L635 516" fill="none" stroke="${green}" stroke-width="5"/>
    <rect x="682" y="154" width="860" height="710" rx="30" fill="#0d1725" stroke="${line}" stroke-width="2"/>
    <text x="1112" y="830" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="${green}">输出：封面 · 佩戴 · 细节 · 竖屏</text>
  </svg>`);
  await sharp({ create: { width: 1600, height: 960, channels: 4, background: '#07101c' } }).composite([
    { input: background, left: 0, top: 0 },
    { input: source, left: 88, top: 180 },
    { input: thumbs[0], left: 710, top: 190 },
    { input: thumbs[1], left: 1060, top: 190 },
    { input: thumbs[2], left: 710, top: 490 },
    { input: thumbs[3], left: 1060, top: 490 }
  ]).webp({ quality: 90 }).toFile(output('compare/before-after.webp'));
}

await convertSources();
await convertResults();
await makeCover();
await makeCompare();
console.log('Sample 02 visuals generated from the real Pic365 project.');
