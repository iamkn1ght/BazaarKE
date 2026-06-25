/**
 * Hakken cross-app discovery types — Phase 2. Source: OPERATOR_REQUEST_HAKKEN.md +
 * docs/RAIL_INTEGRATION_PLAYBOOK.md §3.5 + §10.7 (banned-key wall) + HAKKEN_INTEGRATION_REFERENCE.
 *
 * Hakken is OUTBOUND-only (UA publishes product entities/broadcasts + queries ranking) and is
 * deliberately ISOLATED from the 4-rail HMAC signer: it uses the interim three-header pilot auth and
 * carries an Identiti customer JWT with aud=hakken. INERT today — there is no aud=hakken JWT yet
 * (getHakkenJwt defers) and HAKKEN_* are unset.
 *
 * MONEY/PII WALLS (encoded app-side from day 1): never send a raw price — only a `price_range_kes`
 * band of integer KES minor units; never send MSISDN/email/person names. See containment.ts.
 */

export const HAKKEN_APP_KEY_DEFAULT = "unique_accessories";
/** The UA vertical — set on ranking queries and used to enforce vertical isolation on results. */
export const HAKKEN_VERTICAL = "unique_accessories";
/** Broadcasts must carry ttl_at ≤ now + 168h (ISO-8601 future). */
export const BROADCAST_TTL_MAX_MS = 168 * 60 * 60 * 1000;

export type ConsentScope = "single_app" | "cross_app_optional" | "cross_app_required";
export type BroadcastType = "new_arrival" | "restock";

/** Integer KES minor-units band — the approved alternative to a raw price (§10.7). [low, high]. */
export type PriceRangeKes = [number, number];

// ── Entities ────────────────────────────────────────────────────────────────
export interface RegisterEntityInput {
  entity_type: "product";
  role_flags: string[]; // ["publisher"]
  external_ref: string; // "ua:product:<sanity_id>"
  attributes?: Record<string, unknown>;
}

export interface Entity {
  entity_id: string; // UUID — cache as publisher_id on every broadcast
  external_ref?: string;
  vertical?: string;
}

// ── Broadcasts ──────────────────────────────────────────────────────────────
export interface BroadcastInput {
  publisher_id: string; // the cached entity_id
  broadcast_type: BroadcastType;
  consent_scope: ConsentScope;
  ttl_at: string; // ISO-8601 future, ≤ now + 168h
  price_range_kes?: PriceRangeKes;
  payload?: Record<string, unknown>;
}

export interface Broadcast {
  broadcast_id: string;
  ttl_at?: string;
}

// ── Ranking ─────────────────────────────────────────────────────────────────
export interface RankingQueryInput {
  vertical: string; // "unique_accessories"
  user_role: "consumer";
  query_type: "one_sided";
  query?: string;
  limit?: number;
}

export interface RankingEntity {
  entity_id: string;
  vertical: string;
  external_ref?: string;
  score?: number;
  attributes?: Record<string, unknown>;
}

export interface RankingResult {
  results: RankingEntity[];
  paused?: boolean; // vertical paused → show empty-results-with-retry
}
