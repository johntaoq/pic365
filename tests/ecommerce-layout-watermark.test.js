import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {
  LAYOUT_WATERMARK_PROTOCOL_VERSION,
  MAX_LAYOUT_WATERMARK_COLUMNS,
  MAX_LAYOUT_WATERMARK_TEXT_CHARACTERS,
  normalizeEcommerceLayoutWatermark
} from '../shared/ecommerce-layout-watermark.js';
import {
  applyEcommerceLayoutWatermark,
  applyEcommerceLayoutWatermarkBytes,
  prepareEcommerceLayoutWatermark
} from '../api/_lib/ecommerce-layout-watermark.js';

function dataUrl(bytes, mimeType = 'image/png') {
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

async function fixtures() {
  const logo = await sharp({ create: {
    width: 200, height: 50, channels: 4, background: { r: 240, g: 20, b: 20, alpha: 1 }
  } }).png().toBuffer();
  const text = await sharp({ create: {
    width: 300, height: 70, channels: 4, background: { r: 20, g: 20, b: 20, alpha: .5 }
  } }).png().toBuffer();
  const source = await sharp({ create: {
    width: 400, height: 400, channels: 3, background: '#ffffff'
  } }).png().toBuffer();
  return { logo, text, source };
}

function redBounds(bytes) {
  return sharp(bytes).raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => {
    let left = info.width, right = -1, top = info.height, bottom = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * info.channels;
        if (data[offset] - data[offset + 1] < 25) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    return { width: right - left + 1, height: bottom - top + 1 };
  });
}

async function redSlope(bytes) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let pixels = 0, sumX = 0, sumY = 0, sumXY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] - data[offset + 1] < 25) continue;
      pixels++;
      sumX += x;
      sumY += y;
      sumXY += x * y;
    }
  }
  return sumXY / pixels - sumX * sumY / (pixels * pixels);
}

async function colorCenters(bytes) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const centers = { red: { pixels: 0, x: 0, y: 0 }, blue: { pixels: 0, x: 0, y: 0 } };
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      const center = data[offset] > data[offset + 2] + 25 ? centers.red
        : data[offset + 2] > data[offset] + 25 ? centers.blue : null;
      if (!center) continue;
      center.pixels++;
      center.x += x;
      center.y += y;
    }
  }
  for (const center of Object.values(centers)) {
    assert.ok(center.pixels > 0);
    center.x /= center.pixels;
    center.y /= center.pixels;
  }
  return centers;
}

async function redCells(bytes, columns, rows) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const cells = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ pixels: 0, sumX: 0, sumY: 0, minX: info.width, minY: info.height, maxX: 0, maxY: 0 })));
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset] - data[offset + 1] < 25) continue;
      const cell = cells[Math.min(rows - 1, Math.floor(y * rows / info.height))]
        [Math.min(columns - 1, Math.floor(x * columns / info.width))];
      cell.pixels++;
      cell.sumX += x;
      cell.sumY += y;
      cell.minX = Math.min(cell.minX, x);
      cell.minY = Math.min(cell.minY, y);
      cell.maxX = Math.max(cell.maxX, x);
      cell.maxY = Math.max(cell.maxY, y);
    }
  }
  return cells;
}

test('layout watermark validates orientation, required image, and fewer than 20 Unicode characters', async () => {
  const { logo, text } = await fixtures();
  const imageDataUrl = dataUrl(logo);
  const textImageDataUrl = dataUrl(text);
  const valid = { angle: -45, columns: 4, text: '图'.repeat(MAX_LAYOUT_WATERMARK_TEXT_CHARACTERS),
    textImageDataUrl, imageDataUrl };
  assert.equal(LAYOUT_WATERMARK_PROTOCOL_VERSION, 3);
  assert.equal(MAX_LAYOUT_WATERMARK_COLUMNS, 8);
  assert.deepEqual(normalizeEcommerceLayoutWatermark(valid, { isLayout: true }), valid);
  for (const angle of [45, 135]) {
    const legacy = { angle, imageDataUrl };
    assert.deepEqual(normalizeEcommerceLayoutWatermark(legacy, { isLayout: true }), legacy);
    assert.equal((await prepareEcommerceLayoutWatermark(legacy)).columns, 1);
  }
  assert.equal(normalizeEcommerceLayoutWatermark(undefined), null);
  for (const watermark of [
    { ...valid, text: '图'.repeat(20) },
    ...[0, 9, 1.5, '4', null].map((columns) => ({ ...valid, columns })),
    { angle: 0, text: '', textImageDataUrl },
    { angle: 0, text: '图' },
    { angle: 0, imageDataUrl: '' },
    { angle: 90, imageDataUrl },
    { angle: 0 },
    { angle: 0, imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }
  ]) {
    assert.throws(() => normalizeEcommerceLayoutWatermark(watermark, { isLayout: true }),
      (error) => error.code === 'LAYOUT_WATERMARK_INVALID');
  }
  assert.throws(() => normalizeEcommerceLayoutWatermark(valid),
    (error) => error.code === 'LAYOUT_WATERMARK_INVALID');
  await assert.rejects(prepareEcommerceLayoutWatermark({
    angle: 0, imageDataUrl: dataUrl(Buffer.from('not an image'))
  }), (error) => error.code === 'LAYOUT_WATERMARK_INVALID');
});

