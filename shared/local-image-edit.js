// Annotation previews are UI guides. Keep the clean source separate from them.
export function referenceWithEditAnnotations(reference, annotations, markedImageUrl = '') {
  const originalImageUrl = reference.originalImageUrl || reference.imageUrl;
  const originalThumbnailUrl = reference.originalThumbnailUrl
    || (reference.markedImageUrl ? originalImageUrl : reference.thumbnailUrl)
    || originalImageUrl;
  const marks = Array.isArray(annotations) ? annotations : [];
  const preview = marks.length ? markedImageUrl : '';
  return {
    ...reference,
    imageUrl: originalImageUrl,
    originalImageUrl,
    originalThumbnailUrl,
    annotations: marks,
    markedImageUrl: preview,
    thumbnailUrl: preview || originalThumbnailUrl
  };
}
