import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-infinite-canvas-db-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');

const localDb = await import('../api/_lib/local-db.js');
const canvasDb = await import('../api/_lib/infinite-canvas-db.js');
const queue = await import('../api/_lib/free-generation-queue.js');

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function user(email) {
  return localDb.createUser({ email, password: 'testing-1234', fullName: 'Canvas Test' });
}

function generation(userId, id) {
  localDb.getDb().prepare(`
    INSERT INTO generations (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at)
    VALUES (?, ?, 'canvas test', 'test-image-model', '1024x1024', 'low', 'test', 'succeeded', ?, ?)
  `).run(id, userId, `${userId}/${id}.png`, new Date().toISOString());
}

test('IC-AT-001 canvas projects and nodes persist on the server', () => {
  const owner = user('canvas-persist@example.com');
  generation(owner.id, 'generation-one');
  const created = canvasDb.createInfiniteCanvasProject(owner.id, { name: '第一张创作' });
  assert.equal(created.name, '第一张创作');
  assert.equal(created.revision, 1);
  assert.equal(created.nodes.length, 1);

  const idea = created.nodes[0];
  const saved = canvasDb.updateInfiniteCanvasProject(owner.id, created.id, {
    revision: created.revision,
    viewport: { x: -260, y: 140, zoom: 0.75 },
    nodes: [
      { ...idea, x: -400, y: 80, prompt: '一只在窗边的猫' },
      {
        id: 'result-one',
        type: 'image',
        parentId: idea.id,
        x: 20,
        y: 80,
        prompt: '商业摄影风格',
        generationId: 'generation-one',
        imageUrl: '/api/generated?id=generation-one',
        thumbnailUrl: '/api/generated?id=generation-one&variant=thumbnail'
      }
    ]
  });
  assert.equal(saved.conflict, false);
  assert.equal(saved.project.revision, 2);
  assert.equal(saved.project.nodes.length, 2);
  assert.equal(saved.project.nodes[1].parentId, idea.id);
  assert.deepEqual(saved.project.viewport, { x: -260, y: 140, zoom: 0.75 });

  const restored = canvasDb.getInfiniteCanvasProject(owner.id, created.id);
  assert.equal(restored.nodes[0].prompt, '一只在窗边的猫');
  assert.equal(restored.nodes[1].generationId, 'generation-one');
  assert.equal(canvasDb.listInfiniteCanvasProjects(owner.id)[0].nodeCount, 2);
});

test('IC-AT-005 stale revisions cannot silently overwrite newer canvas data', () => {
  const owner = user('canvas-conflict@example.com');
  const project = canvasDb.createInfiniteCanvasProject(owner.id, { name: '冲突测试' });
  const first = canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
    revision: project.revision,
    name: '新名称',
    nodes: project.nodes
  });
  assert.equal(first.project.revision, 2);

  const stale = canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
    revision: project.revision,
    name: '旧标签页名称',
    nodes: project.nodes
  });
  assert.equal(stale.conflict, true);
  assert.equal(stale.project.name, '新名称');
  assert.equal(stale.project.revision, 2);
});

test('IC-AT-017 adopted versions persist and new branches do not replace them', () => {
  const owner = user('canvas-adopt@example.com');
  generation(owner.id, 'gen-a');
  generation(owner.id, 'gen-b');
  const project = canvasDb.createInfiniteCanvasProject(owner.id, { name: '采用测试' });
  const idea = project.nodes[0];
  const firstImage = { id: 'adopted-image', type: 'image', parentId: idea.id, x: 520, y: 120, generationId: 'gen-a' };
  const adopted = canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
    revision: project.revision,
    adoptedNodeId: firstImage.id,
    nodes: [idea, firstImage]
  });
  assert.equal(adopted.project.adoptedNodeId, firstImage.id);

  const secondImage = { id: 'new-branch', type: 'image', parentId: firstImage.id, x: 890, y: 120, generationId: 'gen-b' };
  const branched = canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
    revision: adopted.project.revision,
    adoptedNodeId: adopted.project.adoptedNodeId,
    nodes: [...adopted.project.nodes, secondImage]
  });
  assert.equal(branched.project.adoptedNodeId, firstImage.id);
});

test('IC-AT-020 users cannot read or modify another users canvas project', () => {
  const owner = user('canvas-owner@example.com');
  const stranger = user('canvas-stranger@example.com');
  const project = canvasDb.createInfiniteCanvasProject(owner.id, { name: '私有画布' });
  assert.equal(canvasDb.getInfiniteCanvasProject(stranger.id, project.id), null);
  assert.equal(canvasDb.updateInfiniteCanvasProject(stranger.id, project.id, { revision: 1, name: '越权修改' }), null);
  assert.equal(canvasDb.listInfiniteCanvasProjects(stranger.id).length, 0);
});

