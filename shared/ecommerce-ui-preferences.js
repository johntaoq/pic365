const PROJECT_LIST_COLLAPSED_STORAGE_KEY = 'pic365:ecommerce-project-list-collapsed:v1';

export function getEcommerceProjectListPreferenceKey(userId = '') {
  const owner = String(userId || '').trim() || 'guest';
  return `${PROJECT_LIST_COLLAPSED_STORAGE_KEY}:${owner}`;
}

export function readEcommerceProjectListCollapsed(userId = '', storage) {
  try {
    const targetStorage = storage === undefined ? globalThis.localStorage : storage;
    const storedValue = targetStorage?.getItem(getEcommerceProjectListPreferenceKey(userId));
    if (storedValue === 'expanded') return false;
    if (storedValue === 'collapsed') return true;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return true;
}

export function writeEcommerceProjectListCollapsed(collapsed, userId = '', storage) {
  try {
    const targetStorage = storage === undefined ? globalThis.localStorage : storage;
    targetStorage?.setItem(
      getEcommerceProjectListPreferenceKey(userId),
      collapsed ? 'collapsed' : 'expanded'
    );
  } catch {
    // The menu remains usable even when the preference cannot be persisted.
  }
}
