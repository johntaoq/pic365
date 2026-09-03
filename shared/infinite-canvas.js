export const INFINITE_CANVAS_NODE_WIDTH = 292;
export const INFINITE_CANVAS_NODE_HEIGHT = 270;
export const CANVAS_REFERENCE_ROLES = Object.freeze(['general', 'subject', 'style', 'composition', 'color']);
export const CANVAS_UI_SELECTOR = [
  '.infiniteCanvasNode',
  '[data-canvas-ui="true"]',
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'label',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="dialog"]',
  '[role="alertdialog"]'
].join(',');

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.8;

export function clampCanvasZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value) || 1));
}

export function isCanvasUiTarget(target) {
  return Boolean(target?.closest?.(CANVAS_UI_SELECTOR));
}

export function clipboardImageFiles(clipboardData) {
  const fromItems = Array.from(clipboardData?.items || [])
    .filter((item) => item?.kind === 'file' && String(item.type || '').startsWith('image/'))
    .map((item) => item.getAsFile?.())
    .filter(Boolean);
  const fromFiles = Array.from(clipboardData?.files || []).filter((file) => String(file?.type || '').startsWith('image/'));
  return [...new Set([...fromItems, ...fromFiles])];
}

export function createCanvasIdeaNode({ id, x = 120, y = 120, prompt = '', createdAt = new Date().toISOString() } = {}) {
  return {
    id: String(id || `idea-${Date.now()}`),
    type: 'idea',
    x: Number(x) || 0,
    y: Number(y) || 0,
    parentId: '',
    prompt: String(prompt || ''),
    createdAt
  };
}

function cleanCanvasUrl(value) {
  const url = String(value || '').trim();
  return /^javascript:/i.test(url) ? '' : url;
}

