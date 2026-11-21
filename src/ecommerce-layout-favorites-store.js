import {
  isEcommerceLayoutId, normalizeLayoutFavoriteIds, setLayoutFavorite
} from '../shared/ecommerce-layout-favorites.js';

export const EMPTY_LAYOUT_FAVORITES = Object.freeze({
  ids: Object.freeze([]), pending: Object.freeze([]), status: 'idle', error: ''
});

export function createLayoutFavoritesStore(request = (...args) => fetch(...args)) {
  const accounts = new Map();
  function account(userId) {
    if (!accounts.has(userId)) accounts.set(userId, {
      snapshot: EMPTY_LAYOUT_FAVORITES, listeners: new Set(), loading: null
    });
    return accounts.get(userId);
  }
  function publish(entry, patch) {
    entry.snapshot = { ...entry.snapshot, ...patch };
    entry.listeners.forEach((listener) => listener());
  }
  async function readResponse(response, userId) {
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'LAYOUT_FAVORITES_FAILED');
    // Requests queued before an account switch must never act on the new account.
    if (payload.userId !== userId) throw new Error('LAYOUT_FAVORITES_ACCOUNT_MISMATCH');
    return payload;
  }

  return {
    getSnapshot(userId) { return userId ? account(userId).snapshot : EMPTY_LAYOUT_FAVORITES; },
    subscribe(userId, listener) {
      if (!userId) return () => {};
      const entry = account(userId);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    load(userId) {
      if (!userId) return Promise.reject(new Error('AUTH_REQUIRED'));
      const entry = account(userId);
      if (entry.loading) return entry.loading;
      if (entry.snapshot.pending.length) return Promise.resolve(entry.snapshot.ids);
      publish(entry, { status: 'loading', error: '' });
      entry.loading = Promise.resolve().then(async () => {
        const payload = await readResponse(await request('/api/ecommerce/layout-favorites', {
          cache: 'no-store'
        }), userId);
        if (!Array.isArray(payload.favorites)) throw new Error('LAYOUT_FAVORITES_INVALID_RESPONSE');
        const ids = normalizeLayoutFavoriteIds(payload.favorites);
        publish(entry, { ids, status: 'ready', error: '' });
        return ids;
      }).catch((error) => {
        publish(entry, { ids: [], status: 'loadError', error: error.message });
        throw error;
      }).finally(() => { entry.loading = null; });
      return entry.loading;
    },
    async toggle(userId, layoutId) {
      if (!userId) throw new Error('AUTH_REQUIRED');
      const entry = account(userId);
      if (entry.snapshot.status !== 'ready' || !isEcommerceLayoutId(layoutId)) {
        throw new Error('LAYOUT_FAVORITES_UNAVAILABLE');
      }
      if (entry.snapshot.pending.includes(layoutId)) return;
      const favorite = !entry.snapshot.ids.includes(layoutId);
      publish(entry, {
        ids: setLayoutFavorite(entry.snapshot.ids, layoutId, favorite),
        pending: [...entry.snapshot.pending, layoutId], error: ''
      });
      try {
        const payload = await readResponse(await request('/api/ecommerce/layout-favorites', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, layoutId, favorite })
        }), userId);
        if (payload.layoutId !== layoutId || payload.favorite !== favorite) {
          throw new Error('LAYOUT_FAVORITES_INVALID_RESPONSE');
        }
        // Update one layout only; concurrent saves may finish out of order.
        publish(entry, { pending: entry.snapshot.pending.filter((id) => id !== layoutId) });
      } catch (error) {
        publish(entry, {
          ids: setLayoutFavorite(entry.snapshot.ids, layoutId, !favorite),
          pending: entry.snapshot.pending.filter((id) => id !== layoutId), error: error.message
        });
        throw error;
      }
    }
  };
}
