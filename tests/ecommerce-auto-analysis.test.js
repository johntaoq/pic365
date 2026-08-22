import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-ecommerce-auto-analysis-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
process.env.AI_API_KEY = 'test-auto-analysis-key';
process.env.AI_BASE_URL = 'https://provider.example.test';
process.env.AI_BRIEF_MODEL = 'test-vision-model';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const localDb = await import('../api/_lib/local-db.js');
const storage = await import('../api/_lib/storage.js');
const { default: autoFillBriefHandler } = await import('../api/ecommerce/auto-fill-brief.js');

after(() => {
  localDb.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(handler, req = {}) {
  let statusCode = 200;
  let payload;
  const headers = new Map();
  const res = {
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(handler({ method: 'POST', headers: {}, query: {}, ...req }, res))
    .then(() => ({ statusCode, payload, headers }));
}

test('automatic product analysis uses image evidence and categories, persists once, and charges no credits', async () => {
  const user = localDb.createUser({
    email: 'automatic-analysis@example.com',
    password: 'testing-1234',
    fullName: 'Automatic Analysis'
  });
  const session = localDb.createSession(user.id);
  const project = localDb.createEcommerceProject(user.id, {
    projectName: 'Pic365 mineral water',
    platformId: 'taobao-tmall',
    industryId: 'beverage-alcohol',
    subcategoryId: 'water-soft-drinks',
    productName: 'Pic365 矿泉水',
    brandName: 'Pic365',
    coreUser: '',
    coreScenario: '',
    sellingPoints: [],
    specifications: '',
    prohibitedContent: '',
    aiBriefOriginals: {},
    identitySpec: {},
    templateId: 'tmall-clean-launch',
    visualStyleId: 'clean-commercial',
    selectedSlots: ['main-square']
  });
  const assetId = crypto.randomUUID();
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==';
  const persisted = await storage.persistProjectAsset({ userId: user.id, projectId: project.id, assetId, image });
  localDb.createEcommerceProjectAsset(user.id, {
    id: assetId,
    projectId: project.id,
    assetType: 'product',
    fileName: 'pic365-water.png',
    mimeType: persisted.contentType,
    fileSize: persisted.byteLength,
    storagePath: persisted.storagePath,
    purpose: 'master',
    sortOrder: 1
  });
  localDb.setEcommerceProjectMasterAsset(user.id, project.id, assetId);

  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  let providerBody = null;
  globalThis.fetch = async (_url, options) => {
    providerCalls += 1;
    providerBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            coreUser: '重视便捷补水与清晰商品信息的日常消费者',
            coreScenario: '通勤随身携带、办公桌补水与户外短途活动',
            sellingPoints: ['便捷补水', '随身携带', '瓶身清晰'],
            identitySpec: {
              structure: '保持透明圆柱瓶身、瓶肩与横向防滑纹比例一致',
              colorsMaterials: '保持透明 PET 瓶身、无色水体与青绿色瓶盖',
              brandMarks: '保持白色标签上的 Pic365 字样位置与比例',
              packaging: '未提供外包装时不生成额外包装',
              includedItems: '只展示单瓶商品，不增加杯具或赠品',
              mustKeep: '保留瓶型、瓶盖、标签和水位',
              mustAvoid: '不得增加水果口味、功效宣称或不存在的配件'
            }
          })
        }
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const req = {
      headers: { cookie: `member_session=${encodeURIComponent(session.token)}` },
      body: { automatic: true, language: 'zh', projectId: project.id }
    };
    const first = await invoke(autoFillBriefHandler, req);
    assert.equal(first.statusCode, 200);
    assert.equal(first.payload.analyzed, true);
    assert.equal(providerCalls, 1);
    assert.ok(providerBody.messages[1].content.some((item) => item.type === 'image_url'));
    assert.match(providerBody.messages[1].content[0].text, /饮料与酒水 \/ 饮用水与软饮/);

    const analyzed = localDb.getEcommerceProject(user.id, project.id);
    assert.equal(analyzed.coreUser, '重视便捷补水与清晰商品信息的日常消费者');
    assert.equal(analyzed.coreScenario, '通勤随身携带、办公桌补水与户外短途活动');
    assert.deepEqual(analyzed.sellingPoints, ['便捷补水', '随身携带', '瓶身清晰']);
    assert.match(analyzed.identitySpec.structure, /透明圆柱瓶身/);
    assert.equal(analyzed.autoAnalysisStatus, 'completed');
    assert.equal(localDb.getUserProfile(user.id).creditBalance, 0);

    const second = await invoke(autoFillBriefHandler, req);
    assert.equal(second.statusCode, 200);
    assert.equal(second.payload.cached, true);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
