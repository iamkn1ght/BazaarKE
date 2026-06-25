/**
 * Helpan AI (agent runtime) types — Phase 2. Source: OPERATOR_REQUEST_HELPAN.md +
 * docs/RAIL_INTEGRATION_PLAYBOOK.md §3.6 + docs/KMV_RAILS_INTEGRATION_GUIDE.md (delegated authority
 * on Identiti JWKS). Money fields use the `_minor` suffix; KES integer minor units only.
 *
 * UA is DUAL-ROLE: a consumer of Helpan (dispatches actions TO Helpan via the client) AND a dispatch
 * TARGET (Helpan POSTs agent actions to /api/agent/checkout). Nothing is live until Silvia registers
 * `helpan-unique-accessories-v1` and the 3 secrets land — every path here fails CLOSED until then.
 */

/** The agent this app is registered as. No dispatch is honored for any other agent_id. */
export const HELPAN_AGENT_ID = "helpan-unique-accessories-v1";

/**
 * Scope the delegated-authority token MUST carry to place an agent checkout. The exact string is
 * confirmed at agent registration (Silvia); the token's `scopes[]` must contain it — there is no
 * unscoped fallback (HA-D-05).
 */
export const HELPAN_CHECKOUT_SCOPE = "unique_accessories.checkout";

/** operation_audience expected on a charge-bearing authority (KP is the money rail). */
export const KP_OPERATION_AUDIENCE = "kipkiren_pay";

/** Stamped on every AGENT-initiated rail call + order/audit row (§4 cross-rail trail). */
export interface AgentInitiator {
  initiated_by: "agent";
  agent_id: string;
}

/** customer = a human checkout; agent = a Helpan-dispatched checkout. */
export type Initiator = "customer" | "agent";

/**
 * Delegated-authority token claims (RS256 JWT, issued by Helpan, validated against Identiti JWKS).
 * The agent NEVER acts without a valid, unexpired, in-scope one — no bypass (HA-D-05/HA-D-09).
 */
export interface DelegatedAuthorityClaims {
  /** Identiti account the authority acts FOR (the buyer). JWT `sub`. */
  sub: string;
  /** The agent the authority was granted to. Must equal HELPAN_AGENT_ID. */
  agent_id: string;
  /** Granted scopes; must contain the required scope for the action. */
  scopes: string[];
  /** Audience the authority is valid for (e.g. "kipkiren_pay" for money ops). */
  operation_audience: string;
  /** Revocation handle — AUTHORITY_REVOKED webhooks reference this. */
  jti: string;
  /** Expiry, epoch SECONDS (JWT convention). */
  exp: number;
  /** Not-before, epoch seconds (optional). */
  nbf?: number;
  /** Issued-at, epoch seconds (optional). */
  iat?: number;
  /** Always "agent" for a delegated-authority token. */
  initiated_by?: "agent";
}

/** A single line in an agent dispatch (auto-refill cart). */
export interface AgentDispatchLine {
  id: string;
  quantity: number;
}

/** The action Helpan POSTs to /api/agent/checkout (UA as a dispatch target). */
export interface AgentDispatchAction {
  action_id: string;
  agent_id: string;
  /** Buyer's Identiti account_uuid (must match the authority `sub`). */
  account_uuid: string;
  /** What to do, e.g. "checkout.auto_refill". */
  kind: string;
  /** The delegated-authority JWT (validated before anything executes). */
  authority: string;
  payload: {
    items: AgentDispatchLine[];
    /** Stable per-action key — makes the agent order + KP charge idempotent. */
    idempotency_key: string;
  };
  occurred_at?: string;
}

export type DispatchStatus = "accepted" | "rejected" | "failed";

/** Result codes for a rejected/failed dispatch (never throw raw at the agent caller). */
export const DISPATCH_CODES = {
  /** Helpan/KP not provisioned — the unconfigured-dispatcher fallback (§6). */
  TARGET_RAIL_UNCONFIGURED: "TARGET_RAIL_UNCONFIGURED",
  AUTHORITY_MISSING: "AUTHORITY_MISSING",
  AUTHORITY_INVALID: "AUTHORITY_INVALID", // signature did not verify
  AUTHORITY_EXPIRED: "AUTHORITY_EXPIRED",
  AUTHORITY_NOT_YET_VALID: "AUTHORITY_NOT_YET_VALID",
  AUTHORITY_OUT_OF_SCOPE: "AUTHORITY_OUT_OF_SCOPE",
  AUTHORITY_AGENT_MISMATCH: "AUTHORITY_AGENT_MISMATCH",
  AUTHORITY_ACCOUNT_MISMATCH: "AUTHORITY_ACCOUNT_MISMATCH",
  AUTHORITY_AUDIENCE_MISMATCH: "AUTHORITY_AUDIENCE_MISMATCH",
  AUTHORITY_REVOKED: "AUTHORITY_REVOKED",
  UNSUPPORTED_ACTION: "UNSUPPORTED_ACTION",
  INVALID_CART: "INVALID_CART",
  EXECUTION_FAILED: "EXECUTION_FAILED",
} as const;

export type DispatchCode = (typeof DISPATCH_CODES)[keyof typeof DISPATCH_CODES];

export interface DispatchResult {
  action_id: string;
  status: DispatchStatus;
  code?: DispatchCode;
  /** On accepted: the KP charge created on the buyer's behalf. */
  charge_id?: string;
  external_ref?: string;
  message?: string;
}

/** Inbound Helpan webhook events (HMAC-signed with HELPAN_WEBHOOK_SECRET). */
export type HelpanWebhookEventName = "AUTHORITY_REVOKED";

export interface HelpanWebhookEvent {
  event: HelpanWebhookEventName | string;
  /** The revoked authority's jti (revocation is by token handle). */
  jti?: string;
  agent_id?: string;
  account_uuid?: string;
  occurred_at?: string;
}

/** The only inbound webhook events we act on — anything else is acked and ignored. */
export const HELPAN_WEBHOOK_EVENTS: ReadonlySet<string> = new Set(["AUTHORITY_REVOKED"]);

/** Outbound: UA dispatching an action TO Helpan (consumer role) — POST /v1/actions/dispatch. */
export interface DispatchToHelpanInput {
  agent_id: string;
  account_uuid: string;
  kind: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
}

export interface DispatchToHelpanResult {
  action_id: string;
  status: DispatchStatus | string;
}
