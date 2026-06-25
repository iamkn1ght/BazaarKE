// Hakken regulatory containment — the two walls UA encodes from day 1 (OPERATOR_REQUEST_HAKKEN.md §5,
// playbook §10.7). Enforced APP-SIDE and FAIL-CLOSED: a violating payload throws here and is never
// sent, so we never even reach Hakken's 422. Pure (no secret, no I/O) — unit-testable anywhere.
//
//  1. Banned-key wall: money-shaped keys are rejected at ANY nesting depth. The only money signal
//     allowed is `price_range_kes` (an integer KES minor-units band, NOT a raw price).
//  2. PII wall: no MSISDN, no email, no two-word capitalised personal names. Entities are
//     product-shaped, not person-shaped.

/** §10.7 banned keys (exact, case-insensitive). `source_payment*` is handled by prefix below.
 * `price` is named in OPERATOR_REQUEST_HAKKEN.md §5 ("UA must NOT send raw prices"); the app's
 * own *_minor money keys are added as defense-in-depth so they can never be copied into a payload.
 * The ONLY approved money signal is `price_range_kes` (not in this set — exact-match keeps it clean). */
export const BANNED_KEYS: ReadonlySet<string> = new Set([
  "amount", "currency", "funds", "credit", "yield", "float", "transfer", "disburse", "debit",
  "refund", "withdraw", "deposit", "money", "balance", "settlement", "commission", "ledger",
  "kes_amount", "usd_amount", "monetary_value", "price",
  "price_minor", "amount_minor", "total_minor", "unit_price_minor", "delivery_fee_minor",
]);

const SOURCE_PAYMENT_PREFIX = "source_payment";
/** The carve-out is ONLY for these opaque reference keys (§10.7) — never a money-suffixed variant. */
const ALLOWED_SOURCE_PAYMENT_KEYS: ReadonlySet<string> = new Set(["source_payment", "source_payment_ref"]);

/** Keys whose VALUES are legitimately product text (capitalised words are fine) — exempt from the
 * person-name scan so a product title like "Italian Leather Wallet" is not mistaken for a name. */
export const PRODUCT_CONTENT_KEYS: ReadonlySet<string> = new Set([
  "title", "name", "description", "summary", "category", "subtitle", "label", "product_name", "tags",
  "brand", "collection",
]);

// Kenyan MSISDN — 07x AND 01x ranges (Safaricom 0110–0115, Airtel 0100–0102), with or without the
// 254 country code and the leading '+'; plus a generic E.164. Separators are stripped before matching
// so "0712 345 678" / "0712-345-678" can't evade the digit anchors (over-matching is fail-closed PII).
// Email; and two+ adjacent Capitalised words (excludes ALL-CAPS like "SALE"). Applied to values, not keys.
const MSISDN_RE = /(?:\+?254|0)[17]\d{8}|\+\d{8,15}/;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PERSON_NAME_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/;

export function looksLikeMsisdn(s: string): boolean {
  return MSISDN_RE.test(s.replace(/[\s-]/g, ""));
}
export function looksLikeEmail(s: string): boolean {
  return EMAIL_RE.test(s);
}
export function looksLikePersonName(s: string): boolean {
  return PERSON_NAME_RE.test(s);
}

export class RegulatoryContainmentError extends Error {
  constructor(
    public readonly code: "REGULATORY_CONTAINMENT_VIOLATION" | "PII_CONTAINMENT_VIOLATION",
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "RegulatoryContainmentError";
  }
}

export interface ContainmentOptions {
  /** `/v1/entities/` and `/v1/tiers` carve out the `source_payment*` prefix (§10.7). */
  allowSourcePayment?: boolean;
}

function keyBanned(key: string, opts: ContainmentOptions): boolean {
  const k = key.toLowerCase();
  if (BANNED_KEYS.has(k)) return true;
  // A source_payment* key is allowed ONLY when it is one of the specific opaque reference keys AND the
  // carve-out is enabled (entities/tiers). A money-suffixed variant (source_payment_amount, ...) is
  // ALWAYS banned — the carve-out is not a blanket prefix pass.
  if (k.startsWith(SOURCE_PAYMENT_PREFIX)) {
    return !(opts.allowSourcePayment && ALLOWED_SOURCE_PAYMENT_KEYS.has(k));
  }
  return false;
}

function walk(node: unknown, path: string, valueIsProductText: boolean, opts: ContainmentOptions): void {
  if (node === null || node === undefined) return;

  if (typeof node === "string") {
    if (looksLikeMsisdn(node)) throw new RegulatoryContainmentError("PII_CONTAINMENT_VIOLATION", path, `MSISDN-like value at ${path}`);
    if (looksLikeEmail(node)) throw new RegulatoryContainmentError("PII_CONTAINMENT_VIOLATION", path, `email-like value at ${path}`);
    if (!valueIsProductText && looksLikePersonName(node)) {
      throw new RegulatoryContainmentError("PII_CONTAINMENT_VIOLATION", path, `person-name-like value at ${path}`);
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, valueIsProductText, opts));
    return;
  }

  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (keyBanned(key, opts)) {
        throw new RegulatoryContainmentError(
          "REGULATORY_CONTAINMENT_VIOLATION",
          `${path}.${key}`,
          `banned money-shaped key '${key}' at ${path}.${key}`,
        );
      }
      walk(value, `${path}.${key}`, PRODUCT_CONTENT_KEYS.has(key.toLowerCase()), opts);
    }
  }
  // numbers / booleans are fine
}

/**
 * Throw if `payload` violates either wall, at any nesting depth. Call before EVERY Hakken send so a
 * violation can never leave the app (fail-closed).
 */
export function assertContainmentSafe(payload: unknown, opts: ContainmentOptions = {}): void {
  walk(payload, "$", false, opts);
}
