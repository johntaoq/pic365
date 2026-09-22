import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-asset-search-'));
process.env.APP_DB_PATH = path.join(temporary, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(temporary, 'storage');
delete process.env.AZURE_STORAGE_CONNECTION_STRING;
const db = await import('../api/_lib/local-db.js');
const media = await import('../api/_lib/media-assets.js');
const { default: handler } = await import('../api/assets.js');
const { default: itemHandler } = await import('../api/assets/item.js');
const owner = db.createUser({ email: 'search-owner@example.com', password: 'testing-1234', fullName: 'Owner' });
const reader = db.createUser({ email: 'search-reader@example.com', password: 'testing-1234', fullName: 'Reader' });
const outsider = db.createUser({ email: 'search-outsider@example.com', password: 'testing-1234', fullName: 'Outsider' });
const session = db.createSession(owner.id);
const collection = media.createCollection(owner.id, { name: '春季活动' });

function insert(id, createdAt, { user = owner, name = id, tags = [], size = 100, source = 'upload', deleted = false } = {}) {
  db.getDb().prepare(`INSERT INTO assets
    (id, owner_user_id, name, media_type, source_type, original_storage_path, mime_type, file_size, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, 'image', ?, '', 'image/png', ?, ?, ?, ?)`)
    .run(id, user.id, name, source, size, createdAt, createdAt, deleted ? createdAt : null);
  media.replaceAssetTags(user.id, id, tags);
  return id;
}
const first = insert('first', '2025-12-31T16:00:00.000Z', { name: '杯子', tags: ['陶瓷', '春季'], size: 300 });
const last = insert('last', '2026-12-31T15:59:59.999Z', { name: '礼盒', tags: ['陶瓷', '礼品'], source: 'generated' });
insert('before', '2025-12-31T15:59:59.999Z', { tags: ['旧图'] });
insert('after', '2026-12-31T16:00:00.000Z', { tags: ['新图'] });
insert('literal', '2026-09-21T16:00:00.000Z', { name: '100%_完成', tags: ['Campaign'] });
insert('septemberEnd', '2026-09-30T15:59:59.999Z', { tags: ['秋季'] });
insert('october', '2026-09-30T16:00:00.000Z', { tags: ['秋季'] });
insert('private', '2026-09-22T00:00:00.000Z', { user: outsider, tags: ['秘密'] });
insert('trash', '2026-09-22T00:00:00.000Z', { tags: ['已删除'], deleted: true });
media.assignAssetsToCollection(owner.id, [first, last], collection.id);

after(() => { db.getDb().close(); fs.rmSync(temporary, { recursive: true, force: true }); });

async function invoke(query = {}, { userSession = session, method = 'GET', body, target = handler } = {}) {
  let status = 200;
  let payload;
  const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { payload = value; } };
  await target({ method, headers: userSession ? { cookie: `member_session=${userSession.token}` } : {}, query, body }, res);
  return { status, payload };
}

test('keywords search linked names, personal categories and tags without wildcards', async () => {
  for (const q of ['杯子', '陶瓷', '春季活动', 'campaign']) {
    const { status, payload } = await invoke({ q, facets: '1' });
    assert.equal(status, 200);
    assert.ok(payload.totalCount > 0, q);
  }
  assert.equal((await invoke({ q: '春季活动' })).payload.totalCount, 2);
  assert.equal((await invoke({ q: '%' })).payload.totalCount, 1);
  assert.equal((await invoke({ q: '_' })).payload.totalCount, 1);
  assert.equal((await invoke({ q: "' OR 1=1 --" })).payload.totalCount, 0);
});

