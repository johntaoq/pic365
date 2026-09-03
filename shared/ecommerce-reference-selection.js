export const ECOMMERCE_PACKAGING_SLOT_IDS = new Set(['spec-bundle', 'package-contents', 'bundle-cross-sell']);
export const ECOMMERCE_DETAIL_SLOT_IDS = new Set(['detail-material', 'detail-closeup', 'material-detail']);
export const ECOMMERCE_ANGLE_SLOT_IDS = new Set(['multi-angle', 'gallery-angle', 'dimensions', 'model-brief']);
export const ECOMMERCE_VARIANT_SLOT_IDS = new Set(['sku-variant', 'variant']);
export const ECOMMERCE_SCENE_SLOT_IDS = new Set([
  'key-benefit', 'usage-scene', 'campaign', 'detail-page', 'three-second-benefit', 'person-scene',
  'comparison', 'promotion-label', 'video-cover', 'video-storyboard', 'feature', 'lifestyle', 'product-hero',
  'how-to', 'bundle-cross-sell', 'social-share'
]);
export const ECOMMERCE_CLEAN_PRODUCT_SLOT_IDS = new Set(['white-background', 'compliant-main', 'main-square', 'main-portrait', 'cover-square', 'material-portrait', 'collection-card']);

function assetRelevance(project, slot, asset) {
  if (asset.id === project.masterAssetId) return 10000;
  const purpose = String(asset.purpose || '');
  if (asset.assetType === 'reference') {
    if (!ECOMMERCE_SCENE_SLOT_IDS.has(slot.id)) return -1;
    return ['composition', 'lighting', 'scene'].includes(purpose) ? 680 : 560;
  }
  if (asset.assetType === 'packaging') {
    return ECOMMERCE_PACKAGING_SLOT_IDS.has(slot.id) ? 900 : -1;
  }
  if (asset.assetType === 'logo') {
    return ECOMMERCE_CLEAN_PRODUCT_SLOT_IDS.has(slot.id) || slot.id === 'compliant-main' ? -1 : 560;
  }
  if (asset.assetType !== 'product') return -1;
  if (purpose === 'identity') return 950;
  if (purpose === 'angle') return ECOMMERCE_ANGLE_SLOT_IDS.has(slot.id) ? 920 : 760;
  if (purpose === 'material' || purpose === 'detail') return ECOMMERCE_DETAIL_SLOT_IDS.has(slot.id) ? 920 : 740;
  if (purpose === 'packaging') return ECOMMERCE_PACKAGING_SLOT_IDS.has(slot.id) ? 850 : -1;
  if (purpose === 'brand') return 580;
  if (['composition', 'lighting', 'scene'].includes(purpose)) return ECOMMERCE_SCENE_SLOT_IDS.has(slot.id) ? 660 : -1;
  return ECOMMERCE_CLEAN_PRODUCT_SLOT_IDS.has(slot.id) || ECOMMERCE_ANGLE_SLOT_IDS.has(slot.id) ? 700 : 650;
}

export function selectEcommerceAssetsForSlot({ project, slot, assets, limit = 6 }) {
  return [...(assets || [])]
    .map((asset) => ({ asset, relevance: assetRelevance(project, slot, asset) }))
    .filter((item) => item.relevance >= 0)
    .sort((left, right) => (
      right.relevance - left.relevance || Number(left.asset.sortOrder || 0) - Number(right.asset.sortOrder || 0)
    ))
    .slice(0, Math.max(1, Math.min(Number(limit) || 6, 8)))
    .map((item) => item.asset);
}

export function countEcommerceReferenceImages({ project, slot, assets = [], baseGenerationId = '', referenceInputs = [] }) {
  if (!project || !slot) return 0;
  const availableAssets = assets.filter((asset) => asset?.available !== false);
  const assetById = new Map(availableAssets.map((asset) => [asset.id, asset]));
  const refinementAssets = referenceInputs
    .map((input) => assetById.get(input?.assetId))
    .filter(Boolean);
  const maximumAssetInputs = Math.max(1, 8 - (baseGenerationId ? 1 : 0));
  const standardAssets = selectEcommerceAssetsForSlot({
    project,
    slot,
    assets: availableAssets,
    limit: Math.max(1, maximumAssetInputs - refinementAssets.length)
  });
  const selectedAssets = [...standardAssets, ...refinementAssets]
    .filter((asset, index, items) => items.findIndex((item) => item.id === asset.id) === index)
    .slice(0, maximumAssetInputs);
  return selectedAssets.length + (baseGenerationId ? 1 : 0);
}
