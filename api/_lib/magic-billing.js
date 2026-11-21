import { randomUUID } from 'node:crypto';
import { getDb, getUserProfile, reserveCreditCenti, releaseCreditReservation, settleCreditReservationInTransaction } from './local-db.js';
import { calculateChatChargeCenti } from '../../shared/chat-billing.js';
import { estimateMagicPrice } from '../../shared/upstream-pricing.js';
import { estimateTextTokens } from './text-token-estimate.js';
import { reserveNewAPIText } from './newapi-account.js';

export function reserveMagicCredit(userId, provider, { text, imageCount = 0, outputTokens, source = 'ai_magic_prompt' }) {
  if (provider.billingSource) return { ...reserveNewAPIText(userId, provider, { source, requestKey: `magic:${randomUUID()}` }), userId, provider };
  const quote = estimateMagicPrice(provider, {
    text, estimatedTextTokens: estimateTextTokens(text), imageCount, outputTokens,
    fixedPrice: source === 'ai_magic_prompt'
  });
  const profile = getUserProfile(userId);
  // Hold spare capacity where available, but don't require the configured maximum
  // output cost for a short request. Settlement never exceeds the held balance.
  const availableCenti = profile?.role === 'super_admin' && !profile.groupAccount
    ? quote.capacityCenti : Math.round(Number(profile?.creditBalance || 0) * 100);
  const capacityCenti = Math.max(Math.round(quote.estimatedCredits * 100), Math.min(quote.capacityCenti, availableCenti));
  const reservation = reserveCreditCenti(userId, {
    amountCenti: capacityCenti, source, requestKey: `magic:${randomUUID()}`,
    metadata: { model: provider.model, providerId: provider.id, pricing: provider.pricing, estimatedCredits: quote.estimatedCredits, minimumCredits: 1, fixedPrice: quote.fixedPrice === true }
  });
  return { ...reservation, quote, userId, provider };
}

export function completeMagicCredit(reservation, usage) {
  const db = getDb();
  let settled;
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT * FROM credit_reservations WHERE id = ?').get(reservation.reservationId);
    if (!row || !['reserved', 'succeeded'].includes(row.status)) throw Object.assign(new Error('INVALID_RESERVATION_STATE'), { code: 'INVALID_RESERVATION_STATE' });
    const metadata = JSON.parse(row.metadata_json || '{}');
    const calculatedCenti = row.billing_scope === 'external_newapi' ? 0 : row.billing_source === 'ai_magic_prompt'
      ? 100 : Math.max(100, calculateChatChargeCenti({ usage, pricing: reservation.provider.pricing }));
    if (row.status === 'reserved') {
      db.prepare('UPDATE credit_reservations SET metadata_json = ? WHERE id = ?')
        .run(JSON.stringify({ ...metadata, usage, calculatedCenti }), reservation.reservationId);
    }
    settled = settleCreditReservationInTransaction(db, reservation.reservationId, calculatedCenti);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { user: getUserProfile(reservation.userId), chargedCredits: settled.billing_scope === 'super_admin' ? 0 : settled.settled_centi / 100 };
}

export function cancelMagicCredit(reservation, code) {
  releaseCreditReservation(reservation.reservationId, code);
  return getUserProfile(reservation.userId);
}