test('canvas storage rejects inline image data and enforces the node limit', () => {
  const owner = user('canvas-validation@example.com');
  const project = canvasDb.createInfiniteCanvasProject(owner.id, {
    nodes: [{ id: 'inline', type: 'image', imageUrl: 'data:image/png;base64,abc', thumbnailUrl: 'javascript:bad' }]
  });
  assert.equal(project.nodes[0].imageUrl, '');
  assert.equal(project.nodes[0].thumbnailUrl, '');
  assert.throws(
    () => canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
      revision: project.revision,
      nodes: Array.from({ length: canvasDb.MAX_INFINITE_CANVAS_NODES + 1 }, (_, index) => ({ id: `node-${index}`, type: 'idea' }))
    }),
    (error) => error?.code === 'CANVAS_NODE_LIMIT_EXCEEDED'
  );
});

test('canvas project copies use new node ids and preserve the adopted branch', () => {
  const owner = user('canvas-copy@example.com');
  generation(owner.id, 'copy-generation');
  const original = canvasDb.createInfiniteCanvasProject(owner.id, {
    name: '原画布',
    nodes: [
      { id: 'copy-root', type: 'idea', prompt: 'root' },
      { id: 'copy-image', type: 'image', parentId: 'copy-root', generationId: 'copy-generation', imageUrl: '/api/generated?id=copy-generation' }
    ],
    adoptedNodeId: 'copy-image'
  });
  const copied = canvasDb.copyInfiniteCanvasProject(owner.id, original.id);
  assert.notEqual(copied.id, original.id);
  assert.equal(copied.name, '原画布 副本');
  assert.equal(copied.nodes.length, 2);
  assert.notEqual(copied.nodes[0].id, original.nodes[0].id);
  assert.equal(copied.nodes[1].parentId, copied.nodes[0].id);
  assert.equal(copied.adoptedNodeId, copied.nodes[1].id);
});

test('canvas rejects image and task references owned by another user', () => {
  const owner = user('canvas-resource-owner@example.com');
  const stranger = user('canvas-resource-stranger@example.com');
  generation(stranger.id, 'stranger-generation');
  const project = canvasDb.createInfiniteCanvasProject(owner.id, { name: '资源隔离' });
  assert.throws(
    () => canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
      revision: project.revision,
      nodes: [...project.nodes, { id: 'foreign-image', type: 'image', generationId: 'stranger-generation' }]
    }),
    (error) => error?.code === 'CANVAS_NODE_RESOURCE_FORBIDDEN'
  );
});

test('completed canvas tasks release queue capacity after the result is saved to the project', () => {
  const owner = user('canvas-task-cleanup@example.com');
  generation(owner.id, 'cleanup-generation');
  const project = canvasDb.createInfiniteCanvasProject(owner.id, { name: '任务清理' });
  const task = queue.createFreeGenerationTask(owner.id, {
    clientTaskId: 'cleanup-task',
    prompt: 'cleanup',
    size: '1024x1024',
    quality: 'low',
    count: 1,
    providerId: 'provider-test',
    references: [],
    canvasProjectId: project.id,
    canvasTaskNodeId: 'cleanup-node'
  });
  queue.completeFreeGenerationTask(owner.id, task.id, {
    status: 'completed',
    result: { images: [{ generationId: 'cleanup-generation', image: '/api/generated?id=cleanup-generation' }] }
  });
  assert.equal(queue.listFreeGenerationTasks(owner.id).length, 1);
  const saved = canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
    revision: project.revision,
    nodes: [...project.nodes, {
      id: 'cleanup-node',
      type: 'image',
      taskId: task.id,
      generationId: 'cleanup-generation',
      imageUrl: '/api/generated?id=cleanup-generation'
    }]
  });
  assert.equal(saved.conflict, false);
  assert.equal(queue.listFreeGenerationTasks(owner.id).length, 0);
});

test('archived canvas projects remain recoverable and sort after active projects', () => {
  const owner = user('canvas-archive@example.com');
  const first = canvasDb.createInfiniteCanvasProject(owner.id, { name: '待归档' });
  const second = canvasDb.createInfiniteCanvasProject(owner.id, { name: '继续使用' });
  const archived = canvasDb.updateInfiniteCanvasProject(owner.id, first.id, {
    revision: first.revision,
    status: 'archived',
    nodes: first.nodes
  });
  assert.equal(archived.project.status, 'archived');
  assert.deepEqual(canvasDb.listInfiniteCanvasProjects(owner.id).map((project) => project.id), [second.id]);
  const withArchived = canvasDb.listInfiniteCanvasProjects(owner.id, { includeArchived: true });
  assert.deepEqual(withArchived.map((project) => project.id), [second.id, first.id]);
  const restored = canvasDb.updateInfiniteCanvasProject(owner.id, first.id, {
    revision: archived.project.revision,
    status: 'active',
    nodes: archived.project.nodes
  });
  assert.equal(restored.project.status, 'active');
});

