import assert from 'node:assert/strict';
import test from 'node:test';

import { runTaskPool } from '../shared/task-pool.js';

test('runTaskPool preserves result order and enforces concurrency', async () => {
  let active = 0;
  let maximumActive = 0;
  const results = await runTaskPool([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, value % 2 ? 8 : 2));
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(results, [10, 20, 30, 40, 50]);
  assert.equal(maximumActive, 2);
});