test('opaque browser WebP and JPEG watermarks are valid, but fully transparent images are not', async () => {
  const { logo, text } = await fixtures();
  for (const [format, mimeType] of [['webp', 'image/webp'], ['jpeg', 'image/jpeg']]) {
    const image = await sharp(logo).flatten({ background: '#f01414' }).toFormat(format).toBuffer();
    const prepared = await prepareEcommerceLayoutWatermark({
      angle: 0, text: '我的店铺', textImageDataUrl: dataUrl(text), imageDataUrl: dataUrl(image, mimeType)
    });
    assert.deepEqual(prepared.image, image);
    assert.deepEqual(prepared.text, text);
  }
  const transparent = await sharp({ create: {
    width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 }
  } }).png().toBuffer();
  await assert.rejects(prepareEcommerceLayoutWatermark({
    angle: 0, imageDataUrl: dataUrl(transparent)
  }), (error) => error.code === 'LAYOUT_WATERMARK_INVALID');
});

test('postprocessing applies horizontal and diagonal image watermarks without resizing the output', async () => {
  const { logo, source } = await fixtures();
  const imageDataUrl = dataUrl(logo);
  const horizontal = await applyEcommerceLayoutWatermark(dataUrl(source),
    await prepareEcommerceLayoutWatermark({ angle: 0, columns: 1, imageDataUrl }));
  const diagonal = await applyEcommerceLayoutWatermark(dataUrl(source),
    await prepareEcommerceLayoutWatermark({ angle: -45, columns: 1, imageDataUrl }));
  const horizontalBytes = Buffer.from(horizontal.split(',')[1], 'base64');
  const diagonalBytes = Buffer.from(diagonal.split(',')[1], 'base64');
  for (const bytes of [horizontalBytes, diagonalBytes]) {
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, 400);
    assert.equal(metadata.height, 400);
    assert.equal(metadata.format, 'png');
    assert.notDeepEqual(bytes, source);
  }
  const flat = await redBounds(horizontalBytes);
  const tilted = await redBounds(diagonalBytes);
  assert.ok(flat.width > flat.height * 2, JSON.stringify(flat));
  assert.ok(tilted.height > flat.height * 2, JSON.stringify(tilted));
  assert.ok(tilted.width / tilted.height < 1.5, JSON.stringify(tilted));
});

test('text and image watermarks render 20 percent larger without changing output dimensions', async () => {
  const { logo, source } = await fixtures();
  for (const [name, mark, originalWidth, originalHeight] of [
    ['image', { imageDataUrl: dataUrl(logo) }, 144, 36],
    ['text', { text: '店铺', textImageDataUrl: dataUrl(logo) }, 120, 30]
  ]) {
    const output = await applyEcommerceLayoutWatermark(dataUrl(source),
      await prepareEcommerceLayoutWatermark({ angle: 0, columns: 1, ...mark }));
    const bytes = Buffer.from(output.split(',')[1], 'base64');
    const bounds = await redBounds(bytes);
    assert.equal((await sharp(bytes).metadata()).width, 400);
    assert.equal((await sharp(bytes).metadata()).height, 400);
    assert.ok(Math.abs(bounds.width - originalWidth * 1.2) <= 2, `${name}: ${JSON.stringify(bounds)}`);
    assert.ok(Math.abs(bounds.height - originalHeight * 1.2) <= 2, `${name}: ${JSON.stringify(bounds)}`);
  }
});

test('diagonal watermarks rise from lower-left to upper-right, unlike legacy 45-degree ones', async () => {
  const { logo, source } = await fixtures();
  const imageDataUrl = dataUrl(logo);
  const slopes = [];
  for (const angle of [45, -45]) {
    const result = await applyEcommerceLayoutWatermark(dataUrl(source),
      await prepareEcommerceLayoutWatermark({ angle, imageDataUrl }));
    slopes.push(await redSlope(Buffer.from(result.split(',')[1], 'base64')));
  }
  assert.ok(slopes[0] > 10 && slopes[1] < -10, JSON.stringify(slopes));
});

