import { getLatestAssetRetentionBatch, runAssetRetentionBatch } from '../api/_lib/asset-retention.js';
import { ASSET_RETENTION_TIME_ZONE, assetRetentionNightWindow } from '../shared/asset-retention.js';

const WORKER_KEY = Symbol.for('pic365.asset-retention-worker');
const POLL_INTERVAL_MS = 30_000;
const RETRY_INTERVAL_MS = 5 * 60_000;

function state() {
  return globalThis[WORKER_KEY] ||= { timer: null, active: false, stopped: false, lastAttemptAt: null, lastResult: null };
}

export async function tickAssetRetentionWorker({ at = new Date(), latestBatch = getLatestAssetRetentionBatch, runBatch = runAssetRetentionBatch } = {}) {
  const current = state();
  if (current.stopped || current.active || String(process.env.ASSET_RETENTION_ENABLED || '').toLowerCase() === 'false') return;
  const runDate = assetRetentionNightWindow(at);
  if (!runDate) return;
  if (current.lastAttemptAt && new Date(at).getTime() - Date.parse(current.lastAttemptAt) < RETRY_INTERVAL_MS) return;
  current.active = true;
  try {
    const latest = latestBatch();
    if (latest?.runDate === runDate && latest.status === 'completed') return;
    current.lastAttemptAt = new Date(at).toISOString();
    current.lastResult = await runBatch({ runDate, at });
    if (['failed', 'partial'].includes(current.lastResult.status)) {
      console.warn('[asset-retention-worker] cleanup incomplete', { status: current.lastResult.status, errors: current.lastResult.errors });
    }
  } catch {
    current.lastAttemptAt = new Date(at).toISOString();
    current.lastResult = { runDate, status: 'failed', error: 'ASSET_RETENTION_BATCH_FAILED' };
  } finally { current.active = false; }
}

export function startAssetRetentionWorker() {
  const current = state();
  current.stopped = false;
  if (!current.timer) {
    current.timer = setInterval(() => { void tickAssetRetentionWorker(); }, POLL_INTERVAL_MS);
    current.timer.unref?.();
  }
  void tickAssetRetentionWorker();
  return current;
}

export async function stopAssetRetentionWorker() {
  const current = state();
  current.stopped = true;
  if (current.timer) clearInterval(current.timer);
  current.timer = null;
  while (current.active) await new Promise((resolve) => setTimeout(resolve, 10));
}

export function getAssetRetentionWorkerStatus() {
  const current = state();
  return {
    running: Boolean(current.timer && !current.stopped), active: current.active,
    enabled: String(process.env.ASSET_RETENTION_ENABLED || '').toLowerCase() !== 'false',
    schedule: '02:00', timeZone: ASSET_RETENTION_TIME_ZONE,
    lastAttemptAt: current.lastAttemptAt, latestBatch: getLatestAssetRetentionBatch()
  };
}
