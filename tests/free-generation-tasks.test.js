import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancelFreeGenerationTask,
  hasFreeGenerationTask,
  registerFreeGenerationTask,
  unregisterFreeGenerationTask
} from '../api/_lib/free-generation-tasks.js';

test('free generation tasks are explicitly cancelled before unregistering', () => {
  const userId = `user-${Date.now()}`;
  const taskId = 'queue-task';
  const controller = new AbortController();
  assert.equal(registerFreeGenerationTask(userId, taskId, controller), true);
  assert.equal(hasFreeGenerationTask(userId, taskId), true);
  assert.equal(cancelFreeGenerationTask(userId, taskId), true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(unregisterFreeGenerationTask(userId, taskId, controller), true);
  assert.equal(hasFreeGenerationTask(userId, taskId), false);
});
