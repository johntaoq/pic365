import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchImageGeneration,
  IMAGE_GENERATION_CLIENT_TIMEOUT_MS,
  isImageGenerationTimeout
} from '../src/image-generation-client.js';

test('image-generation clients wait up to 300 seconds by default', () => {
  assert.equal(IMAGE_GENERATION_CLIENT_TIMEOUT_MS, 300_000);
});

test('image-generation timeout is reported distinctly', async () => {
  const neverCompletes = (_input, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  await assert.rejects(
    fetchImageGeneration('/api/generate-image', {}, { timeoutMs: 5, fetchImpl: neverCompletes }),
    (error) => isImageGenerationTimeout(error)
  );
});
