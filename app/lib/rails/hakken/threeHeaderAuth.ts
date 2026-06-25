// Hakken interim three-header pilot auth — DELIBERATELY isolated from the shared 4-rail HMAC signer
// (OPERATOR_REQUEST_HAKKEN.md §3/§7: do NOT fold Hakken into _shared/signRequest.ts). Pure — holds
// no secret beyond its args. Full HMAC swap is post-pilot (HK-9).
//
// Headers: Authorization: Bearer <Identiti JWT with aud=hakken> + X-Hakken-App-Key + X-Hakken-App-Secret,
// plus X-Idempotency-Key (idempotency is required during the pilot).

export interface ThreeHeaderArgs {
  /** Identiti customer JWT carrying aud=hakken (a wrong audience 401s AUTH_JWT_AUDIENCE). */
  jwt: string;
  appKey: string; // = app_slug, e.g. "unique_accessories"
  appSecret: string;
  idempotencyKey: string;
  traceparent?: string;
}

export function buildThreeHeaderAuth(args: ThreeHeaderArgs): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.jwt}`,
    "X-Hakken-App-Key": args.appKey,
    "X-Hakken-App-Secret": args.appSecret,
    "X-Idempotency-Key": args.idempotencyKey,
  };
  if (args.traceparent) headers["traceparent"] = args.traceparent;
  return headers;
}
