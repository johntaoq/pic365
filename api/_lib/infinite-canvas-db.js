import { randomUUID } from 'node:crypto';

import { getDb } from './local-db.js';

export const MAX_INFINITE_CANVAS_NODES = 500;
const NODE_TYPES = new Set(['idea', 'image', 'video', 'task', 'group']);
const PROJECT_STATUSES = new Set(['active', 'archived', 'deleted']);
const MAX_COORDINATE = 1_000_000;

function now() {
  return new Date().toISOString();
}

function cleanText(value, maxLength = 6000) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanId(value) {
  return cleanText(value, 160);
}

function finiteNumber(value, fallback = 0, min = -MAX_COORDINATE, max = MAX_COORDINATE) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeViewport(value = {}) {
  return {
    x: finiteNumber(value.x, 80),
    y: finiteNumber(value.y, 70),
    zoom: finiteNumber(value.zoom, 1, 0.2, 3)
  };
}

function safeUrl(value) {
  const url = String(value || '').trim().slice(0, 4000);
  if (!url || /^data:/i.test(url) || /^javascript:/i.test(url)) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return '';
}

function nodeMetadata(node = {}) {
  return {
    name: cleanText(node.name, 80),
    autoName: cleanText(node.autoName, 80),
    pipelineCode: cleanText(node.pipelineCode, 8),
    pipelineDepth: Math.max(0, Math.round(finiteNumber(node.pipelineDepth, 0, 0, 10_000))),
    copyIndex: Math.max(0, Math.round(finiteNumber(node.copyIndex, 0, 0, 10_000))),
    imageUrl: safeUrl(node.imageUrl),
    thumbnailUrl: safeUrl(node.thumbnailUrl),
    videoUrl: safeUrl(node.videoUrl),
    posterUrl: safeUrl(node.posterUrl),
    downloadUrl: safeUrl(node.downloadUrl),
    mediaType: node.mediaType === 'video' ? 'video' : node.mediaType === 'image' ? 'image' : '',
    videoGenerationId: cleanId(node.videoGenerationId),
    mimeType: cleanText(node.mimeType, 120),
    size: cleanText(node.size, 40),
    quality: cleanText(node.quality, 30),
    count: Math.max(1, Math.min(4, Math.round(finiteNumber(node.count, 1, 1, 4)))),
    providerId: cleanId(node.providerId),
    status: cleanText(node.status, 40),
    phase: cleanText(node.phase, 40),
    progress: Math.max(0, Math.min(100, Math.round(finiteNumber(node.progress, 0, 0, 100)))),
    seconds: Math.max(0, Math.min(60, Math.round(finiteNumber(node.seconds, 0, 0, 60)))),
    hasAudio: node.hasAudio == null ? null : Boolean(node.hasAudio),
    error: cleanText(node.error, 160),
    width: Math.max(0, Math.round(finiteNumber(node.width, 0, 0, 100_000))),
    height: Math.max(0, Math.round(finiteNumber(node.height, 0, 0, 100_000))),
    downloadAllowed: Boolean(node.downloadAllowed),
    cloudSaved: Boolean(node.cloudSaved),
    referenceRole: ['general', 'subject', 'style', 'composition', 'color'].includes(node.referenceRole) ? node.referenceRole : '',
    referenceOrder: Math.max(0, Math.round(finiteNumber(node.referenceOrder, 0, 0, 1000))),
    referenceLinks: Array.isArray(node.referenceLinks) ? node.referenceLinks.slice(0, 9).map((link, index) => ({
      nodeId: cleanId(link?.nodeId),
      role: ['general', 'subject', 'style', 'composition', 'color'].includes(link?.role) ? link.role : 'general',
      order: Math.max(1, Math.round(finiteNumber(link?.order, index + 1, 1, 1000)))
    })).filter((link) => link.nodeId) : [],
    referenceNodeIds: Array.isArray(node.referenceNodeIds) ? node.referenceNodeIds.map(cleanId).filter(Boolean).slice(0, 9) : [],
    annotations: Array.isArray(node.annotations) ? node.annotations.slice(0, 200) : [],
    draftPrompt: String(node.draftPrompt || '').slice(0, 6000),
    createdAt: cleanText(node.createdAt, 80),
    completedAt: cleanText(node.completedAt, 80),
    batchId: cleanId(node.batchId),
    batchSize: Math.max(1, Math.min(4, Math.round(finiteNumber(node.batchSize, 1, 1, 4)))),
    variantIndex: Math.max(0, Math.min(3, Math.round(finiteNumber(node.variantIndex, 0, 0, 3)))),
    creditsCharged: Math.max(0, finiteNumber(node.creditsCharged, 0, 0, 1_000_000))
  };
}

