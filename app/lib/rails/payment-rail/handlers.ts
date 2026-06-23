import "server-only";
import { getWriteClient } from "@/app/lib/sanity-write";
import { dedupKey, seenBefore } from "../_shared/dedup";
import { notifyAccount, notifyIdempotencyKey, type TodokuTemplateKey } from "../todoku";
import { dispatchDelivery } from "../itafika";
import { formatKes, parseAmountMinor } from "./money";
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

function orderIdOf(event: KpEvent): string {
  return (event.external_ref ?? "").replace(/^ua_order_/, "") || event.external_ref || "unknown";
}

function amountText(event: KpEvent): string {
  try {
    return formatKes(parseAmountMinor(event.amount_minor ?? "0"));
  } catch {
    return "";
  }
}

/**
 * Send a Todoku notification for an order event. Partial-failure rule (App Integration Guide §8.6):
 * a comms failure must NOT roll back the payment state — log and continue. Inert until Todoku creds
 * + template ULIDs land (throws RAIL_CONFIG_INCOMPLETE / TEMPLATE_NOT_READY, caught here).
 */
async function notify(
  event: KpEvent,
  templateKey: TodokuTemplateKey,
  eventType: string,
  variables: Record<string, string>,
): Promise<void> {
  if (!event.account_uuid) return;
  try {
    await notifyAccount({
      accountUuid: event.account_uuid,
      templateKey,
      variables,
      idempotencyKey: notifyIdempotencyKey(orderIdOf(event), eventType),
    });
  } catch (err) {
    console.error(`[kp->todoku] ${templateKey} send failed:`, err instanceof Error ? err.message : err);
  }
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
    case "PAYMENT_COMPLETED": {
      await patchOrder(event, { state: "PAID", kp_charge_id: event.charge_id }, "payment.completed");
      const vars = { order_ref: event.external_ref ?? "", amount: amountText(event) };
      await notify(event, "order_confirmed_sms", "order_confirmed_sms", vars);
      await notify(event, "order_confirmed_whatsapp", "order_confirmed_whatsapp", vars);
      // Trigger last-mile delivery. Inert until shipping geo + store origin exist; partial-failure
      // safe — a dispatch error must not roll back the PAID state.
      try {
        await dispatchDelivery(event.external_ref ?? "");
      } catch (err) {
        console.error("[kp->itafika] dispatch failed:", err instanceof Error ? err.message : err);
      }
      break;
    }
    case "PAYMENT_FAILED":
      await patchOrder(event, { state: "FAILED" }, "payment.failed");
      break;
    case "PAYOUT_COMPLETED":
      await patchOrder(event, { state: "REFUNDED" }, "payout.completed");
      await notify(event, "refund_initiated_sms", "refund_initiated", {
        order_ref: event.external_ref ?? "",
        amount: amountText(event),
      });
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
