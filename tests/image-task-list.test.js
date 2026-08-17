import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendImageTask,
  DEFAULT_IMAGE_TASK_CONCURRENCY,
  isActiveImageTask,
  MAX_IMAGE_TASKS,
  removeImageTask
} from '../src/image-task-list.js';

test('free workshop queue defaults to three concurrent client tasks', () => {
  assert.equal(DEFAULT_IMAGE_TASK_CONCURRENCY, 3);
});

test('free workshop task list has a hard 20-task limit until a task is removed', () => {
  let tasks = [];
  for (let index = 0; index < MAX_IMAGE_TASKS; index += 1) {
    tasks = appendImageTask(tasks, { id: `task-${index}`, status: 'completed' });
  }
  assert.equal(tasks.length, 20);

  const fullList = appendImageTask(tasks, { id: 'task-overflow', status: 'queued' });
  assert.equal(fullList, tasks);
  assert.equal(fullList.some((task) => task.id === 'task-overflow'), false);

  const afterDelete = removeImageTask(tasks, 'task-0');
  assert.equal(afterDelete.length, 19);
  const afterAppend = appendImageTask(afterDelete, { id: 'task-new', status: 'queued' });
  assert.equal(afterAppend.length, 20);
  assert.equal(afterAppend.some((task) => task.id === 'task-new'), true);
});

test('removing a task record does not mutate its completed image results', () => {
  const completedImage = { id: 'image-1', imageUrl: '/api/generated?id=image-1' };
  const task = { id: 'task-1', status: 'completed', results: [completedImage] };
  const remaining = removeImageTask([task], task.id);
  assert.deepEqual(remaining, []);
  assert.deepEqual(task.results, [completedImage]);
});

test('queued and running tasks must be cancelled before deletion', () => {
  const queued = { id: 'queued-task', status: 'queued' };
  const running = { id: 'running-task', status: 'running' };
  const cancelling = { id: 'cancelling-task', status: 'cancelling' };
  const cancelled = { id: 'cancelled-task', status: 'cancelled' };
  const tasks = [queued, running, cancelling, cancelled];

  assert.equal(isActiveImageTask(queued), true);
  assert.equal(isActiveImageTask(running), true);
  assert.equal(isActiveImageTask(cancelling), true);
  assert.equal(isActiveImageTask(cancelled), false);
  assert.equal(removeImageTask(tasks, queued.id), tasks);
  assert.equal(removeImageTask(tasks, running.id), tasks);
  assert.equal(removeImageTask(tasks, cancelling.id), tasks);
  assert.deepEqual(removeImageTask(tasks, cancelled.id), [queued, running, cancelling]);
});
