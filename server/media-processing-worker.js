import {
  claimAssetProcessingJobs,
  failAssetProcessingJob,
  processAssetProcessingJob,
  queueMissingImageVariants
} from '../api/_lib/media-assets.js';

const WORKER_KEY = Symbol.for('pic365.media-processing-worker');
const POLL_INTERVAL_MS = 1000;

function state() {
  if (!globalThis[WORKER_KEY]) {
    globalThis[WORKER_KEY] = { active: new Map(), timer: null, ticking: false, stopped: false, lastDiscoveryAt: 0 };
  }
  return globalThis[WORKER_KEY];
}

async function tick() {
  const current = state();
  if (current.stopped || current.ticking) return;
  current.ticking = true;
  try {
    const concurrency = Math.max(1, Math.min(4, Number(
      process.env.MEDIA_PROCESSING_WORKER_CONCURRENCY || process.env.MEDIA_PROCESSING_CONCURRENCY
    ) || 1));
    const available = Math.max(0, concurrency - current.active.size);
    if (!available) return;
    if (process.env.ASSET_VARIANT_REPAIR_ENABLED !== 'false' && Date.now() - current.lastDiscoveryAt >= 10000) {
      current.lastDiscoveryAt = Date.now();
      queueMissingImageVariants();
    }
    for (const job of claimAssetProcessingJobs(available)) {
      const promise = processAssetProcessingJob(job)
        .catch((error) => {
          failAssetProcessingJob(job.id, error?.code || 'PROCESSING_FAILED');
          console.error('[media-processing-worker] job failed', job.id, error);
        })
        .finally(() => current.active.delete(job.id));
      current.active.set(job.id, promise);
    }
  } catch (error) {
    console.error('[media-processing-worker] poll failed', error);
  } finally {
    current.ticking = false;
  }
}

export function startMediaProcessingWorker() {
  const current = state();
  current.stopped = false;
  if (!current.timer) {
    current.timer = setInterval(tick, POLL_INTERVAL_MS);
    current.timer.unref?.();
  }
  void tick();
  return current;
}

export async function stopMediaProcessingWorker() {
  const current = state();
  current.stopped = true;
  if (current.timer) clearInterval(current.timer);
  current.timer = null;
  await Promise.allSettled([...current.active.values()]);
  current.active.clear();
}

export function getMediaProcessingWorkerStatus() {
  const current = state();
  return { running: Boolean(current.timer && !current.stopped), active: current.active.size };
}
