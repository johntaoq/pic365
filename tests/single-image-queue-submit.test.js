import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { imageStudioFeedbackState } from '../src/image-studio-feedback.js';

const source = fs.readFileSync(new URL('../src/free-image-workspace.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/free-image-studio.css', import.meta.url), 'utf8');

// Exercise the component's actual handler with controlled network responses.
const handler = source.slice(source.indexOf('  async function queueCurrentGeneration()'),
  source.indexOf('  async function deleteQueueTask('));
const failureText = source.slice(source.indexOf('function generationFailureText('),
  source.indexOf('function taskFailureText('));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function fixture(overrides = {}) {
  const network = deferred();
  const originalResults = [{ id: 'previous-image' }];
  const state = {
    status: 'success', results: originalResults, message: '', messageTone: 'status'
  };
  const context = {
    prompt: '  A product photo  ', hasFullWorkspace: true, isSignedIn: true,
    isGenerating: false, sizeCheck: { valid: true }, size: '1024x1024', quality: 'low', count: 1,
    referencesValid: true, references: [], activeQueueTaskCount: 0, MAX_ACTIVE_IMAGE_TASKS: 20,
    queueTasks: [], providerId: 'test-provider', stylePresetId: '', maxReferenceImages: 3,
    singleSubmitLockRef: { current: false }, submitting: false, state,
    t: { queueSubmitting: 'Submitting', queueAdded: 'Queued', failed: 'Generation failed', queueSubmitFailed: 'Failed',
      queueFull: 'Full', emptyPrompt: 'Empty' },
    requests: [], refreshes: 0, workspaceTab: 'control',
    fetch(url, init) {
      this.requests.push({ url, ...JSON.parse(init.body) });
      return network.promise;
    },
    setQueueSubmitting(value) { context.submitting = value; },
    setState(update) { context.state = imageStudioFeedbackState(context.state, update); },
    setQueueTasks(update) { context.queueTasks = update(context.queueTasks); },
    setWorkspaceTab(value) { context.workspaceTab = value; },
    refreshQueueTasksNow() { context.refreshes += 1; },
    ...overrides
  };
  // The browser's global fetch has no receiver; bind the test double explicitly.
  context.fetch = context.fetch.bind(context);
  const queue = vm.runInNewContext(`${failureText}\n${handler}\nqueueCurrentGeneration`, context);
  return { context, network, queue, originalResults };
}

function success(id = 'task-1') {
  return { ok: true, json: async () => ({ ok: true, task: { id, status: 'queued' } }) };
}

test('rapid clicks submit once and expose busy feedback before the response', async () => {
  const { context, network, queue, originalResults } = fixture();
  const pending = queue();
  assert.equal(context.submitting, true);
  assert.equal(context.singleSubmitLockRef.current, true);
  assert.equal(context.state.message, 'Submitting');
  assert.equal(context.state.messageTone, 'status');
  assert.equal(context.state.results, originalResults);
  await Promise.all([queue(), queue(), queue()]);
  assert.equal(context.requests.length, 1);
  assert.equal(context.requests[0].prompt, 'A product photo');
  assert.equal(context.requests[0].size, '1024x1024');
  assert.equal(context.requests[0].quality, 'low');
  network.resolve(success());
  await pending;
  assert.equal(context.submitting, false);
  assert.equal(context.singleSubmitLockRef.current, false);
  assert.equal(context.queueTasks.length, 1);
  assert.equal(context.workspaceTab, 'tasks');
  assert.equal(context.state.message, 'Queued');
  assert.equal(context.state.messageTone, 'status');
  assert.equal(context.refreshes, 1);
});

test('the lock remains held until the response body is read', async () => {
  const { context, network, queue } = fixture();
  const body = deferred();
  const pending = queue();
  network.resolve({ ok: true, json: () => body.promise });
  await Promise.resolve();
  await queue();
  assert.equal(context.requests.length, 1);
  assert.equal(context.submitting, true);
  body.resolve({ ok: true, task: { id: 'slow-body' } });
  await pending;
  assert.equal(context.submitting, false);
});

test('network failure shows an error and releases the controls', async () => {
  const { context, network, queue } = fixture();
  const pending = queue();
  network.reject(new Error('Network unavailable'));
  await pending;
  assert.equal(context.submitting, false);
  assert.equal(context.singleSubmitLockRef.current, false);
  assert.equal(context.state.message, 'Failed');
  assert.equal(context.state.messageTone, 'error');
  assert.equal(context.workspaceTab, 'control');
});

test('server rejection releases the lock and keeps its existing error mapping', async () => {
  const { context, network, queue } = fixture();
  const pending = queue();
  network.resolve({ ok: false, json: async () => ({ ok: false, error: 'TASK_ACTIVE_LIMIT' }) });
  await pending;
  assert.equal(context.state.message, 'Full');
  assert.equal(context.submitting, false);
  assert.equal(context.singleSubmitLockRef.current, false);
  assert.equal(context.queueTasks.length, 0);
});

test('malformed success does not create a phantom task or leave submission locked', async () => {
  const { context, network, queue } = fixture();
  const pending = queue();
  network.resolve({ ok: true, json: async () => ({ ok: true }) });
  await pending;
  assert.equal(context.state.messageTone, 'error');
  assert.equal(context.queueTasks.length, 0);
  assert.equal(context.submitting, false);
  assert.equal(context.singleSubmitLockRef.current, false);
});

test('a later intentional submission is still allowed after success', async () => {
  const { context, network, queue } = fixture();
  const first = queue();
  network.resolve(success());
  await first;
  context.prompt = 'Another product photo';
  await queue();
  assert.equal(context.requests.length, 2);
  assert.equal(context.requests[1].prompt, 'Another product photo');
});

test('immediate generation and queue submission share the synchronous lock', async () => {
  const { context, queue } = fixture({ singleSubmitLockRef: { current: true } });
  await queue();
  assert.equal(context.requests.length, 0);
  assert.equal(context.submitting, false);
  const directSubmit = source.slice(source.indexOf('  async function handleSubmit('), source.indexOf('\n  return (\n    <div', source.indexOf('  async function handleSubmit(')));
  assert.match(directSubmit, /if \(singleSubmitLockRef\.current \|\| isGenerating\) return/);
});

test('invalid prompt is rejected without entering a submitting state', async () => {
  const { context, queue } = fixture({ prompt: '  ' });
  await queue();
  assert.equal(context.state.message, 'Empty');
  assert.equal(context.submitting, false);
  assert.equal(context.singleSubmitLockRef.current, false);
  assert.equal(context.requests.length, 0);
});

test('the queue button has a visible spinner, busy state and mutual disable protection', () => {
  const buttons = source.slice(source.indexOf('<div className="freeImageGenerateActions">'),
    source.indexOf('<div className="freeImageBatchActions">'));
  assert.match(buttons, /freeImageGenerateButton[^\n]*disabled=\{queueSubmitting \|\| singleSubmitLocked/);
  assert.match(buttons, /disabled=\{queueSubmitting \|\| singleSubmitLocked \|\| isGenerating/);
  assert.match(buttons, /aria-busy=\{queueSubmitting\}/);
  assert.match(buttons, /queueSubmitting \? <LoaderCircle size=\{18\} className="spin"/);
  assert.match(buttons, /<span>\{queueSubmitting \? t\.queueSubmitting/);
  assert.match(css, /freeImageQueueButton\[aria-busy="true"\][^\n]*opacity: 1/);
  assert.match(css, /freeImageGenerateActions > \.freeImageQueueButton[^\n]*min-width: 128px/);
});
