import { randomUUID } from 'node:crypto';
import { getDb } from './local-db.js';
import {
  DELIVERY_FORMATS,
  DELIVERY_LAYOUTS,
  DELIVERY_THEMES,
  DELIVERY_TYPES,
  normalizeDeliveryAdvanced,
  normalizeDeliveryContent
} from '../../shared/ecommerce-delivery.js';

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function booleanValue(value, fallback = false) {
  if (value == null) return fallback;
  return Boolean(value);
}

export function normalizeDeliveryDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    slotId: row.slot_id,
    sourceGenerationId: row.source_generation_id || '',
    documentType: row.document_type || 'benefit',
    targetWidth: Number(row.target_width || 1024),
    targetHeight: Number(row.target_height || 1024),
    outputFormat: row.output_format || 'png',
    themeId: row.theme_id || 'minimal-light',
    layoutId: row.layout_id || 'bottom-left',
    safeArea: Number(row.safe_area ?? 1) === 1,
    includeInExport: Number(row.include_in_export ?? 1) === 1,
    moduleOrder: Number(row.module_order || 0),
    content: normalizeDeliveryContent(parseJson(row.content_json, {})),
    advanced: normalizeDeliveryAdvanced(parseJson(row.advanced_json, {})),
    validation: parseJson(row.validation_json, {}),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function listEcommerceDeliveryDocuments(userId, projectId) {
  return getDb().prepare(`
    SELECT * FROM ecommerce_delivery_documents
    WHERE user_id = ? AND project_id = ?
    ORDER BY module_order ASC, created_at ASC
  `).all(userId, projectId).map(normalizeDeliveryDocument);
}

export function getEcommerceDeliveryDocument(userId, documentId) {
  return normalizeDeliveryDocument(getDb().prepare(`
    SELECT * FROM ecommerce_delivery_documents WHERE id = ? AND user_id = ?
  `).get(documentId, userId));
}

export function getEcommerceDeliveryDocumentBySlot(userId, projectId, slotId) {
  return normalizeDeliveryDocument(getDb().prepare(`
    SELECT * FROM ecommerce_delivery_documents
    WHERE user_id = ? AND project_id = ? AND slot_id = ?
  `).get(userId, projectId, slotId));
}

export function createEcommerceDeliveryDocument(userId, draft) {
  const id = randomUUID();
  const timestamp = now();
  getDb().prepare(`
    INSERT INTO ecommerce_delivery_documents (
      id, project_id, user_id, slot_id, source_generation_id, document_type,
      target_width, target_height, output_format, theme_id, layout_id, safe_area,
      include_in_export, module_order, content_json, advanced_json, validation_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
  `).run(
    id,
    draft.projectId,
    userId,
    draft.slotId,
    draft.sourceGenerationId || null,
    draft.documentType,
    Number(draft.targetWidth || 1024),
    Number(draft.targetHeight || 1024),
    draft.outputFormat || 'png',
    draft.themeId || 'minimal-light',
    draft.layoutId || 'bottom-left',
    draft.safeArea === false ? 0 : 1,
    draft.includeInExport === false ? 0 : 1,
    Number(draft.moduleOrder || 0),
    JSON.stringify(normalizeDeliveryContent(draft.content)),
    JSON.stringify(normalizeDeliveryAdvanced(draft.advanced)),
    timestamp,
    timestamp
  );
  return getEcommerceDeliveryDocument(userId, id);
}

