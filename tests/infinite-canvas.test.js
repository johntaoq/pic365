import assert from 'node:assert/strict';
import test from 'node:test';

import {
  arrangeCanvasNodes,
  assignCanvasNodeNames,
  canvasBatchResultPlacements,
  canvasReferenceConnectorPath,
  canvasReferenceConnectorMidpoint,
  canvasReferenceEdges,
  canvasReferenceRemovalImpact,
  canvasImageDownloadFilename,
  canvasMovableNodeIds,
  inferCanvasReferenceRole,
  canvasReferencePrompt,
  canvasNodeBounds,
  canvasConnectorPath,
  canvasConnectorMidpoint,
  canvasPipelineLabel,
  clampCanvasZoom,
  clipboardImageFiles,
  isCanvasUiTarget,
  normalizeCanvasState,
  orderedCanvasReferenceNodes,
  removeCanvasReferenceConnection,
  replaceCanvasTaskForRetry,
  setCanvasNodesLocked,
  viewportRightMiddlePosition,
  viewportForCanvasNodes
} from '../shared/infinite-canvas.js';

test('reference roles are inferred from useful visual intent while keeping a safe general fallback', () => {
  assert.equal(inferCanvasReferenceRole({ prompt: '沿用这张图的配色和色板' }), 'color');
  assert.equal(inferCanvasReferenceRole({ name: '俯拍构图参考' }), 'composition');
  assert.equal(inferCanvasReferenceRole({ prompt: '柔和摄影光影与高级材质' }), 'style');
  assert.equal(inferCanvasReferenceRole({ name: '产品主体正面图' }), 'subject');
  assert.equal(inferCanvasReferenceRole({ name: 'reference-01.png' }), 'general');
});

test('canvas gestures start only from the blank canvas surface', () => {
  const control = { closest: (selector) => selector.includes('button') ? {} : null };
  const overlay = { closest: (selector) => selector.includes('[data-canvas-ui="true"]') ? {} : null };
  const blankCanvas = { closest: () => null };
  assert.equal(isCanvasUiTarget(control), true);
  assert.equal(isCanvasUiTarget(overlay), true);
  assert.equal(isCanvasUiTarget(blankCanvas), false);
  assert.equal(isCanvasUiTarget(null), false);
});

test('clipboard images are detected from clipboard items without accepting text', () => {
  const image = { name: 'clipboard.png', type: 'image/png' };
  const files = clipboardImageFiles({
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => image }
    ],
    files: [image]
  });
  assert.deepEqual(files, [image]);
});

test('canvas state rejects invalid nodes and repairs missing parents', () => {
  const state = normalizeCanvasState({
    viewport: { x: '12', y: 9, zoom: 8 },
    nodes: [
      { id: 'root', type: 'idea', x: 20, y: 30 },
      { id: 'child', type: 'image', parentId: 'missing', imageUrl: '/image.png' },
      { id: 'ignored', type: 'unknown' }
    ]
  });
  assert.equal(state.nodes.length, 2);
  assert.equal(state.nodes[1].parentId, '');
  assert.equal(state.viewport.zoom, 1.8);
});

test('canvas pipelines receive stable spreadsheet-style names with level copy suffixes', () => {
  assert.equal(canvasPipelineLabel(0), 'A');
  assert.equal(canvasPipelineLabel(25), 'Z');
  assert.equal(canvasPipelineLabel(26), 'AA');
  assert.equal(canvasPipelineLabel(51), 'AZ');

  const named = assignCanvasNodeNames([
    { id: 'root-a', type: 'image', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'a-level-1', type: 'image', parentId: 'root-a', createdAt: '2026-01-01T00:00:01.000Z' },
    { id: 'a-level-2', type: 'image', parentId: 'a-level-1', createdAt: '2026-01-01T00:00:02.000Z' },
    { id: 'a-level-2-copy', type: 'image', parentId: 'a-level-1', createdAt: '2026-01-01T00:00:03.000Z' },
    { id: 'root-b', type: 'image', createdAt: '2026-01-01T00:00:04.000Z' }
  ]);
  assert.deepEqual(named.map((node) => node.name), ['A', 'A1', 'A2', 'A2-01', 'B']);
  assert.deepEqual(named.map((node) => node.autoName), ['A', 'A1', 'A2', 'A2-01', 'B']);

  const renamed = assignCanvasNodeNames(named.map((node) => node.id === 'a-level-2' ? { ...node, name: '主视觉定稿' } : node));
  assert.equal(renamed.find((node) => node.id === 'a-level-2').name, '主视觉定稿');
  assert.equal(renamed.find((node) => node.id === 'a-level-2').autoName, 'A2');
});

