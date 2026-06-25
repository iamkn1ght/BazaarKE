// Hakken entity/broadcast builders — turn a UA product into a containment-safe Hakken payload, and a
// vertical-isolation filter for ranking results. Pure (no secret, no I/O) — unit-testable. Every
// builder runs assertContainmentSafe so a money-shaped key or PII can never escape (fail-closed).

import { assertContainmentSafe } from "./containment";
import {
  BROADCAST_TTL_MAX_MS,
  HAKKEN_VERTICAL,
  type BroadcastInput,
  type BroadcastType,
  type ConsentScope,
  type PriceRangeKes,
  type RankingEntity,
  type RegisterEntityInput,
} from "./types";

// Bucket edges in KES MAJOR units. Banding maps a price into a coarse [low, high] so the EXACT price
// is never sent (§5) — only `price_range_kes` (integer KES minor units). Adjustable per product policy.
const BAND_EDGES_MAJOR = [0, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000, 20000, 50000] as const;

/**
 * Map a price (KES minor units) to an integer-minor-units band [low, high] that STRICTLY CONTAINS the
 * price — `low < priceMinor < high` — so neither bound ever equals the price, even when the price sits
 * exactly on a bucket edge (KES 500, 1000, 5000, ... — the common round retail points). `low` is the
 * largest edge strictly below the price; `high` is the smallest edge strictly above it. (A price of 0
 * has no edge below it, so it bands to [0, firstEdge] — revealing "free" is not sensitive.)
 */
export function priceRangeKes(priceMinor: number): PriceRangeKes {
  const major = Number.isFinite(priceMinor) && priceMinor > 0 ? priceMinor / 100 : 0;
  let lo = 0;
  let hi: number | null = null;
  for (const edge of BAND_EDGES_MAJOR) {
    if (edge < major) lo = edge; // raise the floor toward the price
    else if (edge > major) {
      hi = edge; // first edge strictly above the price
      break;
    }
    // edge === major → skip it as a bound so the price stays strictly interior
  }
  const top = BAND_EDGES_MAJOR[BAND_EDGES_MAJOR.length - 1];
  if (hi === null) hi = Math.max(top * 2, Math.ceil(major) + 1); // above the top edge
  return [Math.round(lo * 100), Math.round(hi * 100)];
}

export interface ProductForHakken {
  _id: string;
  name?: string;
  category?: string;
  price_minor?: number | null;
  price?: number | null;
}

function priceMinorOf(p: ProductForHakken): number | null {
  if (typeof p.price_minor === "number" && Number.isInteger(p.price_minor) && p.price_minor >= 0) return p.price_minor;
  if (typeof p.price === "number" && Number.isFinite(p.price) && p.price >= 0) return Math.round(p.price * 100);
  return null;
}

/** Register a product as a publisher entity. external_ref = "ua:product:<sanity_id>". */
export function buildEntityInput(product: ProductForHakken): RegisterEntityInput {
  const input: RegisterEntityInput = {
    entity_type: "product",
    role_flags: ["publisher"],
    external_ref: `ua:product:${product._id}`,
    attributes: {
      title: product.name ?? "",
      category: product.category ?? "",
      vertical: HAKKEN_VERTICAL,
    },
  };
  assertContainmentSafe(input, { allowSourcePayment: true }); // /v1/entities carve-out
  return input;
}

export interface BuildBroadcastArgs {
  publisherId: string; // cached entity_id
  type: BroadcastType;
  consentScope: ConsentScope;
  nowMs: number;
  /** Desired TTL; clamped to ≤ 168h. */
  ttlMs?: number;
  product?: ProductForHakken;
}

/** Build a new_arrival / restock broadcast. Carries a price_range_kes BAND, never a raw price. */
export function buildBroadcastInput(args: BuildBroadcastArgs): BroadcastInput {
  const ttl = Math.min(Math.max(args.ttlMs ?? BROADCAST_TTL_MAX_MS, 0), BROADCAST_TTL_MAX_MS);
  const input: BroadcastInput = {
    publisher_id: args.publisherId,
    broadcast_type: args.type,
    consent_scope: args.consentScope,
    ttl_at: new Date(args.nowMs + ttl).toISOString(),
    payload: {
      title: args.product?.name ?? "",
      category: args.product?.category ?? "",
      vertical: HAKKEN_VERTICAL,
    },
  };
  const minor = args.product ? priceMinorOf(args.product) : null;
  if (minor != null) input.price_range_kes = priceRangeKes(minor);

  assertContainmentSafe(input); // no source_payment carve-out on broadcasts
  return input;
}

/**
 * Drop any ranking result not in UA's vertical — the app-layer half of vertical isolation (a UA
 * surface must NEVER render another app's results; bleed is P0). Also returns [] for a paused query.
 */
export function filterToVertical(results: RankingEntity[] | undefined, vertical: string = HAKKEN_VERTICAL): RankingEntity[] {
  if (!Array.isArray(results)) return [];
  return results.filter((r) => r && r.vertical === vertical);
}
