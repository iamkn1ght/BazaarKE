// KES money helpers — Money Rule: main-loop only.
//
// KES is handled in INTEGER MINOR UNITS everywhere (KES 50.00 = 5000). No floating-point
// arithmetic on money. Division by 100 happens ONLY for display formatting, never for
// arithmetic on stored values. KP wire field is `amount_minor` (integer in requests,
// string-encoded bigint in responses — parse via parseAmountMinor).

/** KP step-up threshold: refunds/payouts >= KES 10,000 require an Identiti step-up token. */
export const STEPUP_THRESHOLD_MINOR = 1_000_000; // KES 10,000.00

function assertInteger(minor: number, label = "amount_minor"): void {
  if (!Number.isInteger(minor)) {
    throw new Error(`${label} must be an integer (KES minor units), got ${minor}`);
  }
}

/** KES 50.00 -> 5000. Rounds to the nearest minor unit; rejects non-finite input. */
export function kesMajorToMinor(major: number): number {
  if (!Number.isFinite(major)) throw new Error(`kesMajorToMinor: non-finite input ${major}`);
  return Math.round(major * 100);
}

/** 5000 -> 50. Returns major units as a number (for display/formatting only). */
export function kesMinorToMajor(minor: number): number {
  assertInteger(minor);
  return minor / 100;
}

/** 5000 -> "KES 50.00". Thousands-separated, always 2 dp. */
export function formatKes(minor: number): string {
  assertInteger(minor);
  const formatted = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
  return `KES ${formatted}`;
}

/** Parse KP's string-encoded `amount_minor` (responses) back to an integer. Accepts number too. */
export function parseAmountMinor(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  assertInteger(n);
  return n;
}

/** True when an amount requires an Identiti step-up before a KP payout. */
export function requiresStepUp(amountMinor: number): boolean {
  assertInteger(amountMinor);
  return amountMinor >= STEPUP_THRESHOLD_MINOR;
}
