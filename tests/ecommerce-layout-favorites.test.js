import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { after } from 'node:test';
import { LAYOUT_TEMPLATES } from '../shared/ecommerce-layout-studio.js';
import {
  layoutsForCategory, normalizeLayoutFavoriteIds, setLayoutFavorite
} from '../shared/ecommerce-layout-favorites.js';
import { createLayoutFavoritesStore, EMPTY_LAYOUT_FAVORITES } from '../src/ecommerce-layout-favorites-store.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-layout-favorites-'));
process.env.APP_DB_PATH = path.join(directory, 'app.sqlite');
const db = await import('../api/_lib/local-db.js');
const { default: handler } = await import('../api/ecommerce/layout-favorites.js');

after(() => {
  db.getDb().close();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function invoke(req = {}) {
  const response = { statusCode: 200, payload: null, headers: {} };
  const res = {
    setHeader(name, value) { response.headers[name.toLowerCase()] = value; },
    status(code) { response.statusCode = code; return this; },
    json(value) { response.payload = value; return this; }
  };
  await handler({ method: 'GET', headers: {}, query: {}, ...req }, res);
  return response;
}

function auth() {
  const user = db.createUser({
    email: `layout-favorite-${crypto.randomUUID()}@example.com`,
    password: 'testing-1234', fullName: 'Layout favorites test'
  });
  const session = db.createSession(user.id);
  return { user, headers: { cookie: `member_session=${encodeURIComponent(session.token)}` } };
}

function response(payload, ok = true) {
  return { ok, json: async () => payload };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('favorites accept every layout, omit obsolete IDs, and do not share the ten-selection cap', () => {
  const ids = LAYOUT_TEMPLATES.map((layout) => layout.id);
  assert.deepEqual(normalizeLayoutFavoriteIds([ids[0], 'unknown', ids[0], null, ids[1]]), ids.slice(0, 2));
  assert.deepEqual(normalizeLayoutFavoriteIds(null), []);
  let favorites = [];
  for (const id of ids) favorites = setLayoutFavorite(favorites, id, true);
  assert.equal(favorites.length, 30);
  assert.deepEqual(setLayoutFavorite(favorites, 'unknown', true), favorites);
  assert.equal(setLayoutFavorite(favorites, ids[0], false).length, 29);
});

test('favorites filter across categories without changing catalog order or category counts', () => {
  const favorites = ['detail-ribbons', 'single-frame', 'arch-cards'];
  assert.deepEqual(layoutsForCategory('favorites', favorites),
    LAYOUT_TEMPLATES.filter((layout) => favorites.includes(layout.id)));
  assert.equal(layoutsForCategory('all', favorites).length, 30);
  for (const category of ['selling', 'scene', 'detail']) {
    assert.deepEqual(layoutsForCategory(category, favorites),
      LAYOUT_TEMPLATES.filter((layout) => layout.type === category));
  }
  assert.deepEqual(layoutsForCategory('favorites'), []);
});

test('favorite API requires login, is non-cacheable, and rejects unsupported methods', async () => {
  for (const method of ['GET', 'PATCH']) assert.equal((await invoke({ method })).statusCode, 401);
  const unsupported = await invoke({ method: 'POST' });
  assert.equal(unsupported.statusCode, 405);
  assert.equal(unsupported.headers.allow, 'GET, PATCH');
  assert.equal(unsupported.headers['cache-control'], 'private, no-store');
});

test('favorites persist by user and are idempotent, independent of generation and billing', async () => {
  const first = auth();
  const second = auth();
  const before = {
    ledger: db.getDb().prepare('SELECT COUNT(*) AS count FROM credit_ledger').get().count,
    tasks: db.getDb().prepare('SELECT COUNT(*) AS count FROM free_generation_tasks').get().count,
    providers: db.getDb().prepare('SELECT COUNT(*) AS count FROM image_provider_configs').get().count
  };
  assert.deepEqual((await invoke({ headers: first.headers })).payload.favorites, []);
  const update = (owner, favorite, layoutId = 'single-frame') => invoke({
    method: 'PATCH', headers: owner.headers, body: { userId: owner.user.id, layoutId, favorite }
  });
  for (let i = 0; i < 2; i++) assert.equal((await update(first, true)).statusCode, 200);
  await update(second, true);
  assert.deepEqual((await invoke({ headers: first.headers })).payload.favorites, ['single-frame']);
  assert.deepEqual((await invoke({ headers: second.headers, query: { userId: first.user.id } })).payload, {
    ok: true, userId: second.user.id, favorites: ['single-frame']
  });
  const freshConnection = new DatabaseSync(process.env.APP_DB_PATH, { readOnly: true });
  assert.equal(freshConnection.prepare('SELECT COUNT(*) AS count FROM ecommerce_layout_favorites WHERE user_id=?')
    .get(first.user.id).count, 1);
  freshConnection.close();
  await update(first, false);
  await update(first, false);
  assert.deepEqual((await invoke({ headers: first.headers })).payload.favorites, []);
  assert.deepEqual((await invoke({ headers: second.headers })).payload.favorites, ['single-frame']);
  for (const layout of LAYOUT_TEMPLATES) await update(first, true, layout.id);
  assert.equal((await invoke({ headers: first.headers })).payload.favorites.length, 30);
  assert.equal(db.getDb().prepare('SELECT COUNT(*) AS count FROM credit_ledger').get().count, before.ledger);
  assert.equal(db.getDb().prepare('SELECT COUNT(*) AS count FROM free_generation_tasks').get().count, before.tasks);
  assert.equal(db.getDb().prepare('SELECT COUNT(*) AS count FROM image_provider_configs').get().count, before.providers);
});

test('favorite updates cannot cross accounts and reject invalid IDs and request bodies', async () => {
  const first = auth();
  const second = auth();
  const patch = (body) => invoke({ method: 'PATCH', headers: first.headers, body });
  assert.equal((await patch({ userId: second.user.id, layoutId: 'single-frame', favorite: true })).statusCode, 403);
  for (const body of [
    { userId: first.user.id, layoutId: 'unknown', favorite: true },
    { userId: first.user.id, layoutId: 'single-frame', favorite: 'true' },
    { userId: first.user.id, layoutId: 1, favorite: true }
  ]) assert.equal((await patch(body)).statusCode, 400);
  assert.equal((await patch('{invalid')).statusCode, 400);
  assert.equal((await patch({ padding: 'x'.repeat(9000) })).statusCode, 413);
  assert.deepEqual((await invoke({ headers: second.headers })).payload.favorites, []);
});

test('late loading responses and logout never expose another account favorites', async () => {
  const late = deferred();
  let calls = 0;
  const store = createLayoutFavoritesStore(async () => ++calls === 1 ? late.promise
    : response({ ok: true, userId: 'second', favorites: ['arch-cards'] }));
  const loadingFirst = store.load('first');
  await Promise.resolve();
  await store.load('second');
  late.resolve(response({ ok: true, userId: 'first', favorites: ['single-frame'] }));
  await loadingFirst;
  assert.deepEqual(store.getSnapshot('first').ids, ['single-frame']);
  assert.deepEqual(store.getSnapshot('second').ids, ['arch-cards']);
  assert.equal(store.getSnapshot(''), EMPTY_LAYOUT_FAVORITES);
  const changedAccount = createLayoutFavoritesStore(async () => response({
    ok: true, userId: 'second', favorites: ['arch-cards']
  }));
  await assert.rejects(changedAccount.load('first'), /ACCOUNT_MISMATCH/);
  assert.deepEqual(changedAccount.getSnapshot('first').ids, []);
});

test('optimistic hearts save separately, handle out-of-order completion, and roll back failures', async () => {
  const requests = [];
  const store = createLayoutFavoritesStore(async (url, init) => {
    assert.equal(url, '/api/ecommerce/layout-favorites');
    if (init?.method !== 'PATCH') return response({ ok: true, userId: 'owner', favorites: [] });
    const request = { ...deferred(), body: JSON.parse(init.body) };
    requests.push(request);
    return request.promise;
  });
  await store.load('owner');
  const first = store.toggle('owner', 'single-frame');
  const second = store.toggle('owner', 'arch-cards');
  await store.toggle('owner', 'single-frame');
  assert.equal(requests.length, 2);
  assert.deepEqual(store.getSnapshot('owner').ids, ['single-frame', 'arch-cards']);
  const complete = (request) => request.resolve(response({ ok: true, ...request.body }));
  complete(requests[1]);
  await second;
  complete(requests[0]);
  await first;
  assert.deepEqual(store.getSnapshot('owner').pending, []);
  const failedRemoval = store.toggle('owner', 'single-frame');
  const third = store.toggle('owner', 'detail-ribbons');
  complete(requests[3]);
  await third;
  requests[2].reject(new Error('offline'));
  await assert.rejects(failedRemoval, /offline/);
  assert.equal(store.getSnapshot('owner').ids.includes('single-frame'), true);
  assert.equal(store.getSnapshot('owner').ids.includes('detail-ribbons'), true);
  assert.deepEqual(store.getSnapshot('owner').pending, []);
  assert.equal(store.getSnapshot('owner').error, 'offline');
});

test('stale account writes are rejected and failed loading can be retried', async () => {
  let getCalls = 0;
  const store = createLayoutFavoritesStore(async (url, init) => {
    if (init?.method === 'PATCH') return response({
      ok: false, error: 'LAYOUT_FAVORITES_ACCOUNT_MISMATCH'
    }, false);
    if (++getCalls === 1) throw new Error('offline');
    return response({ ok: true, userId: 'owner', favorites: [] });
  });
  await assert.rejects(store.load('owner'), /offline/);
  assert.equal(store.getSnapshot('owner').status, 'loadError');
  await store.load('owner');
  await assert.rejects(store.toggle('owner', 'single-frame'), /ACCOUNT_MISMATCH/);
  assert.deepEqual(store.getSnapshot('owner').ids, []);
  await assert.rejects(store.toggle('', 'single-frame'), /AUTH_REQUIRED/);
});

test('favorite controls follow All, remain outside selection buttons, and use theme colors', () => {
  const source = fs.readFileSync(new URL('../src/ecommerce-layout-studio.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/ecommerce-layout-studio.css', import.meta.url), 'utf8');
  assert.match(source, /id: 'all'.*\n\s*\{ id: 'favorites'.*\.\.\.LAYOUT_IMAGE_TYPES/);
  assert.match(source, /<\/button>\s*<button className=\{`layoutStudioFavorite/);
  assert.match(source, /aria-pressed=\{favorited\}/);
  assert.match(source, /fill=\{favorited \? 'currentColor' : 'none'\}/);
  assert.match(css, /\.layoutStudioFavorite:is\(:hover,\.active\).*var\(--studio-error\)/);
});
