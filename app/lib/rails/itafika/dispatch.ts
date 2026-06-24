import "server-only";
import { getWriteClient } from "@/app/lib/sanity-write";
import { createJob, quoteJob } from "./client";
import { haversineMeters, storeOrigin } from "./geo";
import type { GeoPoint } from "./types";

/**
 * Create an Itafika delivery job for a paid order. Money-adjacent — main-loop only.
 *
 * Enabled once both a store origin (ITAFIKA_ORIGIN_*) and the order's shipping_destination (set at
 * checkout from the geocoded delivery step) exist; otherwise it logs and returns (e.g. before the
 * origin is configured). Idempotent: skips if the order already has an itafika_job_id, and
 * anchor_reference_id is a second idempotency layer on Itafika's side.
 */

interface OrderForDispatch {
  _id: string;
  shipping_destination?: GeoPoint;
  itafika_job_id?: string;
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