function normalizeInputNodes(nodes = []) {
  if (!Array.isArray(nodes)) return [];
  if (nodes.length > MAX_INFINITE_CANVAS_NODES) {
    const error = new Error('CANVAS_NODE_LIMIT_EXCEEDED');
    error.code = 'CANVAS_NODE_LIMIT_EXCEEDED';
    throw error;
  }
  const seen = new Set();
  const normalized = nodes.map((node, index) => {
    const id = cleanId(node?.id) || randomUUID();
    if (seen.has(id)) {
      const error = new Error('DUPLICATE_CANVAS_NODE');
      error.code = 'DUPLICATE_CANVAS_NODE';
      throw error;
    }
    seen.add(id);
    const nodeType = NODE_TYPES.has(node?.type) ? node.type : 'idea';
    return {
      id,
      type: nodeType,
      parentId: cleanId(node?.parentId),
      x: finiteNumber(node?.x, 120 + index * 24),
      y: finiteNumber(node?.y, 120 + index * 24),
      cardWidth: finiteNumber(node?.cardWidth, 292, 120, 2000),
      cardHeight: finiteNumber(node?.cardHeight, 270, 80, 2000),
      zIndex: Math.round(finiteNumber(node?.zIndex, index, -10_000, 10_000)),
      title: cleanText(node?.title, 240),
      prompt: String(node?.prompt || '').slice(0, 6000),
      notes: String(node?.notes || '').slice(0, 4000),
      assetId: cleanId(node?.assetId),
      generationId: cleanId(node?.generationId),
      taskId: cleanId(node?.taskId),
      locked: Boolean(node?.locked),
      favorite: Boolean(node?.favorite),
      metadata: nodeMetadata(node)
    };
  });
  const ids = new Set(normalized.map((node) => node.id));
  for (const node of normalized) {
    if (!ids.has(node.parentId) || node.parentId === node.id) node.parentId = '';
    node.metadata.referenceLinks = [...new Map((node.metadata.referenceLinks || [])
      .filter((link) => ids.has(link.nodeId) && link.nodeId !== node.id)
      .map((link) => [link.nodeId, link])).values()]
      .sort((left, right) => left.order - right.order)
      .map((link, index) => ({ ...link, order: index + 1 }));
  }
  return normalized;
}

function normalizeProjectRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    status: row.status || 'active',
    adoptedNodeId: row.adopted_node_id || '',
    viewport: normalizeViewport(parseJson(row.viewport_json, {})),
    revision: Number(row.revision || 1),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    deletedAt: row.deleted_at || ''
  };
}

