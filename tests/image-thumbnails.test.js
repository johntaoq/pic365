import assert from 'node:assert/strict';
import test from 'node:test';

import {
  galleryThumbnailUrl,
  generatedImageUrl,
  generatedThumbnailStoragePath
} from '../shared/image-thumbnails.js';

test('generated image URLs keep originals and thumbnails on distinct immutable URLs', () => {
  assert.equal(generatedImageUrl('image id'), '/api/generated?id=image%20id&v=v2');
  assert.equal(generatedImageUrl('image id', 'thumb'), '/api/generated?id=image%20id&variant=thumb&v=v2');
  assert.equal(generatedImageUrl(''), '');
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
