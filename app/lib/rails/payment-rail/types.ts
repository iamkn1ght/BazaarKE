/**
 * Kipkiren Pay (KP) request/response envelope types.
 * Source: docs/KMV_RAILS_INTEGRATION_GUIDE.md §6 + docs/RAIL_INTEGRATION_PLAYBOOK.md §3.2.
 *
 * Wire conventions:
 *  - Money field is `amount_minor`: NUMBER (integer) in requests, STRING (bigint) in responses.
 *  - currency is always "KES". external_ref pattern "ua_order_<id>".
 *  - Payouts initiate at /v1/payouts/initiate (the bare /v1/payouts 404s).
 */

export type KpCurrency = "KES";

// ── Charges (cart payment / STK push) ──────────────────────────────────────
export interface InitiateChargeInput {
  account_uuid: string;
  amount_minor: number; // integer KES minor units
  currency: KpCurrency;
  purpose: string; // e.g. "order_purchase"
  external_ref: string; // "ua_order_<id>"
  idempotency_key: string;
}

export interface Charge {
  charge_id: string;
  status: string; // PENDING | COMPLETED | FAILED | ...
  amount_minor: string; // string-encoded in responses
  currency?: KpCurrency;
  external_ref?: string;
  mpesa_receipt?: string;
  created_at?: string;
}

// ── Payouts (refunds, B2C) ──────────────────────────────────────────────────
export interface InitiatePayoutInput {
  account_uuid: string; // recipient
  amount_minor: number;
  currency: KpCurrency;
  purpose: string; // e.g. "refund"
  external_ref: string; // "refund_<order_id>"
  idempotency_key: string;
  /** RS256 step-up token from Identiti, required for amount_minor >= STEPUP_THRESHOLD_MINOR. */
  stepup_token?: string;
}

export interface Payout {
  payout_id: string;
  status: string;
  amount_minor: string;
  mpesa_conversation_id?: string;
  created_at?: string;
}

// ── Holds (escrow, KP-9) ────────────────────────────────────────────────────
export interface CreateHoldInput {
  account_uuid: string;
  amount_minor: number;
  currency: KpCurrency;
  external_ref: string;
  idempotency_key: string;
}

export interface Hold {
  hold_id: string;
  status: string;
  amount_minor: string;
}

// ── Webhook / Kafka events ──────────────────────────────────────────────────
export type KpEventType =
  | "WALLET_CREDITED"
  | "PAYMENT_COMPLETED"
  | "PAYMENT_FAILED"
  | "PAYOUT_COMPLETED"
  | "PAYOUT_FAILED";

export interface KpEvent {
  event_type: KpEventType | string;
  /** charge_id / payout_id depending on event. */
  resource_id?: string;
  charge_id?: string;
  payout_id?: string;
  external_ref?: string;
  amount_minor?: string; // string-encoded
  account_uuid?: string;
  occurred_at?: string;
}