function normalizeNodeRow(row) {
  if (!row) return null;
  const metadata = parseJson(row.metadata_json, {});
  return {
    id: row.id,
    type: row.node_type,
    parentId: row.parent_node_id || '',
    x: Number(row.x || 0),
    y: Number(row.y || 0),
    cardWidth: Number(row.width || 292),
    cardHeight: Number(row.height || 270),
    zIndex: Number(row.z_index || 0),
    title: row.title || '',
    prompt: row.prompt || '',
    notes: row.notes || '',
    assetId: row.asset_id || '',
    generationId: row.generation_id || '',
    taskId: row.task_id || '',
    locked: Boolean(row.locked),
    favorite: Boolean(row.favorite),
    ...metadata,
    createdAt: metadata.createdAt || row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function projectRows(userId, { includeArchived = false, includeDeleted = false } = {}) {
  const statuses = includeDeleted
    ? "('active', 'archived', 'deleted')"
    : includeArchived ? "('active', 'archived')" : "('active')";
  const deletedClause = includeDeleted ? '' : 'AND project.deleted_at IS NULL';
  return getDb().prepare(`
    SELECT project.*, COUNT(node.id) AS node_count
    FROM infinite_canvas_projects project
    LEFT JOIN infinite_canvas_nodes node ON node.project_id = project.id AND node.deleted_at IS NULL
    WHERE project.user_id = ? AND project.status IN ${statuses} ${deletedClause}
    GROUP BY project.id
    ORDER BY CASE project.status WHEN 'active' THEN 0 WHEN 'archived' THEN 1 ELSE 2 END, project.updated_at DESC, project.id DESC
  `).all(userId);
}

export function listInfiniteCanvasProjects(userId, options = {}) {
  return projectRows(userId, options).map((row) => ({
    ...normalizeProjectRow(row),
    nodeCount: Number(row.node_count || 0)
  }));
}

export function getInfiniteCanvasProject(userId, projectId, { includeDeleted = false } = {}) {
  const row = getDb().prepare(`
    SELECT * FROM infinite_canvas_projects
    WHERE id = ? AND user_id = ? ${includeDeleted ? '' : "AND status != 'deleted' AND deleted_at IS NULL"}
  `).get(projectId, userId);
  if (!row) return null;
  const nodes = getDb().prepare(`
    SELECT * FROM infinite_canvas_nodes
    WHERE project_id = ? AND user_id = ? AND deleted_at IS NULL
    ORDER BY z_index ASC, created_at ASC, id ASC
  `).all(projectId, userId).map(normalizeNodeRow);
  return { ...normalizeProjectRow(row), nodes };
}

function writeNodes(db, userId, projectId, nodes, timestamp) {
  const canAccessAsset = db.prepare(`
    SELECT 1 FROM assets asset
    WHERE asset.id = ? AND asset.deleted_at IS NULL AND (
      asset.owner_user_id = ?
      OR EXISTS (
        SELECT 1 FROM asset_permissions permission
        WHERE permission.asset_id = asset.id
          AND permission.principal_type = 'user'
          AND permission.principal_id = ?
      )
      OR EXISTS (
        SELECT 1 FROM asset_permissions permission
        JOIN team_members member ON member.team_id = permission.principal_id
        WHERE permission.asset_id = asset.id
          AND permission.principal_type = 'team'
          AND member.user_id = ?
      )
    )
  `);
  const ownsGeneration = db.prepare('SELECT 1 FROM generations WHERE id = ? AND user_id = ?');
  const ownsTask = db.prepare(`
    SELECT 1 FROM free_generation_tasks WHERE id = ? AND user_id = ?
    UNION ALL
    SELECT 1 FROM video_generation_tasks WHERE id = ? AND user_id = ?
    LIMIT 1
  `);
  for (const node of nodes) {
    const assetAllowed = !node.assetId || canAccessAsset.get(node.assetId, userId, userId, userId);
    const generationAllowed = !node.generationId || ownsGeneration.get(node.generationId, userId);
    const taskAllowed = !node.taskId || ownsTask.get(node.taskId, userId, node.taskId, userId);
    if (!assetAllowed || !generationAllowed || !taskAllowed) {
      const error = new Error('CANVAS_NODE_RESOURCE_FORBIDDEN');
      error.code = 'CANVAS_NODE_RESOURCE_FORBIDDEN';
      throw error;
    }
  }
  const existingRows = db.prepare(`
    SELECT id, node_type, task_id, created_at FROM infinite_canvas_nodes WHERE project_id = ? AND user_id = ?
  `).all(projectId, userId);
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const incomingIds = new Set(nodes.map((node) => node.id));
  const upsert = db.prepare(`
    INSERT INTO infinite_canvas_nodes
      (id, project_id, user_id, node_type, parent_node_id, x, y, width, height, z_index,
       title, prompt, notes, asset_id, generation_id, task_id, locked, favorite, metadata_json,
       created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET
      node_type = excluded.node_type,
      parent_node_id = excluded.parent_node_id,
      x = excluded.x,
      y = excluded.y,
      width = excluded.width,
      height = excluded.height,
      z_index = excluded.z_index,
      title = excluded.title,
      prompt = excluded.prompt,
      notes = excluded.notes,
      asset_id = excluded.asset_id,
      generation_id = excluded.generation_id,
      task_id = excluded.task_id,
      locked = excluded.locked,
      favorite = excluded.favorite,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at,
      deleted_at = NULL
  `);
  for (const node of nodes) {
    upsert.run(
      node.id,
      projectId,
      userId,
      node.type,
      node.parentId || null,
      node.x,
      node.y,
      node.cardWidth,
      node.cardHeight,
      node.zIndex,
      node.title,
      node.prompt,
      node.notes,
      node.assetId || null,
      node.generationId || null,
      node.taskId || null,
      node.locked ? 1 : 0,
      node.favorite ? 1 : 0,
      JSON.stringify(node.metadata),
      existingById.get(node.id)?.created_at || timestamp,
      timestamp
    );
  }
  const markDeleted = db.prepare(`
    UPDATE infinite_canvas_nodes SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND project_id = ? AND user_id = ?
  `);
  for (const row of existingRows) {
    if (!incomingIds.has(row.id)) {
      markDeleted.run(timestamp, timestamp, row.id, projectId, userId);
      if (row.task_id) {
        db.prepare(`
          UPDATE free_generation_tasks SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND status IN ('completed', 'failed', 'cancelled', 'interrupted')
        `).run(timestamp, timestamp, row.task_id, userId);
        db.prepare(`
          UPDATE video_generation_tasks SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND status IN ('completed', 'failed', 'cancelled')
        `).run(timestamp, timestamp, row.task_id, userId);
      }
    }
  }
  const releaseCompletedTask = db.prepare(`
    UPDATE free_generation_tasks SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND status = 'completed'
  `);
  const releaseCompletedVideoTask = db.prepare(`
    UPDATE video_generation_tasks SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND status = 'completed'
  `);
  for (const node of nodes) {
    if (node.type === 'image' && node.taskId && node.generationId) {
      releaseCompletedTask.run(timestamp, timestamp, node.taskId, userId);
    }
    if (node.type === 'video' && node.taskId && node.assetId) {
      releaseCompletedVideoTask.run(timestamp, timestamp, node.taskId, userId);
    }
  }

  db.prepare('DELETE FROM infinite_canvas_edges WHERE project_id = ?').run(projectId);
  const insertGeneratedEdge = db.prepare(`
    INSERT INTO infinite_canvas_edges
      (id, project_id, source_node_id, target_node_id, relation_type, metadata_json, created_at)
    VALUES (?, ?, ?, ?, 'generated_from', '{}', ?)
  `);
  const insertReferenceEdge = db.prepare(`
    INSERT INTO infinite_canvas_edges
      (id, project_id, source_node_id, target_node_id, relation_type, metadata_json, created_at)
    VALUES (?, ?, ?, ?, 'reference', ?, ?)
  `);
  for (const node of nodes) {
    if (node.parentId) insertGeneratedEdge.run(randomUUID(), projectId, node.parentId, node.id, timestamp);
    for (const link of node.metadata.referenceLinks || []) {
      insertReferenceEdge.run(randomUUID(), projectId, link.nodeId, node.id, JSON.stringify({ role: link.role, order: link.order }), timestamp);
    }
  }
}

export function createInfiniteCanvasProject(userId, values = {}) {
  const db = getDb();
  const id = cleanId(values.id) || randomUUID();
  const timestamp = now();
  const name = cleanText(values.name, 120) || '未命名画布';
  const viewport = normalizeViewport(values.viewport);
  const nodes = normalizeInputNodes(Array.isArray(values.nodes) && values.nodes.length ? values.nodes : [{
    id: `idea-${randomUUID()}`,
    type: 'idea',
    x: 150,
    y: 170,
    prompt: ''
  }]);
  const adoptedNodeId = cleanId(values.adoptedNodeId);
  const validAdoptedNodeId = nodes.some((node) => node.id === adoptedNodeId && node.type === 'image') ? adoptedNodeId : '';
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO infinite_canvas_projects
        (id, user_id, name, status, adopted_node_id, viewport_json, revision, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, 1, ?, ?)
    `).run(id, userId, name, validAdoptedNodeId || null, JSON.stringify(viewport), timestamp, timestamp);
    writeNodes(db, userId, id, nodes, timestamp);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getInfiniteCanvasProject(userId, id);
}

export function copyInfiniteCanvasProject(userId, sourceProjectId, { name = '' } = {}) {
  const source = getInfiniteCanvasProject(userId, sourceProjectId);
  if (!source) return null;
  const copyableNodes = source.nodes.filter((node) => node.type !== 'task');
  const idMap = new Map(copyableNodes.map((node) => [node.id, randomUUID()]));
  const nodes = copyableNodes.map((node) => ({
    ...node,
    id: idMap.get(node.id),
    parentId: idMap.get(node.parentId) || '',
    referenceLinks: (node.referenceLinks || []).map((link) => ({ ...link, nodeId: idMap.get(link.nodeId) || '' })).filter((link) => link.nodeId),
    taskId: '',
    x: Number(node.x || 0) + 24,
    y: Number(node.y || 0) + 24,
    createdAt: now()
  }));
  return createInfiniteCanvasProject(userId, {
    name: cleanText(name, 120) || `${source.name} 副本`,
    viewport: source.viewport,
    nodes,
    adoptedNodeId: idMap.get(source.adoptedNodeId) || ''
  });
}

export function updateInfiniteCanvasProject(userId, projectId, values = {}) {
  const db = getDb();
  const current = getInfiniteCanvasProject(userId, projectId, { includeDeleted: true });
  if (!current) return null;
  const expectedRevision = Math.max(1, Math.round(Number(values.revision) || 0));
  if (expectedRevision !== current.revision) {
    return { conflict: true, project: current };
  }
  const timestamp = now();
  const nodes = Object.prototype.hasOwnProperty.call(values, 'nodes')
    ? normalizeInputNodes(values.nodes)
    : current.nodes;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adoptedNodeId = cleanId(values.adoptedNodeId ?? current.adoptedNodeId);
  const validAdoptedNodeId = nodeIds.has(adoptedNodeId)
    && nodes.some((node) => node.id === adoptedNodeId && node.type === 'image')
    ? adoptedNodeId
    : '';
  const status = PROJECT_STATUSES.has(values.status) ? values.status : current.status;
  const deletedAt = status === 'deleted' ? timestamp : null;
  const name = Object.prototype.hasOwnProperty.call(values, 'name')
    ? cleanText(values.name, 120) || '未命名画布'
    : current.name;
  const viewport = normalizeViewport(values.viewport || current.viewport);

  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare(`
      UPDATE infinite_canvas_projects
      SET name = ?, status = ?, adopted_node_id = ?, viewport_json = ?, revision = revision + 1,
        updated_at = ?, deleted_at = ?
      WHERE id = ? AND user_id = ? AND revision = ?
    `).run(
      name,
      status,
      validAdoptedNodeId || null,
      JSON.stringify(viewport),
      timestamp,
      deletedAt,
      projectId,
      userId,
      expectedRevision
    );
    if (!result.changes) {
      db.exec('ROLLBACK');
      return { conflict: true, project: getInfiniteCanvasProject(userId, projectId) };
    }
    if (status !== 'deleted') writeNodes(db, userId, projectId, nodes, timestamp);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { conflict: false, project: getInfiniteCanvasProject(userId, projectId, { includeDeleted: true }) };
}

export function deleteInfiniteCanvasProject(userId, projectId, revision) {
  return updateInfiniteCanvasProject(userId, projectId, { revision, status: 'deleted' });
}

export function permanentlyDeleteInfiniteCanvasProject(userId, projectId, revision) {
  const db = getDb();
  const current = getInfiniteCanvasProject(userId, projectId, { includeDeleted: true });
  if (!current) return null;
  if (current.status !== 'deleted') {
    const error = new Error('CANVAS_PROJECT_NOT_TRASHED');
    error.code = 'CANVAS_PROJECT_NOT_TRASHED';
    throw error;
  }
  const expectedRevision = Math.max(1, Math.round(Number(revision) || 0));
  if (expectedRevision !== current.revision) return { conflict: true, project: current };
  const result = db.prepare(`
    DELETE FROM infinite_canvas_projects
    WHERE id = ? AND user_id = ? AND status = 'deleted' AND revision = ?
  `).run(projectId, userId, expectedRevision);
  if (!result.changes) return { conflict: true, project: getInfiniteCanvasProject(userId, projectId, { includeDeleted: true }) };
  return { conflict: false, permanent: true, projectId };
}
