import { NextResponse } from "next/server";
import { coercePoint } from "@/app/lib/rails/itafika/geo";

// Uses global fetch + AbortController; keep the Node runtime for parity with the other checkout
// routes and to avoid Edge fetch/header quirks.
export const runtime = "nodejs";

/**
 * POST /api/checkout/reverse-geocode — turn a delivery pin (lat/lng) into a human-readable place
 * name for display (e.g. "Kilimani, Nairobi"), so checkout shows a location NAME instead of raw
 * coordinates. The exact lat/lng are still what the rider is dispatched to; this is display-only.
 *
 * Best-effort + fail-open: anything but a bad point returns 200 with `{ name: null }`, so the UI
 * shows a calm "Location pinned" rather than an error or raw numbers. It never blocks checkout.
 *
 * Provider: OpenStreetMap Nominatim (keyless). Its usage policy requires an identifying User-Agent
 * and ≤1 req/s sustained; a coarse-cell cache + a fixed-window upstream cap keep us well under that
 * and blunt this unauthenticated route as a fan-out surface. Swap the provider in reverseGeocode().
 */

type GeoResponse = { name: string | null };

const NONE: GeoResponse = { name: null };

// Coarse-cell cache (~111 m at 3 dp) — nearby pins / GPS jitter collapse to one upstream lookup.
// Place names are stable, so cache for an hour (and cache clean misses too — a null for a valid KE
// point is a stable "no name here" answer, not a transient failure).
const CACHE = new Map<string, { at: number; body: GeoResponse }>();
const CACHE_TTL_MS = 60 * 60_000;
const CACHE_MAX = 5_000;

function cellKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function cacheGet(key: string): GeoResponse | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.body;
}

function cachePut(key: string, body: GeoResponse): GeoResponse {
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(key, { at: Date.now(), body });
  return body;
}

// Fixed-window cap on upstream calls per instance — bounds fan-out regardless of pin variety.
const RL_WINDOW_MS = 10_000;
const RL_MAX = 30;
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

const UPSTREAM_TIMEOUT_MS = 4000;

/** Build a short "<local area>, <city>" label from a Nominatim address object, or null. */
function nameFromAddress(addr: Record<string, unknown>): string | null {
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = addr[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  const local = pick("neighbourhood", "suburb", "quarter", "residential", "city_district", "village", "hamlet", "town");
  const city = pick("city", "town", "municipality", "county", "state");
  const parts = [local, city].filter((p): p is string => !!p);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i); // de-dupe when local === city
  return unique.length ? unique.join(", ") : null;
}

/** Trim Nominatim's display_name to the first couple of place parts, skipping house nos / plus-codes. */
function nameFromDisplay(display: string): string | null {
  const parts = display
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !/^\d/.test(s) && !s.includes("+")); // drop leading numbers + plus codes
  return parts.length ? parts.slice(0, 2).join(", ") : null;
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        // Nominatim policy: a descriptive User-Agent identifying the app + a contact URL.
        "User-Agent": "BazaarKE/1.0 (checkout delivery pin; https://bazaar-ke.vercel.app)",
        "Accept-Language": "en",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { address?: Record<string, unknown>; display_name?: string }
      | null;
    if (!data) return null;
    if (data.address) {
      const name = nameFromAddress(data.address);
      if (name) return name;
    }
    if (typeof data.display_name === "string") return nameFromDisplay(data.display_name);
    return null;
  } catch {
    return null; // timeout / network / block — degrade to no name
  } finally {
    clearTimeout(timer);
  }
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

  if (!allowUpstream()) return NextResponse.json(NONE); // over budget — degrade, don't cache

  const name = await reverseGeocode(point.lat, point.lng);
  return NextResponse.json(cachePut(key, { name }));
}
