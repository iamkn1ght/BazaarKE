// KP event-processing CORE (functional core / imperative shell). Money Rule: main-loop only.
//
// This holds the money-critical orchestration — dedup claim/release, the forward-only transition
// (via decideKp), and side-effect firing — but takes ALL I/O (Sanity, Todoku, Itafika, dedup store)
// as injected deps, so it imports nothing server-only and can be unit-tested in isolation. The thin
// shell (handlers.ts) wires the real implementations. Behavior must stay identical to the shell.

import { dedupKey } from "../_shared/dedup";
import { decideKp } from "./transitions";
import { formatKes, parseAmountMinor } from "./money";
import type { TodokuTemplateKey } from "../todoku";
import type { KpEvent } from "./types";

export interface OrderSnapshot {
  state?: string;
  traceparent?: string;
  business_op_id?: string;
}

export interface NotifyArgs {
  accountUuid: string;
  templateKey: TodokuTemplateKey;
  variables: Record<string, string>;
  idempotencyKey: string;
}

/** Every external collaborator the core needs — injected so the orchestration is testable. */
export interface KpDeps {
  seenBefore: (key: string) => Promise<boolean>;
  releaseDedup: (key: string) => Promise<void>;
  loadOrder: (externalRef: string) => Promise<OrderSnapshot | null>;
  commitOrder: (externalRef: string, snapshot: OrderSnapshot, set: Record<string, unknown>, action: string) => Promise<void>;
  notifyAccount: (args: NotifyArgs) => Promise<unknown>;
  notifyIdempotencyKey: (orderId: string, eventType: string) => string;
  dispatchDelivery: (externalRef: string, traceparent?: string) => Promise<void>;
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
async function notify(deps: KpDeps, event: KpEvent, templateKey: TodokuTemplateKey, eventType: string, variables: Record<string, string>): Promise<void> {
  if (!event.account_uuid) return;
  try {
    await deps.notifyAccount({
      accountUuid: event.account_uuid,
      templateKey,
      variables,
      idempotencyKey: deps.notifyIdempotencyKey(orderIdOf(event), eventType),
    });
  } catch (err) {
    console.error(`[kp->todoku] ${templateKey} send failed:`, err instanceof Error ? err.message : err);
  }
}

export async function processKpEvent(event: KpEvent, deps: KpDeps): Promise<void> {
  // Only dedup on a STABLE id. An id-less event must not collapse into a shared "unknown" slot.
  const stableId = event.external_ref ?? event.charge_id ?? event.payout_id ?? event.resource_id ?? null;
  let key: string | null = null;
  if (stableId) {
    key = dedupKey("kp", String(event.event_type), stableId);
    if (await deps.seenBefore(key)) return; // duplicate — already processed
  }

  try {
    const externalRef = event.external_ref ?? null;
    const snapshot: OrderSnapshot = (externalRef && (await deps.loadOrder(externalRef))) || {};
    const decision = decideKp(String(event.event_type), snapshot.state ?? "");

    // Unknown/unsubscribed event, or no order to correlate to → ack without side effects.
    if (decision.kind === "ack" || !externalRef) return;

    if (decision.kind === "skip") {
      console.warn(`[kp] ignoring ${decision.action} for ${externalRef}: state '${snapshot.state ?? "none"}' is not a legal predecessor`);
      return;
    }

    if (decision.kind === "audit") {
      await deps.commitOrder(externalRef, snapshot, {}, decision.action);
      return;
    }

    // decision.kind === "apply": a legal forward transition. Write the state, THEN fire side effects —
    // which run only here, so a replay/out-of-order event (decided "skip") can never double-charge,
    // double-notify, or double-dispatch.
    const set: Record<string, unknown> = { state: decision.newState };
    if (decision.setChargeId) set.kp_charge_id = event.charge_id;
    await deps.commitOrder(externalRef, snapshot, set, decision.action);

    const variables = { order_ref: externalRef, amount: amountText(event) };
    for (const effect of decision.sideEffects) {
      if (effect.kind === "notify") {
        await notify(deps, event, effect.templateKey, effect.eventType, variables);
      } else {
        // dispatch — partial-failure safe (a dispatch error must NOT roll back the PAID state).
        try {
          await deps.dispatchDelivery(externalRef, snapshot.traceparent);
        } catch (err) {
          console.error("[kp->itafika] dispatch failed:", err instanceof Error ? err.message : err);
        }
      }
    }
  } catch (err) {
    // Money-state write failed AFTER claiming dedup — release so the redelivery re-processes.
    if (key) await deps.releaseDedup(key);
    throw err;
  }
}
