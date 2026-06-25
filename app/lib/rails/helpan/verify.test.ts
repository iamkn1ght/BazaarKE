import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, createSign, generateKeyPairSync } from "crypto";
import { decodeAuthorityJwt, verifyRs256 } from "./verify";

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function makeJwt(header: object, payload: object, privateKey: string): string {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${b64url(signer.sign(privateKey))}`;
}

const a = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const b = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const token = makeJwt({ alg: "RS256", kid: "k1" }, { sub: "acc_1", exp: 9999999999 }, a.privateKey);

describe("decodeAuthorityJwt", () => {
  it("decodes header + payload of a well-formed JWT", () => {
    const d = decodeAuthorityJwt(token);
    assert.ok(d);
    assert.equal(d.header.alg, "RS256");
    assert.equal(d.header.kid, "k1");
    assert.equal(d.payload.sub, "acc_1");
  });
  it("returns null for malformed input", () => {
    assert.equal(decodeAuthorityJwt("not.a.jwt.at.all"), null);
    assert.equal(decodeAuthorityJwt("only-one-part"), null);
    assert.equal(decodeAuthorityJwt("a.b"), null);
    assert.equal(decodeAuthorityJwt(""), null);
    // header that base64url-decodes to non-JSON
    assert.equal(decodeAuthorityJwt(`${b64url("{bad")}.${b64url("{}")}.sig`), null);
  });
});

describe("verifyRs256", () => {
  const d = decodeAuthorityJwt(token)!;

  it("verifies a genuine signature against the matching public key (PEM)", () => {
    assert.equal(verifyRs256(d.signingInput, d.signatureB64url, a.publicKey), true);
  });
  it("verifies against the public key as a JWK", () => {
    const jwk = createPublicKey(a.publicKey).export({ format: "jwk" });
    assert.equal(verifyRs256(d.signingInput, d.signatureB64url, jwk), true);
  });
  it("rejects the wrong key", () => {
    assert.equal(verifyRs256(d.signingInput, d.signatureB64url, b.publicKey), false);
  });
  it("rejects a tampered signing input", () => {
    assert.equal(verifyRs256(d.signingInput + "x", d.signatureB64url, a.publicKey), false);
  });
  it("rejects a tampered signature", () => {
    const bad = d.signatureB64url.slice(0, -4) + "AAAA";
    assert.equal(verifyRs256(d.signingInput, bad, a.publicKey), false);
  });
  it("never throws on a bad key", () => {
    assert.equal(verifyRs256(d.signingInput, d.signatureB64url, "not-a-key"), false);
  });
});
