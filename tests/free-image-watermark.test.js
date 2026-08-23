import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { addFreeImageWatermark, getFreeImageWatermarkLayout } from '../api/_lib/free-image-watermark.js';

test('free image watermark occupies eight percent of image width at the top right', () => {
  assert.deepEqual(getFreeImageWatermarkLayout(1000, 600), {
    width: 80,
    height: 16,
    left: 905,
    top: 15
  });
});

test('free image watermark returns a marked PNG without changing dimensions', async () => {
  const source = await sharp({
    create: { width: 1000, height: 600, channels: 3, background: '#102030' }
  }).png().toBuffer();
  const result = await addFreeImageWatermark(`data:image/png;base64,${source.toString('base64')}`);

  assert.equal(result.contentType, 'image/png');
  assert.equal(result.width, 1000);
  assert.equal(result.height, 600);
  assert.equal(result.watermark.text, 'pic365.org');
  assert.equal(result.watermark.width, 80);
  assert.match(result.image, /^data:image\/png;base64,/);

  const output = Buffer.from(result.image.split(',')[1], 'base64');
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 1000);
  assert.equal(metadata.height, 600);

  const watermarkStats = await sharp(output)
    .extract({
      left: result.watermark.left,
      top: result.watermark.top,
      width: result.watermark.width,
      height: result.watermark.height
    })
    .stats();
  assert.ok(watermarkStats.channels.some((channel) => channel.max > channel.min));
});
