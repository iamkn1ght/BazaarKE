import "server-only";

/**
 * Obtain an Identiti customer JWT carrying aud=hakken for a Hakken call.
 *
 * DEFERRED today (the getHakkenJwt deferral pattern, OPERATOR_REQUEST_HAKKEN.md §7): Identiti's
 * customer-token endpoint only mints aud=unique_accessories (issueCustomerToken), and a wrong-audience
 * JWT 401s AUTH_JWT_AUDIENCE at Hakken — so until Silvia ships multi-audience minting
 * (OPERATOR_REQUEST_IDENTITI.md §4a / RECAP §8 item 3) this THROWS HakkenDeferredError. Callers log an
 * audit row `hakken.deferred.<op>` and surface 503; they must NEVER fall back to an aud=unique_accessories
 * token (that would leak the wrong audience to Hakken).
 */
export class HakkenDeferredError extends Error {
  constructor(public readonly op: string) {
    super(`hakken.deferred.${op}: aud=hakken JWT not available yet (Identiti multi-audience minting pending)`);
    this.name = "HakkenDeferredError";
  }
}

export async function getHakkenJwt(_accountUuid: string, op: string): Promise<string> {
  // Wire to issueCustomerToken({ audience: "hakken" }) once Identiti supports multi-audience minting.
  throw new HakkenDeferredError(op);
}
