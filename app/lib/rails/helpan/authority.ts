// Delegated-authority validation — the HARD RULE (HA-D-05 / HA-D-09): the agent NEVER acts without a
// valid, unexpired, in-scope token. No bypass, no unscoped fallback. Pure + fail-closed; safe and
// unit-testable anywhere (no secret held — the verifying public key is injected).

import { decodeAuthorityJwt, verifyRs256 } from "./verify";
import { DISPATCH_CODES, type DelegatedAuthorityClaims, type DispatchCode } from "./types";
import type { JsonWebKey } from "crypto";

export type AuthorityCheck =
  | { ok: true; claims: DelegatedAuthorityClaims }
  | { ok: false; code: DispatchCode };

export interface ClaimRequirements {
  agentId: string;
  accountUuid: string;
  requiredScope: string;
  expectedAudience: string;
  nowMs: number;
}

/**
 * PURE claim validation. Every check fails CLOSED with a specific code — there is no path that
 * accepts a token missing any required property.
 */
export function validateAuthorityClaims(
  claims: DelegatedAuthorityClaims | null | undefined,
  req: ClaimRequirements,
): AuthorityCheck {
  if (!claims || typeof claims !== "object") return { ok: false, code: DISPATCH_CODES.AUTHORITY_INVALID };
  const nowSec = Math.floor(req.nowMs / 1000);

  if (claims.initiated_by !== undefined && claims.initiated_by !== "agent") {
    return { ok: false, code: DISPATCH_CODES.AUTHORITY_INVALID };
  }
  if (typeof claims.agent_id !== "string" || claims.agent_id !== req.agentId) {
    return { ok: false, code: DISPATCH_CODES.AUTHORITY_AGENT_MISMATCH };
  }
  if (typeof claims.sub !== "string" || claims.sub !== req.accountUuid) {
    return { ok: false, code: DISPATCH_CODES.AUTHORITY_ACCOUNT_MISMATCH };
  }
  if (typeof claims.operation_audience !== "string" || claims.operation_audience !== req.expectedAudience) {
    return { ok: false, code: DISPATCH_CODES.AUTHORITY_AUDIENCE_MISMATCH };
  }
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
    return { ok: false, code: DISPATCH_CODES.AUTHORITY_INVALID };
  }
  if (nowSec >= claims.exp) return { ok: false, code: DISPATCH_CODES.AUTHORITY_EXPIRED };
  if (typeof claims.nbf === "number" && nowSec < claims.nbf) {
    return { ok: false, code: DISPATCH_CODES.AUTHORITY_NOT_YET_VALID };
  }
  if (!Array.isArray(claims.scopes) || !claims.scopes.includes(req.requiredScope)) {
    return { ok: false, code: DISPATCH_CODES.AUTHORITY_OUT_OF_SCOPE };
  }
  if (typeof claims.jti !== "string" || claims.jti.length === 0) {
    return { ok: false, code: DISPATCH_CODES.AUTHORITY_INVALID };
  }
  return { ok: true, claims };
}

/**
 * Resolve the RSA public key for a JWT `kid` from Identiti's JWKS (the delegated-authority key).
 * Returns null when the rail is unconfigured or the kid is unknown — which makes verifyAuthority
 * fail CLOSED. The production resolver (helpan/agent-checkout.ts) is inert until Identiti's JWKS is
 * reachable (ID-14 / Helpan Stage-1).
 */
export type AuthorityKeyResolver = (kid: string | undefined) => Promise<string | JsonWebKey | null>;

/**
 * Full verification: structural decode → RS256 signature (against the resolved JWKS key) → claims.
 * Fails CLOSED at every step: missing token, non-RS256 alg, unresolvable key (rail not provisioned),
 * bad signature, or any failed claim all reject.
 */
export async function verifyAuthority(
  token: string | undefined,
  resolveKey: AuthorityKeyResolver,
  req: ClaimRequirements,
): Promise<AuthorityCheck> {
  if (!token || typeof token !== "string") return { ok: false, code: DISPATCH_CODES.AUTHORITY_MISSING };
  const decoded = decodeAuthorityJwt(token);
  if (!decoded) return { ok: false, code: DISPATCH_CODES.AUTHORITY_INVALID };
  if (decoded.header.alg !== "RS256") return { ok: false, code: DISPATCH_CODES.AUTHORITY_INVALID };

  const key = await resolveKey(decoded.header.kid);
  if (!key) return { ok: false, code: DISPATCH_CODES.AUTHORITY_INVALID }; // unconfigured / unknown kid → fail closed
  if (!verifyRs256(decoded.signingInput, decoded.signatureB64url, key)) {
    return { ok: false, code: DISPATCH_CODES.AUTHORITY_INVALID };
  }
  return validateAuthorityClaims(decoded.payload, req);
}
