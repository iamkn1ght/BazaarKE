/**
 * Identiti rail request/response envelope types.
 * Source: docs/KMV_RAILS_INTEGRATION_GUIDE.md (Identiti section) + docs/RAIL_INTEGRATION_PLAYBOOK.md §3.1.
 * Identiti is the root of trust: it issues the account_uuid that is the primary FK for every order.
 */

export type IdentitiTier = "tier_0" | "tier_1" | "tier_2" | "tier_3";
export type CustomerState = "pending_onboarding" | "active" | "suspended";

/** consent.captured_via is a hard-coded enum on the rail — anything else is a 400. */
export type CapturedVia = "app_onboarding" | "operator_console" | "self_service_portal";

export interface CustomerConsent {
  dpa_consent: boolean;
  kyc_consent: boolean;
  marketing_consent: boolean;
  captured_at: string; // RFC 3339
  captured_via: CapturedVia;
}

export interface CreateCustomerInput {
  /** E.164, e.g. "+254700000005". Passed to Identiti only — NEVER stored app-side (Cardinal Rule). */
  phone: string;
  name_first: string;
  name_last: string;
  /** "<app_slug>_<unique-per-user>", e.g. "unique_accessories_<orderId|sessionId>". */
  app_correlation: string;
  consent: CustomerConsent;
}

export interface Customer {
  account_uuid: string; // "acc_<uuid>"
  state: CustomerState;
  tier: IdentitiTier;
  created_at: string;
}

/** Customer JWT for this app (aud=unique_accessories). Phase 2 also needs aud=hakken — see operator request. */
export interface CustomerToken {
  token: string;
  expires_in: number;
}

export type PhoneTokenAudience = "todoku";

export interface PhoneToken {
  phone_token: string; // opaque HS256 JWT — never cache beyond expires_at; mint fresh per send
  jti: string; // "pht_<ULID>"
  audience: PhoneTokenAudience;
  expires_at: string;
}

export type OperationRiskTier = "low" | "medium" | "high";

export interface StepUpChallengeInput {
  account_uuid: string;
  /** "kipkiren_pay" — do NOT invent a unique_accessories.* audience (needs Silvia registration). */
  operation_audience: string;
  /** "kipkiren_pay.payout.initiate" for KP-bound refunds. */
  operation_kind: string;
  operation_risk_tier: OperationRiskTier;
  factor: "phone_otp";
}

export interface StepUpChallenge {
  challenge_id: string; // "stp_<ULID>"
  factor: string;
  expires_at: string;
  delivery_status: string;
  /** Echoed in sandbox only (non-prod + factor=phone_otp); stripped in production. */
  otp_plaintext?: string;
  sandbox_only?: boolean;
}

export interface StepUpVerifyInput {
  challenge_id: string;
  /** The OTP value — the field is literally named `response`. */
  response: string;
}

export interface StepUpToken {
  stepup_token: string; // RS256 JWT — verify against JWKS, not the app secret
  expires_in: number; // 300
}

export interface TierResponse {
  tier: IdentitiTier;
}
