export function imageReferenceIdentity(item) {
  return String(item?.generationId || item?.id || item?.assetId || '');
}

export function resolveImageReferenceTarget(workspaceTab, creationMode) {
  return workspaceTab === 'control' && creationMode === 'batch-repair'
    ? 'batch-repair'
    : 'single';
}
