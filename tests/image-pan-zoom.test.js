import assert from 'node:assert/strict';
import test from 'node:test';

import { clampImagePanOffset, imagePanBounds } from '../src/image-pan-zoom.js';

test('pan bounds expose every scaled edge without allowing the image to drift away', () => {
  assert.deepEqual(imagePanBounds({
    viewportWidth: 800,
    viewportHeight: 600,
    contentWidth: 700,
    contentHeight: 500,
    zoom: 2
  }), { maxX: 300, maxY: 200 });

  assert.deepEqual(clampImagePanOffset({ x: 900, y: -900 }, {
    viewportWidth: 800,
    viewportHeight: 600,
    contentWidth: 700,
    contentHeight: 500,
    zoom: 2
  }), { x: 300, y: -200 });
});

test('images that fit the viewport remain centered', () => {
  assert.deepEqual(clampImagePanOffset({ x: 120, y: -80 }, {
    viewportWidth: 800,
    viewportHeight: 600,
    contentWidth: 500,
    contentHeight: 400,
    zoom: 1
  }), { x: 0, y: 0 });
});
