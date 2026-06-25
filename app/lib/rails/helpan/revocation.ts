import "server-only";

/**
 * Delegated-authority revocation store (§4: revocation must reject new dispatches within ~5s).
 * Backed by Vercel KV (same store/discipline as _shared/dedup.ts) so a revoke seen by one serverless
 * instance is visible to all. An AUTHORITY_REVOKED webhook writes the jti here; every dispatch checks
 * it before executing. In-flight dispatches already accepted are unaffected (we check at accept time).
 *
 * TTL = the authority's max lifetime: once an authority would have expired anyway, the entry can lapse
 * (an expired token is already rejected by validateAuthorityClaims).
 */

const TTL_SECONDS = 86_400;

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// Dev-only fallback — per-process memory, NOT safe across serverless instances (mirrors dedup.ts).
const memory = new Map<string, number>();

export function revocationKey(jti: string): string {
  return `helpan:revoked:${jti}`;
}

/** Mark a delegated-authority token (by jti) revoked. */
export async function revokeAuthority(jti: string, ttlSeconds: number = TTL_SECONDS): Promise<void> {
  if (!jti) return;
  const key = revocationKey(jti);
  if (kvConfigured()) {
    const { kv } = await import("@vercel/kv");
    await kv.set(key, "1", { ex: ttlSeconds });
    return;
  }
  if (process.env.NODE_ENV === "production") {
    console.warn("[helpan] Vercel KV not configured — authority revocation is NOT reliable across instances.");
  }
  memory.set(key, Date.now() + ttlSeconds * 1000);
}

/** True if this authority (jti) has been revoked. Fail-OPEN only on store errors is NOT allowed — a
 * KV failure throws to the caller, which rejects the dispatch (the dispatch core treats a thrown
 * revocation check as execution failure rather than silently proceeding). */
export async function isAuthorityRevoked(jti: string): Promise<boolean> {
  if (!jti) return false;
  const key = revocationKey(jti);
  if (kvConfigured()) {
    const { kv } = await import("@vercel/kv");
    return (await kv.get(key)) !== null;
  }
  const exp = memory.get(key);
  if (exp === undefined) return false;
  if (exp < Date.now()) {
    memory.delete(key);
    return false;
  }
  return true;
}
