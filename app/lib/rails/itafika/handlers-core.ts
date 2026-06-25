// Itafika webhook event-processing CORE (functional core / imperative shell). Money Rule: main-loop
// only (delivery-fee reconciliation is payment-adjacent). Holds the dedup + forward-only transition
// (via decideItafika) + side-effect orchestration, with all I/O injected so it is unit-testable and
// imports nothing server-only. The thin shell (handlers.ts) wires the real implementations.

import { dedupKey } from "../_shared/dedup";
import { decideItafika } from "./transitions";
import { ITAFIKA_WEBHOOK_EVENTS, type ItafikaWebhookEvent } from "./types";
import type { TodokuTemplateKey } from "../todoku";

export interface OrderRow {
  _id: string;
  account_uuid?: string;
  business_op_id?: string;
  delivery_fee_minor?: number;
  traceparent?: string;
  state?: string;
}

export interface NotifyArgs {
  accountUuid: string;
  templateKey: TodokuTemplateKey;
  variables: Record<string, string>;
  idempotencyKey: string;
}

export interface ItafikaDeps {
  seenBefore: (key: string) => Promise<boolean>;
  releaseDedup: (key: string) => Promise<void>;
  findOrderByJob: (jobId: string) => Promise<OrderRow | null>;
  commitOrder: (order: OrderRow, set: Record<string, unknown>, action: string) => Promise<void>;
  notifyAccount: (args: NotifyArgs) => Promise<unknown>;
  notifyIdempotencyKey: (orderId: string, eventType: string) => string;
}

export async function processItafikaEvent(event: ItafikaWebhookEvent, deps: ItafikaDeps): Promise<void> {
  // Reject unknown/unsigned event types up front (the header fallback is gone — see webhook.ts).
  if (!ITAFIKA_WEBHOOK_EVENTS.has(event.event as string)) {
    console.warn(`[itafika] unknown event '${event.event}' for job ${event.job_id}; acking`);
    return;
  }

  const key = dedupKey("itafika", String(event.event), event.job_id); // (job_id, event) dedup
  if (await deps.seenBefore(key)) return;

  try {
    const order = await deps.findOrderByJob(event.job_id);
    if (!order) {
      console.warn(`[itafika] no order found for job ${event.job_id}; acking`);
      return;
    }
    const externalRef = order._id.replace(/^order\./, "");
    const orderId = order.business_op_id ?? externalRef.replace(/^ua_order_/, "");

    const notify = async (templateKey: TodokuTemplateKey, eventType: string): Promise<void> => {
      if (!order.account_uuid) return;
      try {
        await deps.notifyAccount({
          accountUuid: order.account_uuid,
          templateKey,
          variables: { order_ref: externalRef },
          idempotencyKey: deps.notifyIdempotencyKey(orderId, eventType),
        });
      } catch (err) {
        console.error(`[itafika->todoku] ${templateKey} failed:`, err instanceof Error ? err.message : err);
      }
    };

    const decision = decideItafika(String(event.event), order.state ?? "");
    if (decision.kind === "ack") return;

    if (decision.kind === "skip") {
      console.warn(`[itafika] ignoring ${decision.action} for ${order._id}: state '${order.state ?? "none"}' is not a legal predecessor`);
      return;
    }

    if (decision.kind === "audit") {
      await deps.commitOrder(order, {}, decision.action);
      return;
    }

    // decision.kind === "apply": a legal forward transition. Write state, then fire side effects —
    // only here, so a redelivered/out-of-order event (decided "skip") cannot re-fire them.
    await deps.commitOrder(order, { state: decision.newState }, decision.action);
    for (const effect of decision.sideEffects) {
      if (effect.kind === "reconcile") {
        // KP-16 reconciliation (observe-only): log the expected delivery fee; charging is inert today.
        console.info(
          `[itafika][reconcile] job=${event.job_id} order=${externalRef} expected_delivery_fee_minor=${order.delivery_fee_minor ?? "unknown"} (observe-only; KP-16 inert)`,
        );
      } else {
        await notify(effect.templateKey, effect.eventType);
      }
    }
  } catch (err) {
    if (key) await deps.releaseDedup(key);
    throw err;
  }
}
