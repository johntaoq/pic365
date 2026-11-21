import { LAYOUT_TEMPLATES } from './ecommerce-layout-studio.js';

const layoutIds = new Set(LAYOUT_TEMPLATES.map((layout) => layout.id));

export function isEcommerceLayoutId(value) {
  return typeof value === 'string' && layoutIds.has(value);
}

export function normalizeLayoutFavoriteIds(value) {
  return Array.isArray(value) ? [...new Set(value.filter(isEcommerceLayoutId))] : [];
}

export function setLayoutFavorite(ids, layoutId, favorite) {
  const current = normalizeLayoutFavoriteIds(ids);
  if (!isEcommerceLayoutId(layoutId)) return current;
  return favorite ? normalizeLayoutFavoriteIds([...current, layoutId])
    : current.filter((id) => id !== layoutId);
}

export function layoutsForCategory(category, favorites = []) {
  if (category === 'all') return LAYOUT_TEMPLATES;
  if (category === 'favorites') {
    const ids = new Set(normalizeLayoutFavoriteIds(favorites));
    return LAYOUT_TEMPLATES.filter((layout) => ids.has(layout.id));
  }
  return LAYOUT_TEMPLATES.filter((layout) => layout.type === category);
}
