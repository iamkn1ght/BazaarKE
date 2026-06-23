import "server-only";
import { getWriteClient } from "@/app/lib/sanity-write";
import { dedupKey, seenBefore } from "../_shared/dedup";
import type { KpEvent } from "./types";

/**
 * KP event handling — Money Rule: main-loop only. Shared by BOTH the inert HTTP webhook
 * (app/lib/rails/payment-rail/webhook.ts) and the primary Kafka consumer (kafka-consumer.ts),
 * so the money logic lives in exactly one place.
 *
 * Order docs use _id = `order.<external_ref>` (external_ref = "ua_order_<id>", set at checkout).
 */

function auditRow(action: string, event: KpEvent) {
  return {
    rail: "kipkiren_pay",
    action,
    business_op_id: event.external_ref,
    timestamp: new Date().toISOString(),
    success: true,
  };
}

async function patchOrder(
  event: KpEvent,
  set: Record<string, unknown>,
  auditAction: string,
): Promise<void> {
  const externalRef = event.external_ref;
  if (!externalRef) return; // nothing to correlate to
  const client = getWriteClient();
  await client
    .patch(`order.${externalRef}`)
    .setIfMissing({ rail_audit: [] })
    .set(set)
    .append("rail_audit", [auditRow(auditAction, event)])
    .commit({ autoGenerateArrayKeys: true });
}

/**
 * Dispatch a KP event. Idempotent: dedups via Vercel KV before any side effect, so HTTP-retry
 * and Kafka-redelivery of the same event are safe.
 */
export async function dispatchKpEvent(event: KpEvent): Promise<void> {
  const dedupId =
    event.external_ref ?? event.charge_id ?? event.payout_id ?? event.resource_id ?? "unknown";
  if (await seenBefore(dedupKey("kp", String(event.event_type), dedupId))) {
    return; // duplicate — already processed
  }

  switch (event.event_type) {
    case "PAYMENT_COMPLETED":
      await patchOrder(event, { state: "PAID", kp_charge_id: event.charge_id }, "payment.completed");
      // TODO(Week 4): trigger Itafika POST /v1/jobs (anchor_reference_id = the order's external_ref)
      // TODO(Week 3): trigger Todoku unique_accessories_order_confirmed_{sms,whatsapp}
      break;
    case "PAYMENT_FAILED":
      await patchOrder(event, { state: "FAILED" }, "payment.failed");
      break;
    case "PAYOUT_COMPLETED":
      await patchOrder(event, { state: "REFUNDED" }, "payout.completed");
      // TODO(Week 3): trigger Todoku unique_accessories_refund_initiated_sms
      break;
    case "PAYOUT_FAILED":
      await patchOrder(event, {}, "payout.failed");
      break;
    case "WALLET_CREDITED":
      await patchOrder(event, {}, "wallet.credited");
      break;
    default:
      // Unknown/unsubscribed event — ack without side effects.
      break;
  }
}
