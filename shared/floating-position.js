export function normalizeFloatingPosition(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function clampFloatingPosition(position, elementSize, viewportSize, margin = 12) {
  const normalized = normalizeFloatingPosition(position) || { x: margin, y: margin };
  const width = Math.max(0, Number(elementSize?.width) || 0);
  const height = Math.max(0, Number(elementSize?.height) || 0);
  const viewportWidth = Math.max(0, Number(viewportSize?.width) || 0);
  const viewportHeight = Math.max(0, Number(viewportSize?.height) || 0);
  const safeMargin = Math.max(0, Number(margin) || 0);
  const minimumX = Math.min(safeMargin, Math.max(0, viewportWidth - width));
  const minimumY = Math.min(safeMargin, Math.max(0, viewportHeight - height));
  const maximumX = Math.max(minimumX, viewportWidth - width - safeMargin);
  const maximumY = Math.max(minimumY, viewportHeight - height - safeMargin);
  return {
    x: Math.min(maximumX, Math.max(minimumX, normalized.x)),
    y: Math.min(maximumY, Math.max(minimumY, normalized.y))
  };
}

export function clampFloatingSize(size, minSize, maxSize) {
  const minimumWidth = Math.max(0, Number(minSize?.width) || 0);
  const minimumHeight = Math.max(0, Number(minSize?.height) || 0);
  const maximumWidth = Math.max(minimumWidth, Number(maxSize?.width) || minimumWidth);
  const maximumHeight = Math.max(minimumHeight, Number(maxSize?.height) || minimumHeight);
  const width = Number(size?.width);
  const height = Number(size?.height);
  return {
    width: Math.min(maximumWidth, Math.max(minimumWidth, Number.isFinite(width) ? width : minimumWidth)),
    height: Math.min(maximumHeight, Math.max(minimumHeight, Number.isFinite(height) ? height : minimumHeight))
  };
}
