import { EventEmitter } from 'node:events';

import generateSlotHandler from '../api/ecommerce/generate-slot.js';
import { claimQueuedEcommerceGenerationTasks, completeEcommerceGenerationTask } from '../api/_lib/ecommerce-p1-db.js';
import { INTERNAL_AUTH_CONTEXT } from '../api/_lib/local-auth.js';

const WORKER_KEY = Symbol.for('pic365.ecommerce-generation-worker');
const POLL_INTERVAL_MS = 500;
const DEFAULT_GLOBAL_CONCURRENCY = 12;
const DEFAULT_PER_USER_CONCURRENCY = 3;

function state() {
  if (!globalThis[WORKER_KEY]) {
    globalThis[WORKER_KEY] = { active: new Map(), timer: null, ticking: false, stopped: false };
  }
  return globalThis[WORKER_KEY];
}

async function invokeTask(task) {
  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = {};
  req.body = {
    projectId: task.projectId,
    slotId: task.slotId,
    taskId: task.id,
    workerClaimed: true
  };
  req[INTERNAL_AUTH_CONTEXT] = { userId: task.userId };

  const res = new EventEmitter();
  res.statusCode = 200;
  res.writableEnded = false;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = () => res;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (payload = {}) => {
      if (settled) return;
      settled = true;
      res.writableEnded = true;
      res.emit('finish');
      resolve({ status: res.statusCode, payload });
    };
    res.json = (payload) => {
      finish(payload);
      return res;
    };
    res.end = (body = '') => {
      try {
        finish(body ? JSON.parse(body) : {});
      } catch {
        finish({});
      }
      return res;
    };
    Promise.resolve(generateSlotHandler(req, res)).then(() => {
      if (!settled) finish({ ok: false, error: 'GENERATION_FAILED' });
    }).catch(reject);
  });
}

async function execute(task) {
  try {
    const { payload } = await invokeTask(task);
    if (payload?.task || payload?.ok) return;
    completeEcommerceGenerationTask(task.userId, task.id, {
      status: payload?.error === 'GENERATION_CANCELLED' ? 'cancelled' : 'failed',
      errorCode: payload?.error || 'GENERATION_FAILED'
    });
  } catch (error) {
    completeEcommerceGenerationTask(task.userId, task.id, {
      status: error?.code === 'GENERATION_CANCELLED' ? 'cancelled' : 'failed',
      errorCode: error?.code || 'GENERATION_FAILED'
    });
  }
}

async function tick() {
  const current = state();
  if (current.stopped || current.ticking) return;
  current.ticking = true;
  try {
    const concurrency = Math.max(1, Math.min(100, Number(process.env.ECOMMERCE_GENERATION_WORKER_CONCURRENCY) || DEFAULT_GLOBAL_CONCURRENCY));
    const perUser = Math.max(1, Math.min(10, Number(process.env.ECOMMERCE_GENERATION_USER_CONCURRENCY) || DEFAULT_PER_USER_CONCURRENCY));
    const available = Math.max(0, concurrency - current.active.size);
    if (!available) return;
    const tasks = claimQueuedEcommerceGenerationTasks(available, perUser);
    for (const task of tasks) {
      const promise = execute(task)
        .catch((error) => console.error('[ecommerce-generation-worker] task failed', task.id, error))
        .finally(() => current.active.delete(task.id));
      current.active.set(task.id, promise);
    }
  } catch (error) {
    console.error('[ecommerce-generation-worker] poll failed', error);
  } finally {
    current.ticking = false;
  }
}

export function startEcommerceGenerationWorker() {
  const current = state();
  current.stopped = false;
  if (!current.timer) {
    current.timer = setInterval(tick, POLL_INTERVAL_MS);
    current.timer.unref?.();
  }
  void tick();
  return current;
}

export async function stopEcommerceGenerationWorker() {
  const current = state();
  current.stopped = true;
  if (current.timer) clearInterval(current.timer);
  current.timer = null;
  await Promise.allSettled([...current.active.values()]);
  current.active.clear();
}

export function getEcommerceGenerationWorkerStatus() {
  const current = state();
  return { running: Boolean(current.timer && !current.stopped), active: current.active.size };
}