test('annual, monthly, daily and range queries compose with category and tag', async () => {
  const year = await invoke({ dateMode: 'year', dateValue: '2026', tag: '陶瓷', collectionId: collection.id, facets: '1' });
  assert.deepEqual(new Set(year.payload.assets.map(a => a.id)), new Set([first, last]));
  const month = await invoke({ dateMode: 'month', dateValue: '2026-09', sort: 'recent' });
  assert.deepEqual(month.payload.assets.map(a => a.id), ['septemberEnd', 'literal']);
  const day = await invoke({ dateMode: 'day', dateValue: '2026-09-22' });
  assert.deepEqual(day.payload.assets.map(a => a.id), ['literal']);
  const range = await invoke({ dateMode: 'range', dateFrom: '2026-09-22', dateTo: '2026-09-30' });
  assert.equal(range.payload.totalCount, 2);
  assert.equal((await invoke({ tag: '陶瓷', sourceType: 'generated', q: '礼品' })).payload.totalCount, 1);
});

test('facets and totals do not leak other accounts, private categories or trash', async () => {
  const { payload } = await invoke({ facets: '1', limit: '1' });
  assert.equal(payload.assets.length, 1);
  assert.equal(payload.totalCount, 7);
  assert.equal(payload.hasMore, true);
  assert.ok(!payload.facets.tags.some(x => ['秘密', '已删除'].includes(x.tag)));
  const category = await invoke({ collectionId: collection.id, tag: '春季', facets: '1' });
  assert.equal(category.payload.totalCount, 1);
  assert.ok(category.payload.facets.tags.some(x => x.tag === '礼品'));
  assert.ok(!category.payload.facets.tags.some(x => x.tag === '秋季'));
  media.shareAsset(owner.id, first, { principalType: 'user', principalId: reader.id, permission: 'view' });
  const readerSession = db.createSession(reader.id);
  assert.equal((await invoke({ q: '春季活动' }, { userSession: readerSession })).payload.totalCount, 0);
  assert.equal((await invoke({ tag: '陶瓷' }, { userSession: readerSession })).payload.totalCount, 1);
  assert.equal((await invoke({ tag: '陶瓷' }, { userSession: readerSession })).payload.assets[0].canEditMetadata, false);
  assert.equal((await invoke({ tag: '陶瓷' })).payload.assets[0].canEditMetadata, true);
  assert.equal((await invoke({ facets: '1' }, { userSession: readerSession })).payload.facets.tags.length, 2);
  media.revokeAssetPermission(owner.id, first, 'user', reader.id);
  assert.equal((await invoke({ facets: '1' }, { userSession: readerSession })).payload.facets.tags.length, 0);
});

test('sorts, case-insensitive tags, pagination and invalid options are deterministic', async () => {
  assert.equal((await invoke({ tag: 'campaign' })).payload.totalCount, 1);
  const page1 = await invoke({ sort: 'oldest', limit: '2' });
  const page2 = await invoke({ sort: 'oldest', limit: '2', offset: String(page1.payload.nextOffset) });
  assert.equal(page1.payload.assets[0].id, 'before');
  assert.equal(new Set([...page1.payload.assets, ...page2.payload.assets].map(a => a.id)).size, 4);
  assert.equal((await invoke({ sort: 'largest' })).payload.assets[0].id, first);
  assert.equal((await invoke({ sort: 'name' })).payload.assets[0].name, '100%_完成');
  assert.equal((await invoke({ sort: 'toString' })).status, 200);
  assert.equal((await invoke({ dateMode: 'day', dateValue: '2026-02-29' })).status, 400);
  assert.equal((await invoke({}, { userSession: null })).status, 401);
});

test('saved and removed tags immediately affect results and facets', async () => {
  const result = await invoke({ id: first }, { target: itemHandler, method: 'PATCH', body: { tags: '新品，陶瓷;summer\nSUMMER' } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.asset.tags, ['summer', '新品', '陶瓷']);
  assert.equal((await invoke({ q: '新品' })).payload.totalCount, 1);
  assert.equal((await invoke({ tag: '春季' })).payload.totalCount, 0);
  const facets = (await invoke({ facets: '1' })).payload.facets.tags;
  assert.ok(facets.some(x => x.tag === '新品'));
  assert.ok(!facets.some(x => x.tag === '春季'));
});
