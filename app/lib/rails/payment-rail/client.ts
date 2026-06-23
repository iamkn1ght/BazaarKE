import "server-only";
import { railFetch, type RailClientConfig } from "../_shared/railFetch";
import type {
  Charge,
  CreateHoldInput,
  Hold,
  InitiateChargeInput,
  InitiatePayoutInput,
  Payout,
} from "./types";

/**
 * Kipkiren Pay (KP) outbound client (server-only). HMAC-signed via the shared signer.
 *
 * Secret encoding: base64url-43 (NOT hex like Identiti). Env vars are PAYMENT_RAIL_* (AD-K06 —
 * never KIPKIREN_*; survives the Phase-3 LipaStack flip as an env-only change).
 *
 * KP is not deployed yet (KP-1-Ops): PAYMENT_RAIL_API_BASE is unset, so getConfig() throws
 * RAIL_CONFIG_INCOMPLETE until it lands. Callers (checkout routes) surface that as 503.
 */

const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;

function getConfig(): RailClientConfig {
  const baseUrl = process.env.PAYMENT_RAIL_API_BASE;
  const appId = process.env.PAYMENT_RAIL_APP_ID;
  const secret = process.env.PAYMENT_RAIL_APP_SECRET;
  if (!baseUrl || !appId || !secret) {
    throw new Error(
      "RAIL_CONFIG_INCOMPLETE: payment-rail (need PAYMENT_RAIL_API_BASE, PAYMENT_RAIL_APP_ID, PAYMENT_RAIL_APP_SECRET) — KP not deployed yet?",
    );
  }
  if (!BASE64URL_43.test(secret)) {
    throw new Error("RAIL_CONFIG_BAD_ENCODING: payment-rail.APP_SECRET (expected base64url-43)");
  }
  return { prefix: "KipkirenPay", baseUrl: baseUrl.replace(/\/+$/, ""), appId, secret };
}

export interface CallContext {
  traceparent?: string;
  idempotencyKey?: string;
}

/** POST /v1/charges/initiate — initiate a cart payment (triggers the M-Pesa STK push). */
export async function initiateCharge(input: InitiateChargeInput, ctx: CallContext = {}): Promise<Charge> {
  const { data } = await railFetch<Charge>(getConfig(), {
    method: "POST",
    path: "/v1/charges/initiate",
    body: input,
    idempotencyKey: ctx.idempotencyKey ?? input.idempotency_key,
    traceparent: ctx.traceparent,
  });
  return data;
}

/** GET /v1/charges/{charge_id} — poll charge status. */
export async function getCharge(chargeId: string, ctx: CallContext = {}): Promise<Charge> {
  const { data } = await railFetch<Charge>(getConfig(), {
    method: "GET",
    path: `/v1/charges/${encodeURIComponent(chargeId)}`,
    traceparent: ctx.traceparent,
  });
  return data;
}

/** POST /v1/payouts/initiate — refunds (B2C). NOTE the /initiate suffix (bare /v1/payouts is 404). */
export async function initiatePayout(input: InitiatePayoutInput, ctx: CallContext = {}): Promise<Payout> {
  const { data } = await railFetch<Payout>(getConfig(), {
    method: "POST",
    path: "/v1/payouts/initiate",
    body: input,
    idempotencyKey: ctx.idempotencyKey ?? input.idempotency_key,
    traceparent: ctx.traceparent,
  });
  return data;
}

/** GET /v1/payouts/{payout_id} — poll payout status. */
export async function getPayout(payoutId: string, ctx: CallContext = {}): Promise<Payout> {
  const { data } = await railFetch<Payout>(getConfig(), {
    method: "GET",
    path: `/v1/payouts/${encodeURIComponent(payoutId)}`,
    traceparent: ctx.traceparent,
  });
  return data;
}

/** POST /v1/holds — escrow (KP-9). */
export async function createHold(input: CreateHoldInput, ctx: CallContext = {}): Promise<Hold> {
  const { data } = await railFetch<Hold>(getConfig(), {
    method: "POST",
    path: "/v1/holds",
    body: input,
    idempotencyKey: ctx.idempotencyKey ?? input.idempotency_key,
    traceparent: ctx.traceparent,
  });
  return data;
}
