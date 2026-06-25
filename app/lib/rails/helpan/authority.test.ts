import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createSign, generateKeyPairSync } from "crypto";
import { validateAuthorityClaims, verifyAuthority, type AuthorityKeyResolver } from "./authority";
import {
  DISPATCH_CODES,
  HELPAN_AGENT_ID,
  HELPAN_CHECKOUT_SCOPE,
  KP_OPERATION_AUDIENCE,
  type DelegatedAuthorityClaims,
} from "./types";

const NOW_MS = 1_700_000_000_000;
const NOW_SEC = Math.floor(NOW_MS / 1000);

function claims(over: Partial<DelegatedAuthorityClaims> = {}): DelegatedAuthorityClaims {
  return {
    sub: "acc_1",
    agent_id: HELPAN_AGENT_ID,
    scopes: [HELPAN_CHECKOUT_SCOPE],
    operation_audience: KP_OPERATION_AUDIENCE,
    jti: "jti1",
    exp: NOW_SEC + 300,
    initiated_by: "agent",
    ...over,
  };
}
const req = {
  agentId: HELPAN_AGENT_ID,
  accountUuid: "acc_1",
  requiredScope: HELPAN_CHECKOUT_SCOPE,
  expectedAudience: KP_OPERATION_AUDIENCE,
  nowMs: NOW_MS,
};

describe("validateAuthorityClaims — the hard rule (fail-closed)", () => {
  it("accepts a valid, unexpired, in-scope, correctly-bound token", () => {
    const r = validateAuthorityClaims(claims(), req);
    assert.equal(r.ok, true);
  });

  const cases: Array<[string, Partial<DelegatedAuthorityClaims>, string]> = [
    ["expired", { exp: NOW_SEC - 1 }, DISPATCH_CODES.AUTHORITY_EXPIRED],
    ["exp exactly now (>=)", { exp: NOW_SEC }, DISPATCH_CODES.AUTHORITY_EXPIRED],
    ["not yet valid", { nbf: NOW_SEC + 60 }, DISPATCH_CODES.AUTHORITY_NOT_YET_VALID],
    ["wrong agent", { agent_id: "helpan-someone-else-v1" }, DISPATCH_CODES.AUTHORITY_AGENT_MISMATCH],
    ["wrong account", { sub: "acc_other" }, DISPATCH_CODES.AUTHORITY_ACCOUNT_MISMATCH],
    ["wrong audience", { operation_audience: "todoku" }, DISPATCH_CODES.AUTHORITY_AUDIENCE_MISMATCH],
    ["out of scope", { scopes: ["unique_accessories.read"] }, DISPATCH_CODES.AUTHORITY_OUT_OF_SCOPE],
    ["empty scopes", { scopes: [] }, DISPATCH_CODES.AUTHORITY_OUT_OF_SCOPE],
    ["missing jti", { jti: "" }, DISPATCH_CODES.AUTHORITY_INVALID],
    ["wrong initiated_by", { initiated_by: "customer" as unknown as "agent" }, DISPATCH_CODES.AUTHORITY_INVALID],
  ];
  for (const [name, over, code] of cases) {
    it(`rejects: ${name} → ${code}`, () => {
      const r = validateAuthorityClaims(claims(over), req);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.code, code);
    });
  }

  it("rejects null/garbage claims", () => {
    assert.equal(validateAuthorityClaims(null, req).ok, false);
    assert.equal(validateAuthorityClaims(undefined, req).ok, false);
  });
});

describe("verifyAuthority — signature then claims, fail-closed", () => {
  const kp = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const resolverOk: AuthorityKeyResolver = async () => kp.publicKey;
  const resolverNull: AuthorityKeyResolver = async () => null;

  function b64url(s: string | Buffer) {
    return Buffer.from(s).toString("base64url");
  }
  function jwt(header: object, payload: object) {
    const si = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const s = createSign("RSA-SHA256");
    s.update(si);
    s.end();
    return `${si}.${b64url(s.sign(kp.privateKey))}`;
  }

  it("accepts a genuinely-signed, valid token", async () => {
    const r = await verifyAuthority(jwt({ alg: "RS256", kid: "k1" }, claims()), resolverOk, req);
    assert.equal(r.ok, true);
  });

  it("fails CLOSED when the key cannot be resolved (rail unconfigured)", async () => {
    const r = await verifyAuthority(jwt({ alg: "RS256", kid: "k1" }, claims()), resolverNull, req);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, DISPATCH_CODES.AUTHORITY_INVALID);
  });

  it("rejects a missing token", async () => {
    const r = await verifyAuthority(undefined, resolverOk, req);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, DISPATCH_CODES.AUTHORITY_MISSING);
  });

  it("rejects a non-RS256 alg before touching the key", async () => {
    let resolverCalled = false;
    const spy: AuthorityKeyResolver = async () => {
      resolverCalled = true;
      return kp.publicKey;
    };
    const r = await verifyAuthority(jwt({ alg: "HS256", kid: "k1" }, claims()), spy, req);
    assert.equal(r.ok, false);
    assert.equal(resolverCalled, false);
  });

  it("rejects an alg:none token (no signature)", async () => {
    const unsigned = `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify(claims()))}.`;
    const r = await verifyAuthority(unsigned, resolverOk, req);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, DISPATCH_CODES.AUTHORITY_INVALID);
  });

  it("rejects the classic alg-confusion forgery (HS256 signed with the RSA PUBLIC key as the HMAC secret)", async () => {
    const si = `${b64url(JSON.stringify({ alg: "HS256", kid: "k1" }))}.${b64url(JSON.stringify(claims()))}`;
    const forged = `${si}.${createHmac("sha256", kp.publicKey).update(si).digest("base64url")}`;
    const r = await verifyAuthority(forged, resolverOk, req);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, DISPATCH_CODES.AUTHORITY_INVALID);
  });

  it("rejects a tampered signature", async () => {
    const good = jwt({ alg: "RS256", kid: "k1" }, claims());
    const tampered = good.slice(0, -4) + "AAAA";
    const r = await verifyAuthority(tampered, resolverOk, req);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, DISPATCH_CODES.AUTHORITY_INVALID);
  });

  it("verifies the signature but still enforces claims (valid sig, expired token → EXPIRED)", async () => {
    const r = await verifyAuthority(jwt({ alg: "RS256", kid: "k1" }, claims({ exp: NOW_SEC - 10 })), resolverOk, req);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, DISPATCH_CODES.AUTHORITY_EXPIRED);
  });
});
