import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LAYOUT_REFERENCE_EDGE, LAYOUT_REFERENCE_JPEG_QUALITY,
  layoutReferenceDimensions, loadEcommerceLayoutReference
} from '../src/ecommerce-layout-guide.js';

test('template upload resolution is capped independently of output size and never upscaled', () => {
  assert.equal(MAX_LAYOUT_REFERENCE_EDGE, 512);
  assert.equal(LAYOUT_REFERENCE_JPEG_QUALITY, .72);
  assert.deepEqual(layoutReferenceDimensions(1024, 1024), { width: 512, height: 512 });
  assert.deepEqual(layoutReferenceDimensions(3840, 2160), { width: 512, height: 288 });
  assert.deepEqual(layoutReferenceDimensions(1024, 3072), { width: 171, height: 512 });
  assert.deepEqual(layoutReferenceDimensions(256, 128), { width: 256, height: 128 });
  for (const value of [0, -1, NaN, Infinity]) {
    assert.throws(() => layoutReferenceDimensions(value, 1024), /INVALID_LAYOUT_REFERENCE_SIZE/);
  }
});

test('template loading returns a cached compressed JPEG, not the high resolution gallery asset', async () => {
  const originalImage = globalThis.Image;
  const originalDocument = globalThis.document;
  const drawn = [];
  const canvases = [];
  let createdImages = 0;
  globalThis.Image = class {
    constructor() { createdImages += 1; this.naturalWidth = 1024; this.naturalHeight = 1024; }
    set src(value) { this.url = value; queueMicrotask(() => this.onload()); }
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = {
        getContext() {
          return {
            fillRect() {},
            drawImage(image, x, y, width, height) { drawn.push({ url: image.url, x, y, width, height }); }
          };
        },
        toDataURL(mime, quality) {
          assert.equal(mime, 'image/jpeg');
          assert.equal(quality, .72);
          return 'data:image/jpeg;base64,compressed';
        }
      };
      canvases.push(canvas);
      return canvas;
    }
  };
  try {
    const url = '/generated/test-template.webp';
    const [first, second] = await Promise.all([
      loadEcommerceLayoutReference(url), loadEcommerceLayoutReference(url)
    ]);
    assert.equal(first, 'data:image/jpeg;base64,compressed');
    assert.equal(second, first);
    assert.equal(createdImages, 1);
    assert.equal(canvases[0].width, 512);
    assert.equal(canvases[0].height, 512);
    assert.deepEqual(drawn, [{ url, x: 0, y: 0, width: 512, height: 512 }]);
    await assert.rejects(loadEcommerceLayoutReference(''), /LAYOUT_REFERENCE_UNAVAILABLE/);
  } finally {
    globalThis.Image = originalImage;
    globalThis.document = originalDocument;
  }
});

test('a missing template fails closed and can be retried instead of silently losing a reference', async () => {
  const originalImage = globalThis.Image;
  let attempts = 0;
  globalThis.Image = class {
    set src(value) { attempts += 1; queueMicrotask(() => this.onerror()); }
  };
  try {
    await assert.rejects(loadEcommerceLayoutReference('/missing.webp'), /LAYOUT_REFERENCE_UNAVAILABLE/);
    await assert.rejects(loadEcommerceLayoutReference('/missing.webp'), /LAYOUT_REFERENCE_UNAVAILABLE/);
    assert.equal(attempts, 2);
  } finally {
    globalThis.Image = originalImage;
  }
});
