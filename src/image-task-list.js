export const MAX_IMAGE_TASKS = 20;
export const DEFAULT_IMAGE_TASK_CONCURRENCY = 3;
export const ACTIVE_IMAGE_TASK_STATUSES = new Set(['queued', 'running', 'cancelling']);

export function appendImageTask(tasks, task, limit = MAX_IMAGE_TASKS) {
  const current = Array.isArray(tasks) ? tasks : [];
  if (!task || current.length >= limit) return current;
  return [...current, task];
}

export function removeImageTask(tasks, taskId) {
  const current = Array.isArray(tasks) ? tasks : [];
  const task = current.find((item) => item?.id === taskId);
  if (task && ACTIVE_IMAGE_TASK_STATUSES.has(task.status)) return current;
  return current.filter((task) => task?.id !== taskId);
}

export function isActiveImageTask(task) {
  return ACTIVE_IMAGE_TASK_STATUSES.has(task?.status);
}
