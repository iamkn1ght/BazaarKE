// Agent-dispatch CORE (functional core / imperative shell). Money Rule: main-loop only — an agent
// auto-refill spends real money via KP. Pure orchestration over injected deps so the fail-closed
// gates are unit-testable; the shell (agent-checkout.ts) wires the real authority/revocation/KP I/O.
//
// Gate order (every gate fails CLOSED): configured → well-formed action → delegated authority
// (signature + claims) → not revoked → execute (KP charge stamped initiated_by:"agent").

import {
  DISPATCH_CODES,
  HELPAN_AGENT_ID,
  HELPAN_CHECKOUT_SCOPE,
  KP_OPERATION_AUDIENCE,
  type AgentDispatchAction,
  type AgentInitiator,
  type DelegatedAuthorityClaims,
  type DispatchCode,
  type DispatchResult,
} from "./types";
import type { AuthorityCheck } from "./authority";

export interface PlacedAgentOrder {
  charge_id?: string;
  external_ref: string;
}

export interface AgentDispatchDeps {
  /** Helpan + its secrets are provisioned. False → TARGET_RAIL_UNCONFIGURED (the §6 fallback). */
  configured: boolean;
  verifyAuthority: (
    token: string | undefined,
    req: { agentId: string; accountUuid: string; requiredScope: string; expectedAudience: string; nowMs: number },
  ) => Promise<AuthorityCheck>;
  isAuthorityRevoked: (jti: string) => Promise<boolean>;
  placeAgentOrder: (action: AgentDispatchAction, claims: DelegatedAuthorityClaims, agent: AgentInitiator) => Promise<PlacedAgentOrder>;
  nowMs: number;
}

const SUPPORTED_KINDS: ReadonlySet<string> = new Set(["checkout.auto_refill"]);

// The idempotency_key becomes the money anchor (order doc id + KP idempotency key), so it must be a
// globally-unique UUIDv4 — the rail contract requires it, and the human checkout route enforces the
// same shape (app/api/checkout/initiate/route.ts). A predictable/colliding key is rejected up front
// so two distinct dispatches can never collapse onto one order/charge.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reject(action_id: string, code: DispatchCode): DispatchResult {
  return { action_id, status: "rejected", code };
}
function failed(action_id: string, code: DispatchCode, message?: string): DispatchResult {
  return { action_id, status: "failed", code, message };
}

export async function processAgentDispatch(action: AgentDispatchAction, deps: AgentDispatchDeps): Promise<DispatchResult> {
  const action_id = (action && action.action_id) || "unknown";

  // 0) Unconfigured target — never crash; return the structured fallback (§6).
  if (!deps.configured) return failed(action_id, DISPATCH_CODES.TARGET_RAIL_UNCONFIGURED);

  // 1) Well-formed, in-scope-for-this-app action.
  if (!action || action.agent_id !== HELPAN_AGENT_ID) return reject(action_id, DISPATCH_CODES.AUTHORITY_AGENT_MISMATCH);
  if (!SUPPORTED_KINDS.has(action.kind)) return reject(action_id, DISPATCH_CODES.UNSUPPORTED_ACTION);
  const items = action.payload?.items;
  if (!Array.isArray(items) || items.length === 0) return reject(action_id, DISPATCH_CODES.INVALID_CART);
  const idem = action.payload?.idempotency_key;
  if (typeof idem !== "string" || !UUID.test(idem)) return reject(action_id, DISPATCH_CODES.INVALID_CART);

  // 2) Delegated authority — signature THEN claims. Fail-closed (no token / unconfigured key / bad
  //    signature / expired / out-of-scope / agent|account|audience mismatch all reject).
  const check = await deps.verifyAuthority(action.authority, {
    agentId: HELPAN_AGENT_ID,
    accountUuid: action.account_uuid,
    requiredScope: HELPAN_CHECKOUT_SCOPE,
    expectedAudience: KP_OPERATION_AUDIENCE,
    nowMs: deps.nowMs,
  });
  if (!check.ok) return reject(action_id, check.code);

  // 3) Revocation gate — a dispatch initiated after AUTHORITY_REVOKED is rejected (≤5s propagation).
  //    A revocation-store error is treated as execution failure, never as "not revoked".
  let revoked: boolean;
  try {
    revoked = await deps.isAuthorityRevoked(check.claims.jti);
  } catch (err) {
    return failed(action_id, DISPATCH_CODES.EXECUTION_FAILED, err instanceof Error ? err.message : "revocation check failed");
  }
  if (revoked) return reject(action_id, DISPATCH_CODES.AUTHORITY_REVOKED);

  // 4) Execute — KP charge on the buyer's behalf, stamped initiated_by:"agent" + agent_id.
  try {
    const placed = await deps.placeAgentOrder(action, check.claims, { initiated_by: "agent", agent_id: HELPAN_AGENT_ID });
    return { action_id, status: "accepted", charge_id: placed.charge_id, external_ref: placed.external_ref };
  } catch (err) {
    return failed(action_id, DISPATCH_CODES.EXECUTION_FAILED, err instanceof Error ? err.message : "execution failed");
  }
}
