function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function imagePanBounds({ viewportWidth, viewportHeight, contentWidth, contentHeight, zoom = 1 }) {
  const safeZoom = Math.max(0, finite(zoom));
  return {
    maxX: Math.max(0, (finite(contentWidth) * safeZoom - finite(viewportWidth)) / 2),
    maxY: Math.max(0, (finite(contentHeight) * safeZoom - finite(viewportHeight)) / 2)
  };
}

export function clampImagePanOffset(offset, metrics) {
  const { maxX, maxY } = imagePanBounds(metrics);
  const x = finite(offset?.x);
  const y = finite(offset?.y);
  return {
    x: maxX > 0 ? Math.max(-maxX, Math.min(maxX, x)) : 0,
    y: maxY > 0 ? Math.max(-maxY, Math.min(maxY, y)) : 0
  };
}
