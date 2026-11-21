import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SYSTEM_TRY_ON_MODELS, MODEL_BACKGROUNDS, TRY_ON_REFERENCE_ORDER, isModelPhotoProvider, buildModelPhotoPrompt, buildClothingTryOnPrompt, normalizeAdultModelDefinition, normalizeClothingStudioRequest, validateClothingStudioRequest } from '../shared/clothing-try-on.js';

const definition = SYSTEM_TRY_ON_MODELS[0];
const workflow = { kind: 'clothing-try-on', referenceOrder: TRY_ON_REFERENCE_ORDER, adultConfirmed: true, modelSource: 'system', modelId: definition.id, garmentType: 'top', notes: '展示自然褶皱' };

test('the catalog defines ten adult women and ten adult men with modest outfits and premium backgrounds', () => {
  assert.equal(SYSTEM_TRY_ON_MODELS.length, 20);
  assert.equal(SYSTEM_TRY_ON_MODELS.filter(item => item.gender === 'female').length, 10);
  assert.equal(SYSTEM_TRY_ON_MODELS.filter(item => item.gender === 'male').length, 10);
  assert.equal(new Set(SYSTEM_TRY_ON_MODELS.map(item => item.id)).size, 20);
  for (const model of SYSTEM_TRY_ON_MODELS) {
    assert.ok(model.age >= 22 && model.age <= 55);
    assert.ok(MODEL_BACKGROUNDS.some(background => background.id === model.backgroundId));
    const prompt = buildModelPhotoPrompt(model);
    assert.match(prompt, /fictional adult/);
    assert.match(prompt, /Fully and modestly dressed/);
    assert.match(prompt, /Full body/);
    assert.match(prompt, /no underwear or nudity/);
  }
});

test('every bundled model is a real generated image2.5 Low photo with recorded provenance', () => {
  const root = path.resolve('src/assets/try-on-models/generated');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const model of SYSTEM_TRY_ON_MODELS) {
    assert.equal(manifest.models[model.id].quality, 'low');
    assert.ok(isModelPhotoProvider(manifest.models[model.id].model));
    assert.ok(fs.statSync(path.join(root, model.artwork)).size > 1000);
    assert.equal(manifest.models[model.id].width, 1024);
    assert.equal(manifest.models[model.id].height, 1536);
  }
});

test('model creation rejects medium, high, auto, absent quality and any non-image2.5 provider', () => {
  const request = { studioWorkflow: { kind: 'model-creation', definition }, quality: 'low', count: 1, references: [] };
  for (const model of ['gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']) {
    assert.equal(validateClothingStudioRequest(request, { model }).kind, 'model-creation');
    for (const quality of ['medium', 'high', 'auto', undefined]) assert.throws(() => validateClothingStudioRequest({ ...request, quality }, { model }), { code: 'MODEL_LOW_QUALITY_REQUIRED' });
  }
  for (const model of ['gpt-image-2', 'gemini-3.1-flash-image', 'gpt-image-2.50', 'other-gpt-image-2.5']) assert.throws(() => validateClothingStudioRequest(request, { model }), { code: 'MODEL_IMAGE_25_REQUIRED' });
  assert.throws(() => validateClothingStudioRequest({ ...request, count: 2 }, { model: 'gpt-image-2.5' }), { code: 'INVALID_MODEL_PHOTO_REQUEST' });
  assert.throws(() => validateClothingStudioRequest({ ...request, references: [{ assetId: 'photo' }] }, { model: 'gpt-image-2.5' }), { code: 'INVALID_MODEL_PHOTO_REQUEST' });
});

test('custom definitions require explicit adult ages and an approved background', () => {
  for (const age of [17, 0, -1, 81, 30.5, '', 'bad']) assert.throws(() => normalizeAdultModelDefinition({ ...definition, age }), { code: 'ADULT_MODEL_REQUIRED' });
  assert.equal(normalizeAdultModelDefinition({ ...definition, age: 18 }).age, 18);
  assert.throws(() => normalizeAdultModelDefinition({ ...definition, backgroundId: 'unknown' }), { code: 'INVALID_MODEL_BACKGROUND' });
});

