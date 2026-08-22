import { authenticateRequest } from '../_lib/local-auth.js';
import {
  getStorageBillingAdminSummary,
  getStorageBillingConfig,
  updateStorageBillingConfig
} from '../_lib/storage-billing.js';
import { readJsonBody } from '../_lib/request.js';
import { getStorageBillingWorkerStatus } from '../../server/storage-billing-worker.js';
import { requirePermission } from '../_lib/governance.js';
import { ADMIN_PERMISSIONS } from '../../shared/admin-permissions.js';

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const auth = authenticateRequest(req);
  if (auth.error) return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  try {
    requirePermission(auth.user, ADMIN_PERMISSIONS.MANAGE_PRICING);
  } catch {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  try {
    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      updateStorageBillingConfig(body, auth.user.id);
    }
    return res.status(200).json({
      ok: true,
      storageBilling: getStorageBillingConfig(),
      summary: getStorageBillingAdminSummary(),
      worker: getStorageBillingWorkerStatus()
    });
  } catch (error) {
    console.warn('Failed to manage storage billing', {
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    return res.status(400).json({ ok: false, error: 'STORAGE_BILLING_CONFIG_FAILED' });
  }
}
