import { randomBytes } from "crypto";

/**
 * Generate a W3C traceparent for a business operation (§A.11). One per operation, propagated
 * across every rail call. Format: version "00" - 16-byte trace-id - 8-byte span-id - flags "01".
 * Pure helper (no secret) — safe to import anywhere server-side.
 */
export function newTraceparent(): string {
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  return `00-${traceId}-${spanId}-01`;
}
