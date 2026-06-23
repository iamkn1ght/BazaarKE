/**
 * Deterministic per-business-op idempotency key for Todoku sends: ua_<order_id>_<event_type>.
 * Pure helper (no secret, no server-only) so it is unit-testable directly.
 */
export function notifyIdempotencyKey(orderId: string, eventType: string): string {
  return `ua_${orderId}_${eventType}`;
}
