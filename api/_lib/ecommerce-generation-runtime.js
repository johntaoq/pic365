const ACTIVE_TASKS_KEY = Symbol.for('awesome-gpt-image-2.ecommerce.active-generation-tasks');
const CANCELLED_TASKS_KEY = Symbol.for('awesome-gpt-image-2.ecommerce.cancelled-generation-tasks');
const CANCELLED_TASK_TTL_MS = 5 * 60 * 1000;

const activeTasks = globalThis[ACTIVE_TASKS_KEY] || new Map();
const cancelledTasks = globalThis[CANCELLED_TASKS_KEY] || new Map();
globalThis[ACTIVE_TASKS_KEY] = activeTasks;
globalThis[CANCELLED_TASKS_KEY] = cancelledTasks;

function taskKey(userId, taskId) {
  return `${userId}:${taskId}`;
}

function pruneCancelledTasks() {
  const cutoff = Date.now() - CANCELLED_TASK_TTL_MS;
  for (const [key, timestamp] of cancelledTasks) {
    if (timestamp < cutoff) cancelledTasks.delete(key);
  }
}

export function registerGenerationTask(userId, taskId) {
  pruneCancelledTasks();
  const key = taskKey(userId, taskId);
  const previous = activeTasks.get(key);
  if (previous) previous.abortController.abort();

  const abortController = new AbortController();
  activeTasks.set(key, { abortController, createdAt: Date.now() });
  if (cancelledTasks.delete(key)) abortController.abort();
  return abortController;
}

export function unregisterGenerationTask(userId, taskId) {
  activeTasks.delete(taskKey(userId, taskId));
}

export function cancelGenerationTask(userId, taskId) {
  pruneCancelledTasks();
  const key = taskKey(userId, taskId);
  const task = activeTasks.get(key);
  if (task) {
    task.abortController.abort();
    return { accepted: true, active: true };
  }

  cancelledTasks.set(key, Date.now());
  return { accepted: true, active: false };
}

export function isGenerationCancellation(error, signal) {
  return Boolean(
    signal?.aborted ||
    error?.name === 'AbortError' ||
    error?.code === 'ABORT_ERR' ||
    error?.message === 'GENERATION_CANCELLED'
  );
}

export function throwIfGenerationCancelled(signal) {
  if (!signal?.aborted) return;
  const error = new Error('GENERATION_CANCELLED');
  error.code = 'GENERATION_CANCELLED';
  error.name = 'AbortError';
  throw error;
}
