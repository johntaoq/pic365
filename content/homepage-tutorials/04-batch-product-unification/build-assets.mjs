import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = (relative) => path.join(root, relative);
const green = '#76f4a7';
const ink = '#07110d';
const panel = '#0d1725';
const line = '#263a50';
const muted = '#9cafc7';

fs.mkdirSync(output('compare'), { recursive: true });

async function fitted(file, width, height, fit = 'contain') {
  return sharp(output(file)).resize({ width, height, fit, background: '#08111f' }).webp({ quality: 90 }).toBuffer();
}

async function convertResults() {
  await Promise.all(['unified', 'outdoor'].flatMap((suffix) => [1, 2, 3, 4].map((number) => {
    const name = `${String(number).padStart(2, '0')}-${suffix}`;
    return sharp(output(`results/${name}.png`)).webp({ quality: 90 }).toFile(output(`results/${name}.webp`));
  })));
}

async function makeCover() {
  const sources = await Promise.all([
    fitted('source/source-01.jpg', 210, 210),
    fitted('source/source-02.jpg', 210, 210),
    fitted('source/source-03.jpg', 210, 210),
    fitted('source/source-04.webp', 210, 210)
  ]);
  const results = await Promise.all([
    'results/01-unified.webp',
    'results/02-unified.webp',
    'results/03-outdoor.webp',
    'results/04-outdoor.webp'
  ].map((file) => fitted(file, 250, 250)));
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1080">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#132a35"/><stop offset=".55" stop-color="#080d15"/><stop offset="1" stop-color="#18231d"/></linearGradient></defs>
    <rect width="1440" height="1080" fill="url(#g)"/>
    <rect x="54" y="48" width="200" height="46" rx="23" fill="${green}"/>
    <text x="154" y="79" text-anchor="middle" font-family="Microsoft YaHei, Arial" font-size="18" font-weight="700" fill="${ink}">真实场景课堂</text>
    <text x="58" y="166" font-family="Microsoft YaHei, Arial" font-size="54" font-weight="800" fill="#fff">四张商品照片</text>
    <text x="58" y="234" font-family="Microsoft YaHei, Arial" font-size="54" font-weight="800" fill="${green}">一次统一风格</text>
    <text x="60" y="285" font-family="Microsoft YaHei, Arial" font-size="22" fill="${muted}">黑金电影舞台 · 休闲户外运动 · 统一提示词</text>
    <text x="64" y="350" font-family="Microsoft YaHei, Arial" font-size="18" font-weight="700" fill="#fff">输入：背景与画幅不一致</text>
    <text x="760" y="350" font-family="Microsoft YaHei, Arial" font-size="18" font-weight="700" fill="#fff">输出：两套可复用场景</text>
    <path d="M665 615 H735" stroke="${green}" stroke-width="5" stroke-linecap="round"/>
    <path d="M720 600 L740 615 L720 630" fill="none" stroke="${green}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="61" y="954" font-family="Microsoft YaHei, Arial" font-size="23" fill="#fff">5 分钟学会</text>
    <text x="61" y="997" font-family="Microsoft YaHei, Arial" font-size="19" fill="${muted}">同一组原图切换风格指令，快速生成展台与人像场景</text>
  </svg>`);
  const composites = [{ input: background, left: 0, top: 0 }];
  sources.forEach((input, index) => composites.push({ input, left: 58 + (index % 2) * 232, top: 385 + Math.floor(index / 2) * 232 }));
  results.forEach((input, index) => composites.push({ input, left: 770 + (index % 2) * 270, top: 385 + Math.floor(index / 2) * 270 }));
  await sharp({ create: { width: 1440, height: 1080, channels: 4, background: '#060b12' } })
    .composite(composites).webp({ quality: 90 }).toFile(output('cover.webp'));
}

async function makeCompare() {
  const sources = await Promise.all([
    fitted('source/source-01.jpg', 330, 330),
    fitted('source/source-02.jpg', 330, 330),
    fitted('source/source-03.jpg', 330, 330),
    fitted('source/source-04.webp', 330, 330)
  ]);
  const results = await Promise.all([1, 2, 3, 4].map((number) => fitted(`results/0${number}-unified.webp`, 330, 330)));
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1040">
    <rect width="1600" height="1040" fill="#07101c"/>
    <text x="60" y="68" font-family="Microsoft YaHei, Arial" font-size="34" font-weight="800" fill="#fff">四张商品图，共用一条电影级风格指令</text>
    <text x="60" y="108" font-family="Microsoft YaHei, Arial" font-size="18" fill="${muted}">统一黑金展台、冷暖轮廓光和体积雾，同时保留每张画幅比例</text>
    <text x="60" y="164" font-family="Microsoft YaHei, Arial" font-size="19" font-weight="700" fill="#fff">处理前</text>
    <text x="60" y="598" font-family="Microsoft YaHei, Arial" font-size="19" font-weight="700" fill="${green}">处理后</text>
    <path d="M770 494 V548" stroke="${green}" stroke-width="5" stroke-linecap="round"/><path d="M754 533 L770 553 L786 533" fill="none" stroke="${green}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
  const composites = [{ input: background, left: 0, top: 0 }];
  sources.forEach((input, index) => composites.push({ input, left: 60 + index * 380, top: 190 }));
  results.forEach((input, index) => composites.push({ input, left: 60 + index * 380, top: 625 }));
  await sharp({ create: { width: 1600, height: 1040, channels: 4, background: panel } })
    .composite(composites).webp({ quality: 90 }).toFile(output('compare/before-after.webp'));
}

async function makeOutdoorCompare() {
  const sources = await Promise.all([
    fitted('source/source-01.jpg', 330, 330),
    fitted('source/source-02.jpg', 330, 330),
    fitted('source/source-03.jpg', 330, 330),
    fitted('source/source-04.webp', 330, 330)
  ]);
  const results = await Promise.all([1, 2, 3, 4].map((number) => fitted(`results/0${number}-outdoor.webp`, 330, 330)));
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1040">
    <rect width="1600" height="1040" fill="#07101c"/>
    <text x="60" y="68" font-family="Microsoft YaHei, Arial" font-size="34" font-weight="800" fill="#fff">四张商品图，共用一条户外运动场景指令</text>
    <text x="60" y="108" font-family="Microsoft YaHei, Arial" font-size="18" fill="${muted}">成年阳光男模自然佩戴，统一清晨河滨绿道与温暖轮廓光</text>
    <text x="60" y="164" font-family="Microsoft YaHei, Arial" font-size="19" font-weight="700" fill="#fff">处理前</text>
    <text x="60" y="598" font-family="Microsoft YaHei, Arial" font-size="19" font-weight="700" fill="${green}">处理后 · Low 质量</text>
    <path d="M770 494 V548" stroke="${green}" stroke-width="5" stroke-linecap="round"/><path d="M754 533 L770 553 L786 533" fill="none" stroke="${green}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
  const composites = [{ input: background, left: 0, top: 0 }];
  sources.forEach((input, index) => composites.push({ input, left: 60 + index * 380, top: 190 }));
  results.forEach((input, index) => composites.push({ input, left: 60 + index * 380, top: 625 }));
  await sharp({ create: { width: 1600, height: 1040, channels: 4, background: panel } })
    .composite(composites).webp({ quality: 90 }).toFile(output('compare/before-outdoor.webp'));
}

await convertResults();
await makeCover();
await makeCompare();
await makeOutdoorCompare();
console.log('Sample 04 cover, two comparisons, and web assets generated from both real batch runs.');
