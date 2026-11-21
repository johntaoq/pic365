import { getDb } from './local-db.js';
import {
  isEcommerceLayoutId, normalizeLayoutFavoriteIds
} from '../../shared/ecommerce-layout-favorites.js';

const initializedDatabases = new WeakSet();

function favoritesDb() {
  const db = getDb();
  if (!initializedDatabases.has(db)) {
    // Additive, lazy migration also works with an already running local server.
    // Existing users, generation tasks and image-provider configuration stay intact.
    db.exec(`CREATE TABLE IF NOT EXISTS ecommerce_layout_favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      layout_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, layout_id)
    )`);
    initializedDatabases.add(db);
  }
  return db;
}

export function listEcommerceLayoutFavorites(userId) {
  const rows = favoritesDb().prepare(`SELECT layout_id FROM ecommerce_layout_favorites
    WHERE user_id = ? ORDER BY created_at DESC, layout_id`).all(userId);
  return normalizeLayoutFavoriteIds(rows.map((row) => row.layout_id));
}

export function saveEcommerceLayoutFavorite(userId, layoutId, favorite) {
  if (!isEcommerceLayoutId(layoutId) || typeof favorite !== 'boolean') {
    throw Object.assign(new Error('INVALID_LAYOUT_FAVORITE'), { code: 'INVALID_LAYOUT_FAVORITE' });
  }
  const db = favoritesDb();
  if (favorite) {
    db.prepare(`INSERT INTO ecommerce_layout_favorites (user_id, layout_id, created_at)
      VALUES (?, ?, ?) ON CONFLICT(user_id, layout_id) DO NOTHING`
    ).run(userId, layoutId, new Date().toISOString());
  } else {
    db.prepare('DELETE FROM ecommerce_layout_favorites WHERE user_id = ? AND layout_id = ?')
      .run(userId, layoutId);
  }
  return favorite;
}
