import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancelGenerationTask,
  registerGenerationTask,
  unregisterGenerationTask
} from '../api/_lib/ecommerce-generation-runtime.js';

test('cancelling an active ecommerce task aborts its provider signal', () => {
  const userId = `user-${Date.now()}`;
  const taskId = `task-${Date.now()}`;
  const controller = registerGenerationTask(userId, taskId);
  try {
    const result = cancelGenerationTask(userId, taskId);
    assert.deepEqual(result, { accepted: true, active: true });
    assert.equal(controller.signal.aborted, true);
  } finally {
    unregisterGenerationTask(userId, taskId);
  }
});
