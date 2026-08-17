const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

function assertBodySize(value, maxBytes) {
  const byteLength = Buffer.byteLength(value || '', 'utf8');
  if (byteLength <= maxBytes) return;
  throwBodyTooLarge();
}

function throwBodyTooLarge() {
  const error = new Error('REQUEST_BODY_TOO_LARGE');
  error.code = 'REQUEST_BODY_TOO_LARGE';
  error.status = 413;
  throw error;
}

export async function readJsonBody(req, { maxBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  const contentLength = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throwBodyTooLarge();
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maxBytes) throwBodyTooLarge();
    return JSON.parse(req.body.toString('utf8') || '{}');
  }
  if (req.body && typeof req.body === 'object') {
    const serialized = JSON.stringify(req.body);
    assertBodySize(serialized, maxBytes);
    return req.body;
  }
  if (typeof req.body === 'string') {
    assertBodySize(req.body, maxBytes);
    return JSON.parse(req.body || '{}');
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) throwBodyTooLarge();
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export async function readBufferBody(req, { maxBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  const contentLength = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throwBodyTooLarge();
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maxBytes) throwBodyTooLarge();
    return req.body;
  }
  if (typeof req.body === 'string') {
    const buffer = Buffer.from(req.body);
    if (buffer.length > maxBytes) throwBodyTooLarge();
    return buffer;
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) throwBodyTooLarge();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