test('automatic canvas layout places child generations to the right', () => {
  const arranged = arrangeCanvasNodes([
    { id: 'root', type: 'idea', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'child', type: 'image', parentId: 'root', createdAt: '2026-01-01T00:00:01.000Z' },
    { id: 'branch', type: 'image', parentId: 'root', createdAt: '2026-01-01T00:00:02.000Z' }
  ]);
  const root = arranged.find((node) => node.id === 'root');
  const child = arranged.find((node) => node.id === 'child');
  const branch = arranged.find((node) => node.id === 'branch');
  assert.ok(child.x > root.x);
  assert.equal(child.x, branch.x);
  assert.ok(branch.y > child.y);
  assert.match(canvasConnectorPath(root, child), /^M /);
  assert.equal(clampCanvasZoom(0), 1);
});

test('generation settings popover is positioned at the generation curve midpoint', () => {
  assert.deepEqual(canvasConnectorMidpoint(
    { x: 100, y: 80 },
    { x: 760, y: 360 }
  ), { x: 576, y: 355 });
});

test('automatic canvas layout preserves locked entity positions', () => {
  const arranged = arrangeCanvasNodes([
    { id: 'locked', type: 'image', x: 777, y: 333, locked: true, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'free', type: 'image', x: 999, y: 999, createdAt: '2026-01-01T00:00:01.000Z' }
  ]);
  assert.deepEqual({ x: arranged[0].x, y: arranged[0].y }, { x: 777, y: 333 });
  assert.notDeepEqual({ x: arranged[1].x, y: arranged[1].y }, { x: 999, y: 999 });
});

test('selection locking and movement apply to every canvas entity type', () => {
  const nodes = [
    { id: 'idea', type: 'idea', locked: false },
    { id: 'image', type: 'image', locked: false },
    { id: 'video', type: 'video', locked: true },
    { id: 'task', type: 'task', locked: false }
  ];
  const selectedIds = nodes.map((node) => node.id);
  assert.deepEqual(canvasMovableNodeIds(nodes, selectedIds), ['idea', 'image', 'task']);

  const locked = setCanvasNodesLocked(nodes, selectedIds, true);
  assert.ok(locked.every((node) => node.locked));
  assert.deepEqual(canvasMovableNodeIds(locked, selectedIds), []);

  const unlocked = setCanvasNodesLocked(locked, selectedIds, false);
  assert.ok(unlocked.every((node) => !node.locked));
  assert.deepEqual(canvasMovableNodeIds(unlocked, selectedIds), selectedIds);
});

test('canvas state keeps persisted task metadata for reload recovery', () => {
  const state = normalizeCanvasState({
    nodes: [{
      id: 'task-one',
      type: 'task',
      taskId: 'queue-one',
      status: 'running',
      providerId: 'provider-one',
      x: -120,
      y: 360
    }]
  });
  assert.equal(state.nodes[0].type, 'task');
  assert.equal(state.nodes[0].taskId, 'queue-one');
  assert.equal(state.nodes[0].status, 'running');
  assert.equal(state.nodes[0].x, -120);
});

test('fit viewport includes nodes placed in negative and positive canvas coordinates', () => {
  const nodes = [
    { id: 'left', type: 'idea', x: -500, y: -120 },
    { id: 'right', type: 'image', x: 900, y: 620 }
  ];
  const bounds = canvasNodeBounds(nodes);
  assert.equal(bounds.left, -500);
  assert.ok(bounds.right > 900);
  const viewport = viewportForCanvasNodes(nodes, 1200, 700);
  assert.ok(viewport.zoom >= 0.35 && viewport.zoom <= 1.2);
  assert.ok(Number.isFinite(viewport.x));
  assert.ok(Number.isFinite(viewport.y));
});

test('make another places a new node inside the current viewport right middle', () => {
  const viewport = { x: -420, y: 90, zoom: 0.75 };
  const position = viewportRightMiddlePosition(viewport, 1280, 720);
  const screenLeft = position.x * viewport.zoom + viewport.x;
  const screenTop = position.y * viewport.zoom + viewport.y;
  assert.ok(screenLeft >= 0);
  assert.ok(screenLeft + 292 * viewport.zoom <= 1280);
  assert.ok(screenTop >= 70);
  assert.ok(screenTop + 270 * viewport.zoom <= 720 - 200);
});

test('multi-result generation creates independent entities connected to the same parent', () => {
  const placements = canvasBatchResultPlacements({ x: 500, y: 180, parentId: 'source-image', count: 4 });
  assert.equal(placements.length, 4);
  assert.equal(new Set(placements.map(({ x, y }) => `${x}:${y}`)).size, 4);
  assert.deepEqual([...new Set(placements.map((item) => item.parentId))], ['source-image']);
  const parent = { id: 'source-image', x: 120, y: 330 };
  placements.forEach((placement, index) => {
    assert.match(canvasConnectorPath(parent, { id: `result-${index}`, ...placement }), /^M /);
  });
});

