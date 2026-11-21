import { getDb, settleCreditReservationInTransaction } from './local-db.js';
import { settleImageInputPricing } from '../../shared/image-input-billing.js';

export function validateImageInputPricing(config, model) {
  const rule = config?.upstreamCost;
  if (!config?.chargeTextTokens && !config?.chargeReferenceTokens) return;
  if (!rule || rule.model !== model) throw Object.assign(new Error('UPSTREAM_MODEL_PRICE_REQUIRED'), { code: 'UPSTREAM_MODEL_PRICE_REQUIRED' });
  for (const [enabled, price] of [
    [config.chargeTextTokens, rule.imageTextInputRmb ?? rule.pricing?.input],
    [config.chargeReferenceTokens, rule.imageInput ?? rule.pricing?.input]
  ]) {
    if (enabled && (price == null || !Number.isFinite(Number(price)) || Number(price) <= 0)) {
      throw Object.assign(new Error('UPSTREAM_INPUT_PRICE_REQUIRED'), { code: 'UPSTREAM_INPUT_PRICE_REQUIRED' });
    }
  }
}

export function settleImageGenerationBilling(reservationId, quoted, usage) {
  const db = getDb();
  const pricing = settleImageInputPricing(quoted, usage);
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT status, metadata_json, settled_centi, billing_scope, billing_source FROM credit_reservations WHERE id = ?').get(reservationId);
    if (!row) throw new Error('RESERVATION_NOT_FOUND');
    const metadata = JSON.parse(row.metadata_json || '{}');
    if (row.billing_scope === 'external_newapi') {
      pricing.chargedCredits = 0;
      pricing.credits = 0;
      pricing.billingSource = row.billing_source;
      if (row.status !== 'reserved' && row.status !== 'succeeded') throw Object.assign(new Error('GENERATION_CANCELLED'), { code: 'GENERATION_CANCELLED' });
      settleCreditReservationInTransaction(db, reservationId, 0);
      db.exec('COMMIT');
      return pricing;
    }
    pricing.chargedCredits = row.billing_scope === 'super_admin' ? 0 : pricing.credits;
    if (row.status !== 'reserved') {
      if (row.status !== 'succeeded') throw Object.assign(new Error('GENERATION_CANCELLED'), { code: 'GENERATION_CANCELLED' });
      db.exec('COMMIT');
      return metadata.inputTokenSettlement || pricing;
    }
    db.prepare('UPDATE credit_reservations SET metadata_json = ? WHERE id = ?')
      .run(JSON.stringify({ ...metadata, chargedCredits: pricing.chargedCredits, inputTokenSettlement: pricing, providerInputUsage: usage || null }), reservationId);
    settleCreditReservationInTransaction(db, reservationId, Math.round(pricing.chargedCredits * 100));
    db.exec('COMMIT');
    return pricing;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
