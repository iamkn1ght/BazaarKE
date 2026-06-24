// Shared geo helpers for the Itafika last-mile rail — usable on BOTH client and server.
//
// IMPORTANT: this module is deliberately NOT `server-only`. The checkout UI imports the pure
// validation/parse helpers (coercePoint / parseLatLngInput / isServiceablePoint) to vet a pin
// before it is sent, and the server routes import the same helpers so client and server agree on
// what "a serviceable delivery point" means. Keep it free of server-only imports and side effects.

import type { GeoPoint } from "./types";

/**
 * Serviceable area = mainland Kenya bounding box (Itafika is Kenya-only last-mile), padded a little
 * past the borders so legitimate edge towns aren't rejected. A pin outside this box is treated as a
 * data error (wrong hemisphere, transposed lat/lng, the "null island" 0,0 default, etc.), not a
 * deliverable address. Kenya extents ≈ lat [-4.72, 5.06], lng [33.91, 41.92].
 */
export const KE_SERVICE_AREA = {
  minLat: -5.2,
  maxLat: 5.6,
  minLng: 33.5,
  maxLng: 42.2,
} as const;

/** True when (lat, lng) are finite, in valid global ranges, AND inside the serviceable area. */
export function isServiceablePoint(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return (
    lat >= KE_SERVICE_AREA.minLat &&
    lat <= KE_SERVICE_AREA.maxLat &&
    lng >= KE_SERVICE_AREA.minLng &&
    lng <= KE_SERVICE_AREA.maxLng
  );
}

/** Round to ~0.11 m precision — drops meaningless float noise from GPS/paste before storage. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in whole metres. Only lat/lng are used, so any GeoPoint-like works. */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** The store's dispatch origin from ITAFIKA_ORIGIN_*, or null when unconfigured. Server-side only. */
export function storeOrigin(): GeoPoint | null {
  const lat = Number(process.env.ITAFIKA_ORIGIN_LAT);
  const lng = Number(process.env.ITAFIKA_ORIGIN_LNG);
  const label = process.env.ITAFIKA_ORIGIN_LABEL ?? "BazaarKE store";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label };
}

/**
 * Coerce an untrusted lat/lng pair (no label) into a serviceable point, or null. Used by the
 * delivery-quote route, which only needs coordinates for distance, and by the checkout UI to vet a
 * pasted pin. Accepts string-encoded numbers (form input).
 */
export function coercePoint(raw: unknown): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lat = typeof r.lat === "number" ? r.lat : Number(r.lat);
  const lng = typeof r.lng === "number" ? r.lng : Number(r.lng);
  if (!isServiceablePoint(lat, lng)) return null;
  return { lat: round6(lat), lng: round6(lng) };
}

/** Min/max human-readable delivery label length (the rider-facing address text). */
export const DELIVERY_LABEL_MIN = 3;
export const DELIVERY_LABEL_MAX = 200;

/**
 * Coerce an untrusted destination ({lat, lng, label}) into a full, order-grade GeoPoint, or null.
 * Stricter than coercePoint: a delivery needs a rider-readable label, not just coordinates.
 */
export function coerceDestination(raw: unknown): GeoPoint | null {
  const point = coercePoint(raw);
  if (!point) return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (label.length < DELIVERY_LABEL_MIN || label.length > DELIVERY_LABEL_MAX) return null;
  return { lat: point.lat, lng: point.lng, label };
}

/**
 * Pull a lat/lng out of free text a customer pastes when GPS isn't available: a bare "lat, lng"
 * pair, or a Google Maps URL (`@lat,lng` in the path, or `?q=lat,lng`). Returns coordinates without
 * vetting the area — the caller runs isServiceablePoint and shows an error.
 */
export function parseLatLngInput(text: string): { lat: number; lng: number } | null {
  if (!text) return null;
  const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const atMatch = text.match(new RegExp(`@${NUM}\\s*,\\s*${NUM}`));
  const qMatch = text.match(new RegExp(`[?&]q=${NUM}\\s*,\\s*${NUM}`));
  const plainMatch = text.trim().match(new RegExp(`^${NUM}\\s*,\\s*${NUM}$`));
  const m = atMatch ?? qMatch ?? plainMatch;
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
