import sharp from 'sharp';

import { parseVideoSize } from '../../shared/video-generation.js';

const REQUEST_TIMEOUT_MS = 60_000;

function isBaiduKlingProvider(provider = {}) {
  return String(provider.providerType || provider.provider_type || '').toLowerCase() === 'baidu-kling-video';
}

function providerRoot(baseUrl) {
  const url = new URL(String(baseUrl || '').trim());
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = /\/openai\/v1$/i.test(pathname) || /\/v1$/i.test(pathname)
    ? pathname
    : `${pathname}/v1`;
  return url.toString().replace(/\/$/, '');
}

function providerUrl(baseUrl, pathname) {
  return `${providerRoot(baseUrl)}/${String(pathname || '').replace(/^\/+/, '')}`;
}

function baiduKlingUrl(baseUrl, pathname) {
  return `${String(baseUrl || '').trim().replace(/\/+$/, '')}/${String(pathname || '').replace(/^\/+/, '')}`;
}

function baiduKlingTaskUrl(baseUrl, providerTaskId) {
  const url = new URL(String(baseUrl || '').trim());
  url.pathname = `/v3/tasks/${encodeURIComponent(providerTaskId)}`;
  url.search = '';
  return url.toString();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options.signal;
  const abort = () => controller.abort();
  externalSignal?.addEventListener?.('abort', abort, { once: true });
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', abort);
  }
}

async function responsePayload(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) return response.json().catch(() => ({}));
  return { message: await response.text().catch(() => '') };
}

function providerError(response, payload, fallback = 'VIDEO_PROVIDER_ERROR') {
  const message = String(payload?.error?.message || payload?.error || payload?.message || fallback).slice(0, 500);
  const error = new Error(message || fallback);
  error.status = response?.status || 0;
  error.providerCode = String(payload?.error?.code || payload?.code || '').slice(0, 120);
  error.providerPayload = payload;
  return error;
}

function baiduKlingPayloadError(response, payload, fallback) {
  const code = payload?.code;
  const normalizedCode = String(code ?? '').trim().toLowerCase();
  const hasErrorCode = normalizedCode && !['0', '200', 'success', 'succeed', 'succeeded'].includes(normalizedCode);
  if (!response.ok || hasErrorCode) throw providerError(response, payload, fallback);
}

function baiduKlingStatus(payload = {}) {
  const status = String(
    payload.videoGenerateTaskInfo?.status
    || payload.data?.status
    || payload.data?.taskStatus
    || payload.data?.task_status
    || payload.status
    || ''
  ).trim().toLowerCase();
  if (['success', 'succeed', 'succeeded', 'completed'].includes(status)) return 'completed';
  if (['failure', 'failed', 'error', 'rejected'].includes(status)) return 'failed';
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
  if (['submitted', 'pending', 'processing', 'running'].includes(status)) return 'processing';
  return status;
}

function baiduKlingProgress(status) {
  const normalized = String(status || '').toLowerCase();
  if (['success', 'succeed', 'succeeded', 'completed'].includes(normalized)) return 100;
  if (['failed', 'failure', 'error'].includes(normalized)) return 100;
  if (['processing', 'running'].includes(normalized)) return 50;
  return 5;
}

