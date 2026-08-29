export function imageReferenceIdentity(item) {
  return String(item?.generationId || item?.id || item?.assetId || '');
}

export function resolveImageReferenceTarget(workspaceTab, creationMode) {
  return workspaceTab === 'control' && creationMode === 'batch-repair'
    ? 'batch-repair'
    : 'single';
}

export function splitImageReferences(references = []) {
  const list = Array.isArray(references) ? references.filter(Boolean) : [];
  return {
    primary: list[0] || null,
    supporting: list.slice(1)
  };
}

export function moveImageReferenceToPrimary(references = [], referenceId = '') {
  const list = Array.isArray(references) ? [...references] : [];
  const index = list.findIndex((item) => item?.id === referenceId);
  if (index <= 0) return list;
  [list[0], list[index]] = [list[index], list[0]];
  return list;
}
