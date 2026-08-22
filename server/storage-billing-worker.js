import {
  getLatestStorageBillingBatch,
  getStorageBillingConfig,
  runStorageBillingBatch
} from '../api/_lib/storage-billing.js';
import { storageBillingDateParts } from '../shared/storage-billing.js';

const WORKER_KEY = Symbol.for('pic365.storage-billing-worker');
const POLL_INTERVAL_MS = 30_000;
const RETRY_INTERVAL_MS = 5 * 60_000;
const STALE_RUNNING_MS = 30 * 60_000;

function state() {
  if (!globalThis[WORKER_KEY]) {
    globalThis[WORKER_KEY] = {
      timer: null,
      active: false,
      stopped: false,
      lastAttemptAt: null,
      lastResult: null
    };
  }
  return globalThis[WORKER_KEY];
}

async function tick() {
  const current = state();
  if (current.stopped || current.active) return;
  const config = getStorageBillingConfig();
  if (!config.enabled || String(process.env.STORAGE_BILLING_ENABLED || '').toLowerCase() === 'false') return;

  const parts = storageBillingDateParts();
  const latest = getLatestStorageBillingBatch();
  const firstRunWindow = parts.hour === config.runHour && parts.minute >= config.runMinute && parts.minute <= config.runMinute + 5;
  const shouldCatchUp = Boolean(latest?.runDate && latest.runDate < parts.date);
  const retryReady = !current.lastAttemptAt || Date.now() - Date.parse(current.lastAttemptAt) >= RETRY_INTERVAL_MS;
  const staleRunning = latest?.status === 'running'
    && Date.now() - Date.parse(latest.startedAt || 0) >= STALE_RUNNING_MS;
  const shouldRetryToday = latest?.runDate === parts.date
    && retryReady
    && (['partial', 'failed'].includes(latest.status) || staleRunning);
  const shouldRun = shouldCatchUp || shouldRetryToday || (!latest && firstRunWindow);
  if (!shouldRun) return;

  current.active = true;
  current.lastAttemptAt = new Date().toISOString();
  try {
    current.lastResult = await runStorageBillingBatch({ runDate: parts.date });
  } catch (error) {
    current.lastResult = {
      runDate: parts.date,
      status: 'failed',
      error: error?.code || 'STORAGE_BILLING_BATCH_FAILED'
    };
    console.error('[storage-billing-worker] batch failed', error);
  } finally {
    current.active = false;
  }
}

export function startStorageBillingWorker() {
  const current = state();
  current.stopped = false;
  if (!current.timer) {
    current.timer = setInterval(tick, POLL_INTERVAL_MS);
    current.timer.unref?.();
  }
  void tick();
  return current;
}

export async function stopStorageBillingWorker() {
  const current = state();
  current.stopped = true;
  if (current.timer) clearInterval(current.timer);
  current.timer = null;
  while (current.active) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export function getStorageBillingWorkerStatus() {
  const current = state();
  const config = getStorageBillingConfig();
  const latest = getLatestStorageBillingBatch();
  return {
    running: Boolean(current.timer && !current.stopped),
    active: current.active,
    enabled: config.enabled && String(process.env.STORAGE_BILLING_ENABLED || '').toLowerCase() !== 'false',
    schedule: '00:00',
    timeZone: config.timeZone,
    lastAttemptAt: current.lastAttemptAt,
    latestBatch: latest,
    lastResult: current.lastResult
  };
}
