import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendImageTask,
  DEFAULT_IMAGE_TASK_CONCURRENCY,
  imageTaskSourceLabel,
  isActiveImageTask,
  MAX_ACTIVE_IMAGE_TASKS,
  MAX_IMAGE_TASKS,
  removeImageTask
} from '../src/image-task-list.js';

test('free workshop queue defaults to three concurrent client tasks', () => {
  assert.equal(DEFAULT_IMAGE_TASK_CONCURRENCY, 3);
});

test('free workshop task list keeps 30 records and evicts the oldest completed record', () => {
  let tasks = [];
  for (let index = 0; index < MAX_IMAGE_TASKS; index += 1) {
    tasks = appendImageTask(tasks, { id: `task-${index}`, status: 'completed' });
  }
  assert.equal(tasks.length, 30);

  const fullList = appendImageTask(tasks, { id: 'task-overflow', status: 'queued' });
  assert.equal(fullList.length, 30);
  assert.equal(fullList.some((task) => task.id === 'task-0'), false);
  assert.equal(fullList.some((task) => task.id === 'task-overflow'), true);

  const afterDelete = removeImageTask(fullList, 'task-1');
  assert.equal(afterDelete.length, 29);
  const afterAppend = appendImageTask(afterDelete, { id: 'task-new', status: 'queued' });
  assert.equal(afterAppend.length, 30);
  assert.equal(afterAppend.some((task) => task.id === 'task-new'), true);
});

test('free workshop task list allows at most 20 unfinished tasks', () => {
  const tasks = Array.from({ length: MAX_ACTIVE_IMAGE_TASKS }, (_, index) => ({ id: `active-${index}`, status: 'queued' }));
  const next = appendImageTask(tasks, { id: 'active-overflow', status: 'queued' });
  assert.equal(next, tasks);
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

test('batch task source labels never expose inherited internal prompts as filenames', () => {
  assert.equal(imageTaskSourceLabel({ sourceName: 'model-a.png', batchIndex: 0 }), 'model-a.png');
  assert.equal(imageTaskSourceLabel({
    sourceName: '参考图使用规则：\n图1：主编辑图\n\n创作要求：更换衣服',
    batchIndex: 2
  }), '图片 3');
  assert.equal(imageTaskSourceLabel({ sourceName: '', batchIndex: 1 }, 'en'), 'Image 2');
});
