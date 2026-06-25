// Pure Itafika (last-mile) webhook event → order decision table. NO server-only / NO Sanity imports,
// so it is unit-testable in isolation. Single source of truth for the FORWARD-ONLY delivery state
// machine the handler (handlers.ts) executes. The handler does the I/O; this decides what happens.

import type { TodokuTemplateKey } from "../todoku";

/** States an Itafika event can move an order INTO. */
export type ItafikaState = "DISPATCHED" | "DELIVERED" | "CANCELLED";

export interface ItafikaNotify {
  kind: "notify";
  templateKey: TodokuTemplateKey;
  eventType: string;
}
/** Observe-only delivery-fee reconciliation log on delivery (KP-16 charging is inert at MVP). */
export interface ItafikaReconcile {
  kind: "reconcile";
}
export type ItafikaSideEffect = ItafikaNotify | ItafikaReconcile;

export type ItafikaDecision =
  | { kind: "ack" }
  | { kind: "audit"; action: string }
  | { kind: "skip"; action: string }
  | { kind: "apply"; action: string; newState: ItafikaState; sideEffects: ItafikaSideEffect[] };

interface ItafikaRule {
  action: string;
  newState: ItafikaState | null;
  allowedFrom: string[] | null;
  sideEffects?: ItafikaSideEffect[];
}

// Dispatch only from PAID; delivery from PAID or DISPATCHED (a job.assigned may have been missed);
// cancellation from PAID or DISPATCHED (never after DELIVERED). picked_up / failed are audit-only.
const ITAFIKA_RULES: Readonly<Record<string, ItafikaRule>> = {
  "job.assigned": {
    action: "job.assigned",
    newState: "DISPATCHED",
    allowedFrom: ["PAID"],
    sideEffects: [{ kind: "notify", templateKey: "shipping_dispatched_sms", eventType: "shipping_dispatched" }],
  },
  "job.picked_up": { action: "job.picked_up", newState: null, allowedFrom: null },
  "job.delivered": {
    action: "job.delivered",
    newState: "DELIVERED",
    allowedFrom: ["PAID", "DISPATCHED"],
    sideEffects: [
      { kind: "reconcile" },
      { kind: "notify", templateKey: "delivery_completed_sms", eventType: "delivery_completed" },
    ],
  },
  "job.failed": { action: "job.failed", newState: null, allowedFrom: null },
  "job.cancelled": { action: "job.cancelled", newState: "CANCELLED", allowedFrom: ["PAID", "DISPATCHED"] },
};

export function decideItafika(eventName: string, currentState: string): ItafikaDecision {
  const rule = ITAFIKA_RULES[eventName];
  if (!rule) return { kind: "ack" };
  if (rule.allowedFrom === null || rule.newState === null) return { kind: "audit", action: rule.action };
  if (!rule.allowedFrom.includes(currentState)) return { kind: "skip", action: rule.action };
  return { kind: "apply", action: rule.action, newState: rule.newState, sideEffects: rule.sideEffects ?? [] };
}
