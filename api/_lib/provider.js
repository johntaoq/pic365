import { randomUUID } from 'node:crypto';

const DEFAULT_BASE_URL = 'https://www.unikeyx.com';
const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
const DEFAULT_LLM_MODEL = 'gpt-5.5';
const REQUEST_TIMEOUT_MS = 120000;

function trimBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
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

export function isProviderConfigured() {
  return Boolean(getProviderConfig().apiKey);
}

function buildProviderUrl(pathname) {
  const { baseUrl } = getProviderConfig();
  const path = String(pathname || '').replace(/^\/+/, '');
  return `${baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`}/${path}`;
}

function getContentTypeFromDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+)[;,]/i);
  return match?.[1] || 'image/png';
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

async function requestProvider(pathname, body, { accept = 'application/json', signal } = {}) {
  const { apiKey } = getProviderConfig();
  if (!apiKey) throw new Error('AI_PROVIDER_NOT_CONFIGURED');

  const requestId = randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const cancelRequest = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancelRequest, { once: true });

  try {
    const response = await fetch(buildProviderUrl(pathname), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: accept,
        'X-Client-Request-Id': requestId
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload, requestId };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancelRequest);
  }
}

export async function generateImage({ prompt, model, size = '1024x1024', quality = 'low', format = 'png' }) {
  const config = getProviderConfig();
  const { response, payload, requestId } = await requestProvider('images/generations', {
    model: model || config.imageModel,
    prompt,
    n: 1,
    size,
    quality,
    format
  });
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
    model: model || config.imageModel,
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
  inputFidelity = '',
  signal
}) {
  const config = getProviderConfig();
  const imageInputs = (Array.isArray(images) ? images : [])
    .filter(Boolean)
    .slice(0, 16)
    .map((imageUrl) => ({ image_url: imageUrl }));
  if (!imageInputs.length) throw new Error('IMAGE_INPUT_REQUIRED');

  const requestBody = {
    model: model || config.imageModel,
    prompt,
    images: imageInputs,
    n: 1,
    size,
    quality,
    output_format: format,
    background: 'auto'
  };
  if (inputFidelity === 'high' || inputFidelity === 'low') requestBody.input_fidelity = inputFidelity;
  const { response, payload, requestId } = await requestProvider('images/edits', requestBody, { signal });
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
    model: model || config.imageModel,
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

export { getContentTypeFromDataUrl };
