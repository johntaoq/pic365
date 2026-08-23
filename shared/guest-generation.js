export const GUEST_FREE_GENERATION_LIMIT = 3;

export function guestGenerationRemaining(used, limit = GUEST_FREE_GENERATION_LIMIT) {
  return Math.max(0, Math.max(0, Number(limit) || 0) - Math.max(0, Number(used) || 0));
}