test('diagonal text and image keep their left-to-right reading order on the rising line', async () => {
  const { source } = await fixtures();
  const rightHalf = await sharp({ create: {
    width: 100, height: 40, channels: 4, background: '#0011ff'
  } }).png().toBuffer();
  const striped = await sharp({ create: {
    width: 200, height: 40, channels: 4, background: '#ff1100'
  } }).composite([{ input: rightHalf, left: 100, top: 0 }]).png().toBuffer();
  const imageDataUrl = dataUrl(striped);
  for (const marks of [
    { imageDataUrl },
    { text: '左右', textImageDataUrl: imageDataUrl },
    { text: '左右', textImageDataUrl: imageDataUrl, imageDataUrl }
  ]) {
    const output = await applyEcommerceLayoutWatermark(dataUrl(source),
      await prepareEcommerceLayoutWatermark({ angle: -45, columns: 1, ...marks }));
    const { red, blue } = await colorCenters(Buffer.from(output.split(',')[1], 'base64'));
    assert.ok(red.x < blue.x && red.y > blue.y, JSON.stringify({ marks: Object.keys(marks), red, blue }));
  }
  const legacy = await applyEcommerceLayoutWatermark(dataUrl(source),
    await prepareEcommerceLayoutWatermark({ angle: 135, imageDataUrl }));
  const { red, blue } = await colorCenters(Buffer.from(legacy.split(',')[1], 'base64'));
  assert.ok(red.x > blue.x && red.y < blue.y, JSON.stringify({ red, blue }));
});

test('watermarks are centered and evenly separated in automatic portrait, square, and landscape grids', async () => {
  const { logo } = await fixtures();
  const imageDataUrl = dataUrl(logo);
  for (const [width, height, columns, rows] of [
    [401, 401, 1, 1], [480, 480, 2, 2], [511, 767, 4, 6],
    [960, 480, 4, 2], [480, 960, 2, 4], [480, 480, 8, 8]
  ]) {
    const source = await sharp({ create: {
      width, height, channels: 3, background: '#ffffff'
    } }).png().toBuffer();
    const result = await applyEcommerceLayoutWatermark(dataUrl(source),
      await prepareEcommerceLayoutWatermark({ angle: -45, columns, imageDataUrl }));
    const bytes = Buffer.from(result.split(',')[1], 'base64');
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    const cells = await redCells(bytes, columns, rows);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const cell = cells[row][column];
        const cellWidth = width / columns;
        const cellHeight = height / rows;
        assert.ok(cell.pixels > 0, `empty cell ${width}x${height} (${column}, ${row})`);
        assert.ok(Math.abs(cell.sumX / cell.pixels - (column + .5) * cellWidth) < cellWidth * .08);
        assert.ok(Math.abs(cell.sumY / cell.pixels - (row + .5) * cellHeight) < cellHeight * .08);
        assert.ok(cell.minX > column * cellWidth + cellWidth * .08);
        assert.ok(cell.maxX < (column + 1) * cellWidth - cellWidth * .08);
        assert.ok(cell.minY > row * cellHeight + cellHeight * .08);
        assert.ok(cell.maxY < (row + 1) * cellHeight - cellHeight * .08);
      }
    }
  }
});

test('text and image can be combined; generated JPEG/WebP formats and remote outputs remain usable', async () => {
  const { logo, text, source } = await fixtures();
  const watermark = await prepareEcommerceLayoutWatermark({
    angle: -45, columns: 3, text: 'Pic365 图片', textImageDataUrl: dataUrl(text), imageDataUrl: dataUrl(logo)
  });
  for (const [format, mimeType] of [['jpeg', 'image/jpeg'], ['webp', 'image/webp']]) {
    const input = await sharp(source).toFormat(format).toBuffer();
    const output = await applyEcommerceLayoutWatermark(dataUrl(input, mimeType), watermark);
    assert.ok(output.startsWith(`data:${mimeType};base64,`));
    const metadata = await sharp(Buffer.from(output.split(',')[1], 'base64')).metadata();
    assert.equal(metadata.width, 400);
    assert.equal(metadata.height, 400);
    assert.equal(metadata.format, format);
    const outputBytes = await applyEcommerceLayoutWatermarkBytes(input, watermark);
    assert.equal((await sharp(outputBytes).metadata()).format, format);
    assert.notDeepEqual(outputBytes, input);
  }
  const remote = await applyEcommerceLayoutWatermark('https://provider.example/output.png', watermark, {
    fetchImpl: async (url) => {
      assert.equal(String(url), 'https://provider.example/output.png');
      return new Response(source, { headers: { 'Content-Type': 'image/png' } });
    }
  });
  assert.ok(remote.startsWith('data:image/png;base64,'));
});