export function canvasPipelineLabel(index = 0) {
  let value = Math.max(0, Math.floor(Number(index) || 0));
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

export function assignCanvasNodeNames(nodes = []) {
  const source = Array.isArray(nodes) ? nodes.map((node) => ({ ...node })) : [];
  if (!source.length) return source;
  const byId = new Map(source.map((node) => [String(node.id || ''), node]));
  const sourceIndex = new Map(source.map((node, index) => [node.id, index]));
  const ordered = [...source].sort((left, right) => {
    const time = String(left.createdAt || '').localeCompare(String(right.createdAt || ''));
    return time || Number(sourceIndex.get(left.id) || 0) - Number(sourceIndex.get(right.id) || 0);
  });
  const roots = ordered.filter((node) => !node.parentId || !byId.has(node.parentId) || node.parentId === node.id);
  const usedCodes = new Set(roots.map((node) => String(node.pipelineCode || '').trim()).filter((code) => /^[A-Z]+$/.test(code)));
  let nextPipelineIndex = 0;
  const rootCodes = new Map();
  for (const root of roots) {
    let code = String(root.pipelineCode || '').trim();
    if (!/^[A-Z]+$/.test(code)) {
      do { code = canvasPipelineLabel(nextPipelineIndex); nextPipelineIndex += 1; } while (usedCodes.has(code));
      usedCodes.add(code);
    }
    rootCodes.set(root.id, code);
  }

  const lineageMemo = new Map();
  function lineageOf(node, trail = new Set()) {
    if (lineageMemo.has(node.id)) return lineageMemo.get(node.id);
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (!parent || parent.id === node.id || trail.has(node.id)) {
      const root = { rootId: node.id, depth: 0 };
      lineageMemo.set(node.id, root);
      if (!rootCodes.has(node.id)) {
        let code;
        do { code = canvasPipelineLabel(nextPipelineIndex); nextPipelineIndex += 1; } while (usedCodes.has(code));
        usedCodes.add(code);
        rootCodes.set(node.id, code);
      }
      return root;
    }
    const parentLineage = lineageOf(parent, new Set(trail).add(node.id));
    const lineage = { rootId: parentLineage.rootId, depth: parentLineage.depth + 1 };
    lineageMemo.set(node.id, lineage);
    return lineage;
  }

  const groups = new Map();
  for (const node of ordered) {
    const lineage = lineageOf(node);
    const pipelineCode = rootCodes.get(lineage.rootId) || 'A';
    const key = `${pipelineCode}:${lineage.depth}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ node, lineage, pipelineCode });
  }

  const naming = new Map();
  for (const entries of groups.values()) {
    const usedCopyIndexes = new Set();
    for (const entry of entries) {
      const existing = Number(entry.node.copyIndex);
      if (Number.isInteger(existing) && existing >= 0 && !usedCopyIndexes.has(existing)) usedCopyIndexes.add(existing);
    }
    let nextCopyIndex = 0;
    for (const entry of entries) {
      let copyIndex = Number(entry.node.copyIndex);
      if (!Number.isInteger(copyIndex) || copyIndex < 0 || naming.has(`${entry.pipelineCode}:${entry.lineage.depth}:${copyIndex}`)) {
        while (usedCopyIndexes.has(nextCopyIndex)) nextCopyIndex += 1;
        copyIndex = nextCopyIndex;
        usedCopyIndexes.add(copyIndex);
      }
      naming.set(`${entry.pipelineCode}:${entry.lineage.depth}:${copyIndex}`, true);
      const autoName = entry.lineage.depth === 0
        ? entry.pipelineCode
        : `${entry.pipelineCode}${entry.lineage.depth}${copyIndex ? `-${String(copyIndex).padStart(2, '0')}` : ''}`;
      entry.node.pipelineCode = entry.pipelineCode;
      entry.node.pipelineDepth = entry.lineage.depth;
      entry.node.copyIndex = copyIndex;
      entry.node.autoName = autoName;
      entry.node.name = String(entry.node.name || '').trim().slice(0, 80) || autoName;
    }
  }
  return source;
}

export function normalizeCanvasState(value = {}) {
  const rawNodes = Array.isArray(value.nodes) ? value.nodes : [];
  const seen = new Set();
  const nodes = rawNodes
    .filter((node) => node && typeof node === 'object' && ['idea', 'image', 'video', 'task', 'group'].includes(node.type))
    .map((node, index) => ({
      ...node,
      id: String(node.id || `node-${index}`),
      type: node.type,
      x: Number.isFinite(Number(node.x)) ? Number(node.x) : 120 + index * 28,
      y: Number.isFinite(Number(node.y)) ? Number(node.y) : 120 + index * 28,
      parentId: String(node.parentId || ''),
      prompt: String(node.prompt || '').slice(0, 6000),
      imageUrl: cleanCanvasUrl(node.imageUrl),
      thumbnailUrl: cleanCanvasUrl(node.thumbnailUrl || node.imageUrl),
      videoUrl: cleanCanvasUrl(node.videoUrl),
      posterUrl: cleanCanvasUrl(node.posterUrl),
      downloadUrl: cleanCanvasUrl(node.downloadUrl),
      mediaType: node.mediaType === 'video' ? 'video' : node.mediaType === 'image' ? 'image' : '',
      videoGenerationId: String(node.videoGenerationId || ''),
      assetId: String(node.assetId || ''),
      generationId: String(node.generationId || ''),
      taskId: String(node.taskId || ''),
      mimeType: String(node.mimeType || ''),
      size: String(node.size || ''),
      quality: String(node.quality || ''),
      providerId: String(node.providerId || ''),
      status: String(node.status || ''),
      phase: String(node.phase || ''),
      progress: Math.max(0, Math.min(100, Math.round(Number(node.progress) || 0))),
      seconds: Math.max(0, Math.min(60, Math.round(Number(node.seconds) || 0))),
      hasAudio: node.hasAudio == null ? null : Boolean(node.hasAudio),
      error: String(node.error || ''),
      locked: Boolean(node.locked),
      favorite: Boolean(node.favorite),
      name: String(node.name || '').trim().slice(0, 80),
      autoName: String(node.autoName || '').trim().slice(0, 80),
      pipelineCode: String(node.pipelineCode || '').trim().slice(0, 8),
      pipelineDepth: Math.max(0, Math.round(Number(node.pipelineDepth) || 0)),
      copyIndex: Math.max(0, Math.round(Number(node.copyIndex) || 0)),
      referenceRole: CANVAS_REFERENCE_ROLES.includes(node.referenceRole) ? node.referenceRole : '',
      referenceOrder: Math.max(0, Math.round(Number(node.referenceOrder) || 0)),
      referenceLinks: Array.isArray(node.referenceLinks) ? node.referenceLinks.slice(0, 9).map((link, linkIndex) => ({
        nodeId: String(link?.nodeId || ''),
        role: CANVAS_REFERENCE_ROLES.includes(link?.role) ? link.role : 'general',
        order: Math.max(1, Math.round(Number(link?.order) || linkIndex + 1))
      })) : [],
      referenceNodeIds: Array.isArray(node.referenceNodeIds) ? node.referenceNodeIds.map(String).slice(0, 9) : [],
      annotations: Array.isArray(node.annotations) ? node.annotations : [],
      createdAt: String(node.createdAt || '')
    }))
    .filter((node) => node.id && !seen.has(node.id) && seen.add(node.id));
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes: assignCanvasNodeNames(nodes.map((node) => ({
      ...node,
      parentId: ids.has(node.parentId) && node.parentId !== node.id ? node.parentId : '',
      referenceLinks: [...new Map((node.referenceLinks || [])
        .filter((link) => link.nodeId && link.nodeId !== node.id && ids.has(link.nodeId))
        .map((link) => [link.nodeId, link])).values()]
        .sort((left, right) => left.order - right.order)
        .map((link, index) => ({ ...link, order: index + 1 }))
    }))),
    viewport: {
      x: Number.isFinite(Number(value.viewport?.x)) ? Number(value.viewport.x) : 80,
      y: Number.isFinite(Number(value.viewport?.y)) ? Number(value.viewport.y) : 70,
      zoom: clampCanvasZoom(value.viewport?.zoom)
    }
  };
}

export function viewportRightMiddlePosition(viewport, stageWidth, stageHeight, {
  nodeWidth = INFINITE_CANVAS_NODE_WIDTH,
  nodeHeight = INFINITE_CANVAS_NODE_HEIGHT,
  topInset = 78,
  rightInset = 24,
  bottomInset = 238
} = {}) {
  const zoom = clampCanvasZoom(viewport?.zoom);
  const safeWidth = Math.max(nodeWidth * zoom, Number(stageWidth || 900));
  const safeHeight = Math.max(nodeHeight * zoom, Number(stageHeight || 620));
  const screenX = Math.max(12, safeWidth - rightInset - nodeWidth * zoom);
  const usableHeight = Math.max(nodeHeight * zoom, safeHeight - topInset - bottomInset);
  const screenY = topInset + Math.max(0, (usableHeight - nodeHeight * zoom) / 2);
  return {
    x: (screenX - Number(viewport?.x || 0)) / zoom,
    y: (screenY - Number(viewport?.y || 0)) / zoom
  };
}

export function canvasBatchResultPlacements({
  x = 120,
  y = 120,
  parentId = '',
  count = 1,
  nodeWidth = INFINITE_CANVAS_NODE_WIDTH,
  nodeHeight = INFINITE_CANVAS_NODE_HEIGHT,
  columnGap = 32,
  rowGap = 30
} = {}) {
  const total = Math.max(1, Math.min(4, Math.round(Number(count) || 1)));
  const rows = total > 2 ? 2 : total;
  return Array.from({ length: total }, (_, index) => ({
    x: Number(x) + Math.floor(index / rows) * (nodeWidth + columnGap),
    y: Number(y) + (index % rows) * (nodeHeight + rowGap),
    parentId: String(parentId || '')
  }));
}

export function orderedCanvasReferenceNodes(nodes = [], primaryNodeId = '') {
  const primary = nodes.find((node) => node.id === primaryNodeId && node.type === 'image') || null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const supporting = primary
    ? [...(primary.referenceLinks || [])].sort((left, right) => Number(left.order || 0) - Number(right.order || 0)).map((link) => {
      const node = byId.get(link.nodeId);
      return node?.type === 'image' ? { ...node, referenceRole: link.role, referenceOrder: link.order, referenceTargetId: primary.id } : null;
    }).filter(Boolean)
    : [];
  return primary ? [primary, ...supporting] : supporting;
}

export function inferCanvasReferenceRole(node = {}) {
  const text = [node.name, node.autoName, node.title, node.prompt, node.draftPrompt]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/(配色|色板|颜色|色彩|色调|调色|palette|color|colour|tone)/i.test(text)) return 'color';
  if (/(构图|版式|布局|排版|机位|镜头|视角|角度|composition|layout|framing|camera|angle)/i.test(text)) return 'composition';
  if (/(风格|氛围|光影|质感|摄影|插画|艺术|材质|style|mood|lighting|texture|photograph|illustration|art)/i.test(text)) return 'style';
  if (/(主体|商品|产品|人物|角色|模特|包装|logo|标志|subject|product|person|character|model|package|brand)/i.test(text)) return 'subject';
  return 'general';
}

export function canvasReferenceEdges(nodes = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.flatMap((target) => (target.referenceLinks || []).map((link) => {
    const source = byId.get(link.nodeId);
    if (!source || source.id === target.id) return null;
    return { source, target, role: link.role || 'general', order: Number(link.order || 0) };
  }).filter(Boolean));
}

export function canvasReferenceRemovalImpact(nodes = [], nodeIds = []) {
  const removing = new Set(nodeIds);
  const edges = canvasReferenceEdges(nodes).filter((edge) => removing.has(edge.source.id) || removing.has(edge.target.id));
  return {
    total: edges.length,
    internal: edges.filter((edge) => removing.has(edge.source.id) && removing.has(edge.target.id)).length,
    external: edges.filter((edge) => removing.has(edge.source.id) !== removing.has(edge.target.id)).length
  };
}

export function removeCanvasReferenceConnection(nodes = [], sourceId = '', targetId = '') {
  const source = String(sourceId || '');
  const target = String(targetId || '');
  if (!source || !target) return nodes;
  return nodes.map((node) => node.id === target ? {
    ...node,
    referenceLinks: (node.referenceLinks || [])
      .filter((link) => link.nodeId !== source)
      .map((link, index) => ({ ...link, order: index + 1 }))
  } : node);
}

export function canvasImageDownloadFilename(node = {}, language = 'zh') {
  const rawPrefix = String(node.name || node.autoName || node.title || 'image').trim();
  const prefix = rawPrefix
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[.\s-]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 72) || 'image';
  const mimeExtensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif'
  };
  const mimeType = String(node.mimeType || '').split(';')[0].trim().toLowerCase();
  const source = String(node.downloadUrl || node.imageUrl || '').split(/[?#]/)[0];
  const sourceExtension = source.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  const extension = mimeExtensions[mimeType] || (['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].includes(sourceExtension) ? sourceExtension : 'png');
  return `${prefix}-${language === 'zh' ? '原图' : 'original'}.${extension === 'jpeg' ? 'jpg' : extension}`;
}

export function canvasReferencePrompt(prompt, references = [], language = 'zh') {
  const base = String(prompt || '').trim();
  if (!references.length) return base;
  const zhLabels = { general: '普通参考', subject: '主体参考', style: '风格参考', composition: '构图参考', color: '色彩参考' };
  const enLabels = { general: 'general reference', subject: 'subject reference', style: 'style reference', composition: 'composition reference', color: 'color reference' };
  const labels = language === 'zh' ? zhLabels : enLabels;
  const lines = references.map((node, index) => {
    const canvasName = String(node?.name || node?.autoName || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (index === 0) {
      return language === 'zh'
        ? `母版 / 参考图1 / 图1 = 输入图1${canvasName ? `（画布名：${canvasName}）` : ''}：唯一编辑对象；未明确要求修改的内容必须保留。`
        : `Master / Reference 1 / Image 1 = input image 1${canvasName ? ` (canvas name: ${canvasName})` : ''}: the only image to edit; preserve everything not explicitly requested to change.`;
    }
    const referenceNumber = index + 1;
    const role = labels[node.referenceRole || 'general'] || labels.general;
    return language === 'zh'
      ? `参考图${referenceNumber} / 图${referenceNumber} = 输入图${referenceNumber}${canvasName ? `（画布名：${canvasName}）` : ''}：${role}；只提取用户指定的信息，不替换母版主体。`
      : `Reference ${referenceNumber} / Image ${referenceNumber} = input image ${referenceNumber}${canvasName ? ` (canvas name: ${canvasName})` : ''}: ${role}; use only the requested information and do not replace the master subject.`;
  });
  const composed = language === 'zh'
    ? `图片称呼与输入顺序：\n${lines.join('\n')}\n解释规则：用户提示词中的“母版”“参考图N”与“图N”严格按同一编号映射理解；画布文件名只用于识别，不改变图片角色。\n\n用户修改要求：${base}`
    : `Image names and input order:\n${lines.join('\n')}\nInterpretation rule: “Master”, “Reference N”, and “Image N” strictly follow the same numbered mapping above. Canvas filenames are identifiers only and never change image roles.\n\nUser edit request: ${base}`;
  return composed.slice(0, 6000);
}

export function replaceCanvasTaskForRetry(nodes = [], nodeId, task = {}) {
  return nodes.map((node) => node.id === nodeId ? {
    ...node,
    taskId: String(task.id || node.taskId || ''),
    status: String(task.status || 'queued'),
    error: '',
    referenceNodeIds: Array.isArray(task.canvasReferenceNodeIds) ? task.canvasReferenceNodeIds.map(String).slice(0, 9) : node.referenceNodeIds || []
  } : node);
}

export function canvasNodeBounds(nodes = []) {
  const normalized = normalizeCanvasState({ nodes }).nodes;
  if (!normalized.length) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const left = Math.min(...normalized.map((node) => node.x));
  const top = Math.min(...normalized.map((node) => node.y));
  const right = Math.max(...normalized.map((node) => node.x + Number(node.cardWidth || INFINITE_CANVAS_NODE_WIDTH)));
  const bottom = Math.max(...normalized.map((node) => node.y + Number(node.cardHeight || INFINITE_CANVAS_NODE_HEIGHT)));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function viewportForCanvasNodes(nodes, stageWidth, stageHeight, { padding = 80, minZoom = 0.35, maxZoom = 1.2 } = {}) {
  const bounds = canvasNodeBounds(nodes);
  if (!bounds.width || !bounds.height) return { x: 80, y: 70, zoom: 1 };
  const usableWidth = Math.max(100, Number(stageWidth || 0) - padding * 2);
  const usableHeight = Math.max(100, Number(stageHeight || 0) - padding * 2);
  const zoom = Math.max(minZoom, Math.min(maxZoom, usableWidth / bounds.width, usableHeight / bounds.height));
  return {
    zoom,
    x: (Number(stageWidth || 0) - bounds.width * zoom) / 2 - bounds.left * zoom,
    y: (Number(stageHeight || 0) - bounds.height * zoom) / 2 - bounds.top * zoom
  };
}

export function arrangeCanvasNodes(nodes = []) {
  const normalized = normalizeCanvasState({ nodes }).nodes;
  const ids = new Set(normalized.map((node) => node.id));
  const depthMemo = new Map();
  function depthOf(node, trail = new Set()) {
    if (depthMemo.has(node.id)) return depthMemo.get(node.id);
    if (!node.parentId || !ids.has(node.parentId) || trail.has(node.id)) return 0;
    const parent = normalized.find((item) => item.id === node.parentId);
    const nextTrail = new Set(trail).add(node.id);
    const depth = parent ? Math.min(8, depthOf(parent, nextTrail) + 1) : 0;
    depthMemo.set(node.id, depth);
    return depth;
  }
  const columns = new Map();
  for (const node of normalized) {
    const depth = depthOf(node);
    if (!columns.has(depth)) columns.set(depth, []);
    columns.get(depth).push(node);
  }
  const positions = new Map();
  for (const [depth, column] of [...columns.entries()].sort(([left], [right]) => left - right)) {
    column
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
      .forEach((node, index) => {
        positions.set(node.id, { x: 120 + depth * 370, y: 110 + index * 320 });
      });
  }
  return normalized.map((node) => node.locked
    ? { ...node }
    : { ...node, ...positions.get(node.id) });
}

export function canvasMovableNodeIds(nodes = [], selectedIds = []) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return [...new Set(selectedIds.map(String))].filter((id) => nodeById.has(id) && !nodeById.get(id).locked);
}

export function setCanvasNodesLocked(nodes = [], selectedIds = [], locked = true) {
  const selected = new Set(selectedIds.map(String));
  if (!selected.size) return nodes;
  const nextLocked = Boolean(locked);
  return nodes.map((node) => selected.has(node.id) ? { ...node, locked: nextLocked } : node);
}

export function canvasConnectorPath(parent, child) {
  const startX = Number(parent?.x || 0) + INFINITE_CANVAS_NODE_WIDTH;
  const startY = Number(parent?.y || 0) + INFINITE_CANVAS_NODE_HEIGHT / 2;
  const endX = Number(child?.x || 0);
  const endY = Number(child?.y || 0) + INFINITE_CANVAS_NODE_HEIGHT / 2;
  const bend = Math.max(70, Math.abs(endX - startX) * 0.42);
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
}

export function canvasConnectorMidpoint(parent, child) {
  const startX = Number(parent?.x || 0) + INFINITE_CANVAS_NODE_WIDTH;
  const startY = Number(parent?.y || 0) + INFINITE_CANVAS_NODE_HEIGHT / 2;
  const endX = Number(child?.x || 0);
  const endY = Number(child?.y || 0) + INFINITE_CANVAS_NODE_HEIGHT / 2;
  return {
    x: (startX + endX) / 2,
    y: (startY + endY) / 2
  };
}

export function canvasReferenceConnectorPath(source, target) {
  const sourceCenterX = Number(source?.x || 0) + INFINITE_CANVAS_NODE_WIDTH / 2;
  const targetCenterX = Number(target?.x || 0) + INFINITE_CANVAS_NODE_WIDTH / 2;
  const sourceY = Number(source?.y || 0) + INFINITE_CANVAS_NODE_HEIGHT / 2;
  const targetY = Number(target?.y || 0) + INFINITE_CANVAS_NODE_HEIGHT / 2;
  const leftToRight = sourceCenterX <= targetCenterX;
  const startX = Number(source?.x || 0) + (leftToRight ? INFINITE_CANVAS_NODE_WIDTH : 0);
  const endX = Number(target?.x || 0) + (leftToRight ? 0 : INFINITE_CANVAS_NODE_WIDTH);
  const direction = leftToRight ? 1 : -1;
  const bend = Math.max(64, Math.abs(endX - startX) * 0.38);
  return `M ${startX} ${sourceY} C ${startX + bend * direction} ${sourceY}, ${endX - bend * direction} ${targetY}, ${endX} ${targetY}`;
}

export function canvasReferenceConnectorMidpoint(source, target) {
  const sourceCenterX = Number(source?.x || 0) + INFINITE_CANVAS_NODE_WIDTH / 2;
  const targetCenterX = Number(target?.x || 0) + INFINITE_CANVAS_NODE_WIDTH / 2;
  const sourceY = Number(source?.y || 0) + INFINITE_CANVAS_NODE_HEIGHT / 2;
  const targetY = Number(target?.y || 0) + INFINITE_CANVAS_NODE_HEIGHT / 2;
  const leftToRight = sourceCenterX <= targetCenterX;
  const startX = Number(source?.x || 0) + (leftToRight ? INFINITE_CANVAS_NODE_WIDTH : 0);
  const endX = Number(target?.x || 0) + (leftToRight ? 0 : INFINITE_CANVAS_NODE_WIDTH);
  return {
    x: (startX + endX) / 2,
    y: (sourceY + targetY) / 2
  };
}
