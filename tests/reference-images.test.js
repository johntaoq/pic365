import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import { IMAGE_REFERENCE_MAX_BYTES, isImageReferenceTooLarge } from '../shared/image-generation.js';

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

test('reference images use a fifteen megabyte per-file limit', () => {
  assert.equal(IMAGE_REFERENCE_MAX_BYTES, 15 * 1024 * 1024);
  assert.equal(isImageReferenceTooLarge({ fileSize: IMAGE_REFERENCE_MAX_BYTES }), false);
  assert.equal(isImageReferenceTooLarge({ byteLength: IMAGE_REFERENCE_MAX_BYTES + 1 }), true);
  const oversized = `data:image/png;base64,${Buffer.alloc(IMAGE_REFERENCE_MAX_BYTES + 1).toString('base64')}`;
  assert.throws(
    () => normalizeReferenceRequests([{ imageDataUrl: oversized }]),
    /REFERENCE_IMAGE_TOO_LARGE/
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

test('MAI-Image-2.6 family accepts one primary plus four supporting images', () => {
  for (const model of ['MAI-Image-2.6', 'MAI-Image-2.6-Flash']) {
    assert.doesNotThrow(() => validateReferenceRequestsForModel(
      Array.from({ length: 5 }, (_, index) => ({ generationId: `g-${index}` })),
      model
    ));
    assert.throws(() => validateReferenceRequestsForModel(
      Array.from({ length: 6 }, (_, index) => ({ generationId: `g-${index}` })),
      model
    ), /TOO_MANY_REFERENCE_IMAGES/);
  }
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

test('MAI-Image-2.6 accepts JPEG and PNG but rejects WebP reference inputs', async () => {
  const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const pngImages = await loadReferenceImageInputs(
    'unused-user',
    normalizeReferenceRequests([{ imageDataUrl: pngDataUrl }]),
    { model: 'MAI-Image-2.6-Flash' }
  );
  assert.equal(pngImages.length, 1);

  const webpBytes = await sharp({
    create: { width: 1, height: 1, channels: 4, background: '#ffffff' }
  }).webp().toBuffer();
  await assert.rejects(
    () => loadReferenceImageInputs('unused-user', normalizeReferenceRequests([{
      imageDataUrl: `data:image/webp;base64,${webpBytes.toString('base64')}`
    }]), { model: 'MAI-Image-2.6' }),
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
  assert.match(prompt, /Remove all guide paint, tint and outlines, including boundary strokes/);
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
  assert.match(prompt, /Local edit of image 1/);
  assert.match(prompt, /Apply the user request only within the marked regions/);
  assert.match(prompt, /restore the image beneath them/);
  assert.match(prompt, /Keep all other content and the original framing unchanged/);
  assert.ok(prompt.length < 500, 'single-image local edits should not repeat the full reference-naming or preservation boilerplate');
});

test('reference prompt maps the primary image to image one and continues supporting image numbers', () => {
  const references = [
    { generationId: 'master', annotations: [] },
    { generationId: 'style', annotations: [] },
    { generationId: 'background', annotations: [] }
  ];
  const prompt = buildReferencePrompt('Use 图2 clothing and 图3 lighting on the 母版.', references);
  assert.match(prompt, /Reference 1 \/ Image 1 \/ Primary image \/ Master \/ 参考图1 \/ 图1 \/ 主图 \/ 母版 = supplied reference image 1/);
  assert.match(prompt, /Reference 2 \/ Image 2 \/ 参考图2 \/ 图2 = supplied reference image 2/);
  assert.match(prompt, /Reference 3 \/ Image 3 \/ 参考图3 \/ 图3 = supplied reference image 3/);
  assert.match(prompt, /“Primary image” and “Master” always mean Reference 1/);
  assert.match(prompt, /“主图”和“母版”固定代表参考图1/);
});

test('reference prompt can skip the generic numbered map when a canvas prompt already contains it', () => {
  const prompt = buildReferencePrompt('Image names and input order are already defined.', [{ generationId: 'master', annotations: [] }], { includeNumberedMap: false });
  assert.doesNotMatch(prompt, /Fixed image naming and input order/);
  assert.match(prompt, /User request:\nImage names and input order are already defined/);
});
