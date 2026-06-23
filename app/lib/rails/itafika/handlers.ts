import "server-only";
import { getWriteClient } from "@/app/lib/sanity-write";
import { dedupKey, seenBefore } from "../_shared/dedup";
import { notifyAccount, notifyIdempotencyKey, type TodokuTemplateKey } from "../todoku";
import type { ItafikaWebhookEvent } from "./types";

/**
 * Itafika webhook event handling — Money Rule: main-loop only (delivery-fee reconciliation is
 * payment-adjacent). Correlates job_id -> order (itafika_job_id stored at dispatch), patches the
 * order state, triggers Todoku, and logs the expected delivery fee for reconciliation.
 *
 * KP-16 delivery-fee CHARGING is inert today (needs UA's KP account_uuid on the anchor row AND
 * Itafika OPS-4) — reconciliation is observe-only at MVP.
 */

interface OrderRow {
  _id: string;
  account_uuid?: string;
  business_op_id?: string;
  delivery_fee_minor?: number;
}

async function findOrderByJob(jobId: string): Promise<OrderRow | null> {
  return getWriteClient().fetch<OrderRow | null>(
    `*[_type == "order" && itafika_job_id == $jobId][0]{ _id, account_uuid, business_op_id, delivery_fee_minor }`,
    { jobId },
  );
}

async function patchOrder(orderId: string, set: Record<string, unknown>, action: string, businessOpId?: string): Promise<void> {
  await getWriteClient()
    .patch(orderId)
    .setIfMissing({ rail_audit: [] })
    .set(set)
    .append("rail_audit", [
      { rail: "itafika", action, business_op_id: businessOpId, timestamp: new Date().toISOString(), success: true },
    ])
    .commit({ autoGenerateArrayKeys: true });
}

export async function dispatchItafikaEvent(event: ItafikaWebhookEvent): Promise<void> {
  if (await seenBefore(dedupKey("itafika", String(event.event), event.job_id))) return; // (job_id, event) dedup

  const order = await findOrderByJob(event.job_id);
  if (!order) {
    console.warn(`[itafika] no order found for job ${event.job_id}; acking`);
    return;
  }
  const externalRef = order._id.replace(/^order\./, "");
  const orderId = order.business_op_id ?? externalRef;

  // Partial-failure safe: a comms failure must not undo the delivery state transition.
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
      await patchOrder(order._id, { state: "DISPATCHED" }, "job.assigned", orderId);
      await notify("shipping_dispatched_sms", "shipping_dispatched");
      break;
    case "job.picked_up":
      await patchOrder(order._id, {}, "job.picked_up", orderId);
      break;
    case "job.delivered":
      await patchOrder(order._id, { state: "DELIVERED" }, "job.delivered", orderId);
      // KP-16 reconciliation (observe-only): log the expected delivery fee; charging is inert today.
      console.info(
        `[itafika][reconcile] job=${event.job_id} order=${externalRef} expected_delivery_fee_minor=${order.delivery_fee_minor ?? "unknown"} (observe-only; KP-16 inert)`,
      );
      await notify("delivery_completed_sms", "delivery_completed");
      break;
    case "job.failed":
      await patchOrder(order._id, {}, "job.failed", orderId);
      break;
    case "job.cancelled":
      await patchOrder(order._id, { state: "CANCELLED" }, "job.cancelled", orderId);
      break;
    default:
      break;
  }
}
