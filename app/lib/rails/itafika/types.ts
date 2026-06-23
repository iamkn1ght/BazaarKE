/**
 * Itafika rail types. Source: docs/RAIL_INTEGRATION_PLAYBOOK.md §3.4 + ITAFIKA_INTEGRATION_REFERENCE.
 * Money fields use the _minor suffix (NOT _kes_minor). KES integer minor units.
 */

export type ItafikaTier = "standard" | "express";

/** 9-state job machine. job.* webhooks fire for a subset (see ItafikaWebhookEvent). */
export type JobState =
  | "PENDING_ASSIGNMENT"
  | "ASSIGNED"
  | "AT_PICKUP"
  | "IN_TRANSIT"
  | "AT_DROPOFF"
  | "DELIVERED"
  | "SETTLED"
  | "CANCELLED"
  | "FAILED";

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface QuoteInput {
  origin: GeoPoint;
  destination: GeoPoint;
  distance_meters: number;
  tier: ItafikaTier;
}

export interface Quote {
  price_minor: number;
  rider_payout_minor: number;
  move_take_minor: number;
  distance_meters: number;
  tier: ItafikaTier;
}

export interface CreateJobInput {
  /** Your order id — the SECOND idempotency layer. Re-creating with the same value returns the existing job. */
  anchor_reference_id: string;
  origin: GeoPoint;
  destination: GeoPoint;
  distance_meters: number;
  tier: ItafikaTier;
}

export interface Job {
  job_id: string;
  anchor_id: string;
  rider_id?: string;
  anchor_reference_id: string;
  state: JobState;
  tier: ItafikaTier;
  price_minor: number;
  rider_payout_minor: number;
  charge_id?: string;
  payout_id?: string;
}

/** The 5 events Itafika emits to anchors (body: {event, job_id, state}). */
export type ItafikaWebhookEventName =
  | "job.assigned"
  | "job.picked_up"
  | "job.delivered"
  | "job.failed"
  | "job.cancelled";

export interface ItafikaWebhookEvent {
  event: ItafikaWebhookEventName | string;
  job_id: string;
  state: JobState | string;
}

/** The only event names accepted for dispatch — anything else is rejected (no unsigned routing). */
export const ITAFIKA_WEBHOOK_EVENTS: ReadonlySet<string> = new Set([
  "job.assigned",
  "job.picked_up",
  "job.delivered",
  "job.failed",
  "job.cancelled",
]);
