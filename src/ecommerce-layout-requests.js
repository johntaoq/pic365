import { validateEcommerceLayoutReferences } from '../shared/ecommerce-layout-studio.js';
import {
  LAYOUT_WATERMARK_PROTOCOL_VERSION,
  normalizeEcommerceLayoutWatermark
} from '../shared/ecommerce-layout-watermark.js';
import { expandSharedTaskReferences, SHARED_REFERENCE_PROTOCOL_VERSION } from '../shared/generation-task-references.js';
import { IMAGE_GENERATION_REQUEST_MAX_BYTES } from '../shared/image-generation.js';

export async function submitLayoutGenerationTasks(tasks, productReferences, request = fetch) {
  const expandedTasks = expandSharedTaskReferences(tasks, productReferences);
  for (const task of expandedTasks) {
    const productCount = validateEcommerceLayoutReferences(task);
    normalizeEcommerceLayoutWatermark(task.layoutWatermark, { isLayout: productCount !== undefined });
  }
  const supportResponse = await request('/api/generation-tasks', { cache: 'no-store' });
  if (supportResponse.status === 401) throw new Error('AUTH_REQUIRED');
  const support = await supportResponse.json().catch(() => null);
  if (!supportResponse.ok || support?.ok !== true) {
    throw new Error('LAYOUT_REFERENCE_CHECK_FAILED');
  }
  if (tasks.some((task) => task.layoutWatermark != null)
    && support.capabilities?.layoutWatermark !== LAYOUT_WATERMARK_PROTOCOL_VERSION) {
    throw new Error('LAYOUT_WATERMARK_UNSUPPORTED');
  }
  // Only use shared uploads when explicitly supported. Older services need
  // the product photos repeated in every task instead.
  const shared = support.capabilities?.sharedReferences === SHARED_REFERENCE_PROTOCOL_VERSION;
  const inlineBytes = productReferences.reduce((sum, reference) => sum + (reference.imageDataUrl?.length || 0), 0);
  if (inlineBytes * (shared ? 1 : tasks.length) > IMAGE_GENERATION_REQUEST_MAX_BYTES) {
    throw new Error('REQUEST_BODY_TOO_LARGE');
  }
  const body = JSON.stringify(shared
    ? { tasks, sharedReferences: productReferences }
    : { tasks: expandedTasks });
  if (new Blob([body]).size > IMAGE_GENERATION_REQUEST_MAX_BYTES) throw new Error('REQUEST_BODY_TOO_LARGE');
  const response = await request('/api/generation-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  return { response, payload: await response.json().catch(() => ({})) };
}