export function syncEcommerceDeliveryDocument(userId, draft) {
  const existing = getEcommerceDeliveryDocumentBySlot(userId, draft.projectId, draft.slotId);
  if (!existing) return createEcommerceDeliveryDocument(userId, draft);
  const nextSource = draft.sourceGenerationId || existing.sourceGenerationId;
  if (nextSource !== existing.sourceGenerationId) {
    getDb().prepare(`
      UPDATE ecommerce_delivery_documents
      SET source_generation_id = ?, validation_json = '{}', updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(nextSource || null, now(), existing.id, userId);
  }
  return getEcommerceDeliveryDocument(userId, existing.id);
}

export function updateEcommerceDeliveryDocument(userId, documentId, values) {
  const existing = getEcommerceDeliveryDocument(userId, documentId);
  if (!existing) return null;
  const typeIds = new Set(DELIVERY_TYPES.map((item) => item.id));
  const themeIds = new Set(DELIVERY_THEMES.map((item) => item.id));
  const layoutIds = new Set(DELIVERY_LAYOUTS.map((item) => item.id));
  const documentType = typeIds.has(values.documentType) ? values.documentType : existing.documentType;
  const outputFormat = DELIVERY_FORMATS.includes(values.outputFormat) ? values.outputFormat : existing.outputFormat;
  const themeId = themeIds.has(values.themeId) ? values.themeId : existing.themeId;
  const layoutId = layoutIds.has(values.layoutId) ? values.layoutId : existing.layoutId;
  const targetWidth = Math.max(320, Math.min(4096, Math.round(Number(values.targetWidth) || existing.targetWidth)));
  const targetHeight = Math.max(320, Math.min(4096, Math.round(Number(values.targetHeight) || existing.targetHeight)));
  const sourceGenerationId = values.sourceGenerationId || existing.sourceGenerationId || null;
  const safeArea = booleanValue(values.safeArea, existing.safeArea);
  const includeInExport = booleanValue(values.includeInExport, existing.includeInExport);
  const content = normalizeDeliveryContent(values.content ?? existing.content);
  const advanced = normalizeDeliveryAdvanced(values.advanced ?? existing.advanced);
  const validationAdvanced = ({ showSafeArea: _previewOnly, ...rest }) => rest;
  const validationChanged = sourceGenerationId !== (existing.sourceGenerationId || null)
    || documentType !== existing.documentType
    || targetWidth !== existing.targetWidth
    || targetHeight !== existing.targetHeight
    || outputFormat !== existing.outputFormat
    || themeId !== existing.themeId
    || layoutId !== existing.layoutId
    || safeArea !== existing.safeArea
    || JSON.stringify(content) !== JSON.stringify(existing.content)
    || JSON.stringify(validationAdvanced(advanced)) !== JSON.stringify(validationAdvanced(existing.advanced));
  getDb().prepare(`
    UPDATE ecommerce_delivery_documents SET
      source_generation_id = ?, document_type = ?, target_width = ?, target_height = ?,
      output_format = ?, theme_id = ?, layout_id = ?, safe_area = ?, include_in_export = ?,
      content_json = ?, advanced_json = ?, validation_json = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    sourceGenerationId,
    documentType,
    targetWidth,
    targetHeight,
    outputFormat,
    themeId,
    layoutId,
    safeArea ? 1 : 0,
    includeInExport ? 1 : 0,
    JSON.stringify(content),
    JSON.stringify(advanced),
    JSON.stringify(validationChanged ? {} : existing.validation),
    now(),
    documentId,
    userId
  );
  return getEcommerceDeliveryDocument(userId, documentId);
}

export function updateEcommerceDeliveryValidation(userId, documentId, validation) {
  const result = getDb().prepare(`
    UPDATE ecommerce_delivery_documents SET validation_json = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(JSON.stringify(validation || {}), now(), documentId, userId);
  return result.changes ? getEcommerceDeliveryDocument(userId, documentId) : null;
}

export function setEcommerceDeliveryDocumentsInclusion(userId, projectId, documentIds, includeInExport) {
  const requested = [...new Set((documentIds || []).map(String).filter(Boolean))];
  if (!requested.length) return false;
  const db = getDb();
  const existing = db.prepare(`
    SELECT id FROM ecommerce_delivery_documents
    WHERE user_id = ? AND project_id = ?
  `).all(userId, projectId).map((row) => row.id);
  if (requested.some((id) => !existing.includes(id))) return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare(`
      UPDATE ecommerce_delivery_documents
      SET include_in_export = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND project_id = ?
    `);
    const timestamp = now();
    requested.forEach((id) => update.run(includeInExport ? 1 : 0, timestamp, id, userId, projectId));
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function reorderEcommerceDeliveryDocuments(userId, projectId, documentIds) {
  const db = getDb();
  const current = db.prepare(`
    SELECT id FROM ecommerce_delivery_documents WHERE user_id = ? AND project_id = ?
  `).all(userId, projectId).map((row) => row.id);
  const requested = [...new Set((documentIds || []).map(String))];
  if (current.length !== requested.length || current.some((id) => !requested.includes(id))) return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare(`
      UPDATE ecommerce_delivery_documents SET module_order = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND project_id = ?
    `);
    const timestamp = now();
    requested.forEach((id, index) => update.run(index + 1, timestamp, id, userId, projectId));
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function normalizeUserTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    description: row.description || '',
    platformId: row.platform_id || '',
    industryId: row.industry_id || '',
    projectConfig: parseJson(row.project_config, {}),
    deliveryConfig: parseJson(row.delivery_config, []),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

export function listEcommerceUserTemplates(userId) {
  return getDb().prepare(`
    SELECT * FROM ecommerce_user_templates WHERE user_id = ? ORDER BY updated_at DESC
  `).all(userId).map(normalizeUserTemplate);
}

export function getEcommerceUserTemplate(userId, templateId) {
  return normalizeUserTemplate(getDb().prepare(`
    SELECT * FROM ecommerce_user_templates WHERE id = ? AND user_id = ?
  `).get(templateId, userId));
}

export function createEcommerceUserTemplate(userId, values) {
  const id = randomUUID();
  const timestamp = now();
  getDb().prepare(`
    INSERT INTO ecommerce_user_templates (
      id, user_id, name, description, platform_id, industry_id,
      project_config, delivery_config, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    String(values.name || '').trim().slice(0, 120),
    String(values.description || '').trim().slice(0, 500),
    values.platformId,
    values.industryId,
    JSON.stringify(values.projectConfig || {}),
    JSON.stringify(values.deliveryConfig || []),
    timestamp,
    timestamp
  );
  return getEcommerceUserTemplate(userId, id);
}

export function deleteEcommerceUserTemplate(userId, templateId) {
  return getDb().prepare(`
    DELETE FROM ecommerce_user_templates WHERE id = ? AND user_id = ?
  `).run(templateId, userId).changes > 0;
}