test('reference tray keeps the primary first and supporting references ordered', () => {
  const nodes = [
    { id: 'style', type: 'image', createdAt: '2026-01-01' },
    { id: 'primary', type: 'image', referenceLinks: [{ nodeId: 'style', role: 'style', order: 2 }, { nodeId: 'subject', role: 'subject', order: 1 }] },
    { id: 'subject', type: 'image', createdAt: '2026-01-02' }
  ];
  const ordered = orderedCanvasReferenceNodes(nodes, 'primary');
  assert.deepEqual(ordered.map((node) => node.id), ['primary', 'subject', 'style']);
  const prompt = canvasReferencePrompt('保留产品并优化画面', ordered.map((node, index) => ({ ...node, isPrimaryReference: index === 0 })), 'zh');
  assert.match(prompt, /母版 \/ 参考图1 \/ 图1 = 输入图1/);
  assert.match(prompt, /参考图2 \/ 图2 = 输入图2.*主体参考/);
  assert.match(prompt, /参考图3 \/ 图3 = 输入图3.*风格参考/);
  assert.match(prompt, /用户修改要求：保留产品并优化画面/);
});

test('reference edges are direct one-hop links and never recurse through another reference', () => {
  const nodes = normalizeCanvasState({ nodes: [
    { id: 'primary', type: 'image', x: 800, y: 200, referenceLinks: [{ nodeId: 'style', role: 'style', order: 1 }] },
    { id: 'style', type: 'image', x: 200, y: 100, referenceLinks: [{ nodeId: 'color', role: 'color', order: 1 }] },
    { id: 'color', type: 'image', x: -400, y: 40 }
  ] }).nodes;
  assert.deepEqual(orderedCanvasReferenceNodes(nodes, 'primary').map((node) => node.id), ['primary', 'style']);
  const edges = canvasReferenceEdges(nodes);
  assert.deepEqual(edges.map((edge) => `${edge.source.id}->${edge.target.id}`).sort(), ['color->style', 'style->primary']);
  assert.match(canvasReferenceConnectorPath(edges[0].source, edges[0].target), /^M /);
});

test('reference delete control is positioned on the reference curve midpoint', () => {
  const source = { x: 100, y: 80 };
  const target = { x: 760, y: 360 };
  assert.deepEqual(canvasReferenceConnectorMidpoint(source, target), {
    x: (100 + 292 + 760) / 2,
    y: (80 + 270 / 2 + 360 + 270 / 2) / 2
  });
});

test('removing a reference connection never removes the generation relationship', () => {
  const nodes = [
    { id: 'generation-parent', type: 'image' },
    { id: 'style', type: 'image' },
    { id: 'color', type: 'image' },
    {
      id: 'target',
      type: 'image',
      parentId: 'generation-parent',
      referenceLinks: [
        { nodeId: 'style', role: 'style', order: 1 },
        { nodeId: 'color', role: 'color', order: 2 }
      ]
    }
  ];
  const updated = removeCanvasReferenceConnection(nodes, 'style', 'target');
  const target = updated.find((node) => node.id === 'target');
  assert.equal(target.parentId, 'generation-parent');
  assert.deepEqual(target.referenceLinks, [{ nodeId: 'color', role: 'color', order: 1 }]);
});

test('reference removal impact distinguishes internal and external relationships', () => {
  const nodes = [
    { id: 'master', type: 'image', referenceLinks: [{ nodeId: 'style', role: 'style', order: 1 }] },
    { id: 'style', type: 'image', referenceLinks: [{ nodeId: 'color', role: 'color', order: 1 }] },
    { id: 'color', type: 'image' }
  ];
  assert.deepEqual(canvasReferenceRemovalImpact(nodes, ['style']), { total: 2, internal: 0, external: 2 });
  assert.deepEqual(canvasReferenceRemovalImpact(nodes, ['master', 'style']), { total: 2, internal: 1, external: 1 });
  assert.deepEqual(canvasReferenceRemovalImpact(nodes, ['color']), { total: 1, internal: 0, external: 1 });
});

test('canvas image downloads use the entity name as a safe filename prefix', () => {
  assert.equal(canvasImageDownloadFilename({ name: 'B1-主视觉', mimeType: 'image/webp' }, 'zh'), 'B1-主视觉-原图.webp');
  assert.equal(canvasImageDownloadFilename({ autoName: 'A/2:*', imageUrl: '/asset/output.jpeg?token=masked' }, 'en'), 'A-2-original.jpg');
});

test('retry replaces the failed task data without creating another canvas node', () => {
  const nodes = [{ id: 'retry-node', type: 'task', taskId: 'old-task', status: 'failed', error: 'UPSTREAM_FAILED', x: 620, y: 240 }];
  const retried = replaceCanvasTaskForRetry(nodes, 'retry-node', { id: 'new-task', status: 'queued', canvasReferenceNodeIds: ['primary'] });
  assert.equal(retried.length, 1);
  assert.equal(retried[0].id, 'retry-node');
  assert.equal(retried[0].taskId, 'new-task');
  assert.equal(retried[0].status, 'queued');
  assert.equal(retried[0].x, 620);
  assert.equal(retried[0].y, 240);
  assert.deepEqual(retried[0].referenceNodeIds, ['primary']);
});
