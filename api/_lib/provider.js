import { randomUUID } from 'node:crypto';
import { resolveProviderImageQuality } from '../../shared/image-generation.js';

const DEFAULT_BASE_URL = 'https://www.unikeyx.com';
const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
const DEFAULT_LLM_MODEL = 'gpt-5.5';
const REQUEST_TIMEOUT_MS = 120000;
const IMAGE_REQUEST_TIMEOUT_MS = 295000;
const multipartEditRoutes = new Set();

function trimBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function resolveImageModel(config, requestedModel) {
  return String(requestedModel || config?.imageModel || config?.model || DEFAULT_IMAGE_MODEL).trim();
}

export function getProviderConfig() {
  return {
    provider: process.env.AI_PROVIDER || 'unikeyx',
    baseUrl: trimBaseUrl(process.env.AI_BASE_URL || process.env.UNIKEYX_BASE_URL || DEFAULT_BASE_URL),
    apiKey: process.env.AI_API_KEY || process.env.UNIKEYX_API_KEY || '',
    imageModel: process.env.AI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    llmModel: process.env.AI_LLM_MODEL || DEFAULT_LLM_MODEL
  };
}

export function isProviderConfigured(providerConfig) {
  return Boolean((providerConfig || getProviderConfig()).apiKey);
}

function buildProviderUrl(pathname, providerConfig) {
  const { baseUrl } = providerConfig || getProviderConfig();
  const path = String(pathname || '').replace(/^\/+/, '');
  return `${baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`}/${path}`;
}

function getContentTypeFromDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+)[;,]/i);
  return match?.[1] || 'image/png';
}

function isFormDataBody(value) {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function imageExtension(contentType) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  return 'png';
}

function imageInputBlob(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    const error = new Error('MULTIPART_IMAGE_INPUT_REQUIRED');
    error.code = 'MULTIPART_IMAGE_INPUT_REQUIRED';
    throw error;
  }
  const contentType = String(match[1] || 'image/png').toLowerCase();
  return {
    blob: new Blob([Buffer.from(match[2], 'base64')], { type: contentType }),
    contentType
  };
}

function buildMultipartEditBody({ prompt, images, model, size, quality, format }) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append('size', size);
  form.append('quality', resolveProviderImageQuality(quality));
  form.append('output_format', format);
  form.append('background', 'auto');
  images.forEach((image, index) => {
    const { blob, contentType } = imageInputBlob(image);
    form.append('image', blob, `reference-${index + 1}.${imageExtension(contentType)}`);
  });
  return form;
}

function expectsMultipart(response, payload) {
  const message = [payload?.error?.message, payload?.message, payload?.error, payload?.detail]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return [400, 415, 422].includes(Number(response?.status || 0))
    && /multipart\/form-data|invalid content-type|expected[^.]*multipart/.test(message);
}

function multipartRouteKey(config, model) {
  return `${trimBaseUrl(config?.baseUrl)}::${String(model || '').toLowerCase()}`;
}

function parseImageResult(payload) {
  const first = Array.isArray(payload?.data) ? payload.data[0] : null;
  const b64 = first?.b64_json || first?.base64 || payload?.b64_json || payload?.base64;
  if (b64) {
    const contentType = first?.mime_type || payload?.mime_type || 'image/png';
    return {
      image: `data:${contentType};base64,${b64}`,
      contentType
    };
  }

  const url = first?.url || first?.image_url || payload?.url || payload?.image_url;
  if (url) {
    return {
      image: url,
      contentType: first?.mime_type || payload?.mime_type || ''
    };
  }

  return null;
}

async function requestProvider(pathname, body, { accept = 'application/json', signal, timeoutMs = REQUEST_TIMEOUT_MS, providerConfig } = {}) {
  const { apiKey } = providerConfig || getProviderConfig();
  if (!apiKey) throw new Error('AI_PROVIDER_NOT_CONFIGURED');

  const requestId = randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const cancelRequest = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancelRequest, { once: true });

  try {
    const multipart = isFormDataBody(body);
    const response = await fetch(buildProviderUrl(pathname, providerConfig), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(multipart ? {} : { 'Content-Type': 'application/json' }),
        Accept: accept,
        'X-Client-Request-Id': requestId
      },
      body: multipart ? body : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload, requestId };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancelRequest);
  }
}

export async function generateImage({ prompt, model, size = '1024x1024', quality = 'low', format = 'png', providerConfig, signal }) {
  const config = providerConfig || getProviderConfig();
  const imageModel = resolveImageModel(config, model);
  const { response, payload, requestId } = await requestProvider('images/generations', {
    model: imageModel,
    prompt,
    n: 1,
    size,
    quality: resolveProviderImageQuality(quality),
    output_format: format
  }, { timeoutMs: IMAGE_REQUEST_TIMEOUT_MS, providerConfig: config, signal });
  const result = parseImageResult(payload);

  if (!response.ok || !result?.image) {
    const message = payload?.error?.message || payload?.message || `Image generation failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code || payload?.code;
    error.type = payload?.error?.type || payload?.type;
    error.providerRequestId = requestId;
    throw error;
  }

  return {
    ...result,
    model: imageModel,
    providerRequestId: requestId
  };
}