test('try-on fixes the garment to reference one and the adult model to reference two without changing output quality', () => {
  const references = [{ assetId: 'garment' }, { assetId: 'model' }];
  const request = { studioWorkflow: workflow, quality: 'high', references };
  assert.equal(validateClothingStudioRequest(request, { model: 'gpt-image-2' }).kind, 'clothing-try-on');
  assert.equal(request.quality, 'high');
  assert.deepEqual(request.references, references);
  for (const refs of [[], references.slice(0, 1), [...references, { assetId: 'extra' }]]) assert.throws(() => validateClothingStudioRequest({ ...request, references: refs }, { model: 'gpt-image-2' }), { code: 'TRY_ON_TWO_REFERENCES_REQUIRED' });
  assert.throws(() => validateClothingStudioRequest({ ...request, studioWorkflow: { ...workflow, adultConfirmed: false } }, { model: 'gpt-image-2' }), { code: 'ADULT_MODEL_CONFIRMATION_REQUIRED' });
  const prompt = buildClothingTryOnPrompt(workflow);
  assert.match(prompt, /REFERENCE 1 is the GARMENT PRODUCT/);
  assert.match(prompt, /REFERENCE 2 is the ADULT MODEL/);
  assert.match(prompt, /NOT an identity reference/);
  assert.match(prompt, /garment from reference 1 naturally to the adult model in reference 2/);
  assert.match(prompt, /replace only the top/);
  assert.match(prompt, /background are locked/);
  assert.match(buildClothingTryOnPrompt({ ...workflow, garmentType: 'auto' }), /infer the garment category from reference 1/);
});

test('persisted legacy try-on snapshots reverse only once and preserve the original data', () => {
  const legacyWorkflow = { ...workflow };
  delete legacyWorkflow.referenceOrder;
  const legacy = { studioWorkflow: legacyWorkflow, references: [{ assetId: 'model' }, { assetId: 'garment' }], quality: 'high' };
  const original = structuredClone(legacy);
  const canonical = normalizeClothingStudioRequest(legacy, { legacyStored: true });
  assert.equal(canonical.studioWorkflow.referenceOrder, TRY_ON_REFERENCE_ORDER);
  assert.deepEqual(canonical.references, [{ assetId: 'garment' }, { assetId: 'model' }]);
  assert.equal(canonical.quality, 'high');
  assert.deepEqual(legacy, original);
  assert.deepEqual(normalizeClothingStudioRequest(canonical, { legacyStored: true }), canonical);
  assert.deepEqual(normalizeClothingStudioRequest({ ...legacy, studioWorkflow: { ...legacyWorkflow, referenceOrder: 'model-garment' } }).references, canonical.references);
});

test('new requests without an order marker are garment-first and ordinary references are untouched', () => {
  const unversionedWorkflow = { ...workflow };
  delete unversionedWorkflow.referenceOrder;
  const references = [{ assetId: 'garment' }, { assetId: 'model' }];
  const canonical = normalizeClothingStudioRequest({ studioWorkflow: unversionedWorkflow, references });
  assert.deepEqual(canonical.references, references);
  assert.equal(canonical.studioWorkflow.referenceOrder, TRY_ON_REFERENCE_ORDER);
  const ordinary = { references, prompt: 'Ordinary editing', quality: 'high' };
  assert.equal(normalizeClothingStudioRequest(ordinary, { legacyStored: true }), ordinary);
  assert.throws(() => normalizeClothingStudioRequest({ studioWorkflow: { ...workflow, referenceOrder: 'arbitrary-order' }, references }), { code: 'INVALID_CLOTHING_WORKFLOW' });
});

test('try-on UI renders garment first and keeps the existing shared typography and image settings', () => {
  const source = fs.readFileSync(path.resolve('src/clothing-try-on-studio.jsx'), 'utf8');
  const pair = source.slice(source.indexOf('<div className="tryOnReferencePair">'), source.indexOf('<input ref={garmentInput}'));
  assert.ok(pair.indexOf('tryOnReferenceSlot garment') < pair.indexOf('tryOnReferenceSlot model'));
  assert.match(pair, /01 · \{say\('衣服', 'Garment'\)\}/);
  assert.match(pair, /02 · \{say\('模特', 'Model'\)\}/);
  assert.match(source, /request\.references = \[garment\.assetId[\s\S]*?await modelReference\(selectedModel\)\]/);
  assert.match(source, /referenceOrder: TRY_ON_REFERENCE_ORDER/);
  assert.match(source, /<FreeImageSettings \{\.\.\.imageSettings\}/);
  assert.match(source, /quality="low" qualityLocked/);
  const css = fs.readFileSync(path.resolve('src/clothing-try-on-studio.css'), 'utf8');
  assert.match(css, /font-family: var\(--font-ui\)/);
});

