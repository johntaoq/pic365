import assert from 'node:assert/strict';
import test from 'node:test';

import { checkConfiguredVideoProvider } from '../api/health.js';

const klingProvider = {
  providerType: 'baidu-kling-video',
  baseUrl: 'https://vod.bj.baidubce.com/v3/aigc/kl',
  apiKey: 'bce-v3/test/0123456789012345678901234567890123456789',
  model: 'kling-v3'
};

test('deep health treats an authenticated Kling missing-task response as reachable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 'TASK_NOT_FOUND' }), {
    status: 400,
    headers: { 'content-type': 'application/json' }
  });
  try {
    const result = await checkConfiguredVideoProvider(klingProvider, true);
    assert.equal(result.configured, true);
    assert.equal(result.reachable, true);
    assert.equal(result.modelVisible, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('deep health still rejects Kling authentication failures', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), {
    status: 401,
    headers: { 'content-type': 'application/json' }
  });
  try {
    const result = await checkConfiguredVideoProvider(klingProvider, true);
    assert.equal(result.configured, true);
    assert.equal(result.reachable, false);
    assert.equal(result.error, 'VIDEO_PROVIDER_AUTH_FAILED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
