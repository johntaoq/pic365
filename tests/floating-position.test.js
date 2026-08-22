import assert from 'node:assert/strict';
import test from 'node:test';
import { clampFloatingPosition, clampFloatingSize, normalizeFloatingPosition } from '../shared/floating-position.js';

test('floating positions stay inside the viewport', () => {
  assert.deepEqual(
    clampFloatingPosition({ x: -200, y: 900 }, { width: 410, height: 680 }, { width: 1280, height: 800 }, 12),
    { x: 12, y: 108 }
  );
  assert.deepEqual(
    clampFloatingPosition({ x: 1000, y: 700 }, { width: 78, height: 78 }, { width: 1024, height: 768 }, 12),
    { x: 934, y: 678 }
  );
});

test('floating positions reject invalid stored values and handle narrow viewports', () => {
  assert.equal(normalizeFloatingPosition({ x: 'bad', y: 20 }), null);
  assert.deepEqual(
    clampFloatingPosition({ x: 50, y: 60 }, { width: 360, height: 640 }, { width: 320, height: 600 }, 8),
    { x: 0, y: 0 }
  );
});

test('floating sizes cannot shrink below the usable chat window boundary', () => {
  assert.deepEqual(
    clampFloatingSize(
      { width: 80, height: 120 },
      { width: 320, height: 420 },
      { width: 720, height: 900 }
    ),
    { width: 320, height: 420 }
  );
  assert.deepEqual(
    clampFloatingSize(
      { width: 900, height: 1000 },
      { width: 320, height: 420 },
      { width: 680, height: 760 }
    ),
    { width: 680, height: 760 }
  );
});