test('try-on and model creation use the shared generate buttons with a dynamic inline credit reserve', () => {
  const source = fs.readFileSync(path.resolve('src/clothing-try-on-studio.jsx'), 'utf8');
  const footer = source.slice(source.indexOf('<footer className="studioComposerFooter">'), source.indexOf('</form>'));
  assert.match(footer, /<ImagePlus size=\{19\}/);
  assert.match(footer, /className="freeImageGenerateLabel"[\s\S]*?'立即生图'/);
  assert.match(footer, /<ImageCreditPrice[\s\S]*?quantity=\{imageSettings\.count\}[\s\S]*?compact totalOnly/);
  assert.match(footer, /<ListTodo size=\{18\} \/>\{say\('加入队列', 'Add to queue'\)\}/);
  assert.doesNotMatch(footer, /tryOnPriceRow|立即生成换装照|预留 10/);
  assert.match(source, /const submitDisabled = disabled \|\| \(signedIn && \(!inputsReady/);
  const modalFooter = source.slice(source.indexOf('<footer className="tryOnModalFooter">'), source.indexOf('</StudioModal>'));
  assert.match(modalFooter, /modelQuote\.loading \? null : modelQuote\.pricing/);
  assert.match(modalFooter, /compact totalOnly/);
  assert.match(modalFooter, /保存我的模特/);
  assert.match(source, /quality="low" qualityLocked/);
});

test('failed try-on and model operations use theme-aware red alerts without recoloring ordinary notices', () => {
  const source = fs.readFileSync(path.resolve('src/clothing-try-on-studio.jsx'), 'utf8');
  const css = fs.readFileSync(path.resolve('src/free-image-studio.css'), 'utf8');
  assert.match(source, /操作未完成，请稍后重试；已生成的图片可在生成历史中查看。/);
  assert.match(source, /setNotice\(\{ text: errorText\(error\), error: true \}\)/);
  assert.equal(source.match(/<ImageStudioFeedback className="tryOnNotice" tone=\{notice\.error \? 'error' : 'status'\}/g)?.length, 2);
  assert.match(source, /部分图片已生成[^\n]*error: Boolean\(payload\.partial\)/);
  assert.match(css, /--studio-error: #ff9d9d/);
  assert.match(css, /\.siteThemeLight \.freeImageStudioV2\.freeImageWorkspace \{[^}]*--studio-error: #b83249/);
  assert.match(css, /\.imageStudioFeedback\[data-tone="error"\] \{[^}]*color: var\(--studio-error\)[^}]*border-left: 3px solid var\(--studio-error\)/);
  assert.match(css, /\.imageStudioFeedback \{[^}]*color: var\(--studio-accent\)/);
});

test('the model showcase is an independent middle column beside configuration and before results', () => {
  const source = fs.readFileSync(path.resolve('src/clothing-try-on-studio.jsx'), 'utf8');
  const formEnd = source.indexOf('</form>');
  const showcaseStart = source.indexOf('<section className="tryOnModelShowcase"');
  const resultsStart = source.indexOf('<section className="freeImageResults studioResultsPanel tryOnResults"');
  assert.ok(formEnd < showcaseStart && showcaseStart < resultsStart);
  assert.doesNotMatch(source.slice(source.indexOf('<form className="freeImageComposer"'), formEnd), /tryOnModelGrid|tryOnModelFilters|自定义模特/);
  const showcase = source.slice(showcaseStart, resultsStart);
  assert.match(showcase, /模特橱窗/);
  assert.match(showcase, /自动填入参考图2/);
  assert.match(showcase, /onClick=\{\(\) => setSelectedId\(model\.id\)\}/);
  assert.match(showcase, /onClick=\{openModelModal\}/);
  assert.match(showcase, /模特性别筛选/);
  assert.match(showcase, /我的模特/);
  assert.doesNotMatch(source, /tryOnGridSpacer/);
  const css = fs.readFileSync(path.resolve('src/clothing-try-on-studio.css'), 'utf8');
  const layoutCss = fs.readFileSync(path.resolve('src/ecommerce-layout-studio.css'), 'utf8');
  const columns = 'grid-template-columns: minmax(0,3fr) minmax(0,3fr) minmax(0,4fr)';
  assert.ok(css.includes(columns) && layoutCss.includes(columns));
  assert.match(css, /\.tryOnModelGrid \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)[^}]*overflow: auto/);
  assert.match(css, /@media\(max-width:660px\)[\s\S]*grid-template-columns: minmax\(0,1fr\)/);
});
