import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-infinite-canvas-api-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.SESSION_SECRET = 'infinite-canvas-api-test';

const localDb = await import('../api/_lib/local-db.js');
const { default: projectsHandler } = await import('../api/infinite-canvas/projects.js');
const { default: projectHandler } = await import('../api/infinite-canvas/project.js');

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, req = {}) {
  let statusCode = 200;
  let payload;
  const headers = new Map();
  const res = {
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, ...req }, res))
    .then(() => ({ statusCode, payload, headers }));
}

function authFixture(label) {
  const user = localDb.createUser({ email: `${label}@example.com`, password: 'testing-1234', fullName: label });
  const session = localDb.createSession(user.id);
  return { user, headers: { authorization: `Bearer ${session.token}` } };
}

function generation(userId, id) {
  localDb.getDb().prepare(`
    INSERT INTO generations (id, user_id, prompt, model, size, quality, provider, status, storage_path, created_at)
    VALUES (?, ?, 'api canvas test', 'test-image-model', '1024x1024', 'low', 'test', 'succeeded', ?, ?)
  `).run(id, userId, `${userId}/${id}.png`, new Date().toISOString());
}

test('IC-AT-001 project API creates, saves, and reloads canvas state', async () => {
  const owner = authFixture('canvas-api-owner');
  generation(owner.user.id, 'api-gen');
  const created = await invoke(projectsHandler, { method: 'POST', headers: owner.headers, body: { name: 'API 画布' } });
  assert.equal(created.statusCode, 201);
  const project = created.payload.project;

  const updated = await invoke(projectHandler, {
    method: 'PATCH',
    headers: owner.headers,
    body: {
      projectId: project.id,
      revision: project.revision,
      name: 'API 已保存画布',
      viewport: { x: -300, y: 40, zoom: 0.8 },
      nodes: [...project.nodes, { id: 'api-image', type: 'image', x: 600, y: 120, generationId: 'api-gen', imageUrl: '/api/generated?id=api-gen' }]
    }
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.payload.project.revision, 2);

  const loaded = await invoke(projectHandler, { method: 'GET', headers: owner.headers, query: { id: project.id } });
  assert.equal(loaded.statusCode, 200);
  assert.equal(loaded.payload.project.name, 'API 已保存画布');
  assert.equal(loaded.payload.project.nodes.length, 2);
  assert.equal(loaded.payload.project.viewport.zoom, 0.8);
});

test('IC-AT-005 project API reports revision conflicts with the latest project', async () => {
  const owner = authFixture('canvas-api-conflict');
  const created = await invoke(projectsHandler, { method: 'POST', headers: owner.headers, body: { name: '冲突画布' } });
  const project = created.payload.project;
  const first = await invoke(projectHandler, {
    method: 'PATCH', headers: owner.headers,
    body: { projectId: project.id, revision: project.revision, name: '新版本', nodes: project.nodes }
  });
  assert.equal(first.statusCode, 200);
  const stale = await invoke(projectHandler, {
    method: 'PATCH', headers: owner.headers,
    body: { projectId: project.id, revision: project.revision, name: '旧版本', nodes: project.nodes }
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.payload.error, 'CANVAS_REVISION_CONFLICT');
  assert.equal(stale.payload.project.name, '新版本');
});

test('IC-AT-020 canvas API enforces owner isolation', async () => {
  const owner = authFixture('canvas-api-private-owner');
  const stranger = authFixture('canvas-api-private-stranger');
  const created = await invoke(projectsHandler, { method: 'POST', headers: owner.headers, body: { name: '私有项目' } });
  const response = await invoke(projectHandler, { method: 'GET', headers: stranger.headers, query: { id: created.payload.project.id } });
  assert.equal(response.statusCode, 404);
  assert.equal(response.payload.error, 'CANVAS_PROJECT_NOT_FOUND');
});

test('canvas API copies a project without reusing node ids', async () => {
  const owner = authFixture('canvas-api-copy');
  const created = await invoke(projectsHandler, { method: 'POST', headers: owner.headers, body: { name: '复制来源' } });
  const copied = await invoke(projectsHandler, {
    method: 'POST',
    headers: owner.headers,
    body: { sourceProjectId: created.payload.project.id, name: '复制结果' }
  });
  assert.equal(copied.statusCode, 201);
  assert.equal(copied.payload.project.name, '复制结果');
  assert.notEqual(copied.payload.project.id, created.payload.project.id);
  assert.notEqual(copied.payload.project.nodes[0].id, created.payload.project.nodes[0].id);
});

test('canvas API exposes user-owned trash and restores a deleted project', async () => {
  const owner = authFixture('canvas-api-trash');
  const created = await invoke(projectsHandler, { method: 'POST', headers: owner.headers, body: { name: '待恢复项目' } });
  const project = created.payload.project;
  const deleted = await invoke(projectHandler, {
    method: 'DELETE', headers: owner.headers,
    body: { projectId: project.id, revision: project.revision }
  });
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.payload.project.status, 'deleted');

  const ordinaryList = await invoke(projectsHandler, { method: 'GET', headers: owner.headers, query: { archived: '1' } });
  assert.equal(ordinaryList.payload.projects.length, 0);
  const trashList = await invoke(projectsHandler, { method: 'GET', headers: owner.headers, query: { deleted: '1' } });
  assert.equal(trashList.payload.projects[0].status, 'deleted');
  const trashed = await invoke(projectHandler, { method: 'GET', headers: owner.headers, query: { id: project.id, deleted: '1' } });
  assert.equal(trashed.statusCode, 200);

  const restored = await invoke(projectHandler, {
    method: 'PATCH', headers: owner.headers,
    body: {
      projectId: project.id,
      revision: deleted.payload.project.revision,
      status: 'active',
      nodes: trashed.payload.project.nodes
    }
  });
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.payload.project.status, 'active');
});

test('canvas API permanently deletes only projects already in the trash', async () => {
  const owner = authFixture('canvas-api-permanent-delete');
  const created = await invoke(projectsHandler, { method: 'POST', headers: owner.headers, body: { name: '彻底删除项目' } });
  const project = created.payload.project;
  const tooEarly = await invoke(projectHandler, {
    method: 'DELETE', headers: owner.headers,
    body: { projectId: project.id, revision: project.revision, permanent: true }
  });
  assert.equal(tooEarly.statusCode, 409);
  assert.equal(tooEarly.payload.error, 'CANVAS_PROJECT_NOT_TRASHED');

  const trashed = await invoke(projectHandler, {
    method: 'DELETE', headers: owner.headers,
    body: { projectId: project.id, revision: project.revision }
  });
  const removed = await invoke(projectHandler, {
    method: 'DELETE', headers: owner.headers,
    body: { projectId: project.id, revision: trashed.payload.project.revision, permanent: true }
  });
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.payload.permanent, true);
  const missing = await invoke(projectHandler, { method: 'GET', headers: owner.headers, query: { id: project.id, deleted: '1' } });
  assert.equal(missing.statusCode, 404);
});
