export const MAX_BATCH_IMAGE_PROMPTS = 10;

function boundedCount(value, maximum = MAX_BATCH_IMAGE_PROMPTS) {
  return Math.max(0, Math.min(maximum, Math.round(Number(value) || 0)));
}

export function parseBatchPromptLines(value, maximum = MAX_BATCH_IMAGE_PROMPTS) {
  const limit = Math.max(1, boundedCount(maximum) || MAX_BATCH_IMAGE_PROMPTS);
  const allLines = String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    lines: allLines.slice(0, limit),
    truncated: allLines.length > limit
  };
}

export function batchPromptLayout(imageCount, promptCount) {
  const images = boundedCount(imageCount);
  const prompts = boundedCount(promptCount);
  if (!images) {
    return { activeCount: 0, visibleCount: prompts, minimumCount: 0, canAdd: false };
  }
  if (images === 1) {
    const visibleCount = Math.max(1, prompts);
    return {
      activeCount: visibleCount,
      visibleCount,
      minimumCount: 1,
      canAdd: visibleCount < MAX_BATCH_IMAGE_PROMPTS
    };
  }
  const visibleCount = Math.max(images, prompts);
  return {
    activeCount: images,
    visibleCount,
    minimumCount: images,
    canAdd: prompts < images
  };
}

export function createBatchPromptAssignments(images = [], prompts = []) {
  const sourceImages = Array.isArray(images) ? images.slice(0, MAX_BATCH_IMAGE_PROMPTS) : [];
  const promptItems = Array.isArray(prompts) ? prompts.slice(0, MAX_BATCH_IMAGE_PROMPTS) : [];
  if (!sourceImages.length) return [];
  if (sourceImages.length === 1) {
    return promptItems.map((promptItem, promptIndex) => ({
      image: sourceImages[0],
      imageIndex: 0,
      promptItem,
      promptIndex
    }));
  }
  return sourceImages.map((image, imageIndex) => ({
    image,
    imageIndex,
    promptItem: promptItems[imageIndex],
    promptIndex: imageIndex
  }));
}