export async function editImage({
  prompt,
  images,
  model,
  size = '1024x1024',
  quality = 'medium',
  format = 'png',
  signal,
  providerConfig
}) {
  const config = providerConfig || getProviderConfig();
  const imageModel = resolveImageModel(config, model);
  const imageInputs = (Array.isArray(images) ? images : [])
    .filter(Boolean)
    .slice(0, 9)
    .map((imageUrl) => ({ image_url: imageUrl }));
  if (!imageInputs.length) throw new Error('IMAGE_INPUT_REQUIRED');

  const requestBody = {
    model: imageModel,
    prompt,
    images: imageInputs,
    n: 1,
    size,
    quality: resolveProviderImageQuality(quality),
    output_format: format,
    background: 'auto'
  };
  const routeKey = multipartRouteKey(config, imageModel);
  const multipartPreferred = config.providerType === 'openai-compatible-multipart'
    || multipartEditRoutes.has(routeKey);
  let providerResponse = await requestProvider(
    'images/edits',
    multipartPreferred
      ? buildMultipartEditBody({ prompt, images: images.slice(0, 9), model: imageModel, size, quality, format })
      : requestBody,
    { signal, timeoutMs: IMAGE_REQUEST_TIMEOUT_MS, providerConfig: config }
  );
  if (!multipartPreferred && config.providerType !== 'openai-compatible-json' && expectsMultipart(providerResponse.response, providerResponse.payload)) {
    multipartEditRoutes.add(routeKey);
    providerResponse = await requestProvider(
      'images/edits',
      buildMultipartEditBody({ prompt, images: images.slice(0, 9), model: imageModel, size, quality, format }),
      { signal, timeoutMs: IMAGE_REQUEST_TIMEOUT_MS, providerConfig: config }
    );
  }
  const { response, payload, requestId } = providerResponse;
  const result = parseImageResult(payload);

  if (!response.ok || !result?.image) {
    const message = payload?.error?.message || payload?.message || `Image editing failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code || payload?.code;
    error.type = payload?.error?.type || payload?.type;
    error.providerRequestId = requestId;
    throw error;
  }

  return {
    ...result,
    model: imageModel,
    providerRequestId: requestId
  };
}

export async function generateText({ messages, model, temperature = 0.2 }) {
  const config = getProviderConfig();
  const { response, payload, requestId } = await requestProvider('chat/completions', {
    model: model || config.llmModel,
    messages,
    temperature
  });

  const content = payload?.choices?.[0]?.message?.content;
  if (!response.ok || !content) {
    const message = payload?.error?.message || payload?.message || `Text generation failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code || payload?.code;
    error.type = payload?.error?.type || payload?.type;
    error.providerRequestId = requestId;
    throw error;
  }

  return {
    content,
    model: model || config.llmModel,
    providerRequestId: requestId
  };
}

export function isContentModerationError(error) {
  const haystack = [error?.code, error?.type, error?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return [
    'content_policy',
    'content policy',
    'content_filter',
    'content filter',
    'moderation',
    'safety filter',
    'safety_filter',
    'safety system',
    'prompt blocked',
    'prompt_blocked',
    'filtered content',
    'content filtered',
    'responsible ai',
    'responsible_ai',
    'responsibleaipolicyviolation',
    'policy violation'
  ].some((marker) => haystack.includes(marker));
}

export function classifyImageProviderError(error) {
  if (isContentModerationError(error)) return 'CONTENT_MODERATION_BLOCKED';
  const status = Number(error?.status || 0);
  const haystack = [error?.code, error?.type, error?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (status === 401 || status === 403 || /invalid[_ ]?(api[_ ]?)?key|unauthori[sz]ed|authentication/.test(haystack)) {
    return 'IMAGE_PROVIDER_AUTH_FAILED';
  }
  if (/insufficient[_ ]?(quota|balance|credit)|quota[_ ]?exceeded|account[_ ]?balance|余额不足|额度不足/.test(haystack)) {
    return 'IMAGE_PROVIDER_BALANCE_ERROR';
  }
  if (error?.name === 'AbortError' || /timed?\s*out|timeout/.test(haystack)) {
    return 'IMAGE_PROVIDER_TIMEOUT';
  }
  if (status === 429) return 'UPSTREAM_BUSY';
  if (
    error?.code === 'model_not_found'
    || /model[_ ]?not[_ ]?found|no available (channel|route)|no.*channel|渠道.*不可用|无可用.*渠道|distributor/.test(haystack)
    || status >= 500
  ) {
    return 'IMAGE_PROVIDER_UNAVAILABLE';
  }
  return 'GENERATION_FAILED';
}

export { getContentTypeFromDataUrl };
