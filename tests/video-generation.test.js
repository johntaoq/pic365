import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-video-generation-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'generated');
process.env.PROVIDER_CONFIG_SECRET = 'video-generation-test-secret';
process.env.AI_API_KEY = 'shared-image-video-key';
process.env.AI_BASE_URL = 'https://provider.example';
process.env.AI_IMAGE_MODEL = 'gpt-image-2';
process.env.VIDEO_GENERATION_WORKER_CONCURRENCY = '1';

const previousFetch = globalThis.fetch;
const localDb = await import('../api/_lib/local-db.js');
const canvasDb = await import('../api/_lib/infinite-canvas-db.js');
const mediaAssets = await import('../api/_lib/media-assets.js');
const providers = await import('../api/_lib/video-provider-config.js');
const videoProvider = await import('../api/_lib/video-provider.js');
const queue = await import('../api/_lib/video-generation-queue.js');
const pricing = await import('../shared/video-pricing.js');
const worker = await import('../server/video-generation-worker.js');
const mediaWorker = await import('../server/media-processing-worker.js');
const { default: videoProvidersHandler } = await import('../api/video-providers.js');
const { default: videoPricingHandler } = await import('../api/video-pricing.js');

after(async () => {
  await worker.stopVideoGenerationWorker();
  await mediaWorker.stopMediaProcessingWorker();
  globalThis.fetch = previousFetch;
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

async function waitForTask(userId, taskId, statuses, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = queue.getVideoTask(userId, taskId);
    if (statuses.includes(task?.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('VIDEO_TASK_WAIT_TIMEOUT');
}

async function invoke(handler, req = {}) {
  let statusCode = 200;
  let payload;
  const headers = {};
  const res = {
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  await handler({ method: 'GET', headers: {}, query: {}, ...req }, res);
  return { statusCode, payload, headers };
}

test('video pricing supports per-second and per-generation billing to 0.01 credits', () => {
  assert.equal(pricing.getVideoGenerationPricing({ seconds: 4 }).credits, 280);
  assert.equal(pricing.getVideoGenerationPricing({ seconds: 8 }).credits, 560);
  assert.equal(pricing.getVideoGenerationPricing({ seconds: 5, mode: 'std' }, { modeRatesRmb: { std: 0.6, pro: 0.8, '4k': 3 } }).credits, 300);
  assert.equal(pricing.getVideoGenerationPricing({ seconds: 5, mode: 'pro' }, { modeRatesRmb: { std: 0.6, pro: 0.8, '4k': 3 } }).credits, 400);
  assert.equal(pricing.getVideoGenerationPricing({ seconds: 5, mode: '4k' }, { modeRatesRmb: { std: 0.6, pro: 0.8, '4k': 3 } }).credits, 1500);
  assert.equal(pricing.getVideoGenerationPricing({ seconds: 12 }, {
    mode: 'per-generation',
    pricePerGenerationRmb: 1.2345
  }).credits, 123.45);
});

test('video provider classifies uploaded-person moderation blocks clearly', () => {
  const error = Object.assign(new Error('The request is blocked by our moderation system when checking inputs. Possible reasons: people-in-user-uploads.'), { status: 400 });
  assert.equal(videoProvider.classifyVideoProviderError(error), 'CONTENT_MODERATION_BLOCKED');
});

test('BK Kling provider submits JSON, polls v3 task status, and downloads the result without creating a paid test task', async () => {
  const calls = [];
  let taskQueryCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    const request = { url: String(url), method: options.method || 'GET', authorization: options.headers?.Authorization || '' };
    if (options.body) request.body = JSON.parse(String(options.body));
    calls.push(request);
    if (request.url.endsWith('/v3/aigc/kl/videos/image2video')) {
      return new Response(JSON.stringify({ code: 'SUCCESS', taskId: 'bk-task-1', requestId: 'request-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (request.url.endsWith('/v3/tasks/bk-task-1')) {
      taskQueryCount += 1;
      return new Response(JSON.stringify({
        taskId: 'bk-task-1',
        code: 'SUCCESS',
        status: 'SUCCESS',
        videoGenerateTaskInfo: taskQueryCount === 1
          ? { status: 'processing' }
          : { status: 'success', videoGenerateTaskOutput: { videoUrl: 'https://media.example/bk-task-1.mp4' } }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (request.url === 'https://media.example/bk-task-1.mp4') {
      return new Response(Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.alloc(40)]), { status: 200, headers: { 'Content-Type': 'video/mp4' } });
    }
    throw new Error(`Unexpected fetch: ${request.url}`);
  };
  const provider = {
    providerType: 'baidu-kling-video',
    baseUrl: 'https://vod.bj.baidubce.com/v3/aigc/kl',
    apiKey: 'test-bk-key',
    model: 'kling-v3'
  };
  const created = await videoProvider.createVideoProviderTask({
    provider,
    prompt: '让商品自然转动',
    seconds: 5,
    size: '1920x1080',
    mode: 'pro',
    reference: { bytes: Buffer.from('reference-image'), mimeType: 'image/png', fileName: 'reference.png' }
  });
  assert.equal(created.id, 'bk-task-1');
  assert.equal(calls[0].url, 'https://vod.bj.baidubce.com/v3/aigc/kl/videos/image2video');
  assert.equal(calls[0].authorization, 'Bearer test-bk-key');
  assert.equal(calls[0].body.model_name, 'kling-v3');
  assert.equal(calls[0].body.mode, 'pro');
  assert.equal(calls[0].body.duration, '5');
  assert.equal(calls[0].body.sound, 'off');
  assert.equal(calls[0].body.image, Buffer.from('reference-image').toString('base64'));
  assert.equal(String(calls[0].body.image).startsWith('data:'), false);

  const state = await videoProvider.retrieveVideoProviderTask({ provider, providerTaskId: created.id });
  assert.equal(state.status, 'processing');
  assert.equal(state.resultUrl, '');
  const downloaded = await videoProvider.downloadVideoProviderResult({ provider, providerTaskId: created.id });
  assert.equal(downloaded.contentType, 'video/mp4');
  assert.equal(downloaded.bytes.subarray(4, 8).toString('ascii'), 'ftyp');
  assert.equal(calls.filter((call) => call.url.endsWith('/v3/tasks/bk-task-1')).length, 2);
});

test('default Sora provider inherits the encrypted image provider credential', () => {
  const imageProvider = localDb.getImageProviderConfig();
  providers.ensureDefaultVideoProviderConfig();
  const [publicProvider] = providers.listVideoProviderConfigs({ admin: true });
  const secretProvider = providers.getVideoProviderConfig(publicProvider.id);
  assert.equal(publicProvider.model, 'sora-2');
  assert.equal(publicProvider.imageProviderId, imageProvider.id);
  assert.equal(secretProvider.baseUrl, imageProvider.baseUrl);
  assert.equal(secretProvider.apiKey, 'shared-image-video-key');
  assert.equal(publicProvider.apiKeyMasked.includes('shared-image-video-key'), false);
});

test('BK Kling provider stores its own encrypted key and exposes provider-specific capabilities', () => {
  const saved = providers.saveVideoProviderConfig({
    name: 'BK Kling V3',
    providerType: 'baidu-kling-video',
    credentialSource: 'manual',
    baseUrl: 'https://vod.bj.baidubce.com/v3/aigc/kl',
    apiKey: 'bk-secret-test-key',
    model: 'kling-v3',
    pricingConfig: { mode: 'per-second', modeRatesRmb: { std: 0.6, pro: 0.8, '4k': 3 } },
    enabled: true
  });
  const secret = providers.getVideoProviderConfig(saved.id);
  const publicProvider = providers.listVideoProviderConfigs().find((provider) => provider.id === saved.id);
  assert.equal(secret.apiKey, 'bk-secret-test-key');
  assert.equal(saved.apiKeyMasked.includes('bk-secret-test-key'), false);
  assert.deepEqual(publicProvider.durations, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(publicProvider.modes, ['std', 'pro', '4k']);
  assert.equal(publicProvider.supportsNativeAudio, false);
  assert.equal(publicProvider.supportsCancellation, false);
});

test('public video provider and pricing APIs expose capabilities without credentials', async () => {
  const providersResult = await invoke(videoProvidersHandler);
  assert.equal(providersResult.statusCode, 200);
  assert.equal(providersResult.payload.providers[0].model, 'sora-2');
  assert.deepEqual(providersResult.payload.providers[0].durations, [4, 8, 12]);
  assert.equal(Object.hasOwn(providersResult.payload.providers[0], 'apiKey'), false);
  assert.equal(Object.hasOwn(providersResult.payload.providers[0], 'apiKeyMasked'), false);

  const pricingResult = await invoke(videoPricingHandler, {
    query: { providerId: providersResult.payload.providers[0].id, seconds: '12' }
  });
  assert.equal(pricingResult.statusCode, 200);
  assert.equal(pricingResult.payload.pricing.credits, 840);
  assert.equal(pricingResult.payload.pricing.source, 'server');
});

test('video worker creates an MP4 asset, settles once, and video nodes persist on canvas', async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).endsWith('/v1/videos') && options.method === 'POST') {
      calls[calls.length - 1].form = {
        isFormData: options.body instanceof FormData,
        model: options.body.get('model'),
        seconds: options.body.get('seconds'),
        hasReference: options.body.get('input_reference') instanceof Blob,
        prompt: String(options.body.get('prompt'))
      };
      return new Response(JSON.stringify({ id: 'sora-task-1', status: 'queued', progress: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).endsWith('/v1/videos/sora-task-1/content')) {
      const bytes = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.alloc(40)]);
      return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    }
    if (String(url).endsWith('/v1/videos/sora-task-1')) {
      return new Response(JSON.stringify({ id: 'sora-task-1', status: 'completed', progress: 100 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const user = localDb.createUser({ email: 'video-worker@example.com', password: 'testing-1234', fullName: 'Video Worker', initialCredits: 1000 });
  const project = canvasDb.createInfiniteCanvasProject(user.id, { name: '视频画布' });
  const sourceBytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#7fe9c5' } }).png().toBuffer();
  const sourceAsset = await mediaAssets.createUploadedAsset(user.id, {
    bytes: sourceBytes,
    mimeType: 'image/png',
    fileName: 'video-reference.png'
  });
  const provider = providers.getVideoProviderConfig();
  const task = queue.createVideoTask(user.id, {
    clientTaskId: 'video-task-1',
    prompt: 'A slow camera push toward the product',
    providerId: provider.id,
    seconds: 4,
    size: '1280x720',
    sourceAssetId: sourceAsset.id,
    sourceWidth: 64,
    sourceHeight: 48,
    canvasProjectId: project.id,
    canvasParentNodeId: project.nodes[0].id,
    canvasTaskNodeId: 'canvas-video-task-1'
  });
  assert.equal(task.quotedCredits, 280);
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 720);

  worker.startVideoGenerationWorker();
  const completed = await waitForTask(user.id, task.id, ['completed', 'failed']);
  assert.equal(completed.status, 'completed', JSON.stringify({ error: completed.error, calls }));
  assert.ok(completed.result.assetId);
  assert.equal(completed.result.mimeType, 'video/mp4');
  assert.equal(completed.settledCredits, 280);
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 720);
  const createCall = calls.find((call) => call.method === 'POST');
  assert.equal(createCall?.url, 'https://provider.example/v1/videos');
  assert.equal(createCall?.form?.isFormData, true);
  assert.equal(createCall?.form?.model, 'sora-2');
  assert.equal(createCall?.form?.seconds, '4');
  assert.equal(createCall?.form?.hasReference, true);
  assert.match(createCall?.form?.prompt || '', /supplied image/i);
  assert.equal(calls.some((call) => call.url.endsWith('/v1/videos')), true);
  assert.equal(calls.some((call) => call.url.endsWith('/v1/videos/sora-task-1/content')), true);

  const saved = canvasDb.updateInfiniteCanvasProject(user.id, project.id, {
    revision: project.revision,
    nodes: [
      ...project.nodes,
      {
        id: 'canvas-video-task-1',
        type: 'video',
        parentId: project.nodes[0].id,
        x: 500,
        y: 120,
        taskId: task.id,
        assetId: completed.result.assetId,
        videoUrl: completed.result.videoUrl,
        seconds: 4,
        size: '1280x720'
      }
    ]
  });
  assert.equal(saved.conflict, false);
  assert.equal(canvasDb.getInfiniteCanvasProject(user.id, project.id).nodes.some((node) => node.type === 'video'), true);
});

test('queued video cancellation releases the reserved credits exactly once', () => {
  const user = localDb.createUser({ email: 'video-cancel@example.com', password: 'testing-1234', fullName: 'Video Cancel', initialCredits: 500 });
  const project = canvasDb.createInfiniteCanvasProject(user.id, { name: '取消测试' });
  const provider = providers.getVideoProviderConfig();
  const task = queue.createVideoTask(user.id, {
    clientTaskId: 'video-cancel-task',
    prompt: 'A stable product shot',
    providerId: provider.id,
    seconds: 4,
    canvasProjectId: project.id,
    canvasParentNodeId: project.nodes[0].id,
    canvasTaskNodeId: 'video-cancel-node'
  });
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 220);
  const cancelled = queue.requestVideoTaskCancellation(user.id, task.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 500);
  queue.requestVideoTaskCancellation(user.id, task.id);
  assert.equal(localDb.getUserProfile(user.id).creditBalance, 500);
});
