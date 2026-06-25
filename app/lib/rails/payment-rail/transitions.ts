// Pure KP (Kipkiren Pay) event → order decision table. NO server-only / NO Sanity imports, so it is
// unit-testable in isolation. This is the single source of truth for the FORWARD-ONLY order state
// machine that the handler (handlers.ts) executes — the locus of the prior double-charge / replay
// money-state bugs. The handler does the I/O; this decides what (if anything) should happen.

import type { TodokuTemplateKey } from "../todoku";

/** States a KP event can move an order INTO (writes are forward-only; see allowedFrom). */
export type KpState = "PAID" | "FAILED" | "REFUNDED";

export interface KpNotify {
  kind: "notify";
  templateKey: TodokuTemplateKey;
  /** event-type slug for the Todoku idempotency key (ua_<order_id>_<event_type>). */
  eventType: string;
}
export interface KpDispatch {
  kind: "dispatch";
}
export type KpSideEffect = KpNotify | KpDispatch;

/**
 * The decision for one (event_type, current order state):
 *  - ack   : unknown/unsubscribed event — acknowledge, no write, no side effects.
 *  - audit : record an audit row only (no state change), always.
 *  - skip  : a known state-changing event whose forward-only guard blocked it (out-of-order /
 *            redelivery / terminal-state replay) — do nothing but warn.
 *  - apply : a legal forward transition — write the new state (+ optional charge id) and fire the
 *            side effects, which run ONLY on a real transition (so a replay can't double-fire them).
 */
export type KpDecision =
  | { kind: "ack" }
  | { kind: "audit"; action: string }
  | { kind: "skip"; action: string }
  | { kind: "apply"; action: string; newState: KpState; setChargeId: boolean; sideEffects: KpSideEffect[] };

interface KpRule {
  action: string;
  /** null → audit-only event (no state change). */
  newState: KpState | null;
  /** null → audit-only; otherwise the only predecessor states this transition may apply from. */
  allowedFrom: string[] | null;
  /** PAYMENT_COMPLETED also stamps kp_charge_id from the event. */
  setChargeId?: boolean;
  sideEffects?: KpSideEffect[];
}

// "" models a missing/unknown current state (order not found, or pre-PENDING). A fresh
// PAYMENT_COMPLETED is allowed from "" or "PENDING"; everything else is strictly forward.
const KP_RULES: Readonly<Record<string, KpRule>> = {
  PAYMENT_COMPLETED: {
    action: "payment.completed",
    newState: "PAID",
    allowedFrom: ["", "PENDING"],
    setChargeId: true,
    sideEffects: [
      { kind: "notify", templateKey: "order_confirmed_sms", eventType: "order_confirmed_sms" },
      { kind: "notify", templateKey: "order_confirmed_whatsapp", eventType: "order_confirmed_whatsapp" },
      { kind: "dispatch" },
    ],
  },
  PAYMENT_FAILED: {
    action: "payment.failed",
    newState: "FAILED",
    allowedFrom: ["", "PENDING"],
  },
  PAYOUT_COMPLETED: {
    action: "payout.completed",
    newState: "REFUNDED",
    allowedFrom: ["PAID", "DISPATCHED", "DELIVERED"],
    sideEffects: [{ kind: "notify", templateKey: "refund_initiated_sms", eventType: "refund_initiated" }],
  },
  PAYOUT_FAILED: { action: "payout.failed", newState: null, allowedFrom: null },
  WALLET_CREDITED: { action: "wallet.credited", newState: null, allowedFrom: null },
};

export function decideKp(eventType: string, currentState: string): KpDecision {
  const rule = KP_RULES[eventType];
  if (!rule) return { kind: "ack" };
  if (rule.allowedFrom === null || rule.newState === null) return { kind: "audit", action: rule.action };
  if (!rule.allowedFrom.includes(currentState)) return { kind: "skip", action: rule.action };
  return {
    kind: "apply",
    action: rule.action,
    newState: rule.newState,
    setChargeId: rule.setChargeId ?? false,
    sideEffects: rule.sideEffects ?? [],
  };
}
