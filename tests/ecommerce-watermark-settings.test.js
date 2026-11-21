import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';
import {
  activeEcommerceWatermarkSettings,
  normalizeEcommerceWatermarkSettings
} from '../shared/ecommerce-layout-watermark.js';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-watermark-settings-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
const db = await import('../api/_lib/local-db.js');
const { default: handler } = await import('../api/ecommerce/watermark-settings.js');

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(req = {}) {
  let statusCode = 200;
  let payload;
  const headers = {};
  const res = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; }
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, query: {}, ...req }, res))
    .then(() => ({ statusCode, payload, headers }));
}

function auth() {
  const user = db.createUser({
    email: `watermark-${crypto.randomUUID()}@example.com`,
    password: 'testing-1234',
    fullName: 'Watermark User'
  });
  const session = db.createSession(user.id);
  return { user, headers: { cookie: `member_session=${encodeURIComponent(session.token)}` } };
}

function dataUrl(bytes) {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

test('ecommerce watermark preset is personal, persistent, and does not store the export toggle', async () => {
  const first = auth();
  const second = auth();
  const missing = await invoke();
  assert.equal(missing.statusCode, 401);
  const defaults = await invoke({ headers: first.headers });
  assert.equal(defaults.statusCode, 200);
  assert.equal(defaults.payload.settings.angle, 0);
  assert.equal(defaults.payload.settings.text, '');
  assert.equal(defaults.payload.settings.columns, 1);
  assert.equal(defaults.headers['cache-control'], 'private, no-store');

  const textImageDataUrl = dataUrl(await sharp({ create: {
    width: 80, height: 30, channels: 4, background: '#224466'
  } }).png().toBuffer());
  const imageDataUrl = dataUrl(await sharp({ create: {
    width: 90, height: 50, channels: 4, background: '#d53344'
  } }).png().toBuffer());
  const preset = {
    ...defaults.payload.settings, angle: -45, columns: 4,
    textEnabled: false, text: '我的品牌', textImageDataUrl,
    imageEnabled: true, imageDataUrl, imageName: 'logo.png'
  };
  const saved = await invoke({ method: 'PATCH', headers: first.headers, body: {
    userId: first.user.id, settings: preset
  } });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.payload.settings, preset);
  assert.deepEqual((await invoke({ headers: first.headers })).payload.settings, preset);
  assert.deepEqual((await invoke({ headers: second.headers })).payload.settings, defaults.payload.settings);
  assert.equal(db.getDb().prepare('SELECT COUNT(*) AS count FROM user_ecommerce_watermark_settings').get().count, 1);
  assert.equal(Object.hasOwn(saved.payload.settings, 'active'), false);
  assert.deepEqual(activeEcommerceWatermarkSettings(saved.payload.settings), {
    angle: -45, columns: 4, imageDataUrl
  });
  assert.equal((await invoke({ method: 'PATCH', headers: second.headers, body: {
    userId: first.user.id, settings: defaults.payload.settings
  } })).statusCode, 403);
  assert.deepEqual((await invoke({ headers: first.headers })).payload.settings, preset);
});

test('incomplete settings can be stored, but invalid pixels, oversize text, and missing images cannot be applied', async () => {
  const { user, headers } = auth();
  const defaults = normalizeEcommerceWatermarkSettings({});
  assert.throws(() => activeEcommerceWatermarkSettings(defaults), /WATERMARK_SETTINGS_INCOMPLETE/);
  for (const settings of [
    { ...defaults, columns: 9 },
    { ...defaults, text: '12345678901234567890' },
    { ...defaults, text: '有效文字', textImageDataUrl: 'data:image/png;base64,YWJj' },
    { ...defaults, imageEnabled: true, imageDataUrl: 'data:image/png;base64,YWJj' }
  ]) {
    const result = await invoke({ method: 'PATCH', headers, body: { userId: user.id, settings } });
    assert.equal(result.statusCode, 400);
  }
  const incomplete = await invoke({ method: 'PATCH', headers, body: {
    userId: user.id, settings: { ...defaults, imageEnabled: true }
  } });
  assert.equal(incomplete.statusCode, 200);
  assert.throws(() => activeEcommerceWatermarkSettings(incomplete.payload.settings),
    /WATERMARK_SETTINGS_INCOMPLETE/);
});
