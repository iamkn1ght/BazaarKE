import "server-only";
import { railFetch, type RailClientConfig } from "../_shared/railFetch";
import type {
  CreateCustomerInput,
  Customer,
  CustomerToken,
  IdentitiTier,
  PhoneToken,
  StepUpChallenge,
  StepUpChallengeInput,
  StepUpToken,
  StepUpVerifyInput,
  TierResponse,
} from "./types";

/**
 * Identiti rail client (server-only). HMAC-signed via the shared _shared/signRequest helper.
 * Secret encoding: hex-64 (validated below). Webhooks are Kafka-only today (no IDENTITI_WEBHOOK_SECRET);
 * the HTTP webhook receiver lands at ID-14 Phase 2.
 *
 * Endpoints intentionally NOT implemented: POST /v1/phone-tokens/resolve (Todoku-internal scope —
 * apps get 403). Tier lives at /v1/customers/{uuid}/tier (NOT /v1/accounts/{uuid}/tier — 404).
 */

const HEX_64 = /^[0-9a-f]{64}$/i;

function getConfig(): RailClientConfig {
  const baseUrl = process.env.IDENTITI_API_BASE;
  const appId = process.env.IDENTITI_APP_ID;
  const secret = process.env.IDENTITI_APP_SECRET;
  if (!baseUrl || !appId || !secret) {
    throw new Error("RAIL_CONFIG_INCOMPLETE: identiti (need IDENTITI_API_BASE, IDENTITI_APP_ID, IDENTITI_APP_SECRET)");
  }
  if (!HEX_64.test(secret)) {
    throw new Error("RAIL_CONFIG_BAD_ENCODING: identiti.APP_SECRET (expected hex-64)");
  }
  return { prefix: "Identiti", baseUrl: baseUrl.replace(/\/+$/, ""), appId, secret };
}

/** Per-call context for §A.11 audit propagation + explicit idempotency control. */
export interface CallContext {
  traceparent?: string;
  idempotencyKey?: string;
}

/** POST /v1/customers → issues the account_uuid (primary FK for every order). */
export async function createCustomer(input: CreateCustomerInput, ctx: CallContext = {}): Promise<Customer> {
  const { data } = await railFetch<Customer>(getConfig(), {
    method: "POST",
    path: "/v1/customers",
    body: input,
    traceparent: ctx.traceparent,
    idempotencyKey: ctx.idempotencyKey,
  });
  return data;
}

/**
 * POST /v1/auth/customer-token → customer JWT (aud=unique_accessories).
 * NOTE: the exact factor/login body (OTP vs password) and the aud=hakken multi-audience minting
 * shape are pending Silvia's spec — see OPERATOR_REQUEST_IDENTITI.md (Phase-1 design-time ask).
 */
export async function issueCustomerToken(accountUuid: string, ctx: CallContext = {}): Promise<CustomerToken> {
  const { data } = await railFetch<CustomerToken>(getConfig(), {
    method: "POST",
    path: "/v1/auth/customer-token",
    body: { account_uuid: accountUuid },
    traceparent: ctx.traceparent,
    idempotencyKey: ctx.idempotencyKey,
  });
  return data;
}

/** POST /v1/phone-tokens → opaque phone token (audience=todoku). Mint fresh per Todoku send; never cache. */
export async function mintPhoneToken(accountUuid: string, ctx: CallContext = {}): Promise<PhoneToken> {
  const { data } = await railFetch<PhoneToken>(getConfig(), {
    method: "POST",
    path: "/v1/phone-tokens",
    body: { account_uuid: accountUuid, audience: "todoku" },
    traceparent: ctx.traceparent,
    idempotencyKey: ctx.idempotencyKey,
  });
  return data;
}

/** POST /v1/stepup/challenges → step-up challenge (e.g. for KP-bound refunds >= KES 10,000). */
export async function createStepUpChallenge(input: StepUpChallengeInput, ctx: CallContext = {}): Promise<StepUpChallenge> {
  const { data } = await railFetch<StepUpChallenge>(getConfig(), {
    method: "POST",
    path: "/v1/stepup/challenges",
    body: input,
    traceparent: ctx.traceparent,
    idempotencyKey: ctx.idempotencyKey,
  });
  return data;
}

/** POST /v1/stepup/verify → RS256 step-up token (verify against JWKS, not the app secret). */
export async function verifyStepUp(input: StepUpVerifyInput, ctx: CallContext = {}): Promise<StepUpToken> {
  const { data } = await railFetch<StepUpToken>(getConfig(), {
    method: "POST",
    path: "/v1/stepup/verify",
    body: input,
    traceparent: ctx.traceparent,
    idempotencyKey: ctx.idempotencyKey,
  });
  return data;
}

/** GET /v1/customers/{uuid}/tier → current KYC tier. Bodyless GET (empty Content-Type, no header). */
export async function getCustomerTier(accountUuid: string, ctx: CallContext = {}): Promise<IdentitiTier> {
  const { data } = await railFetch<TierResponse>(getConfig(), {
    method: "GET",
    path: `/v1/customers/${encodeURIComponent(accountUuid)}/tier`,
    traceparent: ctx.traceparent,
  });
  return data.tier;
}
