import "server-only";
import { getWriteClient } from "@/app/lib/sanity-write";
import { createJob, quoteJob } from "./client";
import type { GeoPoint } from "./types";

/**
 * Create an Itafika delivery job for a paid order. Money-adjacent — main-loop only.
 *
 * Inert today: orders carry no shipping geo yet (address collection at checkout is a follow-up),
 * so this logs and returns until both a store origin (ITAFIKA_ORIGIN_*) and the order's
 * shipping_destination exist. Idempotent: skips if the order already has an itafika_job_id, and
 * anchor_reference_id is a second idempotency layer on Itafika's side.
 */

interface OrderForDispatch {
  _id: string;
  shipping_destination?: GeoPoint;
  itafika_job_id?: string;
}

function storeOrigin(): GeoPoint | null {
  const lat = Number(process.env.ITAFIKA_ORIGIN_LAT);
  const lng = Number(process.env.ITAFIKA_ORIGIN_LNG);
  const label = process.env.ITAFIKA_ORIGIN_LABEL ?? "BazaarKE store";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label };
}

const EARTH_RADIUS_M = 6_371_000;

function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

export async function dispatchDelivery(externalRef: string, traceparent?: string): Promise<void> {
  if (!externalRef) return;
  const client = getWriteClient();
  const order = await client.fetch<OrderForDispatch | null>(
    `*[_type == "order" && _id == $id][0]{ _id, shipping_destination, itafika_job_id }`,
    { id: `order.${externalRef}` },
  );
  if (!order || order.itafika_job_id) return; // missing or already dispatched (idempotent)

  const origin = storeOrigin();
  const destination = order.shipping_destination;
  if (!origin || !destination) {
    console.info(
      `[itafika] dispatch skipped for ${externalRef}: missing ${!origin ? "ITAFIKA_ORIGIN_*" : "shipping_destination geo"} (collect address at checkout to enable)`,
    );
    return;
  }

  const distance_meters = haversineMeters(origin, destination);
  const quote = await quoteJob({ origin, destination, distance_meters, tier: "standard" }, { traceparent });
  const { job, requestId } = await createJob(
    { anchor_reference_id: externalRef, origin, destination, distance_meters, tier: "standard" },
    { traceparent, idempotencyKey: externalRef },
  );

  await client
    .patch(`order.${externalRef}`)
    .setIfMissing({ rail_audit: [] })
    .set({ itafika_job_id: job.job_id, delivery_fee_minor: quote.price_minor })
    .append("rail_audit", [
      {
        rail: "itafika",
        action: "job.create",
        traceparent,
        business_op_id: externalRef.replace(/^ua_order_/, ""),
        request_id: requestId,
        timestamp: new Date().toISOString(),
        success: true,
      },
    ])
    .commit({ autoGenerateArrayKeys: true });
}
