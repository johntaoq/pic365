import { EventEmitter } from 'node:events';

import generateImageHandler from '../api/generate-image.js';
import { INTERNAL_AUTH_CONTEXT } from '../api/_lib/local-auth.js';
import {
  claimFreeGenerationTasks,
  completeFreeGenerationTask,
  isFreeGenerationTaskCancellationRequested
} from '../api/_lib/free-generation-queue.js';
import { cancelFreeGenerationTask } from '../api/_lib/free-generation-tasks.js';

const WORKER_KEY = Symbol.for('pic365.free-generation-worker');
const POLL_INTERVAL_MS = 500;
const CANCELLATION_POLL_MS = 150;
const DEFAULT_GLOBAL_CONCURRENCY = 12;

function safeWorkerError(error) {
  return {
    code: String(error?.code || 'GENERATION_FAILED').slice(0, 80),
    message: String(error?.message || 'Generation failed').slice(0, 240)
  };
}

function workerState() {
  if (!globalThis[WORKER_KEY]) {
    globalThis[WORKER_KEY] = {
      active: new Map(),
      timer: null,
      ticking: false,
      stopped: false
    };
  }
  return globalThis[WORKER_KEY];
}

function safeResultPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const { user, ...result } = payload;
  return result;
}

async function invokeGenerationHandler(task) {
  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = {};
  req.body = { ...task.request, clientTaskId: task.id };
  req[INTERNAL_AUTH_CONTEXT] = { userId: task.userId };

  const res = new EventEmitter();
  res.statusCode = 200;
  res.writableEnded = false;
  res.headers = new Map();
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (name, value) => {
    res.headers.set(String(name).toLowerCase(), value);
    return res;
  };

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
      let payload = {};
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        payload = {};
      }
      finish(payload);
      return res;
    };
    Promise.resolve(generateImageHandler(req, res)).then(() => {
      if (!settled) finish({ ok: false, error: 'GENERATION_FAILED' });
    }).catch(reject);
  });
}

async function executeTask(task) {
  const cancellationWatcher = setInterval(() => {
    try {
      if (isFreeGenerationTaskCancellationRequested(task.userId, task.id)) {
        cancelFreeGenerationTask(task.userId, task.id);
      }
    } catch {
      // The next polling cycle retries; the in-process abort registry is the fast path.
    }
  }, CANCELLATION_POLL_MS);
  cancellationWatcher.unref?.();
  try {
    const { status, payload } = await invokeGenerationHandler(task);
    if (payload?.ok && status >= 200 && status < 300) {
      completeFreeGenerationTask(task.userId, task.id, {
        status: 'completed',
        result: safeResultPayload(payload)
      });
      return;
    }
    const errorCode = String(payload?.error || 'GENERATION_FAILED');
    completeFreeGenerationTask(task.userId, task.id, {
      status: errorCode === 'GENERATION_CANCELLED' ? 'cancelled' : 'failed',
      errorCode
    });
  } catch (error) {
    completeFreeGenerationTask(task.userId, task.id, {
      status: error?.code === 'GENERATION_CANCELLED' ? 'cancelled' : 'failed',
      errorCode: error?.code || 'GENERATION_FAILED'
    });
  } finally {
    clearInterval(cancellationWatcher);
  }
}

async function tick() {
  const state = workerState();
  if (state.stopped || state.ticking) return;
  state.ticking = true;
  try {
    const configured = Math.max(1, Math.min(100, Number(process.env.FREE_GENERATION_WORKER_CONCURRENCY) || DEFAULT_GLOBAL_CONCURRENCY));
    const available = Math.max(0, configured - state.active.size);
    if (!available) return;
    const tasks = claimFreeGenerationTasks(available);
    for (const task of tasks) {
      const promise = executeTask(task)
        .catch((error) => console.error('[free-generation-worker] task failed', task.id, safeWorkerError(error)))
        .finally(() => state.active.delete(task.id));
      state.active.set(task.id, promise);
    }
  } catch (error) {
    console.error('[free-generation-worker] poll failed', safeWorkerError(error));
  } finally {
    state.ticking = false;
  }
}

export function startFreeGenerationWorker() {
  const state = workerState();
  state.stopped = false;
  if (!state.timer) {
    state.timer = setInterval(tick, POLL_INTERVAL_MS);
    state.timer.unref?.();
  }
  void tick();
  return state;
}

export async function stopFreeGenerationWorker() {
  const state = workerState();
  state.stopped = true;
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  await Promise.allSettled([...state.active.values()]);
  state.active.clear();
}

export function getFreeGenerationWorkerStatus() {
  const state = workerState();
  return { running: Boolean(state.timer && !state.stopped), active: state.active.size };
}
