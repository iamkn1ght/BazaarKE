import "server-only";
import { getWriteClient } from "@/app/lib/sanity-write";
import { releaseDedup, seenBefore } from "../_shared/dedup";
import { notifyAccount, notifyIdempotencyKey } from "../todoku";
import { dispatchDelivery } from "../itafika";
import { processKpEvent, type OrderSnapshot } from "./handlers-core";
import type { KpEvent } from "./types";

/**
 * KP event handling — Money Rule: main-loop only. Shared by BOTH the inert HTTP webhook and the
 * primary Kafka consumer, so the money logic lives in exactly one place. This is the thin imperative
 * SHELL: it wires the real I/O into processKpEvent (handlers-core.ts), which owns the orchestration.
 *
 * Order docs use _id = `order.<external_ref>` (external_ref = "ua_order_<id>", set at checkout).
 */

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

async function commitOrder(
  externalRef: string,
  snapshot: OrderSnapshot,
  set: Record<string, unknown>,
  action: string,
): Promise<void> {
  await getWriteClient()
    .patch(`order.${externalRef}`)
    .setIfMissing({ rail_audit: [] })
    .set(set)
    .append("rail_audit", [auditRow(action, snapshot, externalRef)])
    .commit({ autoGenerateArrayKeys: true });
}

export async function dispatchKpEvent(event: KpEvent): Promise<void> {
  return processKpEvent(event, {
    seenBefore,
    releaseDedup,
    loadOrder,
    commitOrder,
    notifyAccount,
    notifyIdempotencyKey,
    dispatchDelivery,
  });
}
