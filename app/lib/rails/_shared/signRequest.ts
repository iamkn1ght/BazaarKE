// Intentionally NOT `import "server-only"`: this is a pure HMAC utility that holds no secret
// (the secret is passed in by the caller), so it is safe — and unit-testable — anywhere. The
// server-only guard lives on the secret-reading layer: railFetch.ts and each rail client.
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";

/**
 * Shared per-request HMAC signer for the KMV cross-cutting rails.
 *
 * Authoritative source: docs/KMV_RAILS_INTEGRATION_GUIDE.md (overrides operator packs).
 * Used by Identiti, Kipkiren Pay, Todoku (and Helpan AI in Phase 2). Itafika forks this
 * in app/lib/rails/itafika/sign.ts (base64 outbound / hex inbound webhook verify).
 *
 * The five facts this encodes (do not "fix" these without re-reading the guide):
 *  1. Outer signature output is BASE64 — NOT hex. (Operator packs wrongly say hex.)
 *  2. Canonical = METHOD \n PATH_AND_QUERY \n CONTENT_TYPE \n TIMESTAMP \n SHA256_HEX(body).
 *     The body hash inside the canonical is HEX; only the outer HMAC is base64.
 *  3. PATH_AND_QUERY is signed WITH the /v1/ prefix and any query string.
 *  4. CONTENT_TYPE is the EXACT value sent: 'application/json; charset=utf-8' for bodied
 *     requests, and the EMPTY STRING for bodyless GETs (and no Content-Type header is sent).
 *  5. Timestamp is RFC 3339 (new Date().toISOString()), within a 300s server-clock window.
 */

export type RailPrefix = "Identiti" | "KipkirenPay" | "Todoku" | "Helpan";

export const CONTENT_TYPE_JSON = "application/json; charset=utf-8";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** SHA-256 hex of the exact bytes sent. Hashing "" yields the hash of the empty string. */
export function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/** Build the 5-line canonical signing string shared by all KMV rails. */
export function buildCanonical(
  method: string,
  pathAndQuery: string,
  contentType: string,
  timestamp: string,
  body: string,
): string {
  return [method.toUpperCase(), pathAndQuery, contentType, timestamp, sha256Hex(body)].join("\n");
}

/** Base64 HMAC-SHA256 of the canonical string (the outer signature for all four rails). */
export function signCanonical(canonical: string, secret: string): string {
  return createHmac("sha256", secret).update(canonical, "utf8").digest("base64");
}

export interface SignArgs {
  prefix: RailPrefix;
  appId: string;
  secret: string;
  method: string;
  /** Path WITH the /v1/ prefix and any query string, e.g. "/v1/customers" or "/v1/jobs?tier=express". */
  pathAndQuery: string;
  /** Raw JSON string actually sent on the wire. Omit/empty for a bodyless GET. */
  body?: string;
  /** RFC 3339 timestamp; defaults to now. Injectable for deterministic tests. */
  timestamp?: string;
  /** UUIDv4 idempotency key; auto-generated for write methods when omitted. */
  idempotencyKey?: string;
}

export interface SignResult {
  headers: Record<string, string>;
  timestamp: string;
  canonical: string;
  signature: string;
}

export function signRequest(args: SignArgs): SignResult {
  const method = args.method.toUpperCase();
  const isWrite = WRITE_METHODS.has(method);
  const body = args.body ?? "";
  const hasBody = body.length > 0;
  // Empty Content-Type for bodyless requests (the universal GET rule); exact value otherwise.
  const contentType = hasBody ? CONTENT_TYPE_JSON : "";
  const timestamp = args.timestamp ?? new Date().toISOString();

  const canonical = buildCanonical(method, args.pathAndQuery, contentType, timestamp, body);
  const signature = signCanonical(canonical, args.secret);

  const headers: Record<string, string> = {
    Authorization: `${args.prefix}-HMAC-SHA256 app_id=${args.appId}, signature=${signature}`,
    [`X-${args.prefix}-Timestamp`]: timestamp,
  };
  // Only transmit Content-Type when we actually send a body — must be byte-identical to the signed value.
  if (hasBody) headers["Content-Type"] = CONTENT_TYPE_JSON;
  if (isWrite) headers["X-Idempotency-Key"] = args.idempotencyKey ?? randomUUID();

  return { headers, timestamp, canonical, signature };
}

/**
 * Constant-time verification of a base64 signature against the canonical string.
 * For inbound webhook verification on base64 rails (Identiti/KP/Todoku/Helpan).
 * Itafika inbound is hex and lives in app/lib/rails/itafika/sign.ts.
 */
export function verifyBase64Signature(canonical: string, secret: string, providedBase64: string): boolean {
  const expected = Buffer.from(signCanonical(canonical, secret), "utf8");
  const provided = Buffer.from(providedBase64 ?? "", "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
