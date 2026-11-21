import assert from 'node:assert/strict';
import test from 'node:test';

import {
  galleryThumbnailUrl,
  generatedImageUrl,
  generatedImagePreviewSources,
  generatedThumbnailStoragePath
} from '../shared/image-thumbnails.js';

test('generated image URLs keep originals and thumbnails on distinct immutable URLs', () => {
  assert.equal(generatedImageUrl('image id'), '/api/generated?id=image%20id&v=v2');
  assert.equal(generatedImageUrl('image id', 'thumb'), '/api/generated?id=image%20id&variant=thumb&v=v3');
  assert.equal(generatedImageUrl('image id', 'thumbnail'), generatedImageUrl('image id', 'thumb'));
  assert.equal(generatedImageUrl('image id', 'preview'), '/api/generated?id=image%20id&variant=preview&v=v3');
  assert.equal(generatedImageUrl(''), '');
});

test('generated previews never use originals or a stale thumbnail URL', () => {
  const sources = generatedImagePreviewSources({ generationId: 'result', imageUrl: '/api/generated?id=result',
    thumbnailUrl: '/api/generated?id=result&variant=thumbnail' });
  assert.match(sources.thumbnail, /variant=thumb&v=v3$/);
  assert.match(sources.preview, /variant=preview&v=v3$/);
  assert.deepEqual(generatedImagePreviewSources({ id: 'result', imageUrl: '/api/generated?id=result' }), sources);
  assert.deepEqual(generatedImagePreviewSources({ imageUrl: 'data:image/png;base64,guest' }),
    { thumbnail: 'data:image/png;base64,guest', preview: 'data:image/png;base64,guest' });
});

test('generated thumbnail storage paths are deterministic and traversal safe', () => {
  assert.equal(
    generatedThumbnailStoragePath('user-1/generation-1.png'),
    'thumbnails/v1/user-1/generation-1.webp'
  );
  assert.equal(generatedThumbnailStoragePath('../secret.png'), '');
});

test('gallery thumbnails preserve folders and query strings', () => {
  assert.equal(galleryThumbnailUrl('/images/case338.png'), '/images/thumbnails/case338.webp');
  assert.equal(
    galleryThumbnailUrl('/images/products/demo.jpg?v=2'),
    '/images/thumbnails/products/demo.webp?v=2'
  );
  assert.equal(galleryThumbnailUrl('https://example.com/demo.jpg'), 'https://example.com/demo.jpg');
});
