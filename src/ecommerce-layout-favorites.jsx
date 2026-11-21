import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { createLayoutFavoritesStore, EMPTY_LAYOUT_FAVORITES } from './ecommerce-layout-favorites-store.js';

const store = createLayoutFavoritesStore();

export function useEcommerceLayoutFavorites(userId) {
  const subscribe = useCallback((listener) => store.subscribe(userId, listener), [userId]);
  const snapshot = useSyncExternalStore(subscribe,
    () => store.getSnapshot(userId), () => EMPTY_LAYOUT_FAVORITES);
  useEffect(() => {
    if (userId) void store.load(userId).catch(() => {});
  }, [userId]);
  return {
    ...snapshot,
    ready: Boolean(userId && snapshot.status === 'ready'),
    toggle: (layoutId) => store.toggle(userId, layoutId),
    reload: () => store.load(userId)
  };
}
