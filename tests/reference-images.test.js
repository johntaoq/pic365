import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import {
  buildReferencePrompt,
  loadReferenceImageInputs,
  normalizeReferenceAnnotations,
  normalizeReferenceRequests,
  validateReferenceRequestsForModel
} from '../api/_lib/reference-images.js';

test('reference requests are unique, capped, and annotations are normalized', () => {
  const references = normalizeReferenceRequests([
    {
      generationId: 'g-1',
      annotations: [{ type: 'ellipse', x1: -2, y1: 0.2, x2: 2, y2: 0.8, color: '#FF0000', strokeWidth: 1 }]
    },
    { generationId: 'g-1' },
    { generationId: 'g-2', annotations: [{ type: 'unknown' }] }
  ]);
  assert.equal(references.length, 2);
  assert.deepEqual(references[0].annotations[0], {
    type: 'ellipse',
    x1: 0,
    y1: 0.2,
    x2: 1,
    y2: 0.8,
    color: '#ff0000',
    strokeWidth: 0.04
  });
  assert.equal(references[1].annotations[0].type, 'rectangle');
});

test('more than nine reference images are rejected', () => {
  assert.throws(
    () => normalizeReferenceRequests(Array.from({ length: 10 }, (_, index) => ({ generationId: `g-${index}` }))),
    /TOO_MANY_REFERENCE_IMAGES/
  );
});

test('inline reference images are accepted, normalized, and deduplicated', () => {
  const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const references = normalizeReferenceRequests([
    { imageDataUrl, annotations: [{ type: 'line' }] },
    { imageDataUrl }
  ]);
  assert.equal(references.length, 1);
  assert.equal(references[0].generationId, '');
  assert.match(references[0].imageDataUrl, /^data:image\/png;base64,/);
  assert.equal(references[0].annotations[0].type, 'line');
});

test('invalid inline reference images are rejected', () => {
  assert.throws(
    () => normalizeReferenceRequests([{ imageDataUrl: 'data:text/plain;base64,SGVsbG8=' }]),
    /INVALID_REFERENCE_IMAGE/
  );
});

test('inline reference images load without requiring a generation record', async () => {
  const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const references = normalizeReferenceRequests([{ imageDataUrl }]);
  const images = await loadReferenceImageInputs('unused-user', references);
  assert.equal(images.length, 1);
  assert.match(images[0], /^data:image\/png;base64,/);
});

test('MAI-Image-2 rejects references and MAI-Image-2.5 allows only one', () => {
  assert.throws(
    () => validateReferenceRequestsForModel([{ generationId: 'g-1' }], 'MAI-Image-2'),
    /REFERENCE_IMAGES_UNSUPPORTED/
  );
  assert.doesNotThrow(
    () => validateReferenceRequestsForModel([{ generationId: 'g-1' }], 'MAI-Image-2.5')
  );
  assert.throws(
    () => validateReferenceRequestsForModel([{ generationId: 'g-1' }, { generationId: 'g-2' }], 'MAI-Image-2.5'),
    /TOO_MANY_REFERENCE_IMAGES/
  );
});

test('MAI-Image-2.5 accepts PNG but rejects WebP reference inputs', async () => {
  const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const pngReferences = normalizeReferenceRequests([{ imageDataUrl: pngDataUrl }]);
  const pngImages = await loadReferenceImageInputs('unused-user', pngReferences, { model: 'MAI-Image-2.5' });
  assert.equal(pngImages.length, 1);
  assert.match(pngImages[0], /^data:image\/png;base64,/);

  const webpBytes = await sharp({
    create: { width: 1, height: 1, channels: 4, background: '#ffffff' }
  }).webp().toBuffer();
  const webpReferences = normalizeReferenceRequests([{
    imageDataUrl: `data:image/webp;base64,${webpBytes.toString('base64')}`
  }]);
  await assert.rejects(
    () => loadReferenceImageInputs('unused-user', webpReferences, { model: 'MAI-Image-2.5' }),
    /INVALID_REFERENCE_IMAGE_FORMAT/
  );
});

test('Gemini image editing accepts JPEG, PNG, and WebP references up to the Pic365 limit', async () => {
  assert.doesNotThrow(() => validateReferenceRequestsForModel(
    Array.from({ length: 9 }, (_, index) => ({ generationId: `g-${index}` })),
    'gemini-3.1-flash-image'
  ));
  assert.throws(() => validateReferenceRequestsForModel(
    Array.from({ length: 10 }, (_, index) => ({ generationId: `g-${index}` })),
    'gemini-3.1-flash-image'
  ), /TOO_MANY_REFERENCE_IMAGES/);

  const webpBytes = await sharp({
    create: { width: 2, height: 2, channels: 4, background: '#22d3ee' }
  }).webp().toBuffer();
  const references = normalizeReferenceRequests([{
    imageDataUrl: `data:image/webp;base64,${webpBytes.toString('base64')}`
  }]);
  const images = await loadReferenceImageInputs('unused-user', references, { model: 'gemini-3.1-flash-image' });
  assert.equal(images.length, 1);
  assert.match(images[0], /^data:image\/webp;base64,/);
});

test('reference prompt explains annotations without asking the model to reproduce them', () => {
  const references = [{ generationId: 'g-1', annotations: normalizeReferenceAnnotations([{ type: 'line' }]) }];
  const prompt = buildReferencePrompt('Replace the cup with a glass.', references);
  assert.match(prompt, /editing guides/);
  assert.match(prompt, /never reproduce the colored marks/);
  assert.match(prompt, /Replace the cup/);
});

test('brush annotations preserve an irregular path and lock unpainted regions', () => {
  const [brush] = normalizeReferenceAnnotations([{
    type: 'brush',
    color: '#22D3EE',
    strokeWidth: 0.08,
    points: [
      { x: -1, y: 0.2 },
      { x: 0.45, y: 0.55 },
      { x: 2, y: 0.8 }
    ]
  }]);
  assert.equal(brush.type, 'brush');
  assert.deepEqual(brush.points, [
    { x: 0, y: 0.2 },
    { x: 0.45, y: 0.55 },
    { x: 1, y: 0.8 }
  ]);
  assert.equal(brush.strokeWidth, 0.08);

  const prompt = buildReferencePrompt('Replace the painted object with a flower.', [{
    generationId: 'g-1',
    annotations: [brush]
  }]);
  assert.match(prompt, /localized image-editing task/);
  assert.match(prompt, /Modify only the content inside those marked regions/);
  assert.match(prompt, /Lock every unmarked region/);
  assert.match(prompt, /Do not redraw, restyle, reframe, or regenerate the whole image/);
});
