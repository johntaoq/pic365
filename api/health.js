import { getDb, getImageProviderConfig, listImageProviderConfigs } from './_lib/local-db.js';
import { checkStorageHealth } from './_lib/storage.js';
import { getFreeGenerationWorkerStatus, startFreeGenerationWorker } from '../server/free-generation-worker.js';
import { getEcommerceGenerationWorkerStatus, startEcommerceGenerationWorker } from '../server/ecommerce-generation-worker.js';
import { getMediaProcessingWorkerStatus, startMediaProcessingWorker } from '../server/media-processing-worker.js';
import { getStorageBillingWorkerStatus, startStorageBillingWorker } from '../server/storage-billing-worker.js';

const DEEP_TIMEOUT_MS = 5000;

function providerModelsUrl(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  return `${normalized.endsWith('/v1') ? normalized : `${normalized}/v1`}/models`;
}

async function checkProvider(provider, deep) {
  const result = {
    configured: Boolean(provider.apiKey && provider.baseUrl && provider.model),
    reachable: null
  };
  if (!result.configured || !deep) return result;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEP_TIMEOUT_MS);
  try {
    const response = await fetch(providerModelsUrl(provider.baseUrl), {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: controller.signal
    });
    result.reachable = response.ok;
    result.status = response.status;
  } catch (error) {
    result.reachable = false;
    result.error = error?.name === 'AbortError' ? 'TIMEOUT' : 'UNREACHABLE';
  } finally {
    clearTimeout(timer);
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const deep = ['1', 'true', 'yes'].includes(String(req.query?.deep || '').toLowerCase());
  const startedAt = Date.now();
  const checks = { database: { ok: false }, storage: { ok: false }, providers: [] };
  try {
    const db = getDb();
    const quickCheck = db.prepare('PRAGMA quick_check').get()?.quick_check || '';
    const foreignKeyErrors = db.prepare('PRAGMA foreign_key_check').all().length;
    checks.database = {
      ok: quickCheck === 'ok' && foreignKeyErrors === 0,
      quickCheck,
      foreignKeyErrors,
      activeReservations: Number(db.prepare("SELECT COUNT(*) AS count FROM credit_reservations WHERE status = 'reserved'").get()?.count || 0),
      processingGenerations: Number(db.prepare("SELECT COUNT(*) AS count FROM generations WHERE status = 'processing'").get()?.count || 0)
    };
    const storageHealth = await checkStorageHealth();
    checks.storage = { ok: storageHealth.ok, backend: storageHealth.backend };
    const providers = listImageProviderConfigs({ admin: true }).filter((provider) => provider.enabled);
    for (const { id } of providers) {
      try {
        const provider = getImageProviderConfig(id);
        checks.providers.push(await checkProvider(provider, deep));
      } catch {
        checks.providers.push({ configured: false, reachable: false, error: 'SECRET_DECRYPTION_FAILED' });
      }
    }
    startFreeGenerationWorker();
    startEcommerceGenerationWorker();
    startMediaProcessingWorker();
    startStorageBillingWorker();
    checks.workers = {
      free: getFreeGenerationWorkerStatus(),
      ecommerce: getEcommerceGenerationWorkerStatus(),
      media: getMediaProcessingWorkerStatus(),
      storageBilling: getStorageBillingWorkerStatus()
    };
    const providerOk = checks.providers.length > 0
      && checks.providers.every((provider) => provider.configured && (!deep || provider.reachable));
    const ok = checks.database.ok && checks.storage.ok && providerOk
      && checks.workers.free.running && checks.workers.ecommerce.running && checks.workers.media.running;
    const workerOk = ok && checks.workers.storageBilling.running;
    return res.status(workerOk ? 200 : 503).json({
      ok: workerOk,
      deep,
      checks,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      deep,
      checks,
      error: 'HEALTH_CHECK_FAILED',
      durationMs: Date.now() - startedAt
    });
  }
}
