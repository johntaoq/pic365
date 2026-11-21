import { getDb } from './local-db.js';
import { createUploadedAsset, getAccessibleAsset, listAssets, updateAsset } from './media-assets.js';
import { TRY_ON_MODEL_TAG, isModelPhotoProvider, normalizeAdultModelDefinition } from '../../shared/clothing-try-on.js';

function fail(code) { throw Object.assign(new Error(code), { code }); }

function modelDto(asset) {
  let definition = asset?.metadata?.clothingModel;
  // The generic asset index may refresh generation metadata on restart. Model
  // membership is in tags; its immutable definition lives in the reservation.
  if (!definition && asset?.sourceTable === 'generations' && asset.sourceId) {
    const record = getDb().prepare(`SELECT g.model, g.quality, r.metadata_json
      FROM generations g JOIN credit_reservations r ON r.id = g.reservation_id
      WHERE g.id = ? AND g.user_id = ? AND g.status = 'succeeded'`).get(asset.sourceId, asset.ownerUserId);
    let workflow;
    try { workflow = JSON.parse(record?.metadata_json || '{}').studioWorkflow; } catch { /* Not a model asset. */ }
    if (workflow?.kind === 'model-creation' && record.quality === 'low' && isModelPhotoProvider(record.model)) {
      definition = { ...workflow.definition, adultConfirmed: true, generated: true };
    }
  }
  if (!definition || !asset.tags.includes(TRY_ON_MODEL_TAG)) return null;
  return {
    id: asset.id, source: 'custom', name: asset.name, gender: definition.gender, age: definition.age,
    backgroundId: definition.backgroundId, adultConfirmed: definition.adultConfirmed === true,
    imageUrl: asset.originalUrl, thumbnailUrl: asset.thumbnailUrl, mimeType: asset.mimeType,
    status: asset.status, createdAt: asset.createdAt,
    generated: definition.generated === true, quality: definition.generated ? 'low' : '',
  };
}

export function listPrivateTryOnModels(userId) {
  const assets = listAssets(userId, { tag: TRY_ON_MODEL_TAG, mediaType: 'image', limit: 100, sort: 'recent' }).assets;
  return assets.filter(asset => asset.ownerUserId === userId).map(modelDto).filter(Boolean);
}

export function validatePrivateTryOnReference(userId, workflow, references) {
  if (workflow?.kind !== 'clothing-try-on' || workflow.modelSource !== 'custom') return;
  const asset = getAccessibleAsset(userId, workflow.modelId, { includeDeleted: false });
  if (!asset || asset.ownerUserId !== userId || asset.mediaType !== 'image' || asset.status !== 'ready'
    || !modelDto(asset)?.adultConfirmed || !asset.tags.includes(TRY_ON_MODEL_TAG)
    || references?.[1]?.assetId !== asset.id) fail('TRY_ON_MODEL_NOT_FOUND');
}

export async function uploadPrivateTryOnModel(userId, { bytes, mimeType, definition, adultConfirmed }) {
  if (adultConfirmed !== true) fail('ADULT_MODEL_CONFIRMATION_REQUIRED');
  const normalized = normalizeAdultModelDefinition(definition);
  const asset = await createUploadedAsset(userId, {
    bytes, mimeType, fileName: normalized.name, tags: [TRY_ON_MODEL_TAG],
    metadata: { clothingModel: { ...normalized, adultConfirmed: true, generated: false } },
  });
  return modelDto(asset);
}

// Reuse the existing generated asset. Saving a model is idempotent and does not
// create another image, storage copy, provider call or generation charge.
export function saveGeneratedTryOnModel(userId, generationId, definition) {
  const normalized = normalizeAdultModelDefinition(definition);
  const db = getDb();
  const row = db.prepare(`
    SELECT g.id, g.model, g.quality, g.status, r.metadata_json
    FROM generations g JOIN credit_reservations r ON r.id = g.reservation_id
    WHERE g.id = ? AND g.user_id = ?
  `).get(generationId, userId);
  if (!row || row.status !== 'succeeded') fail('MODEL_GENERATION_NOT_FOUND');
  let metadata;
  try { metadata = JSON.parse(row.metadata_json || '{}'); } catch { fail('INVALID_MODEL_GENERATION'); }
  if (metadata?.studioWorkflow?.kind !== 'model-creation' || row.quality !== 'low' || !isModelPhotoProvider(row.model)) fail('INVALID_MODEL_GENERATION');
  // The recorded, server-validated definition is authoritative.
  const recorded = normalizeAdultModelDefinition(metadata.studioWorkflow.definition);
  const assetId = `generation-${row.id}`;
  const asset = getAccessibleAsset(userId, assetId, { includeDeleted: false });
  if (!asset || asset.ownerUserId !== userId) fail('MODEL_GENERATION_NOT_FOUND');
  if (asset.tags.includes(TRY_ON_MODEL_TAG) && modelDto(asset)?.generated) return modelDto(asset);
  const nextMetadata = { ...asset.metadata, clothingModel: { ...recorded, name: normalized.name, adultConfirmed: true, generated: true } };
  db.prepare('UPDATE assets SET metadata_json = ? WHERE id = ? AND owner_user_id = ?').run(JSON.stringify(nextMetadata), assetId, userId);
  return modelDto(updateAsset(userId, assetId, { name: normalized.name, visibility: 'private', tags: [...new Set([...asset.tags, TRY_ON_MODEL_TAG])] }));
}

export function removePrivateTryOnModel(userId, modelId) {
  const asset = getAccessibleAsset(userId, modelId, { includeDeleted: false });
  if (!asset || asset.ownerUserId !== userId || !asset.tags.includes(TRY_ON_MODEL_TAG)) fail('TRY_ON_MODEL_NOT_FOUND');
  // Remove from the model picker only; retain the user's source photo and history.
  const metadata = { ...asset.metadata };
  delete metadata.clothingModel;
  getDb().prepare('UPDATE assets SET metadata_json = ? WHERE id = ? AND owner_user_id = ?').run(JSON.stringify(metadata), modelId, userId);
  updateAsset(userId, modelId, { tags: asset.tags.filter(tag => tag !== TRY_ON_MODEL_TAG) });
}