function findVideoUrl(value, depth = 0) {
  if (depth > 8 || value == null) return '';
  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) && /(?:\.mp4(?:[?#]|$)|video)/i.test(value) ? value : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  const preferredKeys = ['videoUrl', 'video_url', 'outputVideoUrl', 'output_video_url', 'url'];
  for (const key of preferredKeys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
  }
  for (const nested of Object.values(value)) {
    const found = findVideoUrl(nested, depth + 1);
    if (found) return found;
  }
  return '';
}

export function classifyVideoProviderError(error) {
  if (error?.name === 'AbortError' || error?.code === 'VIDEO_GENERATION_CANCELLED') return 'VIDEO_GENERATION_CANCELLED';
  const status = Number(error?.status || 0);
  const content = `${error?.providerCode || ''} ${error?.message || ''}`.toLowerCase();
  if (status === 401 || status === 403) return 'VIDEO_PROVIDER_AUTH_FAILED';
  if (status === 402 || /quota|balance|credit|insufficient/.test(content)) return 'VIDEO_PROVIDER_BALANCE_ERROR';
  if (status === 429 || /rate.?limit|busy|overload/.test(content)) return 'UPSTREAM_BUSY';
  if (/moderation|content.?filter|safety|policy|blocked/.test(content)) return 'CONTENT_MODERATION_BLOCKED';
  if (/timeout|timed out|abort/.test(content)) return 'VIDEO_PROVIDER_TIMEOUT';
  if (/model|deployment|not found|unsupported/.test(content)) return 'VIDEO_PROVIDER_UNAVAILABLE';
  return 'VIDEO_GENERATION_FAILED';
}

export function isVideoProviderConfigured(provider = {}) {
  return Boolean(provider.baseUrl && provider.apiKey && provider.model);
}

export async function prepareVideoReference(bytes, mimeType, size) {
  const { width, height } = parseVideoSize(size);
  const prepared = await sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize({
      width,
      height,
      fit: 'contain',
      background: { r: 14, g: 20, b: 31, alpha: 1 },
      withoutEnlargement: false
    })
    .png({ compressionLevel: 8 })
    .toBuffer();
  return { bytes: prepared, mimeType: 'image/png', fileName: 'input-reference.png' };
}

export async function createVideoProviderTask({ provider, prompt, seconds, size, mode = 'std', reference, signal }) {
  if (!isVideoProviderConfigured(provider)) throw Object.assign(new Error('VIDEO_PROVIDER_NOT_CONFIGURED'), { code: 'VIDEO_PROVIDER_NOT_CONFIGURED' });
  if (isBaiduKlingProvider(provider)) {
    const body = {
      model_name: provider.model || 'kling-v3',
      prompt,
      duration: String(seconds),
      mode: ['std', 'pro', '4k'].includes(String(mode || '').toLowerCase()) ? String(mode).toLowerCase() : 'std',
      sound: 'off',
      watermark_info: { enabled: false }
    };
    if (reference?.bytes?.length) body.image = Buffer.from(reference.bytes).toString('base64');
    else {
      const { width, height } = parseVideoSize(size);
      body.aspect_ratio = width === height ? '1:1' : height > width ? '9:16' : '16:9';
    }
    const endpoint = reference?.bytes?.length ? 'videos/image2video' : 'videos/text2video';
    const response = await fetchWithTimeout(baiduKlingUrl(provider.baseUrl, endpoint), {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal
    });
    const payload = await responsePayload(response);
    baiduKlingPayloadError(response, payload, 'VIDEO_TASK_CREATE_FAILED');
    const providerTaskId = payload.taskId || payload.task_id || payload.data?.taskId || payload.data?.task_id;
    if (!providerTaskId) throw providerError(response, payload, 'VIDEO_TASK_CREATE_FAILED');
    return { id: String(providerTaskId), status: 'queued', progress: 1, payload };
  }
  const form = new FormData();
  form.set('model', provider.model);
  form.set('prompt', prompt);
  form.set('seconds', String(seconds));
  form.set('size', size);
  if (reference?.bytes?.length) {
    form.set('input_reference', new Blob([reference.bytes], { type: reference.mimeType || 'image/png' }), reference.fileName || 'input-reference.png');
  }
  const response = await fetchWithTimeout(providerUrl(provider.baseUrl, 'videos'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.apiKey}` },
    body: form,
    signal
  });
  const payload = await responsePayload(response);
  if (!response.ok || !payload?.id) throw providerError(response, payload, 'VIDEO_TASK_CREATE_FAILED');
  return {
    id: String(payload.id),
    status: String(payload.status || 'queued'),
    progress: Number(payload.progress || 0),
    payload
  };
}

export async function retrieveVideoProviderTask({ provider, providerTaskId, signal }) {
  if (isBaiduKlingProvider(provider)) {
    const response = await fetchWithTimeout(baiduKlingTaskUrl(provider.baseUrl, providerTaskId), {
      headers: { Authorization: `Bearer ${provider.apiKey}`, Accept: 'application/json' },
      signal
    });
    const payload = await responsePayload(response);
    baiduKlingPayloadError(response, payload, 'VIDEO_TASK_STATUS_FAILED');
    const status = baiduKlingStatus(payload);
    return {
      id: String(payload.taskId || payload.task_id || providerTaskId),
      status,
      progress: baiduKlingProgress(status),
      error: payload.error || payload.message || payload.videoGenerateTaskInfo?.message || null,
      resultUrl: findVideoUrl(payload),
      payload
    };
  }
  const response = await fetchWithTimeout(providerUrl(provider.baseUrl, `videos/${encodeURIComponent(providerTaskId)}`), {
    headers: { Authorization: `Bearer ${provider.apiKey}` },
    signal
  });
  const payload = await responsePayload(response);
  if (!response.ok) throw providerError(response, payload, 'VIDEO_TASK_STATUS_FAILED');
  return {
    id: String(payload.id || providerTaskId),
    status: String(payload.status || ''),
    progress: Number(payload.progress || 0),
    error: payload.error || null,
    payload
  };
}

export async function cancelVideoProviderTask({ provider, providerTaskId, signal }) {
  if (isBaiduKlingProvider(provider)) return false;
  const response = await fetchWithTimeout(providerUrl(provider.baseUrl, `videos/${encodeURIComponent(providerTaskId)}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${provider.apiKey}` },
    signal
  });
  if (response.ok || response.status === 404) return true;
  const payload = await responsePayload(response);
  throw providerError(response, payload, 'VIDEO_TASK_CANCEL_FAILED');
}

export async function downloadVideoProviderResult({ provider, providerTaskId, signal }) {
  if (isBaiduKlingProvider(provider)) {
    const state = await retrieveVideoProviderTask({ provider, providerTaskId, signal });
    const remoteUrl = state.resultUrl || findVideoUrl(state.payload);
    if (!remoteUrl) throw Object.assign(new Error('VIDEO_DOWNLOAD_URL_MISSING'), { code: 'VIDEO_DOWNLOAD_FAILED' });
    const remote = await fetchWithTimeout(remoteUrl, { signal }, 120_000);
    if (!remote.ok) throw providerError(remote, await responsePayload(remote), 'VIDEO_DOWNLOAD_FAILED');
    return {
      bytes: Buffer.from(await remote.arrayBuffer()),
      contentType: remote.headers.get('content-type') || 'video/mp4'
    };
  }
  const response = await fetchWithTimeout(providerUrl(provider.baseUrl, `videos/${encodeURIComponent(providerTaskId)}/content`), {
    headers: { Authorization: `Bearer ${provider.apiKey}` },
    signal
  }, 120_000);
  if (!response.ok) {
    const payload = await responsePayload(response);
    throw providerError(response, payload, 'VIDEO_DOWNLOAD_FAILED');
  }
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => ({}));
    const remoteUrl = payload.url || payload.video_url || payload.data?.url;
    if (!remoteUrl) throw providerError(response, payload, 'VIDEO_DOWNLOAD_FAILED');
    const remote = await fetchWithTimeout(remoteUrl, { signal }, 120_000);
    if (!remote.ok) throw providerError(remote, await responsePayload(remote), 'VIDEO_DOWNLOAD_FAILED');
    return {
      bytes: Buffer.from(await remote.arrayBuffer()),
      contentType: remote.headers.get('content-type') || 'video/mp4'
    };
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: contentType || 'video/mp4'
  };
}

export async function checkVideoProvider(provider) {
  if (!isVideoProviderConfigured(provider)) return { ok: false, error: 'VIDEO_PROVIDER_NOT_CONFIGURED' };
  try {
    if (isBaiduKlingProvider(provider)) {
      const response = await fetchWithTimeout(baiduKlingTaskUrl(provider.baseUrl, 'pic365-connection-check'), {
        headers: { Authorization: `Bearer ${provider.apiKey}`, Accept: 'application/json' }
      }, 20_000);
      const payload = await responsePayload(response);
      if ([401, 403].includes(response.status)) throw providerError(response, payload, 'VIDEO_PROVIDER_AUTH_FAILED');
      if (response.status >= 500) throw providerError(response, payload, 'VIDEO_PROVIDER_CHECK_FAILED');
      return { ok: true, modelVisible: true };
    }
    const response = await fetchWithTimeout(providerUrl(provider.baseUrl, 'models'), {
      headers: { Authorization: `Bearer ${provider.apiKey}` }
    }, 20_000);
    const payload = await responsePayload(response);
    if (!response.ok) throw providerError(response, payload, 'VIDEO_PROVIDER_CHECK_FAILED');
    const models = Array.isArray(payload?.data) ? payload.data.map((item) => String(item?.id || '')) : [];
    return { ok: models.length ? models.includes(provider.model) : true, modelVisible: models.includes(provider.model) };
  } catch (error) {
    return { ok: false, error: classifyVideoProviderError(error) };
  }
}

function publicPricingEndpoint(baseUrl) {
  const url = new URL(String(baseUrl || '').trim());
  url.pathname = '/api/pricing';
  url.search = '';
  return url.toString();
}

function publicStatusEndpoint(baseUrl) {
  const url = new URL(String(baseUrl || '').trim());
  url.pathname = '/api/status';
  url.search = '';
  return url.toString();
}

export async function fetchVideoProviderPricing(provider) {
  if (isBaiduKlingProvider(provider)) {
    throw Object.assign(new Error('VIDEO_PRICING_SYNC_UNSUPPORTED'), { code: 'VIDEO_PRICING_SYNC_UNSUPPORTED' });
  }
  const [pricingResponse, statusResponse] = await Promise.all([
    fetchWithTimeout(publicPricingEndpoint(provider.baseUrl), { headers: { Accept: 'application/json' } }, 20_000),
    fetchWithTimeout(publicStatusEndpoint(provider.baseUrl), { headers: { Accept: 'application/json' } }, 20_000)
  ]);
  const pricingPayload = await responsePayload(pricingResponse);
  const statusPayload = await responsePayload(statusResponse);
  if (!pricingResponse.ok) throw providerError(pricingResponse, pricingPayload, 'VIDEO_PRICING_SYNC_FAILED');
  const rows = Array.isArray(pricingPayload) ? pricingPayload : Array.isArray(pricingPayload?.data) ? pricingPayload.data : [];
  const model = rows.find((item) => String(item?.model_name || item?.model || '') === provider.model);
  const usdPerSecond = Number(model?.model_price ?? model?.price ?? 0);
  if (!Number.isFinite(usdPerSecond) || usdPerSecond <= 0) throw Object.assign(new Error('VIDEO_PRICING_NOT_FOUND'), { code: 'VIDEO_PRICING_NOT_FOUND' });
  const status = statusPayload?.data || statusPayload || {};
  return {
    usdPerSecond,
    exchangeRate: Number(status.usd_exchange_rate || 7),
    pricingVersion: String(model?.pricing_version || pricingPayload?.pricing_version || '').slice(0, 160)
  };
}
