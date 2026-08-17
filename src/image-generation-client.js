export const IMAGE_GENERATION_CLIENT_TIMEOUT_MS = 300_000;

export async function fetchImageGeneration(
  input,
  init = {},
  { timeoutMs = IMAGE_GENERATION_CLIENT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}
) {
  const controller = new AbortController();
  const externalSignal = init.signal;
  let timedOut = false;
  const forwardAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) forwardAbort();
  else externalSignal?.addEventListener('abort', forwardAbort, { once: true });

  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (!timedOut) throw error;
    const timeoutError = new Error('CLIENT_GENERATION_TIMEOUT');
    timeoutError.name = 'TimeoutError';
    timeoutError.code = 'CLIENT_GENERATION_TIMEOUT';
    throw timeoutError;
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
}

export function isImageGenerationTimeout(error) {
  return error?.code === 'CLIENT_GENERATION_TIMEOUT' || error?.message === 'CLIENT_GENERATION_TIMEOUT';
}
