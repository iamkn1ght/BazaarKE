import "server-only";
import { getWriteClient } from "@/app/lib/sanity-write";
import { dedupKey, releaseDedup, seenBefore } from "../_shared/dedup";
import { notifyAccount, notifyIdempotencyKey, type TodokuTemplateKey } from "../todoku";
import { ITAFIKA_WEBHOOK_EVENTS, type ItafikaWebhookEvent } from "./types";

/**
 * Itafika webhook event handling — Money Rule: main-loop only (delivery-fee reconciliation is
 * payment-adjacent). Correlates job_id -> order (via stored itafika_job_id), patches order state
 * FORWARD-ONLY, triggers Todoku, and logs the expected delivery fee for reconciliation.
 *
 * KP-16 delivery-fee CHARGING is inert today (needs UA's KP account_uuid on the anchor row AND
 * Itafika OPS-4) — reconciliation is observe-only at MVP. Dedup is released on failure so a
 * redelivery can recover (claim-then-crash safety).
 */

interface OrderRow {
  _id: string;
  account_uuid?: string;
  business_op_id?: string;
  delivery_fee_minor?: number;
  traceparent?: string;
  state?: string;
}

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

/** FORWARD-ONLY state write; allowedFrom=null = audit-only. Returns whether a state change applied. */
async function applyState(
  order: OrderRow,
  set: Record<string, unknown>,
  action: string,
  allowedFrom: Set<string> | null,
): Promise<boolean> {
  if (allowedFrom && !allowedFrom.has(order.state ?? "")) {
    console.warn(`[itafika] ignoring ${action} for ${order._id}: state '${order.state ?? "none"}' is not a legal predecessor`);
    return false;
  }
  await getWriteClient()
    .patch(order._id)
    .setIfMissing({ rail_audit: [] })
    .set(set)
    .append("rail_audit", [auditRow(action, order)])
    .commit({ autoGenerateArrayKeys: true });
  return allowedFrom !== null;
}

export async function dispatchItafikaEvent(event: ItafikaWebhookEvent): Promise<void> {
  // Reject unknown/unsigned event types up front (the header fallback is gone — see webhook.ts).
  if (!ITAFIKA_WEBHOOK_EVENTS.has(event.event as string)) {
    console.warn(`[itafika] unknown event '${event.event}' for job ${event.job_id}; acking`);
    return;
  }

  const key = dedupKey("itafika", String(event.event), event.job_id); // (job_id, event) dedup
  if (await seenBefore(key)) return;

  try {
    const order = await findOrderByJob(event.job_id);
    if (!order) {
      console.warn(`[itafika] no order found for job ${event.job_id}; acking`);
      return;
    }
    const externalRef = order._id.replace(/^order\./, "");
    const orderId = order.business_op_id ?? externalRef.replace(/^ua_order_/, "");

    const notify = async (templateKey: TodokuTemplateKey, eventType: string): Promise<void> => {
      if (!order.account_uuid) return;
      try {
        await notifyAccount({
          accountUuid: order.account_uuid,
          templateKey,
          variables: { order_ref: externalRef },
          idempotencyKey: notifyIdempotencyKey(orderId, eventType),
        });
      } catch (err) {
        console.error(`[itafika->todoku] ${templateKey} failed:`, err instanceof Error ? err.message : err);
      }
    };

    switch (event.event) {
      case "job.assigned":
        if (await applyState(order, { state: "DISPATCHED" }, "job.assigned", new Set(["PAID"]))) {
          await notify("shipping_dispatched_sms", "shipping_dispatched");
        }
        break;
      case "job.picked_up":
        await applyState(order, {}, "job.picked_up", null);
        break;
      case "job.delivered":
        if (await applyState(order, { state: "DELIVERED" }, "job.delivered", new Set(["PAID", "DISPATCHED"]))) {
          // KP-16 reconciliation (observe-only): log the expected delivery fee; charging is inert today.
          console.info(
            `[itafika][reconcile] job=${event.job_id} order=${externalRef} expected_delivery_fee_minor=${order.delivery_fee_minor ?? "unknown"} (observe-only; KP-16 inert)`,
          );
          await notify("delivery_completed_sms", "delivery_completed");
        }
        break;
      case "job.failed":
        await applyState(order, {}, "job.failed", null);
        break;
      case "job.cancelled":
        await applyState(order, { state: "CANCELLED" }, "job.cancelled", new Set(["PAID", "DISPATCHED"]));
        break;
      default:
        break;
    }
  } catch (err) {
    if (key) await releaseDedup(key);
    throw err;
  }
}
