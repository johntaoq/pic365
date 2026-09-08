import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
const p = (name) => path.join(root, name);
const green = '#76f4a7';
const muted = '#9cafc7';

async function fit(file, width, height, mode = 'cover') {
  return sharp(p(file)).resize({ width, height, fit: mode, background: '#08111f', position: 'attention' }).webp({ quality: 92 }).toBuffer();
}

const master = await fit('source/model-full.png', 500, 820);
const result = await fit('results/composite.webp', 500, 820);
const compareBg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="980"><rect width="1600" height="980" fill="#07101b"/><text x="70" y="76" font-family="Microsoft YaHei" font-size="38" font-weight="800" fill="#fff">一次上传 1+4，生成一张完整换装图</text><text x="70" y="120" font-family="Microsoft YaHei" font-size="19" fill="${muted}">母版保留人物与场景，四张参考图分别控制包、手表、鞋和发型</text><rect x="100" y="165" width="590" height="720" rx="28" fill="#0d1725" stroke="#263a50" stroke-width="2"/><rect x="910" y="165" width="590" height="720" rx="28" fill="#0d1725" stroke="${green}" stroke-width="3"/><text x="395" y="930" text-anchor="middle" font-family="Microsoft YaHei" font-size="23" font-weight="700" fill="#fff">图1 · 全身人物母版</text><text x="1205" y="930" text-anchor="middle" font-family="Microsoft YaHei" font-size="23" font-weight="700" fill="${green}">一次性换装最终成片</text><path d="M735 525h130" stroke="${green}" stroke-width="7"/><path d="M840 500l30 25-30 25" fill="none" stroke="${green}" stroke-width="7"/></svg>`);
await sharp({ create: { width: 1600, height: 980, channels: 4, background: '#07101b' } }).composite([{ input: compareBg, left: 0, top: 0 }, { input: master, left: 145, top: 190 }, { input: result, left: 955, top: 190 }]).webp({ quality: 92 }).toFile(p('compare/composite-before-after.webp'));

const bag = await fit('source/bag.jpg', 250, 250, 'contain');
const watch = await fit('source/watch.png', 250, 250, 'contain');
const shoes = await fit('source/shoes-red.png', 250, 250, 'contain');
const hair = await fit('source/hair.png', 250, 250, 'cover');
const coverBg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1080"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#10303a"/><stop offset=".55" stop-color="#070c14"/><stop offset="1" stop-color="#271512"/></linearGradient></defs><rect width="1800" height="1080" fill="url(#g)"/><rect x="55" y="46" width="225" height="46" rx="23" fill="${green}"/><text x="168" y="77" text-anchor="middle" font-family="Microsoft YaHei" font-size="19" font-weight="700" fill="#07110d">真实场景课堂 · 06</text><text x="55" y="160" font-family="Microsoft YaHei" font-size="56" font-weight="800" fill="#fff">一张母版，一次完成整套换装</text><text x="57" y="210" font-family="Microsoft YaHei" font-size="23" fill="${muted}">图2换包 · 图3换表 · 图4换鞋 · 图5换发型</text><rect x="55" y="270" width="460" height="720" rx="28" fill="#0d1725" stroke="#263a50" stroke-width="2"/><rect x="1285" y="270" width="460" height="720" rx="28" fill="#0d1725" stroke="${green}" stroke-width="3"/><text x="285" y="1028" text-anchor="middle" font-family="Microsoft YaHei" font-size="22" font-weight="700" fill="#fff">图1 · 全身母版</text><text x="1515" y="1028" text-anchor="middle" font-family="Microsoft YaHei" font-size="22" font-weight="700" fill="${green}">一次生成 · 最终成片</text>${[[575,310,'图2 · 包'],[895,310,'图3 · 表'],[575,650,'图4 · 鞋'],[895,650,'图5 · 发型']].map(([x,y,t])=>`<rect x="${x}" y="${y}" width="250" height="250" rx="24" fill="#0d1725" stroke="#263a50" stroke-width="2"/><text x="${x+125}" y="${y+292}" text-anchor="middle" font-family="Microsoft YaHei" font-size="19" font-weight="700" fill="#dbe7f4">${t}</text>`).join('')}<path d="M540 620h65M1195 620h65" stroke="${green}" stroke-width="6"/><path d="M580 600l24 20-24 20M1235 600l24 20-24 20" fill="none" stroke="${green}" stroke-width="6"/></svg>`);
const coverMaster = await fit('source/model-full.png', 390, 690);
const coverResult = await fit('results/composite.webp', 390, 690);
await sharp({ create: { width: 1800, height: 1080, channels: 4, background: '#07101b' } }).composite([{ input: coverBg, left: 90, top: 285 }, { input: coverMaster, left: 90, top: 285 }, { input: bag, left: 575, top: 310 }, { input: watch, left: 895, top: 310 }, { input: shoes, left: 575, top: 650 }, { input: hair, left: 895, top: 650 }, { input: coverResult, left: 1320, top: 285 }]).webp({ quality: 92 }).toFile(p('cover.webp'));
console.log('Tutorial 06 composite assets generated.');
