// JWT decode + RS256 signature verification for Helpan delegated-authority tokens.
//
// Intentionally NOT `server-only`: like signRequest.ts this holds no secret (the verifying PUBLIC
// key is passed in by the caller), so it is safe — and unit-testable — anywhere. Delegated-authority
// tokens are RS256, verified against Identiti's JWKS public key (NOT the app secret).

import { createPublicKey, createVerify, type JsonWebKey } from "crypto";
import type { DelegatedAuthorityClaims } from "./types";

export interface DecodedAuthorityJwt {
  header: { alg?: string; kid?: string; typ?: string };
  payload: DelegatedAuthorityClaims;
  /** `${headerB64url}.${payloadB64url}` — the bytes the RS256 signature covers. */
  signingInput: string;
  signatureB64url: string;
}

/** Decode (NOT verify) a compact JWS. Returns null on any structural/parse error. */
export function decodeAuthorityJwt(token: string): DecodedAuthorityJwt | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  if (!h || !p || !sig) return null;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (!header || typeof header !== "object" || !payload || typeof payload !== "object") return null;
    return { header, payload: payload as DelegatedAuthorityClaims, signingInput: `${h}.${p}`, signatureB64url: sig };
  } catch {
    return null;
  }
}

/**
 * Verify an RS256 (RSASSA-PKCS1-v1_5 + SHA-256) signature over the JWT signing input against an RSA
 * public key (PEM string or JWK). Never throws — a bad key, wrong alg, or bad signature returns false.
 */
export function verifyRs256(signingInput: string, signatureB64url: string, publicKey: string | JsonWebKey): boolean {
  try {
    const keyObject =
      typeof publicKey === "string" ? createPublicKey(publicKey) : createPublicKey({ key: publicKey, format: "jwk" });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(signingInput);
    verifier.end();
    return verifier.verify(keyObject, Buffer.from(signatureB64url, "base64url"));
  } catch {
    return false;
  }
}
