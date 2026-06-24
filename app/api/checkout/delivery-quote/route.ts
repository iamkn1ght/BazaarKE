import { NextResponse } from "next/server";
import { quoteJob } from "@/app/lib/rails/itafika";
import { coercePoint, haversineMeters, storeOrigin } from "@/app/lib/rails/itafika/geo";
import { RailError } from "@/app/lib/rails/_shared/railFetch";

// HMAC signing (inside quoteJob) is Node-only; Edge would silently fail.
export const runtime = "nodejs";

/**
 * POST /api/checkout/delivery-quote  — best-effort delivery-fee estimate for a pinned location.
 *
 * Read-only and money-inert: it never charges and never writes. The fee shown here is informational
 * (KP-16 delivery-fee charging is observe-only at MVP) and is NOT added to the payment amount.
 *
 * Degrades gracefully on purpose: a bad point is a 400, but every "we can't price this right now"
 * case (origin not configured, Itafika not provisioned, rail error) returns 200 with
 * `available:false` so the cart can show a calm "calculated at dispatch" line instead of an error.
 *
 * Abuse control: the route is unauthenticated and each cache miss makes ONE signed outbound call to
 * the Itafika rail, so it is a cost/rate-amplification surface. Two per-instance guards blunt it
 * without external infra: a coarse-cell quote cache (repeated/nearby pins collapse to one upstream
 * call), and a fixed-window cap on upstream calls (a varied-pin loop can't fan out unbounded).
 */

type QuoteResponse =
  | { available: true; price_minor: number; distance_meters: number; tier: string }
  | { available: false; distance_meters?: number; reason: string };

const UNAVAILABLE: QuoteResponse = { available: false, reason: "unavailable" };

// Coarse-cell cache (~111 m at 3 dp): sub-metre pin jitter resolves to the same key, so a tight loop
// of "distinct" points still hits one cached upstream quote. Per-instance, bounded, short TTL.
const CACHE = new Map<string, { at: number; body: QuoteResponse }>();
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 5_000;

function cellKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function cacheGet(key: string): QuoteResponse | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.body;
}

function cachePut(key: string, body: QuoteResponse): QuoteResponse {
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, { at: Date.now(), body });
  return body;
}

// Fixed-window cap on upstream Itafika calls per instance — bounds fan-out regardless of pin variety.
const RL_WINDOW_MS = 10_000;
const RL_MAX = 60;
let rlWindowStart = 0;
let rlCount = 0;

function allowUpstream(): boolean {
  const now = Date.now();
  if (now - rlWindowStart > RL_WINDOW_MS) {
    rlWindowStart = now;
    rlCount = 0;
  }
  if (rlCount >= RL_MAX) return false;
  rlCount += 1;
  return true;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const point = coercePoint(body?.destination);
  if (!point) {
    return NextResponse.json({ error: "Pin a delivery location inside Kenya." }, { status: 400 });
  }

  const key = cellKey(point.lat, point.lng);
  const hit = cacheGet(key);
  if (hit) return NextResponse.json(hit);

  const origin = storeOrigin();
  if (!origin) {
    // Origin unset is a stable config state — safe to cache so we don't re-derive it every keystroke.
    return NextResponse.json(cachePut(key, UNAVAILABLE));
  }

  const distance_meters = haversineMeters(origin, point);

  // Over the per-instance budget — degrade without touching the rail. Not cached (transient).
  if (!allowUpstream()) {
    return NextResponse.json({ available: false, distance_meters, reason: "unavailable" });
  }

  try {
    const quote = await quoteJob({
      origin,
      destination: { ...point, label: "delivery point" },
      distance_meters,
      tier: "standard",
    });
    // Never trust the rail's number at a money-display boundary: only surface a clean integer.
    if (!Number.isInteger(quote.price_minor) || quote.price_minor < 0) {
      return NextResponse.json({ available: false, distance_meters, reason: "unavailable" });
    }
    return NextResponse.json(
      cachePut(key, { available: true, price_minor: quote.price_minor, distance_meters: quote.distance_meters, tier: quote.tier }),
    );
  } catch (err) {
    // RAIL_CONFIG_INCOMPLETE is a stable "not provisioned yet" state (cacheable); a RailError or
    // anything else is transient — degrade but do NOT cache, so recovery is immediate.
    if (err instanceof Error && err.message.startsWith("RAIL_CONFIG")) {
      return NextResponse.json(cachePut(key, { available: false, distance_meters, reason: "unavailable" }));
    }
    if (!(err instanceof RailError)) {
      console.error("[checkout/delivery-quote]", err);
    }
    return NextResponse.json({ available: false, distance_meters, reason: "unavailable" });
  }
}
