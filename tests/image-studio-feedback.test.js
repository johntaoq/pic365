import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { imageStudioFeedbackState, imageStudioFeedbackTone } from '../src/image-studio-feedback.js';

const read = name => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('new failures are red alerts even when earlier successful image results remain available', () => {
  const previous = { status: 'success', results: [{ id: 'saved-image' }], message: 'Ready', messageTone: 'status' };
  const snapshot = structuredClone(previous);
  const next = imageStudioFeedbackState(previous, current => ({ ...current, message: 'Generation failed' }));
  assert.equal(next.status, 'success');
  assert.equal(next.messageTone, 'error');
  assert.equal(next.results, previous.results);
  assert.deepEqual(previous, snapshot);
});

test('queue, success and warning notices use explicit severity without changing generation state', () => {
  const initial = { status: 'idle', results: [], message: '', messageTone: 'status' };
  for (const feedbackTone of ['error', 'warning', 'status']) {
    const next = imageStudioFeedbackState(initial, { ...initial, message: 'Notice', feedbackTone });
    assert.equal(next.messageTone, feedbackTone);
    assert.equal(next.status, 'idle');
    assert.equal('feedbackTone' in next, false);
  }
  assert.equal(imageStudioFeedbackTone(undefined), 'error');
  assert.equal(imageStudioFeedbackTone('unknown'), 'error');
});

test('background result updates preserve an existing notice severity and clearing resets it', () => {
  const previous = { status: 'success', results: [], message: 'Some images failed', messageTone: 'error' };
  const next = imageStudioFeedbackState(previous, current => ({ ...current, results: [{ id: 'completed' }] }));
  assert.equal(next.messageTone, 'error');
  const repeated = imageStudioFeedbackState(next, current => ({ ...current, message: 'Some images failed' }));
  assert.equal(repeated.messageTone, 'error');
  const cleared = imageStudioFeedbackState(repeated, current => ({ ...current, message: '' }));
  assert.equal(cleared.messageTone, 'status');
  assert.equal(cleared.results, next.results);
});

test('partial completion remains an error notice while completed images remain viewable', () => {
  const next = imageStudioFeedbackState({ message: '' }, {
    status: 'success', results: [{ id: 'completed' }], message: '1 of 2 images completed', feedbackTone: 'error'
  });
  assert.equal(next.status, 'success');
  assert.equal(next.messageTone, 'error');
  assert.equal(next.results.length, 1);
  const workspace = read('free-image-workspace.jsx');
  assert.match(workspace, /feedbackTone: payload\.partial \? 'error' : 'status'/);
});

test('all inspiration image editors and the task list use the shared accessible feedback component', () => {
  const component = read('image-studio-feedback.jsx');
  assert.match(component, /role=\{severity === 'error' \? 'alert' : 'status'\}/);
  assert.match(component, /data-tone=\{severity\}/);
  assert.match(component, /<CircleAlert[^>]*aria-hidden="true"/);
  const workspace = read('free-image-workspace.jsx');
  assert.equal(workspace.match(/<ImageStudioFeedback className="freeImageMessage" tone=\{state\.messageTone\}/g)?.length, 2);
  assert.match(workspace, /imageStudioFeedbackState\(previous, update\)/);
  assert.match(workspace, /message: t\.redoQueued, feedbackTone: 'status'/);
  assert.match(workspace, /message: t\.cancelTaskDone, feedbackTone: 'status'/);
  const layouts = read('ecommerce-layout-studio.jsx');
  assert.match(layouts, /setMessage\(t\.saved, 'status'\)/);
  assert.match(layouts, /<ImageStudioFeedback className="layoutStudioMessage" tone=\{messageTone\}/);
  const tryOn = read('clothing-try-on-studio.jsx');
  assert.equal(tryOn.match(/<ImageStudioFeedback className="tryOnNotice" tone=/g)?.length, 2);
  assert.match(tryOn, /failedTryOnTasks\.length > 0[^\n]*<ImageStudioFeedback>/);
  assert.match(workspace, /pricingError \? <ImageStudioFeedback>\{t\.quoteFailed\}/);
  assert.match(tryOn, /modelQuote\.error[^\n]*<ImageStudioFeedback/);
});

test('all three themes share accessible error colors without coloring cancelled tasks as failures', () => {
  const css = read('free-image-studio.css');
  assert.match(css, /--studio-error: #ff9d9d/);
  assert.match(css, /\.siteThemeLight \.freeImageStudioV2\.freeImageWorkspace \{[^}]*--studio-error: #b83249/);
  assert.match(css, /\.imageStudioFeedback\[data-tone="error"\] \{[^}]*color: var\(--studio-error\)/);
  assert.match(css, /\.imageStudioFeedback\[data-tone="warning"\] \{[^}]*color: var\(--studio-warning\)/);
  assert.match(css, /\.freeImageTaskItem\.failed \.freeImageTaskStatus > span \{[^}]*color: var\(--studio-error\)/);
  assert.match(css, /\.layoutStudioTaskTile:is\(\.failed,\.unavailable\) \.layoutStudioTileState \{[^}]*color: var\(--studio-error\)/);
  assert.match(css, /\.layoutStudioTaskTile\.cancelled \.layoutStudioTileState \{ color: var\(--studio-muted\)/);
  assert.doesNotMatch(read('ecommerce-layout-studio.css'), /\.failed,\.cancelled,\.interrupted[^}]*color/);
});

test('error text maintains at least 4.5 to 1 contrast in light, dark and black themes', () => {
  const rgb = hex => hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const luminance = values => values.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  for (const [text, field] of [['ff9d9d', '292d32'], ['ff9d9d', '080808'], ['b83249', 'f5f7f8']]) {
    const foreground = rgb(text);
    const background = rgb(field).map((value, index) => value * 0.92 + foreground[index] * 0.08);
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `Insufficient contrast for ${text} on ${field}`);
  }
});
