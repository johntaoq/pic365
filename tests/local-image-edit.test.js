import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { referenceWithEditAnnotations } from '../shared/local-image-edit.js';
import { canvasReferencePrompt } from '../shared/infinite-canvas.js';
import { buildReferencePrompt, normalizeReferenceAnnotations } from '../api/_lib/reference-images.js';
import { IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT } from '../shared/image-prompt-optimizer.js';

const workspace = fs.readFileSync(new URL('../src/free-image-workspace.jsx', import.meta.url), 'utf8');
const canvas = fs.readFileSync(new URL('../src/infinite-image-canvas.jsx', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../src/free-image-reference-editor.jsx', import.meta.url), 'utf8');
const optimizer = fs.readFileSync(new URL('../api/optimize-image-prompt.js', import.meta.url), 'utf8');
const marks = normalizeReferenceAnnotations([{ type: 'rectangle', x1: 0.2, y1: 0.3, x2: 0.4, y2: 0.7 }]);

function actualFunction(source, name, nextName, context) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf(`  function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(`${source.slice(start, end)}\n${name}`, context);
}

function workspaceFixture(overrides = {}) {
  const context = {
    previewImage: { id: 'original-image', imageUrl: '/original.png', prompt: 'Previous full-image prompt' },
    prompt: 'An unrelated old prompt', references: [], maxReferenceImages: 9, modelConstraints: {},
    previewPromptEdited: false, previewPrompt: '',
    referenceAllowedForModel: () => true,
    t: { localEditPrompt: 'Legacy instructional text', localEditReady: 'Ready' },
    referenceWithEditAnnotations,
    imageItemMimeType: () => 'image/png',
    applyReferenceCanvasSize: () => {},
    textareaRef: { current: { focus() {}, setSelectionRange() {} } },
    requestAnimationFrame: (callback) => callback(),
    setPreviewImage: (value) => { context.previewImage = value; },
    setPreviewEditReference: (value) => { context.previewEditReference = value; },
    setPreviewPrompt: (value) => { context.previewPrompt = value; },
    setReferences: (value) => { context.references = value; },
    setPrompt: (value) => { context.prompt = value; },
    setPromptOptimized: () => {}, setMention: () => {}, setCount: () => {}, setWorkspaceTab: () => {},
    setState: (value) => { context.state = value; },
    ...overrides
  };
  return context;
}

test('starting a region edit does not copy help text or the previous generation prompt', () => {
  const context = workspaceFixture();
  actualFunction(workspace, 'startPreviewRegionEdit', 'createLocalEditTask', context)();
  assert.equal(context.previewEditReference.localEditDraft, '');
  assert.equal(context.previewPrompt, '');
  assert.equal(context.previewEditReference.imageUrl, '/original.png');
});

test('reopening an edit guide preserves only its current user draft and clean original', () => {
  const context = workspaceFixture({
    prompt: '移除杯子，补齐桌面。',
    previewImage: { id: 'original-image', status: 'edit-guide', imageUrl: '/marked.png', originalImageUrl: '/clean.png' }
  });
  actualFunction(workspace, 'startPreviewRegionEdit', 'createLocalEditTask', context)();
  assert.equal(context.previewEditReference.localEditDraft, context.prompt);
  assert.equal(context.previewEditReference.imageUrl, '/clean.png');
});

test('a user-written preview edit is retained instead of being mistaken for default help text', () => {
  const context = workspaceFixture({ previewPromptEdited: true, previewPrompt: '移除吊牌，补齐包身。' });
  actualFunction(workspace, 'startPreviewRegionEdit', 'createLocalEditTask', context)();
  assert.equal(context.previewEditReference.localEditDraft, '移除吊牌，补齐包身。');
});

test('a new single-image local edit has an empty prompt, not instructions or an @ token', () => {
  const context = workspaceFixture();
  actualFunction(workspace, 'createLocalEditTask', 'showHistoryImage', context)(
    { id: 'original-image', imageUrl: '/clean.png', localEditPrompt: 'Legacy instructional text' }, marks, '/marked.png'
  );
  assert.equal(context.prompt, '');
  assert.equal(context.state.results[0].prompt, '');
  assert.equal(context.references[0].imageUrl, '/clean.png');
  assert.equal(context.references[0].markedImageUrl, '/marked.png');
  assert.equal(context.state.results[0].status, 'edit-guide');
});

test('saving marks never overwrites a genuine user draft', () => {
  const context = workspaceFixture();
  const draft = '把吊牌改为红色。';
  actualFunction(workspace, 'createLocalEditTask', 'showHistoryImage', context)(
    { id: 'original-image', imageUrl: '/clean.png', localEditDraft: draft }, marks, '/marked.png'
  );
  assert.equal(context.prompt, draft);
  assert.equal(context.state.results[0].prompt, draft);
});

test('clearing marks also clears their thumbnail and cannot reuse a baked-in preview', () => {
  const reference = { id: 'image', imageUrl: '/old-marked.png', originalImageUrl: '/clean.png', markedImageUrl: '/old-marked.png', thumbnailUrl: '/old-marked.png' };
  const cleared = referenceWithEditAnnotations(reference, [], '/canvas-without-marks.png');
  assert.equal(cleared.markedImageUrl, '');
  assert.equal(cleared.imageUrl, '/clean.png');
  assert.equal(cleared.thumbnailUrl, '/clean.png');
  const changed = referenceWithEditAnnotations(reference, marks);
  assert.equal(changed.markedImageUrl, '');
  assert.equal(changed.thumbnailUrl, '/clean.png');
  assert.equal(reference.thumbnailUrl, '/old-marked.png');
});

test('the editor always draws on the clean original, not a previous marked preview', () => {
  assert.match(editor, /const originalImageUrl = reference\.originalImageUrl \|\| reference\.imageUrl/);
  assert.match(editor, /image\.src = originalImageUrl/);
  assert.match(workspace, /placeholder=\{localEditLockedRule \? t\.localEditPlaceholder/);
  assert.doesNotMatch(workspace, /setPrompt\([^\n]*t\.localEditPlaceholder/);
});

test('clearing guides restores the small clean thumbnail rather than forcing a full-image download', () => {
  const marked = referenceWithEditAnnotations({ imageUrl: '/original.png', thumbnailUrl: '/thumbnail.webp' }, marks, '/marked.png');
  assert.equal(marked.originalThumbnailUrl, '/thumbnail.webp');
  const cleared = referenceWithEditAnnotations(marked, []);
  assert.equal(cleared.thumbnailUrl, '/thumbnail.webp');
  assert.equal(cleared.imageUrl, '/original.png');
});

for (const draft of ['', '去掉吊牌，补齐包身。']) {
  test(`canvas mark saving preserves the user draft (${draft ? 'written' : 'empty'})`, () => {
    const node = { id: 'image', type: 'image', prompt: 'Previous full-image prompt', draftPrompt: draft, imageUrl: '/clean.png' };
    const context = {
      editNode: node, nodes: [node], prompt: 'Old selected prompt', t: { localEditReady: 'Ready' },
      rememberCanvasState: () => {},
      setNodes: (update) => { context.nodes = update(context.nodes); },
      setSelectedId: () => {}, setSelectedIds: () => {}, setMessage: () => {},
      setPrompt: (value) => { context.prompt = value; },
      setCreationMode: (value) => { context.mode = value; },
      setComposerCollapsed: (value) => { context.collapsed = value; },
      setEditNode: (value) => { context.editNode = value; }
    };
    actualFunction(canvas, 'saveLocalEditAnnotations', 'selectNode', context)(marks);
    assert.equal(context.prompt, draft);
    assert.equal(context.nodes[0].draftPrompt, draft);
    assert.equal(context.nodes[0].imageUrl, '/clean.png');
    assert.equal(context.mode, 'image');
    assert.equal(context.collapsed, false);
  });
}

test('canvas local-edit requests avoid duplicate naming and preserve multi-reference roles', () => {
  const userPrompt = '移除吊牌，补齐包身。';
  assert.equal(canvasReferencePrompt(userPrompt, [{ annotations: marks, name: '包包' }]), userPrompt);
  const multiple = canvasReferencePrompt(userPrompt, [
    { annotations: marks, name: '包包' }, { name: '配色', referenceRole: 'color' }
  ]);
  assert.match(multiple, /图1 \(包包\): 母版/);
  assert.match(multiple, /图2 \(配色\): 色彩参考/);
  assert.ok(multiple.endsWith(userPrompt));
  assert.doesNotMatch(multiple, /解释规则/);
});

test('all annotation tools request complete mark removal without changing the actual user prompt', () => {
  const userPrompt = '把杯子换成玻璃杯。';
  for (const type of ['brush', 'rectangle', 'ellipse', 'line']) {
    const annotations = normalizeReferenceAnnotations([{ type, points: [{ x: 0.3, y: 0.4 }, { x: 0.6, y: 0.7 }] }]);
    const prompt = buildReferencePrompt(userPrompt, [{ annotations }]);
    assert.ok(prompt.endsWith(`User request:\n${userPrompt}`));
    assert.match(prompt, /temporary editing guides, not image content/);
    assert.match(prompt, /Remove all guide paint, tint and outlines, including boundary strokes/);
    assert.ok(prompt.length < 500);
  }
});

test('local-edit optimizer fallback retains the exact input and adds no tutorial boilerplate', () => {
  const start = optimizer.indexOf('function fallbackPrompt(');
  const end = optimizer.indexOf('export default async function handler', start);
  const fallback = vm.runInNewContext(`${optimizer.slice(start, end)}\nfallbackPrompt`, { MAX_PROMPT_LENGTH: 6000 });
  const prompt = '去掉吊牌，补齐包身。';
  assert.equal(fallback(prompt, { language: 'zh', referenceCount: 1, hasAnnotations: true }), prompt);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /short, precise description of the requested change/);
  assert.match(IMAGE_PROMPT_OPTIMIZER_SYSTEM_PROMPT, /Do not expand it into a full-scene prompt/);
  assert.match(fallback(prompt, { language: 'zh', referenceCount: 0, hasAnnotations: false }), /画面要求/);
});
