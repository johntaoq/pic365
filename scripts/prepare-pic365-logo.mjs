import path from 'node:path';
import sharp from 'sharp';

const inputPath = path.resolve(process.argv[2] || 'pic365-logo-source.png');
const outputPath = path.resolve(process.argv[3] || 'data/images/pic365-logo.png');
const source = sharp(inputPath).ensureAlpha();
const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });

let left = info.width;
let top = info.height;
let right = -1;
let bottom = -1;

for (let index = 0; index < data.length; index += 4) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const sourceAlpha = data[index + 3];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const chroma = maximum - minimum;
  const brightness = (red + green + blue) / 3;

  let alpha = sourceAlpha;
  if (minimum >= 228 && chroma <= 12) {
    alpha = 0;
  } else if (minimum >= 218 && chroma <= 22) {
    const colorAlpha = Math.max(0, Math.min(1, (chroma - 12) / 10));
    const shadeAlpha = Math.max(0, Math.min(1, (228 - brightness) / 10));
    alpha = Math.round(sourceAlpha * Math.max(colorAlpha, shadeAlpha));
  }
  data[index + 3] = alpha;

  if (alpha > 10) {
    const pixel = index / 4;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
}

if (right < left || bottom < top) throw new Error('Logo foreground could not be detected.');
const padding = 12;
left = Math.max(0, left - padding);
top = Math.max(0, top - padding);
right = Math.min(info.width - 1, right + padding);
bottom = Math.min(info.height - 1, bottom + padding);

await sharp(data, { raw: info })
  .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(outputPath);

const metadata = await sharp(outputPath).metadata();
console.log(JSON.stringify({ outputPath, width: metadata.width, height: metadata.height }));
