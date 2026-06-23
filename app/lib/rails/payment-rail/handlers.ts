import "server-only";
import { getWriteClient } from "@/app/lib/sanity-write";
import { dedupKey, releaseDedup, seenBefore } from "../_shared/dedup";
import { notifyAccount, notifyIdempotencyKey, type TodokuTemplateKey } from "../todoku";
import { dispatchDelivery } from "../itafika";
import { formatKes, parseAmountMinor } from "./money";
import type { KpEvent } from "./types";

/**
 * KP event handling — Money Rule: main-loop only. Shared by BOTH the inert HTTP webhook and the
 * primary Kafka consumer, so the money logic lives in exactly one place.
 *
 * Order docs use _id = `order.<external_ref>` (external_ref = "ua_order_<id>", set at checkout).
 *
 * Idempotency + ordering safety:
 *  - dedup is claimed up-front for concurrency, but RELEASED on failure so a retry re-processes
 *    (otherwise a claim-then-crash permanently drops the event — money-state loss);
 *  - state writes are FORWARD-ONLY (guarded by the order's current state), so an out-of-order or
 *    redelivered event cannot clobber a terminal state or re-fire side effects.
 */

interface OrderSnapshot {
  state?: string;
  traceparent?: string;
  business_op_id?: string;
}

async function loadOrder(externalRef: string): Promise<OrderSnapshot | null> {
  return getWriteClient().fetch<OrderSnapshot | null>(
    `*[_type == "order" && _id == $id][0]{ state, traceparent, business_op_id }`,
    { id: `order.${externalRef}` },
  );
}

function auditRow(action: string, snapshot: OrderSnapshot, externalRef: string) {
  return {
    rail: "kipkiren_pay",
    action,
    traceparent: snapshot.traceparent, // §A.11 — recovered from the order
    business_op_id: snapshot.business_op_id ?? externalRef.replace(/^ua_order_/, ""),
    timestamp: new Date().toISOString(),
    success: true,
  };
}

/**
 * Apply a state write to the order, FORWARD-ONLY: if allowedFrom is given and the order's current
 * state is not one of those predecessors, the event is ignored (idempotent / out-of-order safe).
 * allowedFrom = null means an audit-only event (no state change, always recorded). Returns whether
 * the state change was applied (so callers can gate side effects on a real transition).
 */
async function applyState(
  externalRef: string,
  snapshot: OrderSnapshot,
  set: Record<string, unknown>,
  action: string,
  allowedFrom: Set<string> | null,
): Promise<boolean> {
  if (allowedFrom && !allowedFrom.has(snapshot.state ?? "")) {
    console.warn(`[kp] ignoring ${action} for ${externalRef}: state '${snapshot.state ?? "none"}' is not a legal predecessor`);
    return false;
  }
  await getWriteClient()
    .patch(`order.${externalRef}`)
    .setIfMissing({ rail_audit: [] })
    .set(set)
    .append("rail_audit", [auditRow(action, snapshot, externalRef)])
    .commit({ autoGenerateArrayKeys: true });
  return allowedFrom !== null; // true = a state transition happened; false = audit-only row
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

/** Todoku notify — partial-failure safe (a comms failure must NOT roll back the payment state). */
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

export async function dispatchKpEvent(event: KpEvent): Promise<void> {
  // Only dedup on a STABLE id. An id-less event must not collapse into a shared "unknown" slot.
  const stableId = event.external_ref ?? event.charge_id ?? event.payout_id ?? event.resource_id ?? null;
  let key: string | null = null;
  if (stableId) {
    key = dedupKey("kp", String(event.event_type), stableId);
    if (await seenBefore(key)) return; // duplicate — already processed
  }

  try {
    const externalRef = event.external_ref ?? null;
    const snapshot: OrderSnapshot = (externalRef && (await loadOrder(externalRef))) || {};

    switch (event.event_type) {
      case "PAYMENT_COMPLETED": {
        if (!externalRef) break;
        const applied = await applyState(
          externalRef,
          snapshot,
          { state: "PAID", kp_charge_id: event.charge_id },
          "payment.completed",
          new Set(["", "PENDING"]),
        );
        if (applied) {
          const vars = { order_ref: externalRef, amount: amountText(event) };
          await notify(event, "order_confirmed_sms", "order_confirmed_sms", vars);
          await notify(event, "order_confirmed_whatsapp", "order_confirmed_whatsapp", vars);
          try {
            await dispatchDelivery(externalRef, snapshot.traceparent);
          } catch (err) {
            console.error("[kp->itafika] dispatch failed:", err instanceof Error ? err.message : err);
          }
        }
        break;
      }
      case "PAYMENT_FAILED":
        if (externalRef) await applyState(externalRef, snapshot, { state: "FAILED" }, "payment.failed", new Set(["", "PENDING"]));
        break;
      case "PAYOUT_COMPLETED":
        if (externalRef) {
          const applied = await applyState(externalRef, snapshot, { state: "REFUNDED" }, "payout.completed", new Set(["PAID", "DISPATCHED", "DELIVERED"]));
          if (applied) {
            await notify(event, "refund_initiated_sms", "refund_initiated", { order_ref: externalRef, amount: amountText(event) });
          }
        }
        break;
      case "PAYOUT_FAILED":
        if (externalRef) await applyState(externalRef, snapshot, {}, "payout.failed", null);
        break;
      case "WALLET_CREDITED":
        if (externalRef) await applyState(externalRef, snapshot, {}, "wallet.credited", null);
        break;
      default:
        break; // unknown/unsubscribed — ack without side effects
    }
  } catch (err) {
    // Money-state write failed AFTER claiming dedup — release so the redelivery re-processes.
    if (key) await releaseDedup(key);
    throw err;
  }
}
