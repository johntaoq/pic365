const REGISTRY_KEY = Symbol.for('pic365.freeGenerationTasks');

function registry() {
  if (!globalThis[REGISTRY_KEY]) globalThis[REGISTRY_KEY] = new Map();
  return globalThis[REGISTRY_KEY];
}

function taskKey(userId, taskId) {
  return `${String(userId || '').trim()}:${String(taskId || '').trim()}`;
}

export function registerFreeGenerationTask(userId, taskId, controller) {
  const key = taskKey(userId, taskId);
  if (!userId || !taskId || !controller || registry().has(key)) return false;
  registry().set(key, { controller, createdAt: Date.now() });
  return true;
}

export function cancelFreeGenerationTask(userId, taskId) {
  const entry = registry().get(taskKey(userId, taskId));
  if (!entry) return false;
  entry.controller.abort();
  return true;
}

export function unregisterFreeGenerationTask(userId, taskId, controller) {
  const key = taskKey(userId, taskId);
  const entry = registry().get(key);
  if (!entry || (controller && entry.controller !== controller)) return false;
  registry().delete(key);
  return true;
}

export function hasFreeGenerationTask(userId, taskId) {
  return registry().has(taskKey(userId, taskId));
}
