import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = (relative) => path.join(root, relative);
const green = '#76f4a7';
const ink = '#07110d';
const panel = '#0d1725';
const line = '#24354b';
const muted = '#9cafc7';

fs.mkdirSync(output('compare'), { recursive: true });

async function fitted(file, width, height, fit = 'cover') {
  return sharp(output(file)).resize({ width, height, fit, background: '#08111f' }).webp({ quality: 90 }).toBuffer();
}

async function makeCover() {
  const canvas = sharp({ create: { width: 1440, height: 1080, channels: 4, background: '#060b12' } });
  const hero = await fitted('results/product-hero.webp', 690, 620);
  const life = await fitted('results/lifestyle.webp', 330, 250);
  const detail = await fitted('results/material-detail.webp', 330, 250);
  const source = await fitted('source/source-01.jpg', 250, 250);
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1080">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#10283a"/><stop offset="0.58" stop-color="#090f18"/><stop offset="1" stop-color="#102219"/></linearGradient></defs>
    <rect width="1440" height="1080" fill="url(#g)"/>
    <rect x="54" y="48" width="200" height="46" rx="23" fill="${green}"/>
    <text x="154" y="79" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="18" font-weight="700" fill="${ink}">真实场景课堂</text>
    <text x="58" y="167" font-family="Microsoft YaHei, Arial" font-size="56" font-weight="800" fill="#fff">一张包图</text>
    <text x="58" y="235" font-family="Microsoft YaHei, Arial" font-size="56" font-weight="800" fill="${green}">生成完整商城套图</text>
    <text x="60" y="286" font-family="Microsoft YaHei, Arial" font-size="22" fill="${muted}">商品母版 · Shopify 图单 · 整套生成 · 独立重做</text>
    <rect x="54" y="335" width="272" height="334" rx="28" fill="#0d1725" stroke="${line}" stroke-width="2"/>
    <text x="80" y="382" font-family="Microsoft YaHei, Arial" font-size="18" fill="${muted}">普通商品素材</text>
    <text x="190" y="720" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="#fff">上传 3 张真实照片</text>
    <path d="M345 500 H420" stroke="${green}" stroke-width="5" stroke-linecap="round"/>
    <path d="M407 485 L426 500 L407 515" fill="none" stroke="${green}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="414" y="335" width="970" height="650" rx="34" fill="#0b1421" stroke="#284056" stroke-width="2"/>
    <text x="452" y="389" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="#fff">Pic365 自动生成不同商城用途</text>
    <text x="61" y="825" font-family="Microsoft YaHei, Arial" font-size="23" fill="#fff">4 分钟学会</text>
    <text x="61" y="870" font-family="Microsoft YaHei, Arial" font-size="19" fill="${muted}">主图、场景、细节和社媒图保持同一商品身份</text>
    <rect x="58" y="922" width="310" height="76" rx="38" fill="${green}"/>
    <text x="213" y="970" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="24" font-weight="800" fill="${ink}">查看完整教程 →</text>
  </svg>`);
  await canvas.composite([
    { input: header, left: 0, top: 0 },
    { input: source, left: 65, top: 408 },
    { input: hero, left: 442, top: 420 },
    { input: life, left: 1134, top: 420 },
    { input: detail, left: 1134, top: 682 }
  ]).webp({ quality: 90 }).toFile(output('cover.webp'));
}

async function makeCompare() {
  const source = await fitted('source/source-01.jpg', 430, 610, 'contain');
  const files = ['product-hero.webp', 'lifestyle.webp', 'material-detail.webp', 'social-share.webp'];
  const thumbs = await Promise.all(files.map((file) => fitted(`results/${file}`, 330, 280)));
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="960">
    <rect width="1600" height="960" fill="#07101c"/>
    <text x="64" y="74" font-family="Microsoft YaHei, Arial" font-size="34" font-weight="800" fill="#fff">从普通商品照，到一整套商城素材</text>
    <text x="64" y="112" font-family="Microsoft YaHei, Arial" font-size="18" fill="${muted}">同一商品身份，不同使用场景</text>
    <rect x="58" y="154" width="480" height="710" rx="30" fill="#0d1725" stroke="${line}" stroke-width="2"/>
    <text x="298" y="830" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="#fff">输入：商品母版</text>
    <path d="M566 500 H650" stroke="${green}" stroke-width="5"/><path d="M635 484 L655 500 L635 516" fill="none" stroke="${green}" stroke-width="5"/>
    <rect x="682" y="154" width="860" height="710" rx="30" fill="#0d1725" stroke="${line}" stroke-width="2"/>
    <text x="1112" y="830" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="${green}">输出：主图 · 场景 · 细节 · 社媒</text>
  </svg>`);
  await sharp({ create: { width: 1600, height: 960, channels: 4, background: '#07101c' } }).composite([
    { input: background, left: 0, top: 0 },
    { input: source, left: 83, top: 190 },
    { input: thumbs[0], left: 710, top: 190 },
    { input: thumbs[1], left: 1060, top: 190 },
    { input: thumbs[2], left: 710, top: 490 },
    { input: thumbs[3], left: 1060, top: 490 }
  ]).webp({ quality: 90 }).toFile(output('compare/before-after.webp'));
}

await makeCover();
await makeCompare();
console.log('Sample 01 cover and comparison visuals generated from the real run.');
