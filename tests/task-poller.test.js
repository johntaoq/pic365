import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskPoller } from '../src/task-poller.js';

function fixture(load) {
  let id = 0;
  let active = true;
  const timers = new Map();
  const document = new EventTarget();
  document.hidden = false;
  const events = new EventTarget();
  const poller = createTaskPoller({ load, hasActiveTasks: () => active, document, events,
    setTimer: (fn, delay) => { const key = ++id; timers.set(key, { fn, delay }); return key; },
    clearTimer: (key) => timers.delete(key) });
  return { poller, timers, document, events, setActive(value) { active = value; } };
}

test('polls and manual refreshes share one in-flight request', async () => {
  let complete;
  let calls = 0;
  const f = fixture(() => { calls += 1; return new Promise((resolve) => { complete = resolve; }); });
  const first = f.poller.refresh();
  assert.equal(first, f.poller.refresh());
  await Promise.resolve();
  assert.equal(calls, 1);
  complete(true);
  await first;
  assert.deepEqual([...f.timers.values()].map((t) => t.delay), [1500]);
  f.setActive(false);
  const idle = f.poller.refresh();
  await Promise.resolve();
  complete(true);
  await idle;
  assert.deepEqual([...f.timers.values()].map((t) => t.delay), [15000]);
  f.poller.stop();
});

test('hidden tabs slow down, visible tabs refresh immediately and stop aborts requests', async () => {
  let signal;
  let calls = 0;
  const f = fixture((value) => { signal = value; calls += 1; return true; });
  await f.poller.refresh();
  f.document.hidden = true;
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual([...f.timers.values()].map((t) => t.delay), [60000]);
  f.document.hidden = false;
  f.document.dispatchEvent(new Event('visibilitychange'));
  await f.poller.refresh();
  assert.equal(calls, 2);
  f.poller.stop();
  assert.equal(signal.aborted, true);
  assert.equal(f.timers.size, 0);
  f.events.dispatchEvent(new Event('online'));
  assert.equal(calls, 2);
});

test('failed requests back off without unhandled rejections', async () => {
  const f = fixture(() => { throw new Error('offline'); });
  await f.poller.refresh();
  assert.deepEqual([...f.timers.values()].map((t) => t.delay), [3000]);
  await f.poller.refresh();
  assert.deepEqual([...f.timers.values()].map((t) => t.delay), [6000]);
  f.poller.stop();
});
