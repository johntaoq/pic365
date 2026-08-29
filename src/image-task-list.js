export const MAX_IMAGE_TASKS = 30;
export const MAX_ACTIVE_IMAGE_TASKS = 20;
export const DEFAULT_IMAGE_TASK_CONCURRENCY = 3;
export const ACTIVE_IMAGE_TASK_STATUSES = new Set(['queued', 'running', 'cancelling']);

export function appendImageTask(tasks, task, limit = MAX_IMAGE_TASKS) {
  const current = Array.isArray(tasks) ? tasks : [];
  if (!task) return current;
  if (isActiveImageTask(task) && current.filter(isActiveImageTask).length >= MAX_ACTIVE_IMAGE_TASKS) return current;
  if (current.length >= limit) {
    const completedIndex = current.findIndex((item) => !isActiveImageTask(item));
    if (completedIndex < 0) return current;
    return [...current.slice(0, completedIndex), ...current.slice(completedIndex + 1), task];
  }
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

export function imageTaskSourceLabel(task, language = 'zh') {
  const sourceName = String(task?.sourceName || '').trim();
  const looksLikePrompt = !sourceName
    || sourceName.length > 80
    || /[\r\n]/.test(sourceName)
    || /参考图使用规则|创作要求：|Reference image roles:|Creation request:/i.test(sourceName);
  if (!looksLikePrompt) return sourceName;
  const index = Math.max(0, Number(task?.batchIndex || 0)) + 1;
  return language === 'zh' ? `图片 ${index}` : `Image ${index}`;
}
