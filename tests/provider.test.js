import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGeminiImageChatRequest,
  classifyImageProviderError,
  editImage,
  generateImage
} from '../api/_lib/provider.js';

test('image provider failures are classified into direct user-facing causes', () => {
  assert.equal(classifyImageProviderError({ status: 503, code: 'model_not_found', message: 'no available channel' }), 'IMAGE_PROVIDER_UNAVAILABLE');
  assert.equal(classifyImageProviderError({ status: 401, code: 'invalid_api_key' }), 'IMAGE_PROVIDER_AUTH_FAILED');
  assert.equal(classifyImageProviderError({ status: 402, message: 'insufficient quota' }), 'IMAGE_PROVIDER_BALANCE_ERROR');
  assert.equal(classifyImageProviderError({ status: 429 }), 'UPSTREAM_BUSY');
  assert.equal(classifyImageProviderError({ name: 'AbortError' }), 'IMAGE_PROVIDER_TIMEOUT');
});

test('Gemini image generation uses New API chat completions with image_config', async () => {
  const previousFetch = globalThis.fetch;
  let requestUrl;
  let requestBody;
  globalThis.fetch = async (url, options) => {
    requestUrl = String(url);
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: '![image](data:image/jpeg;base64,aGVsbG8=)' } }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const result = await generateImage({
      prompt: 'Create a clean product image',
      size: '1024x1536',
      quality: 'low',
      providerConfig: {
        name: '香蕉',
        providerType: 'openai-compatible',
        baseUrl: 'https://provider.example',
        apiKey: 'banana-test-key',
        model: 'gemini-3.1-flash-image'
      }
    });
    assert.equal(requestUrl, 'https://provider.example/v1/chat/completions');
    assert.equal(requestBody.model, 'gemini-3.1-flash-image');
    assert.equal(requestBody.messages[0].content[0].type, 'text');
    assert.equal(requestBody.extra_body.google.image_config.aspect_ratio, '2:3');
    assert.equal(requestBody.extra_body.google.image_config.image_size, '1K');
    assert.equal(result.contentType, 'image/jpeg');
    assert.match(result.image, /^data:image\/jpeg;base64,/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('Gemini image editing sends references through multimodal chat and preserves HTTP URLs', async () => {
  const previousFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,aGVsbG8=' } }] } }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const result = await editImage({
      prompt: 'Keep the product and replace only the background',
      images: [
        'https://cdn.example/reference.jpg',
        'data:image/webp;base64,aGVsbG8='
      ],
      size: '1792x1008',
      quality: 'auto',
      providerConfig: {
        name: '香蕉',
        providerType: 'openai-compatible',
        baseUrl: 'https://provider.example',
        apiKey: 'banana-test-key',
        model: 'gemini-3.1-flash-image'
      }
    });
    assert.deepEqual(
      requestBody.messages[0].content.slice(1).map((item) => item.image_url.url),
      ['https://cdn.example/reference.jpg', 'data:image/webp;base64,aGVsbG8=']
    );
    assert.equal(requestBody.extra_body.google.image_config.aspect_ratio, '16:9');
    assert.equal(requestBody.extra_body.google.image_config.image_size, '2K');
    assert.equal(result.contentType, 'image/png');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('Gemini request builder caps Pic365 reference inputs at nine', () => {
  const body = buildGeminiImageChatRequest({
    prompt: 'Combine the references',
    images: Array.from({ length: 12 }, (_, index) => `https://cdn.example/${index}.png`),
    model: 'gemini-3.1-flash-image',
    size: '512x4096',
    quality: 'high'
  });
  assert.equal(body.messages[0].content.length, 10);
  assert.equal(body.extra_body.google.image_config.aspect_ratio, '1:8');
  assert.equal(body.extra_body.google.image_config.image_size, '4K');
});

test('gpt-image-2 edit requests omit unsupported input_fidelity', async () => {
  const previousFetch = globalThis.fetch;
  const previousBaseUrl = process.env.AI_BASE_URL;
  const previousApiKey = process.env.AI_API_KEY;
  const previousModel = process.env.AI_IMAGE_MODEL;
  let requestBody;

  process.env.AI_BASE_URL = 'https://provider.example';
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_IMAGE_MODEL = 'gpt-image-2';
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    await editImage({
      prompt: 'Edit the reference image',
      images: ['data:image/png;base64,aGVsbG8='],
      size: '1024x1024',
      quality: 'auto',
      inputFidelity: 'high'
    });
    assert.equal(requestBody.model, 'gpt-image-2');
    assert.equal(requestBody.quality, 'medium');
    assert.equal('input_fidelity' in requestBody, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBaseUrl === undefined) delete process.env.AI_BASE_URL;
    else process.env.AI_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = previousApiKey;
    if (previousModel === undefined) delete process.env.AI_IMAGE_MODEL;
    else process.env.AI_IMAGE_MODEL = previousModel;
  }
});

test('database provider configs send their model field upstream', async () => {
  const previousFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    await editImage({
      prompt: 'Edit the product image',
      images: ['data:image/png;base64,aGVsbG8='],
      providerConfig: {
        name: 'GPT Image 2',
        baseUrl: 'https://provider.example',
        apiKey: 'test-key',
        model: 'gpt-image-2'
      }
    });
    assert.equal(requestBody.model, 'gpt-image-2');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('multipart image providers upload reference images as files without a manual content-type header', async () => {
  const previousFetch = globalThis.fetch;
  let requestOptions;
  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    await editImage({
      prompt: 'Keep the product and replace the background',
      images: ['data:image/png;base64,aGVsbG8='],
      size: '1024x1024',
      quality: 'auto',
      providerConfig: {
        name: 'MAI Image',
        providerType: 'openai-compatible-multipart',
        baseUrl: 'https://provider.example',
        apiKey: 'mai-test-key',
        model: 'MAI-Image-2.5'
      }
    });
    assert.ok(requestOptions.body instanceof FormData);
    assert.equal(requestOptions.headers['Content-Type'], undefined);
    assert.equal(requestOptions.body.get('model'), 'MAI-Image-2.5');
    assert.equal(requestOptions.body.get('quality'), 'medium');
    assert.equal(requestOptions.body.getAll('image').length, 1);
    assert.equal(requestOptions.body.get('image').type, 'image/png');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('auto-compatible providers retry image edits as multipart when JSON is rejected', async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(options);
    if (requests.length === 1) {
      return new Response(JSON.stringify({
        error: { message: 'Invalid content-type: "application/json", expected "multipart/form-data".' }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const result = await editImage({
      prompt: 'Edit the supplied image',
      images: ['data:image/webp;base64,aGVsbG8='],
      providerConfig: {
        name: 'Auto provider',
        providerType: 'openai-compatible',
        baseUrl: 'https://multipart-fallback.example',
        apiKey: 'test-key',
        model: 'model-requiring-multipart'
      }
    });
    assert.equal(requests.length, 2);
    assert.equal(typeof requests[0].body, 'string');
    assert.ok(requests[1].body instanceof FormData);
    assert.equal(requests[1].body.get('image').type, 'image/webp');
    assert.match(result.image, /^data:image\/png;base64,/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('image edit requests stop when the caller cancels them', async () => {
  const previousFetch = globalThis.fetch;
  const controller = new AbortController();
  let providerSignal;
  globalThis.fetch = async (_url, options) => {
    providerSignal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  };

  try {
    const request = editImage({
      prompt: 'Cancel this edit',
      images: ['data:image/png;base64,aGVsbG8='],
      signal: controller.signal,
      providerConfig: {
        name: 'Cancelable provider',
        providerType: 'openai-compatible',
        baseUrl: 'https://provider.example',
        apiKey: 'test-key',
        model: 'gpt-image-2'
      }
    });
    controller.abort();
    await assert.rejects(request, (error) => error?.name === 'AbortError');
    assert.equal(providerSignal.aborted, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
