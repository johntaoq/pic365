import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-canvas-video-migration-'));
const databasePath = path.join(tempDirectory, 'app.sqlite');

const legacyDb = new DatabaseSync(databasePath);
legacyDb.exec(`
  CREATE TABLE infinite_canvas_nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    node_type TEXT NOT NULL CHECK (node_type IN ('idea', 'image', 'task', 'group')),
    parent_node_id TEXT,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    width REAL NOT NULL DEFAULT 292,
    height REAL NOT NULL DEFAULT 270,
    z_index INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    asset_id TEXT,
    generation_id TEXT,
    task_id TEXT,
    locked INTEGER NOT NULL DEFAULT 0,
    favorite INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
`);
legacyDb.close();

process.env.APP_DB_PATH = databasePath;
const localDb = await import('../api/_lib/local-db.js');
const canvasDb = await import('../api/_lib/infinite-canvas-db.js');

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('legacy canvas node constraint is upgraded before video nodes are saved', () => {
  const schema = String(localDb.getDb().prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'infinite_canvas_nodes'").get()?.sql || '');
  assert.match(schema, /'video'/);

  const owner = localDb.createUser({ email: 'video-migration@example.com', password: 'testing-1234', fullName: 'Video Migration' });
  const project = canvasDb.createInfiniteCanvasProject(owner.id, { name: '迁移后视频画布' });
  const saved = canvasDb.updateInfiniteCanvasProject(owner.id, project.id, {
    revision: project.revision,
    nodes: [
      ...project.nodes,
      {
        id: 'migrated-video-node',
        type: 'video',
        parentId: project.nodes[0].id,
        x: 480,
        y: 120,
        prompt: '迁移后的视频节点',
        videoUrl: '/api/assets/file?id=video-asset&variant=preview',
        seconds: 4,
        size: '1280x720'
      }
    ]
  });

  assert.equal(saved.conflict, false);
  assert.equal(canvasDb.getInfiniteCanvasProject(owner.id, project.id).nodes.some((node) => node.type === 'video'), true);
});
