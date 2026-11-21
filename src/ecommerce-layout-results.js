export function layoutResultIdentity(item) {
  return String(item?.generationId || item?.id || item?.imageUrl || '');
}

export function latestLayoutBatchId(tasks = []) {
  const latest = tasks.filter((task) => String(task?.batchId || '').startsWith('layout-'))
    .reduce((current, task) => {
      if (!current) return task;
      const order = String(task.createdAt || '').localeCompare(String(current.createdAt || ''));
      return order > 0 || (order === 0 && String(task.id || '') > String(current.id || '')) ? task : current;
    }, null);
  return latest?.batchId || '';
}

export function layoutBatchRows(tasks = [], batchId = '', pendingLayouts = []) {
  if (!String(batchId).startsWith('layout-')) return [];
  const rows = tasks.filter((task) => task?.batchId === batchId);
  for (const [batchIndex, layoutId] of pendingLayouts.entries()) {
    if (!rows.some((task) => task.batchIndex === batchIndex)) {
      rows.push({ id: `${batchId}-${batchIndex}`, batchId, batchIndex, layoutId, status: 'preparing', results: [] });
    }
  }
  return rows.sort((a, b) => a.batchIndex - b.batchIndex
    || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    || String(a.id || '').localeCompare(String(b.id || '')));
}

export function layoutBatchResults(rows = []) {
  return rows.flatMap((task) => (task.results || [])
    .filter((item) => item?.imageUrl && (!item.status || item.status === 'succeeded'))
    .map((item) => ({
      ...item, taskId: task.id, batchId: task.batchId, layoutId: task.layoutId,
      createdAt: item.createdAt || task.completedAt || task.createdAt
    })));
}

export function selectLayoutResult(items = [], selectedId = '', batchId = '') {
  if (!String(batchId).startsWith('layout-')) return null;
  const scoped = items.filter((item) => item.batchId === batchId);
  return scoped.find((item) => layoutResultIdentity(item) === selectedId) || scoped[0] || null;
}

export function layoutResultFilename(item) {
  const extension = { 'image/jpeg': 'jpg', 'image/webp': 'webp' }[item?.mimeType] || 'png';
  return `pic365-${String(item?.generationId || item?.id || 'image').replace(/[^a-zA-Z0-9_-]/g, '_')}.${extension}`;
}

export function layoutTaskFailureText(code, language = 'zh') {
  const messages = {
    LAYOUT_WATERMARK_INVALID: ['水印图无效', 'Invalid watermark'],
    LAYOUT_REFERENCES_INCOMPLETE: ['商品图不完整', 'Product photo missing'],
    REFERENCE_IMAGE_NOT_FOUND: ['商品图已失效', 'Product photo unavailable'],
    IMAGE_PROVIDER_UNAVAILABLE: ['生图服务不可用', 'Service unavailable'],
    IMAGE_PROVIDER_TIMEOUT: ['生图服务超时', 'Service timed out']
  };
  return (messages[code] || ['生成失败', 'Failed'])[language === 'zh' ? 0 : 1];
}