test('deleted canvas projects remain in the trash and can be restored with their nodes', () => {
  const owner = user('canvas-trash@example.com');
  const project = canvasDb.createInfiniteCanvasProject(owner.id, {
    name: '可恢复画布',
    nodes: [{ id: 'trash-root', type: 'idea', prompt: '保留这个创作思路' }]
  });
  const deleted = canvasDb.deleteInfiniteCanvasProject(owner.id, project.id, project.revision);
  assert.equal(deleted.project.status, 'deleted');
  assert.equal(canvasDb.getInfiniteCanvasProject(owner.id, project.id), null);
  assert.equal(canvasDb.listInfiniteCanvasProjects(owner.id, { includeArchived: true }).length, 0);

  const trash = canvasDb.listInfiniteCanvasProjects(owner.id, { includeDeleted: true });
  assert.equal(trash.length, 1);
  assert.equal(trash[0].status, 'deleted');
  const deletedProject = canvasDb.getInfiniteCanvasProject(owner.id, project.id, { includeDeleted: true });
  assert.equal(deletedProject.nodes[0].prompt, '保留这个创作思路');

  const restored = canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
    revision: deleted.project.revision,
    status: 'active',
    nodes: deletedProject.nodes
  });
  assert.equal(restored.project.status, 'active');
  assert.equal(restored.project.nodes[0].prompt, '保留这个创作思路');
});

test('only trashed canvas projects can be permanently deleted', () => {
  const owner = user('canvas-permanent-delete@example.com');
  const project = canvasDb.createInfiniteCanvasProject(owner.id, {
    name: '永久删除画布',
    nodes: [{ id: 'permanent-root', type: 'idea', prompt: '只删除画布作业' }]
  });
  assert.throws(
    () => canvasDb.permanentlyDeleteInfiniteCanvasProject(owner.id, project.id, project.revision),
    (error) => error?.code === 'CANVAS_PROJECT_NOT_TRASHED'
  );
  const trashed = canvasDb.deleteInfiniteCanvasProject(owner.id, project.id, project.revision);
  const removed = canvasDb.permanentlyDeleteInfiniteCanvasProject(owner.id, project.id, trashed.project.revision);
  assert.equal(removed.permanent, true);
  assert.equal(canvasDb.getInfiniteCanvasProject(owner.id, project.id, { includeDeleted: true }), null);
});

test('multi-result batch metadata persists for canvas choice and comparison', () => {
  const owner = user('canvas-batch@example.com');
  generation(owner.id, 'batch-generation-one');
  generation(owner.id, 'batch-generation-two');
  const project = canvasDb.createInfiniteCanvasProject(owner.id, { name: '多图选择' });
  const saved = canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
    revision: project.revision,
    nodes: [...project.nodes,
      { id: 'batch-one', type: 'image', generationId: 'batch-generation-one', batchId: 'batch-task', batchSize: 2, variantIndex: 0, creditsCharged: 20 },
      { id: 'batch-two', type: 'image', generationId: 'batch-generation-two', batchId: 'batch-task', batchSize: 2, variantIndex: 1, creditsCharged: 20 }
    ]
  });
  const variants = saved.project.nodes.filter((node) => node.batchId === 'batch-task');
  assert.deepEqual(variants.map((node) => [node.batchSize, node.variantIndex]), [[2, 0], [2, 1]]);
  assert.deepEqual(variants.map((node) => node.creditsCharged), [20, 20]);
});

test('canvas reference roles, order, and source node ids persist', () => {
  const owner = user('canvas-reference-metadata@example.com');
  generation(owner.id, 'reference-generation');
  const project = canvasDb.createInfiniteCanvasProject(owner.id, { name: '参考图工作台' });
  const saved = canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
    revision: project.revision,
    nodes: [...project.nodes, {
      id: 'style-reference',
      type: 'image',
      generationId: 'reference-generation',
      referenceNodeIds: ['primary-image', 'style-reference']
    }, {
      id: 'primary-image',
      type: 'image',
      generationId: 'reference-generation',
      name: 'A2-01',
      autoName: 'A2-01',
      pipelineCode: 'A',
      pipelineDepth: 2,
      copyIndex: 1,
      referenceLinks: [{ nodeId: 'style-reference', role: 'style', order: 1 }]
    }]
  });
  const reference = saved.project.nodes.find((node) => node.id === 'style-reference');
  assert.deepEqual(reference.referenceNodeIds, ['primary-image', 'style-reference']);
  const primary = saved.project.nodes.find((node) => node.id === 'primary-image');
  assert.deepEqual(primary.referenceLinks, [{ nodeId: 'style-reference', role: 'style', order: 1 }]);
  assert.deepEqual([primary.name, primary.autoName, primary.pipelineCode, primary.pipelineDepth, primary.copyIndex], ['A2-01', 'A2-01', 'A', 2, 1]);
  const edge = localDb.getDb().prepare(`
    SELECT source_node_id, target_node_id, relation_type, metadata_json
    FROM infinite_canvas_edges
    WHERE project_id = ? AND relation_type = 'reference'
  `).get(project.id);
  assert.equal(edge.source_node_id, 'style-reference');
  assert.equal(edge.target_node_id, 'primary-image');
  assert.deepEqual(JSON.parse(edge.metadata_json), { role: 'style', order: 1 });
});
