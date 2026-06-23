import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { CONTENT_TYPE_JSON, buildCanonical, signCanonical } from "../_shared/signRequest";

/**
 * Itafika asymmetric HMAC signer (forked from the shared signer). Pure — no secret held, no
 * server-only guard, so it is unit-testable directly.
 *
 * Itafika is the ONE rail with asymmetric signing:
 *  - OUTBOUND (app -> Itafika): BASE64 signature over the shared 5-line canonical
 *    (METHOD \n PATH_AND_QUERY \n CONTENT_TYPE \n TIMESTAMP \n SHA256_HEX(body)).
 *  - INBOUND  (Itafika -> app webhook): HEX signature over "<timestamp>.<rawBody>" (a DIFFERENT
 *    string — not the 5-line canonical).
 *
 * CRITICAL bodyless-GET rule (this bit the Identiti integration — baked in from day 1): on a GET
 * sign an EMPTY CONTENT_TYPE and send NO Content-Type header. Signing a literal "application/json"
 * on a GET returns 401.
 *
 * Header-case asymmetry per the IT-S5 wire: outbound lowercase (x-itafika-timestamp,
 * x-idempotency-key, content-type); inbound uppercase (X-Itafika-Signature/Timestamp/Event).
 */

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface ItafikaSignArgs {
  appId: string;
  secret: string;
  method: string;
  /** Path WITH the /v1/ prefix and any query string. */
  pathAndQuery: string;
  /** Raw JSON string actually sent. Omit/empty for a bodyless GET. */
  body?: string;
  timestamp?: string; // RFC 3339; defaults to now
  idempotencyKey?: string; // UUIDv4; auto for writes
}

export interface ItafikaSignResult {
  headers: Record<string, string>;
  timestamp: string;
  canonical: string;
  signature: string; // base64 (outbound)
}

export function signItafikaRequest(args: ItafikaSignArgs): ItafikaSignResult {
  const method = args.method.toUpperCase();
  const body = args.body ?? "";
  const hasBody = body.length > 0;
  // Bodyless requests sign an EMPTY content-type and send no Content-Type header.
  const contentType = hasBody ? CONTENT_TYPE_JSON : "";
  const timestamp = args.timestamp ?? new Date().toISOString();

  const canonical = buildCanonical(method, args.pathAndQuery, contentType, timestamp, body);
  const signature = signCanonical(canonical, args.secret); // base64 outbound

  const headers: Record<string, string> = {
    Authorization: `Itafika-HMAC-SHA256 app_id=${args.appId}, signature=${signature}`,
    "x-itafika-timestamp": timestamp,
  };
  if (hasBody) headers["content-type"] = CONTENT_TYPE_JSON;
  if (WRITE_METHODS.has(method)) headers["x-idempotency-key"] = args.idempotencyKey ?? randomUUID();

  return { headers, timestamp, canonical, signature };
}

/** INBOUND: hex(HMAC-SHA256("<timestamp>.<rawBody>", secret)) — note the dot-delimited string. */
export function itafikaInboundSignature(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

/** Constant-time verify of an inbound Itafika webhook signature (hex). */
export function verifyItafikaInbound(
  timestamp: string,
  rawBody: string,
  secret: string,
  providedHex: string,
): boolean {
  const expected = Buffer.from(itafikaInboundSignature(timestamp, rawBody, secret), "utf8");
  const provided = Buffer.from(providedHex ?? "", "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
