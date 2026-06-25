import "server-only";
import { getWriteClient } from "@/app/lib/sanity-write";
import { releaseDedup, seenBefore } from "../_shared/dedup";
import { notifyAccount, notifyIdempotencyKey } from "../todoku";
import { processItafikaEvent, type OrderRow } from "./handlers-core";
import type { ItafikaWebhookEvent } from "./types";

/**
 * Itafika webhook event handling — Money Rule: main-loop only (delivery-fee reconciliation is
 * payment-adjacent). This is the thin imperative SHELL: it wires the real I/O into
 * processItafikaEvent (handlers-core.ts), which owns the dedup + forward-only orchestration.
 *
 * KP-16 delivery-fee CHARGING is inert today (needs UA's KP account_uuid on the anchor row AND
 * Itafika OPS-4) — reconciliation is observe-only at MVP.
 */

async function findOrderByJob(jobId: string): Promise<OrderRow | null> {
  return getWriteClient().fetch<OrderRow | null>(
    `*[_type == "order" && itafika_job_id == $jobId][0]{ _id, account_uuid, business_op_id, delivery_fee_minor, traceparent, state }`,
    { jobId },
  );
}

function auditRow(action: string, order: OrderRow) {
  return {
    rail: "itafika",
    action,
    traceparent: order.traceparent, // §A.11 — recovered from the order
    business_op_id: order.business_op_id ?? order._id.replace(/^order\./, "").replace(/^ua_order_/, ""),
    timestamp: new Date().toISOString(),
    success: true,
  };
}

async function commitOrder(order: OrderRow, set: Record<string, unknown>, action: string): Promise<void> {
  await getWriteClient()
    .patch(order._id)
    .setIfMissing({ rail_audit: [] })
    .set(set)
    .append("rail_audit", [auditRow(action, order)])
    .commit({ autoGenerateArrayKeys: true });
}

export async function dispatchItafikaEvent(event: ItafikaWebhookEvent): Promise<void> {
  return processItafikaEvent(event, {
    seenBefore,
    releaseDedup,
    findOrderByJob,
    commitOrder,
    notifyAccount,
    notifyIdempotencyKey,
  });
}
